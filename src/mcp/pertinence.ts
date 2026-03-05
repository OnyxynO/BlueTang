import type { ClientMcp, ToolMcp, ResourceMcp } from './client.js'
import { STOPWORDS } from '../utils/stopwords.js'

const SEUIL_MCP = 0.3

export interface ResultatPertinence {
  pertinent: boolean
  tools: ToolMcp[]
  resources: ResourceMcp[]
}

function extraireTermes(texte: string): Set<string> {
  return new Set(
    texte
      .toLowerCase()
      .replace(/[^a-z0-9àâäéèêëïîôùûüç_]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  )
}

function scorerTexte(termesRequete: Set<string>, texte: string): number {
  if (termesRequete.size === 0) return 0
  const termesTexte = extraireTermes(texte)
  let intersection = 0
  for (const t of termesRequete) {
    if (termesTexte.has(t)) intersection++
  }
  return intersection / termesRequete.size
}

export function scorerPertinenceMcp(
  requete: string,
  clients: ClientMcp[]
): ResultatPertinence {
  const termesRequete = extraireTermes(requete)

  const toolsPertinents: ToolMcp[] = []
  const resourcesPertinentes: ResourceMcp[] = []

  for (const client of clients) {
    for (const tool of client.tools) {
      const score = scorerTexte(termesRequete, `${tool.nom} ${tool.description}`)
      if (score >= SEUIL_MCP) {
        toolsPertinents.push(tool)
      }
    }
    for (const resource of client.resources) {
      const score = scorerTexte(termesRequete, `${resource.nom} ${resource.description} ${resource.uri}`)
      if (score >= SEUIL_MCP) {
        resourcesPertinentes.push(resource)
      }
    }
  }

  return {
    pertinent: toolsPertinents.length > 0 || resourcesPertinentes.length > 0,
    tools: toolsPertinents,
    resources: resourcesPertinentes,
  }
}
