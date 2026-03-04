#!/usr/bin/env node
import { Command } from 'commander'
import path from 'path'
import { demarrerServeur } from './serveur/app.js'
import { configDefaut } from './config.js'
import { ouvrirBdd } from './bdd/connexion.js'
import { indexerDossier } from './indexation/pipeline.js'

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
  .option('--db-path <chemin>', 'Chemin de la base de données', configDefaut.cheminBdd)
  .action((options) => {
    const db = ouvrirBdd(options.dbPath)
    demarrerServeur(
      {
        port: Number(options.port),
        ollamaUrl: options.ollamaUrl,
        modele: options.model,
        numCtx: Number(options.numCtx),
        verbose: options.verbose,
        cheminBdd: options.dbPath,
      },
      db
    )
  })

programme
  .command('index [chemin]')
  .description('Indexer un dossier pour le RAG (BM25 + sémantique si --ollama-url fourni)')
  .option('-v, --verbose', 'Afficher les fichiers indexés', false)
  .option('--db-path <chemin>', 'Chemin de la base de données', configDefaut.cheminBdd)
  .option('--ollama-url <url>', 'URL Ollama pour les embeddings sémantiques', configDefaut.ollamaUrl)
  .action(async (chemin: string | undefined, options) => {
    const racine = path.resolve(chemin ?? '.')
    const db = ouvrirBdd(options.dbPath)

    console.log(`Indexation de ${racine}...`)
    const stats = await indexerDossier(racine, db, {
      verbose: options.verbose,
      ollamaUrl: options.ollamaUrl,
    })

    console.log(
      `\nTerminé : ${stats.fichiersIndexes} fichier${stats.fichiersIndexes !== 1 ? 's' : ''} indexé${stats.fichiersIndexes !== 1 ? 's' : ''}, ` +
        `${stats.chunksTotal} chunk${stats.chunksTotal !== 1 ? 's' : ''}` +
        (stats.fichiersInchanges > 0 ? ` (${stats.fichiersInchanges} inchangé${stats.fichiersInchanges !== 1 ? 's' : ''})` : '')
    )
  })

programme
  .command('status')
  .description("Afficher les statistiques de l'index")
  .option('--db-path <chemin>', 'Chemin de la base de données', configDefaut.cheminBdd)
  .action((options) => {
    const db = ouvrirBdd(options.dbPath)

    const stats = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM fichiers) AS fichiers,
          (SELECT COUNT(*) FROM chunks) AS chunks,
          (SELECT MAX(indexe_le) FROM fichiers) AS derniere_indexation`
      )
      .get() as { fichiers: number; chunks: number; derniere_indexation: string | null }

    console.log(`Index BlueTang — ${options.dbPath}`)
    console.log(`Fichiers indexés : ${stats.fichiers}`)
    console.log(`Chunks total     : ${stats.chunks}`)
    console.log(
      `Dernière mise à jour : ${stats.derniere_indexation ?? 'jamais'}`
    )
  })

programme.parse()
