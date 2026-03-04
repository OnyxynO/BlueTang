import type { Db } from '../bdd/connexion.js'
import { rechercherBM25, rechercherHybrid } from './recherche.js'
import type { ChunkResultat } from './recherche.js'

// ~2000 tokens de budget pour le contexte RAG (1 token ≈ 4 caractères)
const BUDGET_CHARS = 8000

// En-dessous de ce seuil (score hybride sur 1), le contexte n'est pas injecté
const SEUIL_PERTINENCE = 0.35

interface Message {
  role: string
  content: string
}

function assemblerContexte(chunks: ChunkResultat[]): string {
  let total = 0
  const parties: string[] = []

  for (const chunk of chunks) {
    if (total + chunk.contenu.length > BUDGET_CHARS) break
    parties.push(`// ${chunk.chemin}:${chunk.debut}-${chunk.fin}\n${chunk.contenu}`)
    total += chunk.contenu.length
  }

  if (parties.length === 0) return ''

  return (
    'Extraits de la codebase pertinents pour la question suivante :\n\n```\n' +
    parties.join('\n\n---\n\n') +
    '\n```'
  )
}

export async function enrichirMessages(
  messages: Message[],
  db: Db,
  ollamaUrl?: string
): Promise<Message[]> {
  const dernierUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!dernierUser) return messages

  let chunks: ChunkResultat[]

  if (ollamaUrl) {
    chunks = await rechercherHybrid(dernierUser.content, db, ollamaUrl)
    // Seuil de pertinence : pas d'injection si le meilleur score est trop faible
    if (chunks.length === 0 || chunks[0].score < SEUIL_PERTINENCE) return messages
  } else {
    chunks = rechercherBM25(dernierUser.content, db)
    if (chunks.length === 0) return messages
  }

  const contexte = assemblerContexte(chunks)
  if (!contexte) return messages

  // Injecter le contexte juste avant le dernier message utilisateur
  const resultat = [...messages]
  const indexDernierUser = resultat.map((m) => m.role).lastIndexOf('user')
  resultat.splice(indexDernierUser, 0, { role: 'system', content: contexte })

  return resultat
}
