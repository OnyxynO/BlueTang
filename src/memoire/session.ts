import { createHash } from 'crypto'
import type { Db } from '../bdd/connexion.js'
import { extraireFaits } from './resume.js'

export interface ContexteMemoire {
  sessionId: string
  resume: string | null
  faits: string[]
  nombreMessages: number
}

// Identifie une session via le SHA-256 des 3 premiers messages (best-effort)
export function identifierSession(messages: { role: string; content: string }[]): string {
  const premiers = messages.slice(0, 3)
  const fingerprint = premiers.map((m) => `${m.role}:${m.content}`).join('||')
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)
}

export function chargerContexte(
  messages: { role: string; content: string }[],
  db: Db
): ContexteMemoire {
  const sessionId = identifierSession(messages)

  const session = db
    .prepare<[string], { resume: string | null; faits: string }>(
      'SELECT resume, faits FROM sessions WHERE id = ?'
    )
    .get(sessionId)

  if (!session) {
    return { sessionId, resume: null, faits: [], nombreMessages: 0 }
  }

  const { n: nombreMessages } = db
    .prepare<[string], { n: number }>(
      'SELECT COUNT(*) as n FROM messages_session WHERE session_id = ?'
    )
    .get(sessionId)!

  return {
    sessionId,
    resume: session.resume,
    faits: JSON.parse(session.faits || '[]') as string[],
    nombreMessages,
  }
}

// Injecte le résumé et les faits connus en premier message système
export function injecterMemoire(
  messages: { role: string; content: string }[],
  contexte: ContexteMemoire
): { role: string; content: string }[] {
  if (!contexte.resume && contexte.faits.length === 0) return messages

  const parties: string[] = ['## Contexte de conversation\n']

  if (contexte.resume) {
    parties.push(`### Résumé des échanges précédents\n${contexte.resume}`)
  }

  if (contexte.faits.length > 0) {
    parties.push(
      `### Informations retenues\n${contexte.faits.map((f) => `- ${f}`).join('\n')}`
    )
  }

  return [{ role: 'system', content: parties.join('\n\n') }, ...messages]
}

export function sauvegarderEchange(
  contexte: ContexteMemoire,
  userContent: string,
  assistantContent: string,
  db: Db
): void {
  const stmtUpsert = db.prepare(
    "INSERT INTO sessions (id) VALUES (?) ON CONFLICT(id) DO UPDATE SET mis_a_jour = datetime('now')"
  )
  const stmtMsg = db.prepare(
    'INSERT INTO messages_session (session_id, role, contenu) VALUES (?, ?, ?)'
  )
  const stmtFaits = db.prepare('UPDATE sessions SET faits = ? WHERE id = ?')

  const nouveauxFaits = extraireFaits(userContent)

  db.transaction(() => {
    stmtUpsert.run(contexte.sessionId)
    stmtMsg.run(contexte.sessionId, 'user', userContent)
    stmtMsg.run(contexte.sessionId, 'assistant', assistantContent)

    if (nouveauxFaits.length > 0) {
      const tousLesFaits = [...new Set([...contexte.faits, ...nouveauxFaits])]
      stmtFaits.run(JSON.stringify(tousLesFaits), contexte.sessionId)
    }
  })()
}
