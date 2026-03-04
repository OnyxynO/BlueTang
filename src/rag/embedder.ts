const MODELE_EMBED = 'nomic-embed-text'

export async function obtenirEmbedding(texte: string, ollamaUrl: string): Promise<number[]> {
  const reponse = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELE_EMBED, input: texte }),
  })

  if (!reponse.ok) {
    throw new Error(`Ollama embed (${reponse.status}): ${await reponse.text()}`)
  }

  const data = (await reponse.json()) as { embeddings: number[][] }
  return data.embeddings[0]
}

export function vecToJson(vecteur: number[]): string {
  return JSON.stringify(vecteur)
}
