import type { Hono } from 'hono'
import type { Config } from '../config.js'

export function ajouterRoutesModeles(app: Hono, config: Config): void {
  app.get('/v1/models', async (c) => {
    try {
      const reponse = await fetch(`${config.ollamaUrl}/v1/models`)
      const donnees = await reponse.json()
      return c.json(donnees)
    } catch {
      return c.json({ error: 'Ollama inaccessible' }, 503)
    }
  })

  app.post('/v1/embeddings', async (c) => {
    const corps = await c.req.json()
    try {
      const reponse = await fetch(`${config.ollamaUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      })
      const donnees = await reponse.json()
      return c.json(donnees)
    } catch {
      return c.json({ error: 'Ollama inaccessible' }, 503)
    }
  })

  app.get('/health', async (c) => {
    try {
      const reponse = await fetch(`${config.ollamaUrl}/api/version`)
      const donnees = (await reponse.json()) as { version: string }
      return c.json({ statut: 'ok', ollama: donnees.version, proxy: '0.1.0' })
    } catch {
      return c.json({ statut: 'erreur', ollama: 'inaccessible' }, 503)
    }
  })
}
