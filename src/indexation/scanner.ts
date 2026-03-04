import { readdir, readFile } from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import ignore from 'ignore'

export const EXTENSIONS_INDEXEES = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.php', '.md'])

export const DOSSIERS_EXCLUS = new Set([
  'node_modules', '.git', 'dist', 'build', '.bluetang',
  '__pycache__', '.next', '.nuxt', 'coverage', '.cache',
])

async function chargerGitignore(racine: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore()
  try {
    const contenu = await readFile(path.join(racine, '.gitignore'), 'utf-8')
    ig.add(contenu)
  } catch {
    // Pas de .gitignore, c'est ok
  }
  return ig
}

export async function scannerDossier(racine: string): Promise<string[]> {
  const ig = await chargerGitignore(racine)
  const fichiers: string[] = []

  async function parcourir(dossier: string): Promise<void> {
    let entrees
    try {
      entrees = await readdir(dossier, { withFileTypes: true })
    } catch {
      return
    }

    for (const entree of entrees) {
      if (DOSSIERS_EXCLUS.has(entree.name)) continue

      const cheminComplet = path.join(dossier, entree.name)
      const cheminRelatif = path.relative(racine, cheminComplet)

      if (ig.ignores(cheminRelatif)) continue

      if (entree.isDirectory()) {
        await parcourir(cheminComplet)
      } else if (entree.isFile() && EXTENSIONS_INDEXEES.has(path.extname(entree.name))) {
        fichiers.push(cheminComplet)
      }
    }
  }

  await parcourir(racine)
  return fichiers
}

export async function hasherFichier(chemin: string): Promise<string> {
  const contenu = await readFile(chemin)
  return createHash('sha256').update(contenu).digest('hex')
}
