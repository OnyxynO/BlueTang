import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve as honoServe } from '@hono/node-server'
import type { Config } from '../config.js'
import { ajouterRoutesCompletions } from './completions.js'
import { ajouterRoutesModeles } from './modeles.js'

export function creerApp(config: Config): Hono {
  const app = new Hono()

  if (config.verbose) {
    app.use(logger())
  }

  ajouterRoutesCompletions(app, config)
  ajouterRoutesModeles(app, config)

  return app
}

export function demarrerServeur(config: Config): void {
  const app = creerApp(config)

  honoServe({ fetch: app.fetch, port: config.port }, () => {
    console.log(`BlueTang démarré → http://localhost:${config.port}`)
    console.log(`Ollama      : ${config.ollamaUrl}`)
    console.log(`Modèle      : ${config.modele}`)
    console.log(`Contexte    : ${config.numCtx} tokens`)
  })
}
