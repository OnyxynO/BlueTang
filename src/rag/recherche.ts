import type { Db } from '../bdd/connexion.js'

export interface ChunkResultat {
  id: number
  chemin: string
  debut: number
  fin: number
  contenu: string
  langage: string
  score: number
}

export function rechercherBM25(requete: string, db: Db, topK = 5): ChunkResultat[] {
  // Nettoyer la requête : FTS5 n'accepte pas les caractères spéciaux
  const requeteNettoyee = requete
    .replace(/["'*^]/g, ' ')
    .trim()

  if (!requeteNettoyee) return []

  try {
    return db
      .prepare<[string, number], ChunkResultat>(
        `SELECT c.id, c.chemin, c.debut, c.fin, c.contenu, c.langage,
                bm25(chunks_fts) AS score
         FROM chunks_fts
         JOIN chunks c ON c.id = chunks_fts.rowid
         WHERE chunks_fts MATCH ?
         ORDER BY score
         LIMIT ?`
      )
      .all(requeteNettoyee, topK)
  } catch {
    return []
  }
}
