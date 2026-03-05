#!/usr/bin/env node
import { Command } from 'commander'
import path from 'path'
import { demarrerServeur } from './serveur/app.js'
import { configDefaut, chargerConfigFichier } from './config.js'
import { ouvrirBdd } from './bdd/connexion.js'
import { indexerDossier } from './indexation/pipeline.js'
import { surveillerDossier } from './indexation/watcher.js'
import { lancerInit } from './cli/init.js'
import { lancerClean } from './cli/clean.js'
import { VERSION } from './version.js'

// Les options du fichier .bluetang.json servent de valeurs par défaut
// que les options CLI peuvent surcharger
const cfg = { ...configDefaut, ...chargerConfigFichier() }

const programme = new Command()

programme
  .name('bluetang')
  .description('Proxy intelligent entre client LLM et Ollama — RAG + mémoire')
  .version(VERSION)

programme
  .command('serve')
  .description('Lancer le serveur proxy')
  .option('-p, --port <port>', 'Port du proxy', String(cfg.port))
  .option('--ollama-url <url>', 'URL Ollama', cfg.ollamaUrl)
  .option('-m, --model <nom>', 'Modèle par défaut', cfg.modele)
  .option('--num-ctx <n>', 'Taille du contexte', String(cfg.numCtx))
  .option('-v, --verbose', 'Logs détaillés', false)
  .option('--db-path <chemin>', 'Chemin de la base de données', cfg.cheminBdd)
  .action(async (options) => {
    const db = ouvrirBdd(options.dbPath)
    await demarrerServeur(
      {
        port: Number(options.port),
        ollamaUrl: options.ollamaUrl,
        modele: options.model,
        numCtx: Number(options.numCtx),
        verbose: options.verbose,
        cheminBdd: options.dbPath,
        mcp: cfg.mcp ?? [],
      },
      db
    )
  })

programme
  .command('index [chemin]')
  .description('Indexer un dossier pour le RAG (BM25 + sémantique si --ollama-url fourni)')
  .option('-v, --verbose', 'Afficher les fichiers indexés', false)
  .option('--db-path <chemin>', 'Chemin de la base de données', cfg.cheminBdd)
  .option('--ollama-url <url>', 'URL Ollama pour les embeddings sémantiques', cfg.ollamaUrl)
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
  .option('--db-path <chemin>', 'Chemin de la base de données', cfg.cheminBdd)
  .action((options) => {
    const db = ouvrirBdd(options.dbPath)

    const stats = db
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

    console.log(`Index BlueTang — ${options.dbPath}`)
    console.log(`Fichiers indexés : ${stats.fichiers}`)
    console.log(`Chunks total     : ${stats.chunks}`)
    console.log(`Vecteurs         : ${stats.vecteurs}`)
    console.log(`Sessions mémoire : ${stats.sessions} (${stats.messages} messages)`)
    console.log(`Dernière MAJ     : ${stats.derniere_indexation ?? 'jamais'}`)
  })

programme
  .command('watch [chemin]')
  .description("Surveiller les modifications en temps réel et mettre à jour l'index")
  .option('-v, --verbose', 'Afficher les fichiers traités', false)
  .option('--db-path <chemin>', 'Chemin de la base de données', cfg.cheminBdd)
  .option('--ollama-url <url>', 'URL Ollama pour les embeddings sémantiques', cfg.ollamaUrl)
  .action((chemin: string | undefined, options) => {
    const racine = path.resolve(chemin ?? '.')
    const db = ouvrirBdd(options.dbPath)
    surveillerDossier(racine, db, {
      verbose: options.verbose,
      ollamaUrl: options.ollamaUrl,
    })
  })

programme
  .command('init')
  .description('Configurer BlueTang de manière interactive')
  .action(async () => {
    await lancerInit()
  })

programme
  .command('clean')
  .description("Supprimer l'index et/ou les sessions de mémoire")
  .option('--index', "Supprimer l'index (fichiers, chunks, vecteurs)")
  .option('--sessions', 'Supprimer les sessions de mémoire')
  .option('--all', 'Supprimer tout (index + sessions)')
  .option('--db-path <chemin>', 'Chemin de la base de données', cfg.cheminBdd)
  .action(async (options) => {
    const db = ouvrirBdd(options.dbPath)
    await lancerClean(db, options.dbPath, {
      index: options.index,
      sessions: options.sessions,
      all: options.all,
    })
  })

programme.parse()
