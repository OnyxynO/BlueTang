import { readFile } from 'fs/promises'
import path from 'path'
import type { Db } from '../bdd/connexion.js'
import { chunkerFichier } from './chunker.js'
import { scannerDossier, hasherFichier } from './scanner.js'
import { obtenirEmbedding, vecToJson } from '../rag/embedder.js'

export interface StatsPipeline {
  fichiersScannes: number
  fichiersIndexes: number
  fichiersInchanges: number
  chunksTotal: number
}

export async function indexerDossier(
  racine: string,
  db: Db,
  options: { verbose?: boolean; ollamaUrl?: string } = {}
): Promise<StatsPipeline> {
  const { verbose = false, ollamaUrl } = options
  const fichiers = await scannerDossier(racine)

  const stats: StatsPipeline = {
    fichiersScannes: fichiers.length,
    fichiersIndexes: 0,
    fichiersInchanges: 0,
    chunksTotal: 0,
  }

  const stmtSelectFichier = db.prepare<[string], { id: number; hash: string }>(
    'SELECT id, hash FROM fichiers WHERE chemin = ?'
  )
  const stmtInsertFichier = db.prepare(
    "INSERT INTO fichiers (chemin, hash, indexe_le) VALUES (?, ?, datetime('now'))"
  )
  const stmtUpdateFichier = db.prepare(
    "UPDATE fichiers SET hash = ?, indexe_le = datetime('now') WHERE id = ?"
  )
  // Supprimer les vecteurs AVANT les chunks (la sous-requête ne fonctionne plus après)
  const stmtSupprimerVec = db.prepare(
    'DELETE FROM chunks_vec WHERE chunk_id IN (SELECT id FROM chunks WHERE fichier_id = ?)'
  )
  const stmtSupprimerChunks = db.prepare('DELETE FROM chunks WHERE fichier_id = ?')
  const stmtInsertChunk = db.prepare(
    'INSERT INTO chunks (fichier_id, chemin, debut, fin, contenu, langage) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const stmtInsertVec = db.prepare(
    'INSERT INTO chunks_vec(chunk_id, embedding) VALUES (?, ?)'
  )

  for (const cheminFichier of fichiers) {
    const hash = await hasherFichier(cheminFichier)
    const existant = stmtSelectFichier.get(cheminFichier)

    if (existant?.hash === hash) {
      stats.fichiersInchanges++
      continue
    }

    const contenu = await readFile(cheminFichier, 'utf-8')
    const chunks = chunkerFichier(contenu, cheminFichier)

    // Phase synchrone : toutes les opérations SQLite dans une transaction
    const chunkIds: number[] = []
    const indexer = db.transaction(() => {
      let fichierId: number

      if (existant) {
        stmtSupprimerVec.run(existant.id)
        stmtSupprimerChunks.run(existant.id)
        stmtUpdateFichier.run(hash, existant.id)
        fichierId = existant.id
      } else {
        const result = stmtInsertFichier.run(cheminFichier, hash)
        fichierId = Number(result.lastInsertRowid)
      }

      for (const chunk of chunks) {
        const res = stmtInsertChunk.run(
          fichierId, cheminFichier, chunk.debut, chunk.fin, chunk.contenu, chunk.langage
        )
        chunkIds.push(Number(res.lastInsertRowid))
      }
    })

    indexer()

    // Phase asynchrone : embedding via Ollama (si activé)
    if (ollamaUrl) {
      for (let i = 0; i < chunks.length; i++) {
        try {
          const vecteur = await obtenirEmbedding(chunks[i].contenu, ollamaUrl)
          stmtInsertVec.run(chunkIds[i], vecToJson(vecteur))
        } catch (err) {
          if (verbose) {
            console.warn(`  ⚠ embed échoué pour chunk ${chunkIds[i]}: ${err}`)
          }
        }
      }
    }

    stats.fichiersIndexes++
    stats.chunksTotal += chunks.length

    if (verbose) {
      const relatif = path.relative(racine, cheminFichier)
      const embedInfo = ollamaUrl ? ` + ${chunks.length} embed${chunks.length > 1 ? 's' : ''}` : ''
      console.log(`  ✓ ${relatif} (${chunks.length} chunk${chunks.length > 1 ? 's' : ''}${embedInfo})`)
    }
  }

  return stats
}
