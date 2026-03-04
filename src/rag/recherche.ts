import type { Db } from '../bdd/connexion.js'
import { obtenirEmbedding, vecToJson } from './embedder.js'

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

// Normalisation absolue du score BM25 (négatif, plus négatif = meilleur)
// → val / (1 + val) mappe (0, ∞) → (0, 1), croissant
function bm25Norm(score: number): number {
  const val = Math.max(0, -score)
  return val / (1 + val)
}

// Normalisation sémantique : distance L2 → similarité cosinus pour vecteurs unitaires
// cos ≈ 1 - d²/2, plafonnée à [0, 1]
function semNorm(distance: number): number {
  return Math.max(0, 1 - (distance * distance) / 2)
}

export async function rechercherSemantique(
  requete: string,
  db: Db,
  ollamaUrl: string,
  topK = 5
): Promise<ChunkResultat[]> {
  let vecteur: number[]
  try {
    vecteur = await obtenirEmbedding(requete, ollamaUrl)
  } catch {
    return []
  }

  try {
    const knn = db
      .prepare<[string, number], { vec_rowid: number; distance: number }>(
        `SELECT rowid AS vec_rowid, distance
         FROM chunks_vec
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT ?`
      )
      .all(vecToJson(vecteur), topK)

    if (knn.length === 0) return []

    const stmtMap = db.prepare<[number], { chunk_id: number }>(
      'SELECT chunk_id FROM chunks_vec_map WHERE vec_rowid = ?'
    )
    const stmtChunk = db.prepare<[number], Omit<ChunkResultat, 'score'>>(
      'SELECT id, chemin, debut, fin, contenu, langage FROM chunks WHERE id = ?'
    )

    const resultats: ChunkResultat[] = []
    for (const { vec_rowid, distance } of knn) {
      const mapping = stmtMap.get(vec_rowid)
      if (!mapping) continue
      const chunk = stmtChunk.get(mapping.chunk_id)
      if (chunk) {
        resultats.push({ ...chunk, score: semNorm(distance) })
      }
    }
    return resultats
  } catch {
    return []
  }
}

const POIDS_BM25 = 0.4
const POIDS_SEM = 0.6

export async function rechercherHybrid(
  requete: string,
  db: Db,
  ollamaUrl: string,
  topK = 5
): Promise<ChunkResultat[]> {
  const candidatsK = topK * 2

  const [bm25Resultats, semResultats] = await Promise.all([
    Promise.resolve(rechercherBM25(requete, db, candidatsK)),
    rechercherSemantique(requete, db, ollamaUrl, candidatsK),
  ])

  // Construire la map hybride : chunk_id → {contenu, scores}
  const bm25Scores = new Map<number, number>()
  const bm25Chunks = new Map<number, ChunkResultat>()
  for (const r of bm25Resultats) {
    bm25Scores.set(r.id, bm25Norm(r.score))
    bm25Chunks.set(r.id, r)
  }

  const semScores = new Map<number, number>()
  const semChunks = new Map<number, ChunkResultat>()
  for (const r of semResultats) {
    semScores.set(r.id, r.score) // déjà normalisé [0,1] par semNorm
    semChunks.set(r.id, r)
  }

  // Union des IDs candidats
  const tousIds = new Set([...bm25Scores.keys(), ...semScores.keys()])

  const resultats: ChunkResultat[] = []
  for (const id of tousIds) {
    const score =
      POIDS_BM25 * (bm25Scores.get(id) ?? 0) +
      POIDS_SEM * (semScores.get(id) ?? 0)
    const chunk = bm25Chunks.get(id) ?? semChunks.get(id)!
    resultats.push({ ...chunk, score })
  }

  resultats.sort((a, b) => b.score - a.score)
  return resultats.slice(0, topK)
}
