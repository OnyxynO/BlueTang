import type { Hono } from 'hono'
import type { Config } from '../config.js'
import type { Db } from '../bdd/connexion.js'
import { enrichirMessages } from '../rag/assembleur.js'
import { chargerContexte, injecterMemoire, sauvegarderEchange } from '../memoire/session.js'
import type { ContexteMemoire } from '../memoire/session.js'
import { mettreAJourResume } from '../memoire/resume.js'

// Extrait le texte de la réponse depuis un flux SSE Ollama
async function capturerTexteSSE(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let texte = ''
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
          const data = JSON.parse(json) as { choices?: [{ delta?: { content?: string } }] }
          texte += data.choices?.[0]?.delta?.content ?? ''
        } catch { /* ignore malformed */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return texte
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

export function ajouterRoutesCompletions(app: Hono, config: Config, db: Db | null = null): void {
  app.post('/v1/chat/completions', async (c) => {
    const corps = await c.req.json()
    let messages = corps.messages as { role: string; content: string }[]

    // Capturer le dernier message user avant enrichissement (qui ajoute des messages système)
    const dernierUser = [...messages].reverse().find((m) => m.role === 'user')

    let contexteMémoire: ContexteMemoire | null = null
    if (db && Array.isArray(messages)) {
      // 1. Mémoire en premier (contexte long-terme)
      contexteMémoire = chargerContexte(messages, db)
      messages = injecterMemoire(messages, contexteMémoire)
      // 2. RAG juste avant le dernier message user
      messages = await enrichirMessages(messages, db, config.ollamaUrl)
    }

    corps.messages = messages

    let reponseOllama: Response
    try {
      reponseOllama = await fetch(`${config.ollamaUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      })
    } catch {
      return c.json({ error: 'Ollama inaccessible' }, 503)
    }

    if (!reponseOllama.ok) {
      const texte = await reponseOllama.text()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return c.json({ error: texte }, reponseOllama.status as any)
    }

    // Streaming : tee du flux → client reçoit immédiatement, capture en arrière-plan
    if (corps.stream === true) {
      if (db && contexteMémoire && dernierUser && reponseOllama.body) {
        const [clientStream, captureStream] = reponseOllama.body.tee()
        void (async () => {
          const texteAssistant = await capturerTexteSSE(captureStream)
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

    // Non-streaming : sauvegarder après avoir reçu la réponse complète
    const donnees = await reponseOllama.json() as { choices?: [{ message?: { content?: string } }] }
    if (db && contexteMémoire && dernierUser) {
      const texteAssistant = donnees.choices?.[0]?.message?.content ?? ''
      void traiterPostReponse(contexteMémoire, dernierUser.content, texteAssistant, db, config)
    }

    return c.json(donnees)
  })
}
