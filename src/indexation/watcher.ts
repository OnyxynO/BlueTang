import chokidar from 'chokidar'
import { readFile } from 'fs/promises'
import path from 'path'
import type { Statement } from 'better-sqlite3'
import type { Db } from '../bdd/connexion.js'
import { chunkerFichier } from './chunker.js'
import { hasherFichier, DOSSIERS_EXCLUS } from './scanner.js'
import { mapExtensions } from '../langages/catalogue.js'
import { obtenirEmbedding, vecToJson } from '../rag/embedder.js'

interface Stmts {
  selectFichier: Statement<[string], { id: number; hash: string }>
  insertFichier: Statement
  updateFichier: Statement
  supprimerVec: Statement
  supprimerVecMap: Statement
  supprimerChunks: Statement
  insertChunk: Statement
  insertVec: Statement
  insertVecMap: Statement
  deleteFichier: Statement
}

function preparerStmts(db: Db): Stmts {
  return {
    selectFichier: db.prepare<[string], { id: number; hash: string }>(
      'SELECT id, hash FROM fichiers WHERE chemin = ?'
    ),
    insertFichier: db.prepare(
      "INSERT INTO fichiers (chemin, hash, indexe_le) VALUES (?, ?, datetime('now'))"
    ),
    updateFichier: db.prepare(
      "UPDATE fichiers SET hash = ?, indexe_le = datetime('now') WHERE id = ?"
    ),
    supprimerVec: db.prepare(
      'DELETE FROM chunks_vec WHERE rowid IN (SELECT vec_rowid FROM chunks_vec_map WHERE chunk_id IN (SELECT id FROM chunks WHERE fichier_id = ?))'
    ),
    supprimerVecMap: db.prepare(
      'DELETE FROM chunks_vec_map WHERE chunk_id IN (SELECT id FROM chunks WHERE fichier_id = ?)'
    ),
    supprimerChunks: db.prepare('DELETE FROM chunks WHERE fichier_id = ?'),
    insertChunk: db.prepare(
      'INSERT INTO chunks (fichier_id, chemin, debut, fin, contenu, langage) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    insertVec: db.prepare('INSERT INTO chunks_vec(embedding) VALUES (?)'),
    insertVecMap: db.prepare('INSERT INTO chunks_vec_map(vec_rowid, chunk_id) VALUES (?, ?)'),
    deleteFichier: db.prepare('DELETE FROM fichiers WHERE id = ?'),
  }
}

async function traiterFichierModifie(
  cheminFichier: string,
  db: Db,
  stmts: Stmts,
  options: { ollamaUrl?: string; verbose?: boolean }
): Promise<void> {
  const ext = path.extname(cheminFichier)
  if (!mapExtensions().has(ext)) return

  try {
    const hash = await hasherFichier(cheminFichier)
    const existant = stmts.selectFichier.get(cheminFichier)

    if (existant?.hash === hash) return // inchangé

    const contenu = await readFile(cheminFichier, 'utf-8')
    const chunks = chunkerFichier(contenu, cheminFichier)

    const chunkIds: number[] = []
    const indexer = db.transaction(() => {
      let fichierId: number
      if (existant) {
        stmts.supprimerVec.run(existant.id)
        stmts.supprimerVecMap.run(existant.id)
        stmts.supprimerChunks.run(existant.id)
        stmts.updateFichier.run(hash, existant.id)
        fichierId = existant.id
      } else {
        const res = stmts.insertFichier.run(cheminFichier, hash)
        fichierId = Number(res.lastInsertRowid)
      }
      for (const chunk of chunks) {
        const res = stmts.insertChunk.run(
          fichierId, cheminFichier, chunk.debut, chunk.fin, chunk.contenu, chunk.langage
        )
        chunkIds.push(Number(res.lastInsertRowid))
      }
    })
    indexer()

    if (options.ollamaUrl) {
      for (let i = 0; i < chunks.length; i++) {
        try {
          const vecteur = await obtenirEmbedding(chunks[i].contenu, options.ollamaUrl)
          const vecRes = stmts.insertVec.run(vecToJson(vecteur))
          stmts.insertVecMap.run(Number(vecRes.lastInsertRowid), chunkIds[i])
        } catch { /* continue sans embedding */ }
      }
    }

    if (options.verbose) {
      console.log(`  ↺ ${cheminFichier} (${chunks.length} chunk${chunks.length > 1 ? 's' : ''})`)
    }
  } catch (err) {
    if (options.verbose) console.warn(`  ⚠ erreur sur ${cheminFichier}: ${err}`)
  }
}

function traiterFichierSupprime(
  cheminFichier: string,
  db: Db,
  stmts: Stmts,
  verbose: boolean
): void {
  try {
    const existant = stmts.selectFichier.get(cheminFichier)
    if (!existant) return

    db.transaction(() => {
      stmts.supprimerVec.run(existant.id)
      stmts.supprimerVecMap.run(existant.id)
      stmts.supprimerChunks.run(existant.id)
      stmts.deleteFichier.run(existant.id)
    })()

    if (verbose) console.log(`  ✗ ${cheminFichier} (supprimé de l'index)`)
  } catch (err) {
    if (verbose) console.warn(`  ⚠ erreur suppression ${cheminFichier}: ${err}`)
  }
}

export function surveillerDossier(
  racine: string,
  db: Db,
  options: { ollamaUrl?: string; verbose?: boolean } = {}
): void {
  const { verbose = false } = options
  const stmts = preparerStmts(db)

  const exclusions = [...DOSSIERS_EXCLUS].join('|')
  const ignored = new RegExp(`(^|[/\\\\])\\.|(${exclusions})`)

  const watcher = chokidar.watch(racine, {
    ignored,
    persistent: true,
    ignoreInitial: true,
  })

  watcher
    .on('add', (f) => { void traiterFichierModifie(f, db, stmts, options) })
    .on('change', (f) => { void traiterFichierModifie(f, db, stmts, options) })
    .on('unlink', (f) => { traiterFichierSupprime(f, db, stmts, verbose) })

  console.log(`Surveillance active sur ${racine}`)
  console.log(`Embeddings : ${options.ollamaUrl ? 'activés' : 'désactivés (pas de --ollama-url)'}`)
  console.log('Ctrl+C pour arrêter')
}
