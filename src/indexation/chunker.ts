import path from 'path'
import { createRequire } from 'module'
import Parser from 'tree-sitter'

// Les grammaires tree-sitter sont des modules CJS → createRequire pour ESM
const _require = createRequire(import.meta.url)
const TypeScript = _require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown }
const JavaScript = _require('tree-sitter-javascript') as unknown
const Python = _require('tree-sitter-python') as unknown
const PHP = _require('tree-sitter-php') as { php: unknown }

export interface Chunk {
  contenu: string
  debut: number
  fin: number
  langage: string
}

const TAILLE_MAX_LIGNES = 150
const TAILLE_MIN_LIGNES = 3

const LANGAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.php': 'php',
  '.md': 'markdown',
}

// Parseur singleton (Node.js est mono-thread, réutilisation sûre)
const parseur = new Parser()

// Types de nœuds qui constituent une déclaration majeure à séparer en chunk
const DECLARATIONS_MAJEURES: Record<string, ReadonlySet<string>> = {
  typescript: new Set([
    'function_declaration',
    'class_declaration',
    'abstract_class_declaration',
    'interface_declaration',
    'enum_declaration',
    'type_alias_declaration',
  ]),
  javascript: new Set([
    'function_declaration',
    'class_declaration',
  ]),
  python: new Set([
    'function_definition',
    'class_definition',
    'decorated_definition',
  ]),
  php: new Set([
    'function_definition',
    'class_declaration',
  ]),
}

// Un export_statement ne compte que s'il emballe une vraie déclaration
const DECLARATIONS_EXPORTABLES = new Set([
  'function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'enum_declaration',
])

function estDeclarationMajeure(noeud: Parser.SyntaxNode, nom: string): boolean {
  const types = DECLARATIONS_MAJEURES[nom]
  if (!types) return false
  if (types.has(noeud.type)) return true

  // export function / export class / export default function …
  if ((nom === 'typescript' || nom === 'javascript') && noeud.type === 'export_statement') {
    return noeud.children.some((c) => DECLARATIONS_EXPORTABLES.has(c.type))
  }
  return false
}

function configurerParseur(chemin: string): string | null {
  const ext = path.extname(chemin)
  switch (ext) {
    case '.ts':  parseur.setLanguage(TypeScript.typescript); return 'typescript'
    case '.tsx': parseur.setLanguage(TypeScript.tsx);        return 'typescript'
    case '.js':
    case '.jsx': parseur.setLanguage(JavaScript);            return 'javascript'
    case '.py':  parseur.setLanguage(Python);                return 'python'
    case '.php': parseur.setLanguage(PHP.php);               return 'php'
    default:     return null
  }
}

// Découpe un code source via l'AST tree-sitter
function chunkerAvecAST(contenu: string, langage: string, nom: string): Chunk[] {
  const tree = parseur.parse(contenu)
  const lignes = contenu.split('\n')
  const chunks: Chunk[] = []
  let curseur = 0 // prochaine ligne à inclure dans le preamble

  const viderPreamble = (jusqua: number) => {
    if (jusqua <= curseur) return
    const texte = lignes.slice(curseur, jusqua).join('\n').trim()
    if (texte.length > 0) {
      chunks.push({ contenu: texte, debut: curseur + 1, fin: jusqua, langage })
    }
  }

  for (const enfant of tree.rootNode.children) {
    if (enfant.type === 'ERROR') continue

    if (estDeclarationMajeure(enfant, nom)) {
      viderPreamble(enfant.startPosition.row)

      const debut = enfant.startPosition.row
      const fin = enfant.endPosition.row + 1

      // Chunk trop grand → découper au maximum de lignes
      for (let i = debut; i < fin; i += TAILLE_MAX_LIGNES) {
        const borneFin = Math.min(i + TAILLE_MAX_LIGNES, fin)
        chunks.push({
          contenu: lignes.slice(i, borneFin).join('\n'),
          debut: i + 1,
          fin: borneFin,
          langage,
        })
      }
      curseur = fin
    }
  }

  viderPreamble(lignes.length)
  return chunks.filter((c) => c.contenu.trim().length > 0)
}

// Découpage heuristique pour Markdown (titres) et formats sans grammaire tree-sitter
function chunkerHeuristique(contenu: string, chemin: string): Chunk[] {
  const langage = LANGAGES[path.extname(chemin)] ?? 'text'
  const lignes = contenu.split('\n')

  const PATTERN_MARKDOWN = /^#{1,3}\s+\S/
  const pointsCoupure: number[] = [0]

  if (langage === 'markdown') {
    for (let i = 1; i < lignes.length; i++) {
      if (PATTERN_MARKDOWN.test(lignes[i])) pointsCoupure.push(i)
    }
  }
  pointsCoupure.push(lignes.length)

  const chunks: Chunk[] = []
  for (let i = 0; i < pointsCoupure.length - 1; i++) {
    let debut = pointsCoupure[i]
    const finSection = pointsCoupure[i + 1]
    while (debut < finSection) {
      const fin = Math.min(debut + TAILLE_MAX_LIGNES, finSection)
      const texte = lignes.slice(debut, fin).join('\n')
      if (texte.trim().length > 0) {
        chunks.push({ contenu: texte, debut: debut + 1, fin, langage })
      }
      debut = fin
    }
  }
  return chunks
}

export function chunkerFichier(contenu: string, chemin: string): Chunk[] {
  const lignes = contenu.split('\n')
  const langage = LANGAGES[path.extname(chemin)] ?? 'text'

  if (lignes.length <= TAILLE_MIN_LIGNES) {
    return [{ contenu, debut: 1, fin: lignes.length, langage }]
  }

  const nom = configurerParseur(chemin)
  if (nom) {
    try {
      return chunkerAvecAST(contenu, langage, nom)
    } catch {
      // Fallback heuristique si tree-sitter échoue (ex. fichier très corrompu)
    }
  }

  return chunkerHeuristique(contenu, chemin)
}
