import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { initSchema } from '../src/bdd/schema.js'
import {
  identifierSession,
  chargerContexte,
  injecterMemoire,
  sauvegarderEchange,
} from '../src/memoire/session.js'
import { extraireFaits, mettreAJourResume } from '../src/memoire/resume.js'
import type { Db } from '../src/bdd/connexion.js'

function creerBddTest(): Db {
  const db = new Database(':memory:')
  sqliteVec.load(db)
  initSchema(db)
  return db
}

// ─── Identification de session ───────────────────────────────────────────────

describe('identifierSession', () => {
  it('retourne le même ID pour les mêmes premiers messages', () => {
    const msgs = [
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Salut' },
      { role: 'user', content: 'Comment vas-tu ?' },
    ]
    expect(identifierSession(msgs)).toBe(identifierSession(msgs))
  })

  it('retourne des IDs différents pour des conversations différentes', () => {
    const msgs1 = [{ role: 'user', content: 'Conversation A' }]
    const msgs2 = [{ role: 'user', content: 'Conversation B' }]
    expect(identifierSession(msgs1)).not.toBe(identifierSession(msgs2))
  })

  it('ignore les messages au-delà des 3 premiers', () => {
    const msgs = [
      { role: 'user', content: 'Premier' },
      { role: 'assistant', content: 'Deuxième' },
      { role: 'user', content: 'Troisième' },
    ]
    const msgsAvecExtra = [
      ...msgs,
      { role: 'assistant', content: 'Quatrième' },
      { role: 'user', content: 'Cinquième' },
    ]
    expect(identifierSession(msgs)).toBe(identifierSession(msgsAvecExtra))
  })

  it('retourne un hash hexadécimal de 16 caractères', () => {
    const id = identifierSession([{ role: 'user', content: 'test' }])
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

// ─── Chargement du contexte ──────────────────────────────────────────────────

describe('chargerContexte', () => {
  let db: Db

  beforeEach(() => { db = creerBddTest() })

  it('retourne un contexte vide pour une nouvelle session', () => {
    const ctx = chargerContexte([{ role: 'user', content: 'Bonjour' }], db)
    expect(ctx.resume).toBeNull()
    expect(ctx.faits).toHaveLength(0)
    expect(ctx.nombreMessages).toBe(0)
  })

  it('charge le nombre de messages après sauvegarde', () => {
    const messages = [{ role: 'user', content: 'début' }]
    const ctx1 = chargerContexte(messages, db)
    sauvegarderEchange(ctx1, 'hello', 'salut', db)

    const ctx2 = chargerContexte(messages, db)
    expect(ctx2.nombreMessages).toBe(2) // user + assistant
  })

  it('charge le résumé existant', () => {
    const messages = [{ role: 'user', content: 'début' }]
    const ctx = chargerContexte(messages, db)
    db.prepare("INSERT INTO sessions (id, resume) VALUES (?, ?)").run(ctx.sessionId, 'Résumé test')

    const ctx2 = chargerContexte(messages, db)
    expect(ctx2.resume).toBe('Résumé test')
  })
})

// ─── Injection de mémoire ────────────────────────────────────────────────────

describe('injecterMemoire', () => {
  it('ne modifie pas les messages si le contexte est vide', () => {
    const msgs = [{ role: 'user', content: 'test' }]
    const ctx = { sessionId: 'x', resume: null, faits: [], nombreMessages: 0 }
    expect(injecterMemoire(msgs, ctx)).toEqual(msgs)
  })

  it('injecte le résumé en premier message système', () => {
    const msgs = [{ role: 'user', content: 'question' }]
    const ctx = { sessionId: 'x', resume: 'Résumé précédent', faits: [], nombreMessages: 15 }
    const enrichis = injecterMemoire(msgs, ctx)

    expect(enrichis).toHaveLength(2)
    expect(enrichis[0].role).toBe('system')
    expect(enrichis[0].content).toContain('Résumé précédent')
    expect(enrichis[1]).toEqual(msgs[0])
  })

  it('injecte les faits connus', () => {
    const msgs = [{ role: 'user', content: 'test' }]
    const ctx = { sessionId: 'x', resume: null, faits: ['Prénom : Alice'], nombreMessages: 3 }
    const enrichis = injecterMemoire(msgs, ctx)

    expect(enrichis[0].content).toContain('Alice')
  })

  it('injecte résumé ET faits ensemble', () => {
    const msgs = [{ role: 'user', content: 'test' }]
    const ctx = {
      sessionId: 'x',
      resume: 'Résumé de la session',
      faits: ['Outil : TypeScript'],
      nombreMessages: 20,
    }
    const enrichis = injecterMemoire(msgs, ctx)
    expect(enrichis[0].content).toContain('Résumé de la session')
    expect(enrichis[0].content).toContain('TypeScript')
  })
})

// ─── Sauvegarde des échanges ─────────────────────────────────────────────────

describe('sauvegarderEchange', () => {
  let db: Db

  beforeEach(() => { db = creerBddTest() })

  it('crée la session et sauvegarde 2 messages (user + assistant)', () => {
    const ctx = chargerContexte([{ role: 'user', content: 'hi' }], db)
    sauvegarderEchange(ctx, 'Bonjour', 'Salut !', db)

    const { n } = db
      .prepare<[string], { n: number }>(
        'SELECT COUNT(*) as n FROM messages_session WHERE session_id = ?'
      )
      .get(ctx.sessionId)!
    expect(n).toBe(2)
  })

  it('extrait et persiste les faits automatiquement', () => {
    const msgs = [{ role: 'user', content: "je m'appelle Alice" }]
    const ctx = chargerContexte(msgs, db)
    sauvegarderEchange(ctx, "je m'appelle Alice, comment vas-tu ?", 'Bien !', db)

    const { faits } = db
      .prepare<[string], { faits: string }>('SELECT faits FROM sessions WHERE id = ?')
      .get(ctx.sessionId)!
    expect(JSON.parse(faits) as string[]).toEqual(
      expect.arrayContaining([expect.stringContaining('Alice')])
    )
  })

  it('accumule les échanges successifs', () => {
    const messages = [{ role: 'user', content: 'début' }]
    let ctx = chargerContexte(messages, db)
    sauvegarderEchange(ctx, 'message 1', 'réponse 1', db)
    ctx = chargerContexte(messages, db)
    sauvegarderEchange(ctx, 'message 2', 'réponse 2', db)

    const ctx3 = chargerContexte(messages, db)
    expect(ctx3.nombreMessages).toBe(4) // 2 échanges × 2 messages
  })
})

// ─── Extraction de faits ─────────────────────────────────────────────────────

describe('extraireFaits', () => {
  it('extrait le prénom', () => {
    expect(extraireFaits("je m'appelle Pierre")).toEqual(
      expect.arrayContaining([expect.stringContaining('Pierre')])
    )
  })

  it('extrait les outils utilisés', () => {
    expect(extraireFaits("j'utilise TypeScript pour mon projet")).toEqual(
      expect.arrayContaining([expect.stringContaining('TypeScript')])
    )
  })

  it('extrait les préférences', () => {
    expect(extraireFaits('je préfère les fonctions pures')).toEqual(
      expect.arrayContaining([expect.stringContaining('fonctions pures')])
    )
  })

  it('retourne vide si aucun pattern reconnu', () => {
    expect(extraireFaits('Quelle est la fonction de tri la plus rapide ?')).toHaveLength(0)
  })
})

// ─── Résumé progressif ───────────────────────────────────────────────────────

describe('mettreAJourResume', () => {
  let db: Db

  beforeEach(() => { db = creerBddTest() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('ne résume pas si moins de 10 messages', async () => {
    const messages = [{ role: 'user', content: 'début' }]
    const ctx = chargerContexte(messages, db)
    sauvegarderEchange(ctx, 'message', 'réponse', db) // 2 messages

    vi.stubGlobal('fetch', vi.fn())
    await mettreAJourResume(ctx.sessionId, db, 'http://localhost:11434', 'qwen3:1.7b')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('appelle Ollama et stocke le résumé quand le seuil est atteint', async () => {
    const messages = [{ role: 'user', content: 'début' }]
    let ctx = chargerContexte(messages, db)

    // 5 échanges = 10 messages (seuil)
    for (let i = 0; i < 5; i++) {
      sauvegarderEchange(ctx, `message ${i}`, `réponse ${i}`, db)
      ctx = chargerContexte(messages, db)
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Résumé généré' } }] }),
    }))

    await mettreAJourResume(ctx.sessionId, db, 'http://localhost:11434', 'qwen3:1.7b')
    expect(fetch).toHaveBeenCalled()

    const session = db
      .prepare<[string], { resume: string | null }>('SELECT resume FROM sessions WHERE id = ?')
      .get(ctx.sessionId)!
    expect(session.resume).toBe('Résumé généré')
  })

  // Critère Phase 4 : après 30 échanges, le contexte du tour 5 est accessible
  it('rétention : décision au tour 5 retrouvable au tour 30 via résumé', async () => {
    const messages = [{ role: 'user', content: 'début de session' }]

    // 15 échanges (dont un message clé au tour 5)
    for (let i = 1; i <= 15; i++) {
      const ctx = chargerContexte(messages, db)
      const userMsg = i === 5
        ? 'décision : utiliser TypeScript + Express pour ce projet'
        : `message standard ${i}`
      sauvegarderEchange(ctx, userMsg, `réponse ${i}`, db)
    }

    // Déclencher le résumé (30 messages = seuil 10, multiple de 5)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Décision clé : TypeScript + Express pour le projet' } }],
      }),
    }))

    const ctxAvantResume = chargerContexte(messages, db)
    expect(ctxAvantResume.nombreMessages).toBe(30)
    await mettreAJourResume(ctxAvantResume.sessionId, db, 'http://localhost:11434', 'qwen3:1.7b')

    // Vérifier la rétention
    const ctxFinal = chargerContexte(messages, db)
    expect(ctxFinal.resume).toContain('TypeScript')

    // L'injection doit inclure le résumé
    const enrichis = injecterMemoire([{ role: 'user', content: 'rappelle-moi nos décisions' }], ctxFinal)
    expect(enrichis[0].role).toBe('system')
    expect(enrichis[0].content).toContain('TypeScript')
  })
})
