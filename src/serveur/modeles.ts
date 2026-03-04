import type { Hono } from 'hono'
import type { Config } from '../config.js'
import type { Db } from '../bdd/connexion.js'

const VERSION = '0.2.0'

export function ajouterRoutesModeles(app: Hono, config: Config, db: Db | null = null): void {
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
      return c.json({ statut: 'ok', ollama: donnees.version, proxy: VERSION })
    } catch {
      return c.json({ statut: 'erreur', ollama: 'inaccessible' }, 503)
    }
  })

  app.get('/stats', async (c) => {
    // Métriques index + mémoire (si DB disponible)
    let index = null
    let memoire = null
    if (db) {
      const row = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM fichiers) AS fichiers,
            (SELECT COUNT(*) FROM chunks) AS chunks,
            (SELECT COUNT(*) FROM chunks_vec_map) AS vecteurs,
            (SELECT COUNT(*) FROM sessions) AS sessions,
            (SELECT COUNT(*) FROM messages_session) AS messages,
            (SELECT MAX(indexe_le) FROM fichiers) AS derniere_indexation`
        )
        .get() as {
          fichiers: number; chunks: number; vecteurs: number
          sessions: number; messages: number; derniere_indexation: string | null
        }
      index = { fichiers: row.fichiers, chunks: row.chunks, vecteurs: row.vecteurs, derniere_indexation: row.derniere_indexation }
      memoire = { sessions: row.sessions, messages: row.messages }
    }

    // Disponibilité Ollama (timeout 2s)
    let ollamaVersion: string | null = null
    try {
      const r = await fetch(`${config.ollamaUrl}/api/version`, {
        signal: AbortSignal.timeout(2000),
      })
      if (r.ok) {
        const data = (await r.json()) as { version: string }
        ollamaVersion = data.version
      }
    } catch { /* Ollama inaccessible */ }

    return c.json({
      version: VERSION,
      index,
      memoire,
      ollama: { url: config.ollamaUrl, accessible: ollamaVersion !== null, version: ollamaVersion },
      config: { port: config.port, modele: config.modele, numCtx: config.numCtx },
    })
  })
}
