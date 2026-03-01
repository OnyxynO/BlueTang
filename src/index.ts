#!/usr/bin/env node
import { Command } from 'commander'
import { demarrerServeur } from './serveur/app.js'
import { configDefaut } from './config.js'

const programme = new Command()

programme
  .name('bluetang')
  .description('Proxy intelligent entre client LLM et Ollama — RAG + mémoire')
  .version('0.1.0')

programme
  .command('serve')
  .description('Lancer le serveur proxy')
  .option('-p, --port <port>', 'Port du proxy', String(configDefaut.port))
  .option('--ollama-url <url>', 'URL Ollama', configDefaut.ollamaUrl)
  .option('-m, --model <nom>', 'Modèle par défaut', configDefaut.modele)
  .option('--num-ctx <n>', 'Taille du contexte', String(configDefaut.numCtx))
  .option('-v, --verbose', 'Logs détaillés', false)
  .action((options) => {
    demarrerServeur({
      port: Number(options.port),
      ollamaUrl: options.ollamaUrl,
      modele: options.model,
      numCtx: Number(options.numCtx),
      verbose: options.verbose,
    })
  })

programme.parse()
