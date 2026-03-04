import { existsSync, readFileSync } from 'fs'

export interface Config {
  port: number
  ollamaUrl: string
  modele: string
  numCtx: number
  verbose: boolean
  cheminBdd: string
}

export const configDefaut: Config = {
  port: 11435,
  ollamaUrl: 'http://localhost:11434',
  modele: 'qwen3:1.7b',
  numCtx: 16384,
  verbose: false,
  cheminBdd: '.bluetang/index.db',
}

// Lit .bluetang.json dans le répertoire courant (silencieux si absent)
export function chargerConfigFichier(chemin = '.bluetang.json'): Partial<Config> {
  if (!existsSync(chemin)) return {}
  try {
    const json = JSON.parse(readFileSync(chemin, 'utf-8')) as Partial<Config>
    // Filtrer les clés inconnues
    const clesValides = new Set(Object.keys(configDefaut))
    return Object.fromEntries(
      Object.entries(json).filter(([k]) => clesValides.has(k))
    ) as Partial<Config>
  } catch {
    console.warn(`⚠ .bluetang.json invalide — valeurs par défaut utilisées`)
    return {}
  }
}
