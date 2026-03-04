import type { ClientMcp, ToolMcp } from './client.js'
import type { ResultatPertinence } from './pertinence.js'

type Message = { role: string; content: string }

const MAX_RESOURCES = 3
const MAX_CHARS_PAR_RESOURCE = 4000

export async function injecterContexteMcp(
  messages: Message[],
  resultat: ResultatPertinence,
  clients: ClientMcp[],
  verbose: boolean
): Promise<{ messages: Message[]; toolsDisponibles: ToolMcp[] }> {
  if (!resultat.pertinent) {
    return { messages, toolsDisponibles: [] }
  }

  // Construire une map clientNom → client pour les lookups rapides
  const clientsMap = new Map(clients.map((c) => [c.nom, c]))

  // Lire les resources pertinentes (limité pour ne pas saturer le contexte)
  const resourcesALire = resultat.resources.slice(0, MAX_RESOURCES)
  const partiesContexte: string[] = []

  for (const resource of resourcesALire) {
    const client = clientsMap.get(resource.clientNom)
    if (!client) continue
    try {
      const contenu = await client.lireRessource(resource.uri)
      if (contenu) {
        const contenuTronque = contenu.length > MAX_CHARS_PAR_RESOURCE
          ? contenu.slice(0, MAX_CHARS_PAR_RESOURCE) + '\n[...tronqué]'
          : contenu
        partiesContexte.push(
          `### ${resource.nom} (${resource.uri})\n${contenuTronque}`
        )
        if (verbose) {
          console.log(`MCP resource lue : ${resource.uri} (${contenu.length} chars)`)
        }
      }
    } catch (err) {
      if (verbose) {
        console.warn(`MCP resource erreur [${resource.uri}] : ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // Injecter les resources comme message système si on en a
  let messagesEnrichis = messages
  if (partiesContexte.length > 0) {
    const messageSysteme: Message = {
      role: 'system',
      content: `## Contexte MCP (resources disponibles)\n\n${partiesContexte.join('\n\n---\n\n')}`,
    }
    // Insérer avant le dernier message user
    const idx = [...messages].reduceRight((acc, m, i) => (acc === -1 && m.role === 'user' ? i : acc), -1)
    messagesEnrichis = [
      ...messages.slice(0, idx),
      messageSysteme,
      ...messages.slice(idx),
    ]
  }

  return {
    messages: messagesEnrichis,
    toolsDisponibles: resultat.tools,
  }
}
