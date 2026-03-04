import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { initSchema } from '../src/bdd/schema.js'
import { rechercherBM25, rechercherSemantique, rechercherHybrid } from '../src/rag/recherche.js'
import { enrichirMessages } from '../src/rag/assembleur.js'
import type { Db } from '../src/bdd/connexion.js'

function creerBddTest(): Db {
  const db = new Database(':memory:')
  sqliteVec.load(db)
  initSchema(db)
  return db
}

function insererChunk(db: Db, contenu: string, chemin = '/test.ts'): number {
  db.prepare('INSERT OR IGNORE INTO fichiers (chemin, hash) VALUES (?, ?)').run(chemin, chemin)
  const fichier = db
    .prepare('SELECT id FROM fichiers WHERE chemin = ?')
    .get(chemin) as { id: number }
  const res = db.prepare(
    'INSERT INTO chunks (fichier_id, chemin, debut, fin, contenu, langage) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(fichier.id, chemin, 1, 10, contenu, 'typescript')
  return Number(res.lastInsertRowid)
}

// Vecteur unitaire de 768 dimensions (1.0 sur la dimension i, 0 ailleurs)
function vecUnitaire(dimension: number): number[] {
  return Array(768).fill(0).map((_, i) => (i === dimension ? 1.0 : 0.0))
}

function insererVec(db: Db, chunkId: number, vecteur: number[]): void {
  const res = db.prepare('INSERT INTO chunks_vec(embedding) VALUES (?)').run(JSON.stringify(vecteur))
  db.prepare('INSERT INTO chunks_vec_map(vec_rowid, chunk_id) VALUES (?, ?)').run(
    Number(res.lastInsertRowid), chunkId
  )
}

function mockOllamaEmbed(vecteur: number[]): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ embeddings: [vecteur] }),
  }))
}

// ─── BM25 ───────────────────────────────────────────────────────────────────

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

// ─── Sémantique ─────────────────────────────────────────────────────────────

describe('rechercherSemantique', () => {
  let db: Db

  beforeEach(() => {
    db = creerBddTest()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retourne le chunk le plus proche sémantiquement', async () => {
    // chunk1 avec vecteur [1, 0, ...], chunk2 avec vecteur [0, 1, ...]
    const id1 = insererChunk(db, 'fonction authentifier')
    const id2 = insererChunk(db, 'fonction envoyerEmail', '/test2.ts')
    insererVec(db, id1, vecUnitaire(0))
    insererVec(db, id2, vecUnitaire(1))

    // La requête est projetée sur dimension 0 → doit trouver chunk1 en premier
    mockOllamaEmbed(vecUnitaire(0))

    const resultats = await rechercherSemantique('authentifier', db, 'http://localhost:11434')
    expect(resultats.length).toBeGreaterThan(0)
    expect(resultats[0].id).toBe(id1)
    expect(resultats[0].score).toBeCloseTo(1.0, 1) // distance ≈ 0 → score ≈ 1
  })

  it('retourne vide si chunks_vec est vide', async () => {
    insererChunk(db, 'du contenu sans vecteur')
    mockOllamaEmbed(vecUnitaire(0))

    const resultats = await rechercherSemantique('requête', db, 'http://localhost:11434')
    expect(resultats).toHaveLength(0)
  })

  it('retourne vide si Ollama embedding échoue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' }))

    const resultats = await rechercherSemantique('requête', db, 'http://localhost:11434')
    expect(resultats).toHaveLength(0)
  })

  it('classe les résultats du plus proche au plus loin', async () => {
    const id1 = insererChunk(db, 'chunk proche', '/a.ts')
    const id2 = insererChunk(db, 'chunk éloigné', '/b.ts')
    insererVec(db, id1, vecUnitaire(0))
    insererVec(db, id2, vecUnitaire(1)) // orthogonal → éloigné

    mockOllamaEmbed(vecUnitaire(0))

    const resultats = await rechercherSemantique('requête', db, 'http://localhost:11434', 2)
    expect(resultats[0].id).toBe(id1)
    expect(resultats[0].score).toBeGreaterThan(resultats[1].score)
  })
})

// ─── Hybride ─────────────────────────────────────────────────────────────────

describe('rechercherHybrid', () => {
  let db: Db

  beforeEach(() => {
    db = creerBddTest()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('combine BM25 et sémantique pour le même chunk', async () => {
    // Le chunk contient "authentifier" → trouvé par BM25
    // Et son vecteur est proche de la requête → trouvé par sémantique
    const id1 = insererChunk(db, 'function authentifier(): void {}')
    const id2 = insererChunk(db, 'function logMessage(): void {}', '/b.ts')
    insererVec(db, id1, vecUnitaire(0))
    insererVec(db, id2, vecUnitaire(1))

    mockOllamaEmbed(vecUnitaire(0))

    const resultats = await rechercherHybrid('authentifier', db, 'http://localhost:11434')
    expect(resultats.length).toBeGreaterThan(0)
    // chunk1 doit être en tête (BM25 + sémantique convergent)
    expect(resultats[0].id).toBe(id1)
    expect(resultats[0].score).toBeGreaterThan(0)
  })

  it('retourne vide si aucune source ne trouve de résultat', async () => {
    mockOllamaEmbed(vecUnitaire(0))
    // Pas de chunks du tout
    const resultats = await rechercherHybrid('requête', db, 'http://localhost:11434')
    expect(resultats).toHaveLength(0)
  })

  it('les scores hybrid sont dans [0, 1]', async () => {
    const id = insererChunk(db, 'function test(): void {}')
    insererVec(db, id, vecUnitaire(0))
    mockOllamaEmbed(vecUnitaire(0))

    const resultats = await rechercherHybrid('test', db, 'http://localhost:11434')
    for (const r of resultats) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1)
    }
  })
})

// ─── Assembleur ─────────────────────────────────────────────────────────────

describe('enrichirMessages', () => {
  let db: Db

  beforeEach(() => {
    db = creerBddTest()
    insererChunk(db, 'function calculerTaxe(montant: number): number { return montant * 0.2 }')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('injecte un message system si des chunks BM25 sont trouvés (sans ollamaUrl)', async () => {
    const messages = [{ role: 'user', content: 'calculerTaxe montant' }]
    const enrichis = await enrichirMessages(messages, db)

    expect(enrichis.length).toBeGreaterThan(1)
    const systemMessages = enrichis.filter((m) => m.role === 'system')
    expect(systemMessages.length).toBeGreaterThan(0)
    expect(systemMessages[0].content).toContain('calculerTaxe')
  })

  it('ne modifie pas les messages si aucun chunk trouvé (BM25)', async () => {
    const messages = [{ role: 'user', content: 'termeInexistantXYZ' }]
    const enrichis = await enrichirMessages(messages, db)
    expect(enrichis).toHaveLength(1)
  })

  it('préserve l\'ordre : contexte injecté avant le dernier message user', async () => {
    const messages = [
      { role: 'user', content: 'premier message' },
      { role: 'assistant', content: 'réponse' },
      { role: 'user', content: 'Comment calculer la taxe ?' },
    ]
    const enrichis = await enrichirMessages(messages, db)
    const indexSystem = enrichis.findIndex((m) => m.role === 'system')
    const indexDernierUser = enrichis.map((m) => m.role).lastIndexOf('user')
    expect(indexSystem).toBeLessThan(indexDernierUser)
  })

  it('utilise hybrid search si ollamaUrl fourni', async () => {
    const id = insererChunk(db, 'function calculerTaxe(montant: number): number { return montant * 0.2 }', '/calc.ts')
    insererVec(db, id, vecUnitaire(0))
    mockOllamaEmbed(vecUnitaire(0))

    const messages = [{ role: 'user', content: 'calculerTaxe montant' }]
    const enrichis = await enrichirMessages(messages, db, 'http://localhost:11434')

    // Le score hybride doit dépasser le seuil → injection attendue
    const systemMessages = enrichis.filter((m) => m.role === 'system')
    expect(systemMessages.length).toBeGreaterThan(0)
  })

  it('applique le seuil de pertinence : pas d\'injection si score trop faible', async () => {
    // chunk orthogonal à la requête → score sémantique ≈ 0
    // BM25 : "termeInexistant" ne matche rien → score BM25 = 0
    // → hybrid score = 0 < 0.35 → pas d'injection
    const id = insererChunk(db, 'function xyz(): void {}', '/unrelated.ts')
    insererVec(db, id, vecUnitaire(1)) // vecteur orthogonal

    // La requête est sur dimension 0, le chunk est sur dimension 1 → distance = √2, cosine = 0
    mockOllamaEmbed(vecUnitaire(0))

    const messages = [{ role: 'user', content: 'termeInexistantXYZ' }]
    const enrichis = await enrichirMessages(messages, db, 'http://localhost:11434')
    expect(enrichis).toHaveLength(1) // aucun message system ajouté
  })
})
