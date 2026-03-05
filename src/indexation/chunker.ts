import path from 'path'
import Parser from 'tree-sitter'
import { mapExtensions, chargerGrammaire, type DefinitionLangage } from '../langages/catalogue.js'

export interface Chunk {
  contenu: string
  debut: number
  fin: number
  langage: string
}

const TAILLE_MAX_LIGNES = 150
const TAILLE_MIN_LIGNES = 3

// Parseur singleton (Node.js est mono-thread, réutilisation sûre)
const parseur = new Parser()

// Un export_statement ne compte que s'il emballe une vraie déclaration (TS/JS)
const DECLARATIONS_EXPORTABLES = new Set([
  'function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'enum_declaration',
])

function estDeclarationMajeure(noeud: Parser.SyntaxNode, lang: DefinitionLangage): boolean {
  const types = new Set(lang.noeuds)
  if (types.has(noeud.type)) return true

  // export function / export class (TypeScript + JavaScript)
  if ((lang.id === 'typescript' || lang.id === 'javascript') && noeud.type === 'export_statement') {
    return noeud.children.some((c) => DECLARATIONS_EXPORTABLES.has(c.type))
  }
  return false
}

function configurerParseur(chemin: string): DefinitionLangage | null {
  const ext = path.extname(chemin)
  const map = mapExtensions()
  const lang = map.get(ext)
  if (!lang) return null

  // Markdown et text → pas de parseur AST
  if (lang.id === 'markdown' || lang.id === 'text') return null

  const grammaire = chargerGrammaire(lang)
  if (!grammaire) return null

  try {
    parseur.setLanguage(grammaire as Parameters<typeof parseur.setLanguage>[0])
    return lang
  } catch {
    return null
  }
}

// Découpe un code source via l'AST tree-sitter
function chunkerAvecAST(contenu: string, lang: DefinitionLangage): Chunk[] {
  const tree = parseur.parse(contenu)
  const lignes = contenu.split('\n')
  const chunks: Chunk[] = []
  let curseur = 0

  const viderPreamble = (jusqua: number) => {
    if (jusqua <= curseur) return
    const texte = lignes.slice(curseur, jusqua).join('\n').trim()
    if (texte.length > 0) {
      chunks.push({ contenu: texte, debut: curseur + 1, fin: jusqua, langage: lang.id })
    }
  }

  for (const enfant of tree.rootNode.children) {
    if (enfant.type === 'ERROR') continue

    if (estDeclarationMajeure(enfant, lang)) {
      viderPreamble(enfant.startPosition.row)

      const debut = enfant.startPosition.row
      const fin = enfant.endPosition.row + 1

      for (let i = debut; i < fin; i += TAILLE_MAX_LIGNES) {
        const borneFin = Math.min(i + TAILLE_MAX_LIGNES, fin)
        chunks.push({
          contenu: lignes.slice(i, borneFin).join('\n'),
          debut: i + 1,
          fin: borneFin,
          langage: lang.id,
        })
      }
      curseur = fin
    }
  }

  viderPreamble(lignes.length)
  return chunks.filter((c) => c.contenu.trim().length > 0)
}

// Découpage heuristique pour Markdown et formats sans grammaire tree-sitter
function chunkerHeuristique(contenu: string, langage: string): Chunk[] {
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
  const ext = path.extname(chemin)
  const map = mapExtensions()
  const lang = map.get(ext)
  const langage = lang?.id ?? 'text'

  const lignes = contenu.split('\n')
  if (lignes.length <= TAILLE_MIN_LIGNES) {
    return [{ contenu, debut: 1, fin: lignes.length, langage }]
  }

  const langConf = configurerParseur(chemin)
  if (langConf) {
    try {
      return chunkerAvecAST(contenu, langConf)
    } catch {
      // Fallback heuristique si tree-sitter échoue
    }
  }

  return chunkerHeuristique(contenu, langage)
}
