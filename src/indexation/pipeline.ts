import { readFile } from 'fs/promises'
import path from 'path'
import type { Db } from '../bdd/connexion.js'
import { chunkerFichier } from './chunker.js'
import { scannerDossier, hasherFichier } from './scanner.js'
import { obtenirEmbeddingsBatch, vecToJson } from '../rag/embedder.js'

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
  // Ordre de suppression : chunks_vec (via map) → chunks_vec_map → chunks
  const stmtSupprimerVec = db.prepare(
    'DELETE FROM chunks_vec WHERE rowid IN (SELECT vec_rowid FROM chunks_vec_map WHERE chunk_id IN (SELECT id FROM chunks WHERE fichier_id = ?))'
  )
  const stmtSupprimerVecMap = db.prepare(
    'DELETE FROM chunks_vec_map WHERE chunk_id IN (SELECT id FROM chunks WHERE fichier_id = ?)'
  )
  const stmtSupprimerChunks = db.prepare('DELETE FROM chunks WHERE fichier_id = ?')
  const stmtInsertChunk = db.prepare(
    'INSERT INTO chunks (fichier_id, chemin, debut, fin, contenu, langage) VALUES (?, ?, ?, ?, ?, ?)'
  )
  // sqlite-vec vec0 n'accepte pas de rowid explicite → mapping via chunks_vec_map
  const stmtInsertVec = db.prepare('INSERT INTO chunks_vec(embedding) VALUES (?)')
  const stmtInsertVecMap = db.prepare(
    'INSERT INTO chunks_vec_map(vec_rowid, chunk_id) VALUES (?, ?)'
  )

  for (const cheminFichier of fichiers) {
    const hash = await hasherFichier(cheminFichier)
    const existant = stmtSelectFichier.get(cheminFichier)

    if (existant?.hash === hash) {
      stats.fichiersInchanges++
      continue
    }

    const contenu = await readFile(cheminFichier, 'utf-8')
    // A7 : ignorer les fichiers trop petits pour être utiles
    if (contenu.length < 10) {
      if (verbose) console.log(`  ↷ ${path.relative(racine, cheminFichier)} (ignoré — < 10 octets)`)
      continue
    }
    const chunks = chunkerFichier(contenu, cheminFichier)

    // Phase synchrone : toutes les opérations SQLite dans une transaction
    const chunkIds: number[] = []
    const indexer = db.transaction(() => {
      let fichierId: number

      if (existant) {
        stmtSupprimerVec.run(existant.id)
        stmtSupprimerVecMap.run(existant.id)
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

    // Phase asynchrone : embedding via Ollama en batch (si activé)
    if (ollamaUrl) {
      const TAILLE_BATCH = 20
      for (let debut = 0; debut < chunks.length; debut += TAILLE_BATCH) {
        const batch = chunks.slice(debut, debut + TAILLE_BATCH)
        const batchIds = chunkIds.slice(debut, debut + TAILLE_BATCH)
        try {
          const vecteurs = await obtenirEmbeddingsBatch(batch.map((c) => c.contenu), ollamaUrl)
          for (let i = 0; i < vecteurs.length; i++) {
            const vecRes = stmtInsertVec.run(vecToJson(vecteurs[i]))
            stmtInsertVecMap.run(Number(vecRes.lastInsertRowid), batchIds[i])
          }
        } catch (err) {
          if (verbose) {
            console.warn(`  ⚠ embed batch échoué (chunks ${debut}–${debut + batch.length - 1}): ${err}`)
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
