import path from 'path'

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

const PATTERNS_COUPURE: Record<string, RegExp> = {
  typescript: /^(export\s+)?(default\s+)?(async\s+)?(function|class|interface|type|const|let|var)\s+\w+/,
  javascript: /^(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var)\s+\w+/,
  python: /^(async\s+)?(def|class)\s+\w+/,
  php: /^(public|private|protected|static|abstract|\s)*(function|class)\s+\w+/i,
  markdown: /^#{1,3}\s+\S/,
}

function detecterLangage(chemin: string): string {
  return LANGAGES[path.extname(chemin)] ?? 'text'
}

export function chunkerFichier(contenu: string, chemin: string): Chunk[] {
  const langage = detecterLangage(chemin)
  const lignes = contenu.split('\n')

  if (lignes.length <= TAILLE_MIN_LIGNES) {
    return [{ contenu, debut: 1, fin: lignes.length, langage }]
  }

  // Trouver les points de coupure naturels
  const pattern = PATTERNS_COUPURE[langage]
  const pointsCoupure: number[] = [0]

  if (pattern) {
    for (let i = 1; i < lignes.length; i++) {
      if (pattern.test(lignes[i].trim())) {
        pointsCoupure.push(i)
      }
    }
  }
  pointsCoupure.push(lignes.length)

  // Créer les chunks en respectant TAILLE_MAX_LIGNES
  const chunks: Chunk[] = []
  for (let i = 0; i < pointsCoupure.length - 1; i++) {
    let debut = pointsCoupure[i]
    const finSection = pointsCoupure[i + 1]

    while (debut < finSection) {
      const fin = Math.min(debut + TAILLE_MAX_LIGNES, finSection)
      const lignesChunk = lignes.slice(debut, fin)

      if (lignesChunk.join('\n').trim().length > 0) {
        chunks.push({ contenu: lignesChunk.join('\n'), debut: debut + 1, fin, langage })
      }
      debut = fin
    }
  }

  return chunks
}
