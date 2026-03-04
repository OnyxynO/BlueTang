import { describe, it, expect } from 'vitest'
import { scorerPertinenceMcp } from './pertinence.js'
import type { ClientMcp, ToolMcp, ResourceMcp } from './client.js'

function creerClientMock(
  nom: string,
  tools: Omit<ToolMcp, 'clientNom'>[],
  resources: Omit<ResourceMcp, 'clientNom'>[] = []
): ClientMcp {
  return {
    nom,
    tools: tools.map((t) => ({ ...t, clientNom: nom })),
    resources: resources.map((r) => ({ ...r, clientNom: nom })),
  } as unknown as ClientMcp
}

describe('scorerPertinenceMcp', () => {
  const clientFilesystem = creerClientMock(
    'filesystem',
    [
      { nom: 'read_file', description: 'Read a file from the filesystem', inputSchema: {} },
      { nom: 'list_directory', description: 'List directory contents', inputSchema: {} },
      { nom: 'write_file', description: 'Write content to a file', inputSchema: {} },
    ],
    [
      { uri: 'file:///README.md', nom: 'README.md', description: 'Project readme documentation' },
    ]
  )

  it('retourne pertinent=true quand la requête correspond aux tools', () => {
    // Requête avec termes qui correspondent aux descriptions anglaises des tools
    const resultat = scorerPertinenceMcp('read file from filesystem', [clientFilesystem])
    expect(resultat.pertinent).toBe(true)
    expect(resultat.tools.length).toBeGreaterThan(0)
  })

  it('retourne pertinent=false pour une requête sans correspondance', () => {
    // Requête sans termes liés au filesystem
    const resultat = scorerPertinenceMcp('quelle est la capitale de la France', [clientFilesystem])
    expect(resultat.pertinent).toBe(false)
    expect(resultat.tools).toHaveLength(0)
    expect(resultat.resources).toHaveLength(0)
  })

  it('retourne pertinent=false pour une liste de clients vide', () => {
    const resultat = scorerPertinenceMcp('liste les fichiers du dossier', [])
    expect(resultat.pertinent).toBe(false)
  })

  it('retourne les resources pertinentes pour une requête documentation', () => {
    const resultat = scorerPertinenceMcp('que dit le readme documentation', [clientFilesystem])
    expect(resultat.pertinent).toBe(true)
    expect(resultat.resources.length).toBeGreaterThan(0)
    expect(resultat.resources[0].uri).toBe('file:///README.md')
  })

  it('filtre les stopwords et ne retourne pas de faux positifs', () => {
    // "le", "la", "de", "du" sont des stopwords → score nul
    const resultat = scorerPertinenceMcp('le la de du un une', [clientFilesystem])
    expect(resultat.pertinent).toBe(false)
  })
})
