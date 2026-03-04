#!/usr/bin/env tsx
/**
 * Benchmark RAG BM25 — recall et latence sur la codebase BlueTang elle-même.
 * Usage : npx tsx scripts/benchmark.ts [chemin-src]
 *
 * Ne nécessite pas Ollama (teste uniquement BM25).
 */
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { ouvrirBdd } from '../src/bdd/connexion.js'
import { indexerDossier } from '../src/indexation/pipeline.js'
import { rechercherBM25 } from '../src/rag/recherche.js'

// Requêtes connues + fichier attendu dans le top-K
const CAS_DE_TEST: { requete: string; fichierAttendu: string }[] = [
  { requete: 'rechercherBM25 FTS5 match',         fichierAttendu: 'rag/recherche.ts' },
  { requete: 'chunkerFichier tree-sitter AST',     fichierAttendu: 'indexation/chunker.ts' },
  { requete: 'ouvrirBdd sqlite connexion',         fichierAttendu: 'bdd/connexion.ts' },
  { requete: 'identifierSession SHA-256',          fichierAttendu: 'memoire/session.ts' },
  { requete: 'mettreAJourResume progressif',       fichierAttendu: 'memoire/resume.ts' },
  { requete: 'enrichirMessages injection contexte', fichierAttendu: 'rag/assembleur.ts' },
  { requete: 'surveillerDossier chokidar watch',   fichierAttendu: 'indexation/watcher.ts' },
  { requete: 'demarrerServeur hono proxy',         fichierAttendu: 'serveur/app.ts' },
  { requete: 'indexerDossier pipeline',            fichierAttendu: 'indexation/pipeline.ts' },
  { requete: 'obtenirEmbedding nomic-embed-text',  fichierAttendu: 'rag/embedder.ts' },
]

const RACINE = path.resolve(process.argv[2] ?? './src')

async function main(): Promise<void> {
  console.log(`\nBenchmark BlueTang BM25 — indexation de ${RACINE}\n`)

  // Index dans un répertoire temporaire
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'bluetang-bench-'))
  const cheminBdd = path.join(tmpDir, 'bench.db')

  try {
    const db = ouvrirBdd(cheminBdd)
    process.stdout.write('Indexation… ')
    const debut = Date.now()
    const stats = await indexerDossier(RACINE, db)
    const dureeIndex = Date.now() - debut
    console.log(`${stats.chunksTotal} chunks en ${dureeIndex}ms (${stats.fichiersIndexes} fichiers)\n`)

    let hits1 = 0
    let hits5 = 0
    const latences: number[] = []

    console.log('Cas de test :')
    for (const { requete, fichierAttendu } of CAS_DE_TEST) {
      const t0 = Date.now()
      const resultats = rechercherBM25(requete, db, 5)
      latences.push(Date.now() - t0)

      const trouveA1 = resultats[0]?.chemin.includes(fichierAttendu) ?? false
      const trouveA5 = resultats.some((r) => r.chemin.includes(fichierAttendu))

      if (trouveA1) hits1++
      if (trouveA5) hits5++

      const symbole = trouveA1 ? '✓' : trouveA5 ? '~' : '✗'
      console.log(`  ${symbole} [${String(resultats[0] ? 1 : 0)}/5] "${requete.slice(0, 45)}"`)
      if (!trouveA5 && resultats.length > 0) {
        console.log(`      attendu : ${fichierAttendu}`)
        console.log(`      obtenu  : ${path.basename(resultats[0].chemin)}`)
      }
    }

    const n = CAS_DE_TEST.length
    const latMoy = Math.round(latences.reduce((a, b) => a + b, 0) / n)
    const latMax = Math.max(...latences)

    console.log(`\n─────────────────────────────────`)
    console.log(`Recall@1 : ${hits1}/${n} (${Math.round(hits1 / n * 100)}%)`)
    console.log(`Recall@5 : ${hits5}/${n} (${Math.round(hits5 / n * 100)}%)`)
    console.log(`Latence  : moy ${latMoy}ms, max ${latMax}ms`)
    console.log(`─────────────────────────────────\n`)

    db.close()
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
