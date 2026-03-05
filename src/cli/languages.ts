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
    await execFileAsync('npm', ['install', '--prefix', BLUETANG_ROOT, ...packages], {
      cwd: BLUETANG_ROOT,
    })
    console.log('\nInstallés avec succès :')
    for (const l of choix) {
      console.log(`  ✓ ${l.label} (${l.extensions.join(', ')})`)
    }
    console.log('\nRelancer `bluetang index` pour réindexer avec les nouveaux langages.')
  } catch (err) {
    console.error(`\nErreur lors de l'installation : ${err instanceof Error ? err.message : String(err)}`)
    console.error(`Essaie manuellement : npm install --prefix ${BLUETANG_ROOT} ${packages.join(' ')}`)
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
    await execFileAsync('npm', ['uninstall', '--prefix', BLUETANG_ROOT, ...packages], {
      cwd: BLUETANG_ROOT,
    })
    console.log('\nDésinstallés :')
    for (const l of choix) {
      console.log(`  ✗ ${l.label}`)
    }
    console.log('\nRelancer `bluetang index` pour mettre à jour l\'index.')
  } catch (err) {
    console.error(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
  }
}
