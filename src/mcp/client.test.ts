import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClientMcp } from './client.js'
import type { McpServeurConfig } from '../config.js'

// Mock du SDK MCP
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        { name: 'read_file', description: 'Lire un fichier', inputSchema: { type: 'object' } },
        { name: 'list_directory', description: 'Lister un dossier', inputSchema: { type: 'object' } },
      ],
    }),
    listResources: vi.fn().mockResolvedValue({
      resources: [
        { uri: 'file:///test.txt', name: 'test.txt', description: 'Fichier de test', mimeType: 'text/plain' },
      ],
    }),
    readResource: vi.fn().mockResolvedValue({
      contents: [{ text: 'Contenu du fichier de test' }],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Résultat de l\'outil' }],
    }),
  })),
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}))

describe('ClientMcp', () => {
  let client: ClientMcp
  const config: McpServeurConfig = {
    nom: 'test-server',
    commande: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  }

  beforeEach(() => {
    client = new ClientMcp('test-server')
  })

  it('connecter() initialise tools et resources', async () => {
    await client.connecter(config)
    expect(client.tools).toHaveLength(2)
    expect(client.resources).toHaveLength(1)
    expect(client.tools[0].nom).toBe('read_file')
    expect(client.tools[0].clientNom).toBe('test-server')
  })

  it('lireRessource() retourne le contenu texte', async () => {
    await client.connecter(config)
    const contenu = await client.lireRessource('file:///test.txt')
    expect(contenu).toBe('Contenu du fichier de test')
  })

  it('appelerOutil() retourne le résultat texte', async () => {
    await client.connecter(config)
    const resultat = await client.appelerOutil('read_file', { path: '/tmp/test.txt' })
    expect(resultat).toBe("Résultat de l'outil")
  })

  it('fermer() ne throw pas', async () => {
    await client.connecter(config)
    await expect(client.fermer()).resolves.toBeUndefined()
  })
})
