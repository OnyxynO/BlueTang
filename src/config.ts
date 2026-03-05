import { existsSync, readFileSync } from 'fs'
import { z } from 'zod'

const McpServeurConfigSchema = z.object({
  nom: z.string().min(1),
  commande: z.string().min(1),
  args: z.array(z.string()),
})

export interface McpServeurConfig {
  nom: string
  commande: string
  args: string[]
}

// SEC-01 : validation URL — http:// ou https:// uniquement
function validerUrlOllama(v: string): boolean {
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).optional(),
  ollamaUrl: z.string().refine(validerUrlOllama, 'URL invalide (doit commencer par http:// ou https://)').optional(),
  modele: z.string().min(1).optional(),
  numCtx: z.number().int().min(512).max(131072).optional(),
  cheminBdd: z.string().optional(),
  mcp: z.array(McpServeurConfigSchema).optional(),
})

export interface Config {
  port: number
  ollamaUrl: string
  modele: string
  numCtx: number
  verbose: boolean
  cheminBdd: string
  mcp: McpServeurConfig[]
}

export const configDefaut: Config = {
  port: 11435,
  ollamaUrl: 'http://localhost:11434',
  modele: 'qwen3:1.7b',
  numCtx: 16384,
  verbose: false,
  cheminBdd: '.bluetang/index.db',
  mcp: [],
}

// Lit .bluetang.json dans le répertoire courant (silencieux si absent)
export function chargerConfigFichier(chemin = '.bluetang.json'): Partial<Config> {
  if (!existsSync(chemin)) return {}
  try {
    const json = JSON.parse(readFileSync(chemin, 'utf-8'))
    const resultat = ConfigSchema.safeParse(json)
    if (!resultat.success) {
      const erreurs = resultat.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      console.warn(`⚠ .bluetang.json invalide — ${erreurs}`)
      return {}
    }
    return resultat.data as Partial<Config>
  } catch {
    console.warn(`⚠ .bluetang.json invalide — valeurs par défaut utilisées`)
    return {}
  }
}
