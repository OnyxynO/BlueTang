import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve as honoServe } from '@hono/node-server'
import type { Config } from '../config.js'
import type { Db } from '../bdd/connexion.js'
import { compterChunks } from '../bdd/connexion.js'
import { GestionnaireMcp } from '../mcp/gestionnaire.js'
import { ajouterRoutesCompletions } from './completions.js'
import { ajouterRoutesModeles } from './modeles.js'

export function creerApp(
  config: Config,
  db: Db | null = null,
  gestionnaireMcp: GestionnaireMcp | null = null
): Hono {
  const app = new Hono()

  if (config.verbose) {
    app.use(logger())
  }

  ajouterRoutesCompletions(app, config, db, gestionnaireMcp)
  ajouterRoutesModeles(app, config, db)

  return app
}

export async function demarrerServeur(config: Config, db: Db | null = null): Promise<void> {
  // Initialiser le gestionnaire MCP si des serveurs sont configurés
  let gestionnaireMcp: GestionnaireMcp | null = null
  if (config.mcp.length > 0) {
    gestionnaireMcp = new GestionnaireMcp()
    await gestionnaireMcp.initialiser(config.mcp, config.verbose)
  }

  const app = creerApp(config, db, gestionnaireMcp)

  honoServe({ fetch: app.fetch, port: config.port }, () => {
    console.log(`BlueTang démarré → http://localhost:${config.port}`)
    console.log(`Ollama      : ${config.ollamaUrl}`)
    console.log(`Modèle      : ${config.modele}`)
    console.log(`Contexte    : ${config.numCtx} tokens`)

    if (db) {
      const total = compterChunks(db)
      console.log(`RAG         : ${total} chunk${total !== 1 ? 's' : ''} indexés`)
    } else {
      console.log(`RAG         : aucun index (lancer : bluetang index .)`)
    }

    if (gestionnaireMcp) {
      const clients = gestionnaireMcp.obtenirClients()
      const totalTools = clients.reduce((s, c) => s + c.tools.length, 0)
      const totalRes = clients.reduce((s, c) => s + c.resources.length, 0)
      console.log(`MCP         : ${clients.length} serveur(s), ${totalTools} outil(s), ${totalRes} ressource(s)`)
    }
  })

  // Fermeture propre
  process.on('SIGTERM', async () => {
    await gestionnaireMcp?.fermerTout()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    await gestionnaireMcp?.fermerTout()
    process.exit(0)
  })
}
