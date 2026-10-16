import { checkbox } from '@inquirer/prompts'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  LANGAGES_INTEGRES,
  LANGAGES_OPTIONNELS,
  BLUETANG_ROOT,
  estInstalle,
} from '../langages/catalogue.js'

const execFileAsync = promisify(execFile)

type Commande = [string, string[]]
type Executeur = (cmd: string, args: string[], opts: { cwd: string }) => Promise<unknown>

// bun d'abord : le dépôt de dev est géré par bun, et npm sans package-lock.json élaguerait
// ses dépendances transitives (issue #22). npm en repli : c'est le seul gestionnaire garanti
// après un `npm install -g bluetang` (le README n'exige que Node.js).
export function commandesGestionnaire(action: 'ajouter' | 'supprimer', packages: string[]): Commande[] {
  if (action === 'ajouter') {
    return [
      ['bun', ['add', '--no-save', '--cwd', BLUETANG_ROOT, ...packages]],
      // --legacy-peer-deps : certaines grammaires (ex. tree-sitter-kotlin) déclarent une
      // peerDependency tree-sitter obsolète (^0.21) ; bun, lui, ne bloque pas dessus.
      ['npm', ['install', '--no-save', '--legacy-peer-deps', '--prefix', BLUETANG_ROOT, ...packages]],
    ]
  }
  return [
    ['bun', ['remove', '--no-save', '--cwd', BLUETANG_ROOT, ...packages]],
    ['npm', ['uninstall', '--no-save', '--prefix', BLUETANG_ROOT, ...packages]],
  ]
}

// Essaie chaque commande dans l'ordre ; ne passe à la suivante que si l'exécutable est
// absent (ENOENT). Toute autre erreur (réseau, paquet introuvable) remonte telle quelle.
export async function executerAvecRepli(
  commandes: Commande[],
  executer: Executeur = execFileAsync,
): Promise<string> {
  for (const [cmd, args] of commandes) {
    try {
      await executer(cmd, args, { cwd: BLUETANG_ROOT })
      return cmd
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
  throw new Error(`aucun gestionnaire trouvé dans le PATH (${commandes.map(([c]) => c).join(', ')})`)
}

export async function listerLanguages(): Promise<void> {
  console.log('\nLanguages intégrés (toujours disponibles) :')
  for (const lang of LANGAGES_INTEGRES) {
    console.log(`  ✓ ${lang.label.padEnd(24)} ${lang.extensions.join(', ')}`)
  }

  console.log('\nLanguages optionnels :')
  for (const lang of LANGAGES_OPTIONNELS) {
    const installe = estInstalle(lang)
    const statut = installe ? '✓ installé  ' : '○ disponible'
    console.log(`  ${statut}  ${lang.label.padEnd(24)} ${lang.extensions.join(', ')}`)
  }
  console.log('')
}

export async function ajouterLanguages(): Promise<void> {
  const nonInstalles = LANGAGES_OPTIONNELS.filter((l) => !estInstalle(l))

  if (nonInstalles.length === 0) {
    console.log('Tous les langages optionnels sont déjà installés.')
    return
  }

  const choix = await checkbox({
    message: 'Sélectionner les langages à ajouter :',
    choices: nonInstalles.map((l) => ({
      name: `${l.label.padEnd(16)} ${l.extensions.join(', ')}`,
      value: l,
    })),
  })

  if (choix.length === 0) {
    console.log('Aucun langage sélectionné.')
    return
  }

  const packages = choix.map((l) => l.package)
  console.log(`\nInstallation de ${packages.join(', ')} dans ${BLUETANG_ROOT}...`)

  try {
    await executerAvecRepli(commandesGestionnaire('ajouter', packages))
    console.log('\nInstallés avec succès :')
    for (const l of choix) {
      console.log(`  ✓ ${l.label} (${l.extensions.join(', ')})`)
    }
    console.log('\nRelancer `bluetang index` pour réindexer avec les nouveaux langages.')
  } catch (err) {
    console.error(`\nErreur lors de l'installation : ${err instanceof Error ? err.message : String(err)}`)
    console.error(`Essaie manuellement : npm install --no-save --legacy-peer-deps --prefix ${BLUETANG_ROOT} ${packages.join(' ')}`)
  }
}

export async function supprimerLanguages(): Promise<void> {
  const installes = LANGAGES_OPTIONNELS.filter(estInstalle)

  if (installes.length === 0) {
    console.log('Aucun langage optionnel installé.')
    return
  }

  const choix = await checkbox({
    message: 'Sélectionner les langages à désinstaller :',
    choices: installes.map((l) => ({
      name: `${l.label.padEnd(16)} ${l.extensions.join(', ')}`,
      value: l,
    })),
  })

  if (choix.length === 0) {
    console.log('Aucun langage sélectionné.')
    return
  }

  const packages = choix.map((l) => l.package)
  console.log(`\nDésinstallation de ${packages.join(', ')}...`)

  try {
    await executerAvecRepli(commandesGestionnaire('supprimer', packages))
    console.log('\nDésinstallés :')
    for (const l of choix) {
      console.log(`  ✗ ${l.label}`)
    }
    console.log('\nRelancer `bluetang index` pour mettre à jour l\'index.')
  } catch (err) {
    console.error(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
  }
}
