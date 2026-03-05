import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  BLUETANG_ROOT,
  LANGAGES_INTEGRES,
  LANGAGES_HEURISTIQUES,
  LANGAGES_OPTIONNELS,
  estInstalle,
  langagesDisponibles,
  mapExtensions,
  chargerGrammaire,
} from '../src/langages/catalogue.js'
import { chunkerFichier } from '../src/indexation/chunker.js'

const execFileAsync = promisify(execFile)

async function installer(...packages: string[]): Promise<void> {
  await execFileAsync('npm', ['install', '--no-save', '--prefix', BLUETANG_ROOT, ...packages])
}

async function desinstaller(...packages: string[]): Promise<void> {
  await execFileAsync('npm', ['uninstall', '--no-save', '--prefix', BLUETANG_ROOT, ...packages])
}

// Code source minimal par langage — au moins 2 déclarations majeures
const EXTRAITS: Record<string, { ext: string; code: string; attendu: string[] }> = {
  ruby: {
    ext: '.rb',
    code: `
class Animal
  def initialize(nom)
    @nom = nom
  end

  def parler
    "..."
  end
end

def helper
  puts "aide"
end
`.trim(),
    attendu: ['class', 'def helper'],
  },
  go: {
    ext: '.go',
    code: `
package main

import "fmt"

func main() {
\tfmt.Println("hello")
}

func helper(x int) int {
\treturn x + 1
}
`.trim(),
    attendu: ['func main', 'func helper'],
  },
  rust: {
    ext: '.rs',
    code: `
fn main() {
    println!("hello");
}

struct Point {
    x: f64,
    y: f64,
}

fn distance(p: Point) -> f64 {
    p.x * p.x + p.y * p.y
}
`.trim(),
    attendu: ['fn main', 'struct Point', 'fn distance'],
  },
  java: {
    ext: '.java',
    code: `
public class Calculatrice {
    public int add(int a, int b) {
        return a + b;
    }

    public int sub(int a, int b) {
        return a - b;
    }
}
`.trim(),
    attendu: ['class Calculatrice'],
  },
  c: {
    ext: '.c',
    code: `
#include <stdio.h>

int add(int a, int b) {
    return a + b;
}

void afficher(int n) {
    printf("%d\\n", n);
}
`.trim(),
    attendu: ['add', 'afficher'],
  },
  cpp: {
    ext: '.cpp',
    code: `
#include <string>

class Voiture {
public:
    std::string marque;
    Voiture(std::string m) : marque(m) {}
};

void demarrer(Voiture v) {
    (void)v;
}
`.trim(),
    attendu: ['class Voiture', 'demarrer'],
  },
  csharp: {
    ext: '.cs',
    code: `
public class Salut {
    public string Nom { get; set; }

    public string Bonjour() {
        return "Bonjour " + Nom;
    }

    public void Afficher() {
        System.Console.WriteLine(Bonjour());
    }
}
`.trim(),
    attendu: ['class Salut'],
  },
  bash: {
    ext: '.sh',
    code: `
#!/bin/bash

function bonjour() {
    echo "Bonjour $1"
}

function au_revoir() {
    echo "Au revoir $1"
}

bonjour "monde"
`.trim(),
    attendu: ['bonjour', 'au_revoir'],
  },
  lua: {
    ext: '.lua',
    code: `
function bonjour(nom)
    print("Bonjour " .. nom)
end

local function calculer(a, b)
    return a + b
end

bonjour("monde")
`.trim(),
    attendu: ['bonjour', 'calculer'],
  },
  kotlin: {
    ext: '.kt',
    code: `
class Calculatrice {
    fun add(a: Int, b: Int): Int = a + b
    fun sub(a: Int, b: Int): Int = a - b
}

fun main() {
    val calc = Calculatrice()
    println(calc.add(1, 2))
}
`.trim(),
    attendu: ['class Calculatrice', 'fun main'],
  },
}

// ─────────────────────────────────────────────
// 1. Tests statiques du catalogue (sans installation)
// ─────────────────────────────────────────────

describe('catalogue — structure', () => {
  it('LANGAGES_INTEGRES contient les 4 langages de base', () => {
    const ids = LANGAGES_INTEGRES.map((l) => l.id)
    expect(ids).toContain('typescript')
    expect(ids).toContain('javascript')
    expect(ids).toContain('python')
    expect(ids).toContain('php')
    expect(ids).toHaveLength(4)
  })

  it('LANGAGES_HEURISTIQUES contient markdown', () => {
    expect(LANGAGES_HEURISTIQUES).toHaveLength(1)
    expect(LANGAGES_HEURISTIQUES[0].id).toBe('markdown')
  })

  it('LANGAGES_OPTIONNELS contient les 10 langages attendus', () => {
    const ids = LANGAGES_OPTIONNELS.map((l) => l.id)
    expect(ids).toContain('ruby')
    expect(ids).toContain('go')
    expect(ids).toContain('rust')
    expect(ids).toContain('java')
    expect(ids).toContain('c')
    expect(ids).toContain('cpp')
    expect(ids).toContain('csharp')
    expect(ids).toContain('bash')
    expect(ids).toContain('lua')
    expect(ids).toContain('kotlin')
    expect(ids).toHaveLength(10)
  })

  it('chaque langage a au moins une extension', () => {
    const tous = [...LANGAGES_INTEGRES, ...LANGAGES_HEURISTIQUES, ...LANGAGES_OPTIONNELS]
    for (const lang of tous) {
      expect(lang.extensions.length, `${lang.id} doit avoir des extensions`).toBeGreaterThan(0)
      for (const ext of lang.extensions) {
        expect(ext, `extension de ${lang.id} doit commencer par .`).toMatch(/^\.\w+$/)
      }
    }
  })

  it('pas de doublon d\'extension entre les langages intégrés', () => {
    const exts: string[] = []
    for (const lang of [...LANGAGES_INTEGRES, ...LANGAGES_HEURISTIQUES]) {
      for (const ext of lang.extensions) {
        expect(exts, `extension ${ext} dupliquée`).not.toContain(ext)
        exts.push(ext)
      }
    }
  })

  it('langagesDisponibles() inclut toujours les intégrés et heuristiques', () => {
    const dispo = langagesDisponibles()
    const ids = dispo.map((l) => l.id)
    expect(ids).toContain('typescript')
    expect(ids).toContain('javascript')
    expect(ids).toContain('python')
    expect(ids).toContain('php')
    expect(ids).toContain('markdown')
  })

  it('mapExtensions() couvre toutes les extensions des langages disponibles', () => {
    const map = mapExtensions()
    for (const lang of langagesDisponibles()) {
      for (const ext of lang.extensions) {
        expect(map.has(ext), `extension ${ext} absente de mapExtensions`).toBe(true)
        expect(map.get(ext)?.id).toBe(lang.id)
      }
    }
  })

  it('estInstalle() retourne true pour les langages intégrés', () => {
    for (const lang of LANGAGES_INTEGRES) {
      expect(estInstalle(lang), `${lang.id} devrait être installé`).toBe(true)
    }
  })

  it('chargerGrammaire() retourne une grammaire pour les langages intégrés', () => {
    for (const lang of LANGAGES_INTEGRES) {
      const grammaire = chargerGrammaire(lang)
      expect(grammaire, `grammaire de ${lang.id} ne devrait pas être null`).not.toBeNull()
    }
  })

  it('BLUETANG_ROOT pointe vers la racine du projet (contient package.json)', () => {
    const { existsSync } = require('fs')
    const path = require('path')
    expect(existsSync(path.join(BLUETANG_ROOT, 'package.json'))).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 2. Tests de chunking par langage optionnel (séquentiels)
// ─────────────────────────────────────────────

describe('chunking — langages optionnels (installation individuelle)', { timeout: 60_000 }, () => {
  for (const lang of LANGAGES_OPTIONNELS) {
    const extrait = EXTRAITS[lang.id]
    if (!extrait) continue

    describe(`${lang.label}`, () => {
      const dejaInstalle = estInstalle(lang)

      beforeAll(async () => {
        if (!dejaInstalle) {
          await installer(lang.package)
        }
      })

      afterAll(async () => {
        if (!dejaInstalle) {
          await desinstaller(lang.package)
        }
      })

      it(`installe et détecte ${lang.id}`, () => {
        expect(estInstalle(lang)).toBe(true)
      })

      it(`mapExtensions() inclut les extensions de ${lang.id} après installation`, () => {
        const map = mapExtensions()
        for (const ext of lang.extensions) {
          expect(map.has(ext), `${ext} devrait être dans mapExtensions`).toBe(true)
        }
      })

      it(`chunke du code ${lang.label} avec l'AST tree-sitter`, () => {
        const fichier = `test${extrait.ext}`
        const chunks = chunkerFichier(extrait.code, fichier)

        expect(chunks.length, `${lang.id} : au moins 1 chunk attendu`).toBeGreaterThan(0)

        const toutLeCode = chunks.map((c) => c.contenu).join('\n')
        for (const motCle of extrait.attendu) {
          expect(toutLeCode, `${lang.id} : "${motCle}" introuvable dans les chunks`).toContain(motCle)
        }

        // Vérifier la cohérence des numéros de ligne
        for (const chunk of chunks) {
          expect(chunk.debut, `debut doit être >= 1`).toBeGreaterThanOrEqual(1)
          expect(chunk.fin, `fin doit être >= debut`).toBeGreaterThanOrEqual(chunk.debut)
        }
      })

      it(`le langage des chunks est '${lang.id}'`, () => {
        const fichier = `test${extrait.ext}`
        const chunks = chunkerFichier(extrait.code, fichier)
        for (const chunk of chunks) {
          expect(chunk.langage).toBe(lang.id)
        }
      })
    })
  }
})

// ─────────────────────────────────────────────
// 3. Test d'installation de tous les langages en une fois
// ─────────────────────────────────────────────

describe('installation complète — tous les langages optionnels', { timeout: 120_000 }, () => {
  const packages = LANGAGES_OPTIONNELS.map((l) => l.package)
  const dejaInstalles = LANGAGES_OPTIONNELS.filter(estInstalle).map((l) => l.package)

  beforeAll(async () => {
    await installer(...packages)
  })

  afterAll(async () => {
    // Ne désinstaller que ceux qui n'étaient pas là avant
    const aDesinstaller = packages.filter((p) => !dejaInstalles.includes(p))
    if (aDesinstaller.length > 0) {
      await desinstaller(...aDesinstaller)
    }
  })

  it('tous les langages optionnels sont détectés comme installés', () => {
    for (const lang of LANGAGES_OPTIONNELS) {
      expect(estInstalle(lang), `${lang.id} devrait être installé`).toBe(true)
    }
  })

  it('langagesDisponibles() contient les 15 langages (4 intégrés + 1 heuristique + 10 optionnels)', () => {
    const dispo = langagesDisponibles()
    expect(dispo.length).toBe(15)
  })

  it('mapExtensions() couvre toutes les extensions (aucun doublon)', () => {
    const map = mapExtensions()
    const toutesExtensions = LANGAGES_OPTIONNELS.flatMap((l) => l.extensions)
    for (const ext of toutesExtensions) {
      expect(map.has(ext), `${ext} absente de mapExtensions`).toBe(true)
    }
  })

  it('chunke correctement chaque langage après installation complète', () => {
    for (const lang of LANGAGES_OPTIONNELS) {
      const extrait = EXTRAITS[lang.id]
      if (!extrait) continue

      const chunks = chunkerFichier(extrait.code, `test${extrait.ext}`)
      expect(chunks.length, `${lang.id} : aucun chunk produit`).toBeGreaterThan(0)

      const toutLeCode = chunks.map((c) => c.contenu).join('\n')
      for (const motCle of extrait.attendu) {
        expect(toutLeCode, `${lang.id} : "${motCle}" introuvable`).toContain(motCle)
      }
    }
  })
})
