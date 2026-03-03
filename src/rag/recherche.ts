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

// Mots trop courts ou trop communs pour être pertinents dans une recherche de code
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'et', 'ou', 'si',
  'que', 'qui', 'quoi', 'dont', 'où', 'que', 'est', 'son', 'ses', 'sur', 'par',
  'pour', 'dans', 'avec', 'sans', 'sous', 'aux', 'au', 'ce', 'se', 'sa', 'il',
  'the', 'a', 'an', 'is', 'in', 'of', 'to', 'and', 'or', 'for', 'with', 'at',
  'do', 'what', 'how', 'why', 'when', 'where', 'does', 'fait', 'fait', 'comment',
])

function construireRequeteFTS5(requete: string): string {
  // Garder uniquement les termes significatifs (longueur > 2, hors stopwords)
  const termes = requete
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ_]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t.toLowerCase()))

  if (termes.length === 0) return ''

  // OR entre les termes : un seul suffit à faire remonter un chunk, BM25 classe ensuite
  return termes.join(' OR ')
}

export function rechercherBM25(requete: string, db: Db, topK = 5): ChunkResultat[] {
  const matchQuery = construireRequeteFTS5(requete)
  if (!matchQuery) return []

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
      .all(matchQuery, topK)
  } catch {
    return []
  }
}
