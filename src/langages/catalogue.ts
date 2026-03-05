import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const _require = createRequire(import.meta.url)

// Répertoire racine de BlueTang (dist/ en prod, src/ en dev → on remonte d'un niveau)
export const BLUETANG_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export interface DefinitionLangage {
  id: string
  label: string
  extensions: string[]
  package: string
  // Nœuds AST considérés comme des déclarations majeures (chunking)
  noeuds: string[]
  // Certaines grammaires exportent un sous-objet (ex. TypeScript.typescript)
  cle?: string
}

// Langages intégrés (toujours disponibles, grammaires incluses dans les dépendances)
export const LANGAGES_INTEGRES: DefinitionLangage[] = [
  {
    id: 'typescript',
    label: 'TypeScript / TSX',
    extensions: ['.ts', '.tsx'],
    package: 'tree-sitter-typescript',
    noeuds: ['function_declaration', 'class_declaration', 'abstract_class_declaration', 'interface_declaration', 'enum_declaration', 'type_alias_declaration'],
    cle: 'typescript',
  },
  {
    id: 'javascript',
    label: 'JavaScript / JSX',
    extensions: ['.js', '.jsx'],
    package: 'tree-sitter-javascript',
    noeuds: ['function_declaration', 'class_declaration'],
  },
  {
    id: 'python',
    label: 'Python',
    extensions: ['.py'],
    package: 'tree-sitter-python',
    noeuds: ['function_definition', 'class_definition', 'decorated_definition'],
  },
  {
    id: 'php',
    label: 'PHP',
    extensions: ['.php'],
    package: 'tree-sitter-php',
    noeuds: ['function_definition', 'class_declaration'],
    cle: 'php',
  },
]

// Langages sans grammaire tree-sitter (chunking heuristique)
export const LANGAGES_HEURISTIQUES: DefinitionLangage[] = [
  {
    id: 'markdown',
    label: 'Markdown',
    extensions: ['.md'],
    package: '',
    noeuds: [],
  },
]

// Langages optionnels (installables via `bluetang languages add`)
export const LANGAGES_OPTIONNELS: DefinitionLangage[] = [
  {
    id: 'ruby',
    label: 'Ruby',
    extensions: ['.rb'],
    package: 'tree-sitter-ruby',
    noeuds: ['method', 'singleton_method', 'class', 'module'],
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    package: 'tree-sitter-go',
    noeuds: ['function_declaration', 'method_declaration', 'type_declaration'],
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    package: 'tree-sitter-rust',
    noeuds: ['function_item', 'struct_item', 'impl_item', 'trait_item', 'enum_item'],
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['.java'],
    package: 'tree-sitter-java',
    noeuds: ['method_declaration', 'class_declaration', 'interface_declaration'],
  },
  {
    id: 'c',
    label: 'C',
    extensions: ['.c', '.h'],
    package: 'tree-sitter-c',
    noeuds: ['function_definition', 'struct_specifier'],
  },
  {
    id: 'cpp',
    label: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
    package: 'tree-sitter-cpp',
    noeuds: ['function_definition', 'class_specifier', 'struct_specifier'],
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['.cs'],
    package: 'tree-sitter-c-sharp',
    noeuds: ['method_declaration', 'class_declaration', 'interface_declaration'],
  },
  {
    id: 'bash',
    label: 'Bash / Shell',
    extensions: ['.sh', '.bash'],
    package: 'tree-sitter-bash',
    noeuds: ['function_definition'],
  },
  {
    id: 'lua',
    label: 'Lua',
    extensions: ['.lua'],
    package: 'tree-sitter-lua',
    noeuds: ['function_definition', 'local_function'],
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    extensions: ['.kt', '.kts'],
    package: 'tree-sitter-kotlin',
    noeuds: ['function_declaration', 'class_declaration', 'object_declaration'],
  },
]

// Vérifie si un langage optionnel est installé (package npm disponible)
export function estInstalle(lang: DefinitionLangage): boolean {
  try {
    _require.resolve(lang.package)
    return true
  } catch {
    return false
  }
}

// Charge la grammaire d'un langage (intégré ou installé)
export function chargerGrammaire(lang: DefinitionLangage): unknown | null {
  try {
    const module = _require(lang.package) as Record<string, unknown>
    return lang.cle ? module[lang.cle] : module
  } catch {
    return null
  }
}

// Retourne tous les langages disponibles (intégrés + heuristiques + optionnels installés)
export function langagesDisponibles(): DefinitionLangage[] {
  const optionnelsInstalles = LANGAGES_OPTIONNELS.filter(estInstalle)
  return [...LANGAGES_INTEGRES, ...LANGAGES_HEURISTIQUES, ...optionnelsInstalles]
}

// Map extension → définition de langage (pour le scanner et le chunker)
export function mapExtensions(): Map<string, DefinitionLangage> {
  const map = new Map<string, DefinitionLangage>()
  for (const lang of langagesDisponibles()) {
    for (const ext of lang.extensions) {
      map.set(ext, lang)
    }
  }
  return map
}
