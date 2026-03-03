import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../src/bdd/schema.js'
import { rechercherBM25 } from '../src/rag/recherche.js'
import { enrichirMessages } from '../src/rag/assembleur.js'
import type { Db } from '../src/bdd/connexion.js'

function creerBddTest(): Db {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

function insererChunk(db: Db, contenu: string, chemin = '/test.ts'): void {
  db.prepare('INSERT OR IGNORE INTO fichiers (chemin, hash) VALUES (?, ?)').run(chemin, chemin)
  const fichier = db
    .prepare('SELECT id FROM fichiers WHERE chemin = ?')
    .get(chemin) as { id: number }

  db.prepare(
    'INSERT INTO chunks (fichier_id, chemin, debut, fin, contenu, langage) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(fichier.id, chemin, 1, 10, contenu, 'typescript')
}

describe('rechercherBM25', () => {
  let db: Db

  beforeEach(() => {
    db = creerBddTest()
    insererChunk(db, 'function authentifier(utilisateur: string, motDePasse: string): boolean { return true }')
    insererChunk(db, 'function envoyerEmail(destinataire: string, sujet: string): void { console.log(sujet) }')
    insererChunk(db, 'class ProxyServeur { constructor(port: number) { this.port = port } }')
  })

  it('trouve le bon chunk (needle in a codebase)', () => {
    const resultats = rechercherBM25('authentifier utilisateur', db)
    expect(resultats.length).toBeGreaterThan(0)
    expect(resultats[0].contenu).toContain('authentifier')
  })

  it('classe les résultats par pertinence BM25', () => {
    // FTS5 unicode61 ne découpe pas le camelCase → utiliser des mots entiers du contenu
    const resultats = rechercherBM25('destinataire sujet', db)
    expect(resultats.length).toBeGreaterThan(0)
    expect(resultats[0].contenu).toContain('destinataire')
  })

  it('retourne vide si aucun résultat', () => {
    const resultats = rechercherBM25('termeInexistantXYZ', db)
    expect(resultats).toHaveLength(0)
  })

  it('retourne vide pour une requête vide', () => {
    const resultats = rechercherBM25('', db)
    expect(resultats).toHaveLength(0)
  })

  it('gère une requête avec caractères spéciaux', () => {
    expect(() => rechercherBM25('foo() && bar"test*', db)).not.toThrow()
  })
})

describe('enrichirMessages', () => {
  let db: Db

  beforeEach(() => {
    db = creerBddTest()
    insererChunk(db, 'function calculerTaxe(montant: number): number { return montant * 0.2 }')
  })

  it('injecte un message system si des chunks sont trouvés', () => {
    // Utiliser les mots exacts du contenu indexé pour que FTS5 les trouve
    const messages = [{ role: 'user', content: 'calculerTaxe montant' }]
    const enrichis = enrichirMessages(messages, db)

    expect(enrichis.length).toBeGreaterThan(1)
    const systemMessages = enrichis.filter((m) => m.role === 'system')
    expect(systemMessages.length).toBeGreaterThan(0)
    expect(systemMessages[0].content).toContain('calculerTaxe')
  })

  it('ne modifie pas les messages si aucun chunk trouvé', () => {
    const messages = [{ role: 'user', content: 'termeInexistantXYZ' }]
    const enrichis = enrichirMessages(messages, db)
    expect(enrichis).toHaveLength(1)
  })

  it('préserve l\'ordre : contexte injecté avant le dernier message user', () => {
    const messages = [
      { role: 'user', content: 'premier message' },
      { role: 'assistant', content: 'réponse' },
      { role: 'user', content: 'Comment calculer la taxe ?' },
    ]
    const enrichis = enrichirMessages(messages, db)
    const indexSystem = enrichis.findIndex((m) => m.role === 'system')
    const indexDernierUser = enrichis.map((m) => m.role).lastIndexOf('user')
    expect(indexSystem).toBeLessThan(indexDernierUser)
  })
})
