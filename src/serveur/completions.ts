import type { Hono } from 'hono'
import type { Config } from '../config.js'
import type { Db } from '../bdd/connexion.js'
import { enrichirMessages } from '../rag/assembleur.js'

export function ajouterRoutesCompletions(app: Hono, config: Config, db: Db | null = null): void {
  app.post('/v1/chat/completions', async (c) => {
    const corps = await c.req.json()

    if (db && Array.isArray(corps.messages)) {
      corps.messages = await enrichirMessages(
        corps.messages as { role: string; content: string }[],
        db,
        config.ollamaUrl
      )
    }

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

    // Streaming : passer le flux SSE directement sans buffering
    if (corps.stream === true) {
      return new Response(reponseOllama.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    const donnees = await reponseOllama.json()
    return c.json(donnees)
  })
}
