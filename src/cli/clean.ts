import { confirm } from '@inquirer/prompts'
import { copyFileSync, existsSync } from 'fs'
import type { Db } from '../bdd/connexion.js'

export async function lancerClean(
  db: Db,
  cheminBdd: string,
  options: { index?: boolean; sessions?: boolean; all?: boolean; oui?: boolean }
): Promise<void> {
  const supprimerIndex = options.all || options.index || false
  const supprimerSessions = options.all || options.sessions || false

  if (!supprimerIndex && !supprimerSessions) {
    console.log('Spécifier au moins une option : --index, --sessions, ou --all')
    console.log('Exemple : bluetang clean --all')
    return
  }

  // Afficher ce qui sera supprimé
  if (supprimerIndex) {
    const { fichiers } = db.prepare('SELECT COUNT(*) as fichiers FROM fichiers').get() as { fichiers: number }
    const { chunks } = db.prepare('SELECT COUNT(*) as chunks FROM chunks').get() as { chunks: number }
    console.log(`Index : ${fichiers} fichier(s), ${chunks} chunk(s)`)
  }

  if (supprimerSessions) {
    const { sessions } = db.prepare('SELECT COUNT(*) as sessions FROM sessions').get() as { sessions: number }
    const { messages } = db.prepare('SELECT COUNT(*) as messages FROM messages_session').get() as { messages: number }
    console.log(`Sessions : ${sessions} session(s), ${messages} message(s)`)
  }

  const ok = options.oui || await confirm({ message: 'Confirmer la suppression ?', default: false })
  if (!ok) {
    console.log('Annulé.')
    return
  }

  // Sauvegarde avant suppression (SUP-02)
  if (existsSync(cheminBdd)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const cheminBak = `${cheminBdd}.${timestamp}.bak`
    try {
      copyFileSync(cheminBdd, cheminBak)
      console.log(`Sauvegarde : ${cheminBak}`)
    } catch { /* non bloquant */ }
  }

  if (supprimerIndex) {
    db.exec(
      'DELETE FROM chunks_vec WHERE rowid IN (SELECT vec_rowid FROM chunks_vec_map);' +
      'DELETE FROM chunks_vec_map;' +
      'DELETE FROM chunks;' +
      'DELETE FROM fichiers;'
    )
    console.log('✓ Index supprimé.')
  }

  if (supprimerSessions) {
    db.exec(
      'DELETE FROM messages_session;' +
      'DELETE FROM sessions;'
    )
    console.log('✓ Sessions supprimées.')
  }
}
