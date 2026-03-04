import type { Db } from '../bdd/connexion.js'

// Déclenchement du résumé progressif
const SEUIL_RESUME = 10       // nombre minimum de messages pour déclencher
const MESSAGES_HORS_RESUME = 5 // messages récents exclus du résumé (restent in-context)
const INTERVAL_RESUME = 5     // re-résumer tous les N nouveaux messages au-delà du seuil

interface PatternFait {
  regex: RegExp
  etiquette: string
}

const PATTERNS_FAITS: PatternFait[] = [
  { regex: /je m'appelle\s+(\w+)/gi, etiquette: 'Prénom' },
  { regex: /mon nom est\s+(\w+)/gi, etiquette: 'Nom' },
  { regex: /j'utilise\s+([^.!?\n]{2,80})/gi, etiquette: 'Outil' },
  { regex: /je travaille (?:sur|avec)\s+([^.!?\n]{2,80})/gi, etiquette: 'Projet' },
  { regex: /je préfère\s+([^.!?\n]{2,80})/gi, etiquette: 'Préférence' },
  { regex: /mon (?:projet|appli|application)(?:\s+s'appelle)?\s+([^.!?\n]{2,60})/gi, etiquette: 'Projet' },
]

export function extraireFaits(texte: string): string[] {
  const faits: string[] = []
  for (const { regex, etiquette } of PATTERNS_FAITS) {
    for (const match of texte.matchAll(regex)) {
      const valeur = match[1]?.trim()
      if (valeur) faits.push(`${etiquette} : ${valeur}`)
    }
  }
  return faits
}

export async function mettreAJourResume(
  sessionId: string,
  db: Db,
  ollamaUrl: string,
  modele: string
): Promise<void> {
  const { n: count } = db
    .prepare<[string], { n: number }>(
      'SELECT COUNT(*) as n FROM messages_session WHERE session_id = ?'
    )
    .get(sessionId)!

  // Ne résumer que si au-delà du seuil ET à l'intervalle prévu
  if (count < SEUIL_RESUME || count % INTERVAL_RESUME !== 0) return

  const messagesAResumer = db
    .prepare<[string, number], { role: string; contenu: string }>(
      `SELECT role, contenu FROM messages_session
       WHERE session_id = ?
       ORDER BY cree_le
       LIMIT ?`
    )
    .all(sessionId, count - MESSAGES_HORS_RESUME)

  if (messagesAResumer.length === 0) return

  const { resume: resumeActuel } = db
    .prepare<[string], { resume: string | null }>('SELECT resume FROM sessions WHERE id = ?')
    .get(sessionId) ?? { resume: null }

  const conversation = messagesAResumer
    .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${m.contenu}`)
    .join('\n')

  const prompt = resumeActuel
    ? `Résumé précédent :\n${resumeActuel}\n\nNouveaux échanges :\n${conversation}\n\nMets à jour le résumé (max 200 mots) en intégrant les nouvelles informations importantes.`
    : `Conversation :\n${conversation}\n\nFais un résumé concis (max 200 mots) des points importants à retenir pour la suite.`

  try {
    const reponse = await fetch(`${ollamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modele,
        messages: [
          { role: 'system', content: 'Tu résumes des conversations de façon concise et fidèle.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
      }),
    })

    if (reponse.ok) {
      const data = (await reponse.json()) as { choices: [{ message: { content: string } }] }
      const resume = data.choices[0].message.content.trim()
      db.prepare("UPDATE sessions SET resume = ?, mis_a_jour = datetime('now') WHERE id = ?").run(
        resume,
        sessionId
      )
    }
  } catch {
    // Résumé best-effort : on n'interrompt pas le flux principal
  }
}
