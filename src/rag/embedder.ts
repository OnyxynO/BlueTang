const MODELE_EMBED = 'nomic-embed-text'
const TIMEOUT_EMBED_MS = 30_000

export async function obtenirEmbedding(texte: string, ollamaUrl: string): Promise<number[]> {
  const reponse = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELE_EMBED, input: texte }),
    signal: AbortSignal.timeout(TIMEOUT_EMBED_MS),
  })

  if (!reponse.ok) {
    throw new Error(`Ollama embed (${reponse.status}): ${await reponse.text()}`)
  }

  const data = (await reponse.json()) as { embeddings: number[][] }
  return data.embeddings[0]
}

// C5 — Batching : envoie plusieurs textes en un seul appel Ollama
export async function obtenirEmbeddingsBatch(textes: string[], ollamaUrl: string): Promise<number[][]> {
  if (textes.length === 0) return []

  const reponse = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELE_EMBED, input: textes }),
    signal: AbortSignal.timeout(TIMEOUT_EMBED_MS),
  })

  if (!reponse.ok) {
    throw new Error(`Ollama embed batch (${reponse.status}): ${await reponse.text()}`)
  }

  const data = (await reponse.json()) as { embeddings: number[][] }
  return data.embeddings
}

export function vecToJson(vecteur: number[]): string {
  return JSON.stringify(vecteur)
}
