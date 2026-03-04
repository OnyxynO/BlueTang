import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpServeurConfig } from '../config.js'

export interface ToolMcp {
  nom: string
  description: string
  inputSchema: Record<string, unknown>
  clientNom: string
}

export interface ResourceMcp {
  uri: string
  nom: string
  description: string
  mimeType?: string
  clientNom: string
}

export class ClientMcp {
  private client: Client
  private transport: StdioClientTransport | null = null
  nom: string
  tools: ToolMcp[] = []
  resources: ResourceMcp[] = []

  constructor(nom: string) {
    this.nom = nom
    this.client = new Client({ name: 'bluetang', version: '0.2.0' })
  }

  async connecter(config: McpServeurConfig): Promise<void> {
    this.transport = new StdioClientTransport({
      command: config.commande,
      args: config.args,
    })
    await this.client.connect(this.transport)
    await Promise.all([this.listerOutils(), this.listerRessources()])
  }

  async listerOutils(): Promise<ToolMcp[]> {
    try {
      const reponse = await this.client.listTools()
      this.tools = reponse.tools.map((t) => ({
        nom: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
        clientNom: this.nom,
      }))
    } catch {
      this.tools = []
    }
    return this.tools
  }

  async listerRessources(): Promise<ResourceMcp[]> {
    try {
      const reponse = await this.client.listResources()
      this.resources = reponse.resources.map((r) => ({
        uri: r.uri,
        nom: r.name,
        description: r.description ?? '',
        mimeType: r.mimeType,
        clientNom: this.nom,
      }))
    } catch {
      this.resources = []
    }
    return this.resources
  }

  async lireRessource(uri: string): Promise<string> {
    const reponse = await this.client.readResource({ uri })
    const contenu = reponse.contents[0]
    if (!contenu) return ''
    if ('text' in contenu && typeof contenu.text === 'string') return contenu.text
    if ('blob' in contenu && typeof contenu.blob === 'string') return contenu.blob
    return ''
  }

  async appelerOutil(nom: string, args: Record<string, unknown>): Promise<string> {
    const reponse = await this.client.callTool({ name: nom, arguments: args })
    const contenu = (reponse.content as unknown[])[0]
    if (!contenu) return ''
    if (
      typeof contenu === 'object' &&
      contenu !== null &&
      'type' in contenu &&
      (contenu as { type: string }).type === 'text' &&
      'text' in contenu &&
      typeof (contenu as { text: unknown }).text === 'string'
    ) {
      return (contenu as { text: string }).text
    }
    return JSON.stringify(contenu)
  }

  async fermer(): Promise<void> {
    try {
      await this.client.close()
    } catch { /* best-effort */ }
  }
}
