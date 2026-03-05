import { input, confirm } from '@inquirer/prompts'
import { writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { configDefaut } from '../config.js'
import { ouvrirBdd } from '../bdd/connexion.js'
import { indexerDossier } from '../indexation/pipeline.js'

export async function lancerInit(): Promise<void> {
  console.log('\n🐟 BlueTang — Configuration initiale\n')

  // Vérifier si une config existe déjà
  if (existsSync('.bluetang.json')) {
    const ecraser = await confirm({
      message: 'Un fichier .bluetang.json existe déjà. Écraser la config existante ?',
      default: false,
    })
    if (!ecraser) {
      console.log('Configuration annulée.')
      return
    }
  }

  // Questions config de base
  const portStr = await input({
    message: 'Port du proxy',
    default: String(configDefaut.port),
    validate: (v) => {
      const n = Number(v)
      return Number.isInteger(n) && n > 0 && n < 65536 ? true : 'Port invalide (1–65535)'
    },
  })

  const ollamaUrl = await input({
    message: 'URL Ollama',
    default: configDefaut.ollamaUrl,
    validate: (v) => {
      try {
        const url = new URL(v)
        return url.protocol === 'http:' || url.protocol === 'https:' ? true : "L'URL doit commencer par http:// ou https://"
      } catch {
        return 'URL invalide'
      }
    },
  })

  const modele = await input({
    message: 'Modèle Ollama à utiliser',
    default: configDefaut.modele,
  })

  const numCtxStr = await input({
    message: 'Taille du contexte en tokens',
    default: String(configDefaut.numCtx),
    validate: (v) => {
      const n = Number(v)
      return Number.isInteger(n) && n > 0 ? true : 'Valeur entière positive requise'
    },
  })

  const cheminBdd = await input({
    message: 'Chemin de la base de données',
    default: configDefaut.cheminBdd,
  })

  // MCP filesystem
  const mcpServeurs: Array<{ nom: string; commande: string; args: string[] }> = []

  const activerMcp = await confirm({
    message: 'Activer le serveur MCP filesystem ?',
    default: false,
  })

  if (activerMcp) {
    const cheminMcp = await input({
      message: 'Chemin du dossier à exposer',
      default: resolve('.'),
      validate: (v) => (existsSync(v) ? true : 'Chemin introuvable'),
    })
    mcpServeurs.push({
      nom: 'filesystem',
      commande: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', cheminMcp],
    })
  }

  // Construire et écrire la config
  const config = {
    port: Number(portStr),
    ollamaUrl,
    modele,
    numCtx: Number(numCtxStr),
    cheminBdd,
    ...(mcpServeurs.length > 0 ? { mcp: mcpServeurs } : {}),
  }

  writeFileSync('.bluetang.json', JSON.stringify(config, null, 2))
  console.log('\n✔ .bluetang.json écrit')

  // Indexation optionnelle
  const indexerMaintenant = await confirm({
    message: 'Indexer la codebase maintenant ?',
    default: true,
  })

  if (indexerMaintenant) {
    const dossierIndex = await input({
      message: 'Dossier à indexer',
      default: './src',
      validate: (v) => (existsSync(v) ? true : 'Dossier introuvable'),
    })

    const avecEmbeddings = await confirm({
      message: 'Utiliser les embeddings sémantiques ? (nécessite nomic-embed-text dans Ollama)',
      default: false,
    })

    const racine = resolve(dossierIndex)
    const db = ouvrirBdd(cheminBdd)

    console.log(`\nIndexation de ${racine}...`)
    const stats = await indexerDossier(racine, db, {
      verbose: false,
      ollamaUrl: avecEmbeddings ? ollamaUrl : undefined,
    })

    console.log(
      `✔ ${stats.chunksTotal} chunk${stats.chunksTotal !== 1 ? 's' : ''} indexé${stats.chunksTotal !== 1 ? 's' : ''} ` +
        `(${stats.fichiersIndexes} fichier${stats.fichiersIndexes !== 1 ? 's' : ''})`
    )
  }

  const enDev = process.argv[1]?.endsWith('src/index.ts') || process.argv.includes('tsx')
  const cmdServe = enDev ? 'npm run dev -- serve' : 'bluetang serve'
  console.log(`\nProchaine étape : ${cmdServe}\n`)
}
