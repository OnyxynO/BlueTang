import { describe, it, expect } from 'vitest'
import { commandesGestionnaire, executerAvecRepli } from '../src/cli/languages.js'

// Exécuteur factice : rejette les commandes listées avec le code d'erreur donné
function executeurFactice(echecs: Record<string, string>) {
  const appels: string[] = []
  const executer = async (cmd: string) => {
    appels.push(cmd)
    const code = echecs[cmd]
    if (code) throw Object.assign(new Error(`échec ${cmd}`), { code })
  }
  return { appels, executer }
}

describe('commandesGestionnaire', () => {
  it('propose bun puis npm, avec --legacy-peer-deps côté npm pour l\'ajout', () => {
    const [bun, npm] = commandesGestionnaire('ajouter', ['tree-sitter-go'])
    expect(bun[0]).toBe('bun')
    expect(bun[1]).toContain('add')
    expect(npm[0]).toBe('npm')
    expect(npm[1]).toEqual(expect.arrayContaining(['install', '--legacy-peer-deps', '--prefix', 'tree-sitter-go']))
  })

  it('propose bun remove puis npm uninstall pour la suppression', () => {
    const cmds = commandesGestionnaire('supprimer', ['tree-sitter-go'])
    expect(cmds.map(([c, a]) => `${c} ${a[0]}`)).toEqual(['bun remove', 'npm uninstall'])
  })
})

describe('executerAvecRepli', () => {
  const cmds = commandesGestionnaire('ajouter', ['tree-sitter-go'])

  it('utilise bun quand il est présent, sans appeler npm', async () => {
    const { appels, executer } = executeurFactice({})
    expect(await executerAvecRepli(cmds, executer)).toBe('bun')
    expect(appels).toEqual(['bun'])
  })

  it('bascule sur npm quand bun est absent du PATH (installation npm -g)', async () => {
    const { appels, executer } = executeurFactice({ bun: 'ENOENT' })
    expect(await executerAvecRepli(cmds, executer)).toBe('npm')
    expect(appels).toEqual(['bun', 'npm'])
  })

  it('ne masque pas une vraie erreur de bun derrière le repli npm', async () => {
    const { appels, executer } = executeurFactice({ bun: 'E404' })
    await expect(executerAvecRepli(cmds, executer)).rejects.toThrow('échec bun')
    expect(appels).toEqual(['bun'])
  })

  it('échoue clairement si aucun gestionnaire n\'est disponible', async () => {
    const { executer } = executeurFactice({ bun: 'ENOENT', npm: 'ENOENT' })
    await expect(executerAvecRepli(cmds, executer)).rejects.toThrow('aucun gestionnaire')
  })
})
