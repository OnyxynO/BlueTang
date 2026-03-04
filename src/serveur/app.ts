import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve as honoServe } from '@hono/node-server'
import type { Config } from '../config.js'
import type { Db } from '../bdd/connexion.js'
import { compterChunks } from '../bdd/connexion.js'
import { ajouterRoutesCompletions } from './completions.js'
import { ajouterRoutesModeles } from './modeles.js'

export function creerApp(config: Config, db: Db | null = null): Hono {
  const app = new Hono()

  if (config.verbose) {
    app.use(logger())
  }

  ajouterRoutesCompletions(app, config, db)
  ajouterRoutesModeles(app, config, db)

  return app
}

export function demarrerServeur(config: Config, db: Db | null = null): void {
  const app = creerApp(config, db)

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
  })
}
