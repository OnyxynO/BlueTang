import { describe, it, expect } from 'vitest'
import { chunkerFichier } from '../src/indexation/chunker.js'

describe('chunkerFichier', () => {
  it('retourne un seul chunk pour un fichier court', () => {
    const contenu = 'const x = 1\nconst y = 2'
    const chunks = chunkerFichier(contenu, 'test.ts')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].contenu).toBe(contenu)
    expect(chunks[0].debut).toBe(1)
  })

  it('détecte le langage depuis l\'extension', () => {
    expect(chunkerFichier('x = 1', 'test.py')[0].langage).toBe('python')
    expect(chunkerFichier('x = 1', 'test.ts')[0].langage).toBe('typescript')
    expect(chunkerFichier('x = 1', 'test.js')[0].langage).toBe('javascript')
    expect(chunkerFichier('x = 1', 'test.php')[0].langage).toBe('php')
    expect(chunkerFichier('x = 1', 'test.md')[0].langage).toBe('markdown')
    expect(chunkerFichier('x = 1', 'test.txt')[0].langage).toBe('text')
  })

  it('découpe un fichier TypeScript aux frontières de fonctions', () => {
    const contenu = [
      'function foo() {',
      '  return 1',
      '}',
      '',
      'function bar() {',
      '  return 2',
      '}',
    ].join('\n')

    const chunks = chunkerFichier(contenu, 'test.ts')
    expect(chunks.length).toBeGreaterThanOrEqual(2)

    const toutLeTxte = chunks.map((c) => c.contenu).join('\n')
    expect(toutLeTxte).toContain('function foo')
    expect(toutLeTxte).toContain('function bar')
  })

  it('découpe un fichier Python aux frontières de fonctions', () => {
    const contenu = [
      'def foo():',
      '    return 1',
      '',
      'def bar():',
      '    return 2',
    ].join('\n')

    const chunks = chunkerFichier(contenu, 'test.py')
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks.map((c) => c.contenu).join('\n')).toContain('def bar')
  })

  it('découpe un fichier Markdown aux titres', () => {
    const contenu = [
      '# Section 1',
      'Contenu 1',
      '',
      '## Section 2',
      'Contenu 2',
    ].join('\n')

    const chunks = chunkerFichier(contenu, 'README.md')
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('respecte les numéros de ligne', () => {
    const lignes = Array.from({ length: 10 }, (_, i) => `ligne ${i + 1}`)
    const contenu = lignes.join('\n')
    const chunks = chunkerFichier(contenu, 'test.ts')
    expect(chunks[0].debut).toBe(1)
    expect(chunks[chunks.length - 1].fin).toBe(10)
  })
})
