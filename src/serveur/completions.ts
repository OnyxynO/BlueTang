import type { Hono } from 'hono'
import type { Config } from '../config.js'
import type { Db } from '../bdd/connexion.js'
import { enrichirMessages } from '../rag/assembleur.js'
import { chargerContexte, injecterMemoire, sauvegarderEchange } from '../memoire/session.js'
import type { ContexteMemoire } from '../memoire/session.js'
import { mettreAJourResume } from '../memoire/resume.js'
import type { GestionnaireMcp } from '../mcp/gestionnaire.js'
import type { ToolMcp } from '../mcp/client.js'
import { scorerPertinenceMcp } from '../mcp/pertinence.js'
import { injecterContexteMcp } from '../mcp/injecteur.js'

type Message = { role: string; content: string }

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OllamaChoice {
  delta?: { content?: string; tool_calls?: ToolCall[] }
  message?: { content?: string; tool_calls?: ToolCall[] }
  finish_reason?: string
}

// Extrait le texte et les tool_calls depuis un flux SSE Ollama
async function capturerSSE(
  stream: ReadableStream<Uint8Array>
): Promise<{ texte: string; toolCalls: ToolCall[] }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let texte = ''
  const toolCalls: ToolCall[] = []
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lignes = buffer.split('\n')
      buffer = lignes.pop() ?? ''
      for (const ligne of lignes) {
        if (!ligne.startsWith('data: ')) continue
        const json = ligne.slice(6).trim()
        if (json === '[DONE]') continue
        try {
          const data = JSON.parse(json) as { choices?: [OllamaChoice] }
          texte += data.choices?.[0]?.delta?.content ?? ''
          const tc = data.choices?.[0]?.delta?.tool_calls
          if (tc) toolCalls.push(...tc)
        } catch { /* ignore malformed */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return { texte, toolCalls }
}

// Boucle agentique : exécute les tool_calls et re-soumet à Ollama (max 3 tours)
async function executerAvecTools(
  messages: Message[],
  tools: ToolMcp[],
  corps: Record<string, unknown>,
  ollamaUrl: string,
  gestionnaire: GestionnaireMcp,
  verbose: boolean,
  maxTours = 3
): Promise<Response> {
  // Formater les tools pour l'API Ollama (format OpenAI)
  const toolsOllama = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.nom,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))

  let messagesActuels = messages

  for (let tour = 0; tour < maxTours; tour++) {
    const corpsOllama = { ...corps, messages: messagesActuels, tools: toolsOllama, stream: false }

    let reponse: Response
    try {
      reponse = await fetch(`${ollamaUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsOllama),
      })
    } catch {
      return new Response(JSON.stringify({ error: 'Ollama inaccessible' }), { status: 503 })
    }

    if (!reponse.ok) {
      return reponse
    }

    const donnees = await reponse.json() as {
      choices?: [{ message?: { content?: string; tool_calls?: ToolCall[] }; finish_reason?: string }]
    }

    const choix = donnees.choices?.[0]
    const toolCallsRecu = choix?.message?.tool_calls ?? []

    // Si pas de tool_calls ou finish_reason ≠ tool_calls → réponse finale
    if (toolCallsRecu.length === 0 || choix?.finish_reason !== 'tool_calls') {
      return new Response(JSON.stringify(donnees), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (verbose) {
      console.log(`MCP boucle tour ${tour + 1} : ${toolCallsRecu.length} tool_call(s)`)
    }

    // Ajouter le message assistant avec ses tool_calls
    messagesActuels = [
      ...messagesActuels,
      { role: 'assistant', content: JSON.stringify({ tool_calls: toolCallsRecu }) },
    ]

    // Exécuter chaque tool_call
    for (const tc of toolCallsRecu) {
      const nomOutil = tc.function.name
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>

      // Trouver le client qui possède cet outil
      const clientCible = gestionnaire.obtenirClients().find((c) =>
        c.tools.some((t) => t.nom === nomOutil)
      )

      let resultat = '[outil non trouvé]'
      if (clientCible) {
        try {
          resultat = await clientCible.appelerOutil(nomOutil, args)
          if (verbose) {
            console.log(`MCP outil [${nomOutil}] → ${resultat.slice(0, 100)}${resultat.length > 100 ? '...' : ''}`)
          }
        } catch (err) {
          resultat = `[erreur : ${err instanceof Error ? err.message : String(err)}]`
        }
      }

      messagesActuels = [
        ...messagesActuels,
        { role: 'tool', content: resultat },
      ]
    }
  }

  // Dernier appel sans tools (on a atteint maxTours)
  const corpsFinale = { ...corps, messages: messagesActuels, stream: false }
  try {
    return await fetch(`${ollamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpsFinale),
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Ollama inaccessible' }), { status: 503 })
  }
}

// Sauvegarde et résumé en arrière-plan (best-effort, ne bloque pas la réponse)
async function traiterPostReponse(
  contexte: ContexteMemoire,
  userContent: string,
  assistantContent: string,
  db: Db,
  config: Config
): Promise<void> {
  try {
    sauvegarderEchange(contexte, userContent, assistantContent, db)
    await mettreAJourResume(contexte.sessionId, db, config.ollamaUrl, config.modele)
  } catch { /* best-effort */ }
}

export function ajouterRoutesCompletions(
  app: Hono,
  config: Config,
  db: Db | null = null,
  gestionnaireMcp: GestionnaireMcp | null = null
): void {
  app.post('/v1/chat/completions', async (c) => {
    const corps = await c.req.json() as Record<string, unknown>
    let messages = corps.messages as Message[]

    // Capturer le dernier message user avant enrichissement
    const dernierUser = [...messages].reverse().find((m) => m.role === 'user')

    let contexteMémoire: ContexteMemoire | null = null
    if (db && Array.isArray(messages)) {
      // 1. Mémoire (contexte long-terme)
      contexteMémoire = chargerContexte(messages, db)
      messages = injecterMemoire(messages, contexteMémoire)
      // 2. RAG BM25 + sémantique
      messages = await enrichirMessages(messages, db, config.ollamaUrl)
    }

    // 3. MCP : injection resources + tools si pertinents
    let toolsDisponibles: ToolMcp[] = []
    if (gestionnaireMcp && dernierUser) {
      const clients = gestionnaireMcp.obtenirClients()
      if (clients.length > 0) {
        const pertinence = scorerPertinenceMcp(dernierUser.content, clients)
        if (pertinence.pertinent) {
          if (config.verbose) {
            console.log(
              `MCP pertinent : ${pertinence.tools.length} outil(s), ${pertinence.resources.length} ressource(s)`
            )
          }
          const resultat = await injecterContexteMcp(messages, pertinence, clients, config.verbose)
          messages = resultat.messages
          toolsDisponibles = resultat.toolsDisponibles
        }
      }
    }

    corps.messages = messages

    // 4. Forward vers Ollama (avec ou sans tool_calls)
    let reponseOllama: Response
    try {
      if (toolsDisponibles.length > 0 && gestionnaireMcp) {
        // Mode agentique : boucle tool_calls (force non-streaming pour simplifier)
        reponseOllama = await executerAvecTools(
          messages,
          toolsDisponibles,
          corps,
          config.ollamaUrl,
          gestionnaireMcp,
          config.verbose
        )
      } else if (corps.stream === true) {
        reponseOllama = await fetch(`${config.ollamaUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        })
      } else {
        reponseOllama = await fetch(`${config.ollamaUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        })
      }
    } catch {
      return c.json({ error: 'Ollama inaccessible' }, 503)
    }

    if (!reponseOllama.ok) {
      const texte = await reponseOllama.text()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return c.json({ error: texte }, reponseOllama.status as any)
    }

    // Streaming : tee du flux → client reçoit immédiatement, capture en arrière-plan
    if (corps.stream === true && toolsDisponibles.length === 0) {
      if (db && contexteMémoire && dernierUser && reponseOllama.body) {
        const [clientStream, captureStream] = reponseOllama.body.tee()
        void (async () => {
          const { texte: texteAssistant } = await capturerSSE(captureStream)
          if (texteAssistant) {
            await traiterPostReponse(contexteMémoire!, dernierUser.content, texteAssistant, db, config)
          }
        })()
        return new Response(clientStream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }
      return new Response(reponseOllama.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // Non-streaming (ou mode agentique forcé non-streaming) : sauvegarder après réponse
    const donnees = await reponseOllama.json() as {
      choices?: [{ message?: { content?: string } }]
    }
    if (db && contexteMémoire && dernierUser) {
      const texteAssistant = donnees.choices?.[0]?.message?.content ?? ''
      void traiterPostReponse(contexteMémoire, dernierUser.content, texteAssistant, db, config)
    }

    return c.json(donnees)
  })
}
