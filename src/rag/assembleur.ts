import type { Db } from '../bdd/connexion.js'
import { rechercherBM25 } from './recherche.js'

// ~2000 tokens de budget pour le contexte RAG (1 token ≈ 4 caractères)
const BUDGET_CHARS = 8000

interface Message {
  role: string
  content: string
}

function assemblerContexte(chunks: ReturnType<typeof rechercherBM25>): string {
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

export function enrichirMessages(messages: Message[], db: Db): Message[] {
  const dernierUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!dernierUser) return messages

  const chunks = rechercherBM25(dernierUser.content, db)
  if (chunks.length === 0) return messages

  const contexte = assemblerContexte(chunks)
  if (!contexte) return messages

  // Injecter le contexte juste avant le dernier message utilisateur
  const resultat = [...messages]
  const indexDernierUser = resultat.map((m) => m.role).lastIndexOf('user')
  resultat.splice(indexDernierUser, 0, { role: 'system', content: contexte })

  return resultat
}
