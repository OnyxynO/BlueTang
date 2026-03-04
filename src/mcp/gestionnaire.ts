import { ClientMcp } from './client.js'
import type { McpServeurConfig } from '../config.js'

export class GestionnaireMcp {
  private clients: Map<string, ClientMcp> = new Map()

  async initialiser(configs: McpServeurConfig[], verbose = false): Promise<void> {
    for (const config of configs) {
      const client = new ClientMcp(config.nom)
      try {
        await client.connecter(config)
        this.clients.set(config.nom, client)
        if (verbose) {
          console.log(
            `MCP [${config.nom}] : ${client.tools.length} outil(s), ${client.resources.length} ressource(s)`
          )
        }
      } catch (err) {
        console.warn(
          `⚠ MCP [${config.nom}] : connexion échouée — ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  obtenirClients(): ClientMcp[] {
    return [...this.clients.values()]
  }

  obtenirClient(nom: string): ClientMcp | undefined {
    return this.clients.get(nom)
  }

  async fermerTout(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.fermer()))
    this.clients.clear()
  }
}
