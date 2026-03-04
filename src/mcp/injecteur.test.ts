import { describe, it, expect, vi } from 'vitest'
import { injecterContexteMcp } from './injecteur.js'
import type { ClientMcp, ToolMcp, ResourceMcp } from './client.js'
import type { ResultatPertinence } from './pertinence.js'

function creerClientMock(
  nom: string,
  tools: ToolMcp[] = [],
  resources: ResourceMcp[] = [],
  contenuRessource = 'Contenu de test'
): ClientMcp {
  return {
    nom,
    tools,
    resources,
    lireRessource: vi.fn().mockResolvedValue(contenuRessource),
  } as unknown as ClientMcp
}

describe('injecterContexteMcp', () => {
  const messagesBase = [
    { role: 'user', content: 'Bonjour' },
    { role: 'assistant', content: 'Bonjour !' },
    { role: 'user', content: 'Lis le fichier README.md' },
  ]

  it('ne modifie pas les messages si pertinent=false', async () => {
    const resultat: ResultatPertinence = { pertinent: false, tools: [], resources: [] }
    const { messages, toolsDisponibles } = await injecterContexteMcp(
      messagesBase, resultat, [], false
    )
    expect(messages).toEqual(messagesBase)
    expect(toolsDisponibles).toHaveLength(0)
  })

  it('injecte un message système avant le dernier user si resources pertinentes', async () => {
    const resource: ResourceMcp = {
      uri: 'file:///README.md', nom: 'README.md', description: '', clientNom: 'filesystem'
    }
    const client = creerClientMock('filesystem', [], [resource], '# Mon README\nContenu ici')
    const resultat: ResultatPertinence = { pertinent: true, tools: [], resources: [resource] }

    const { messages } = await injecterContexteMcp(messagesBase, resultat, [client], false)

    // Le message système doit être inséré avant le dernier user
    expect(messages.length).toBe(messagesBase.length + 1)
    const idx = messages.findIndex((m) => m.role === 'system' && m.content.includes('README.md'))
    expect(idx).toBeGreaterThan(-1)
    // Le dernier message doit toujours être user
    expect(messages[messages.length - 1].role).toBe('user')
    // Le message système doit être juste avant le dernier user
    expect(messages[messages.length - 2].role).toBe('system')
  })

  it('retourne les tools disponibles', async () => {
    const tool: ToolMcp = {
      nom: 'read_file', description: 'Lire un fichier', inputSchema: {}, clientNom: 'filesystem'
    }
    const client = creerClientMock('filesystem', [tool], [])
    const resultat: ResultatPertinence = { pertinent: true, tools: [tool], resources: [] }

    const { toolsDisponibles } = await injecterContexteMcp(messagesBase, resultat, [client], false)
    expect(toolsDisponibles).toHaveLength(1)
    expect(toolsDisponibles[0].nom).toBe('read_file')
  })

  it('tronque le contenu des resources trop longues', async () => {
    const contenuLong = 'x'.repeat(5000)
    const resource: ResourceMcp = {
      uri: 'file:///gros.txt', nom: 'gros.txt', description: '', clientNom: 'filesystem'
    }
    const client = creerClientMock('filesystem', [], [resource], contenuLong)
    const resultat: ResultatPertinence = { pertinent: true, tools: [], resources: [resource] }

    const { messages } = await injecterContexteMcp(messagesBase, resultat, [client], false)
    const msgSysteme = messages.find((m) => m.role === 'system')
    expect(msgSysteme?.content).toContain('[...tronqué]')
  })
})
