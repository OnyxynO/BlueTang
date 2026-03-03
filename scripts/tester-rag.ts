import { ouvrirBdd } from '../src/bdd/connexion.js'
import { rechercherBM25 } from '../src/rag/recherche.js'
import { enrichirMessages } from '../src/rag/assembleur.js'

const db = ouvrirBdd('.bluetang/index.db')

const questions = [
  'Que fait la fonction chunkerFichier dans BlueTang ?',
  'Comment fonctionne le pipeline indexation ?',
  'Quelle est la logique de recherche BM25 ?',
]

for (const q of questions) {
  console.log(`\n─── Question : "${q}"`)
  const resultats = rechercherBM25(q, db)
  if (resultats.length === 0) {
    console.log('  ❌ Aucun chunk trouvé')
  } else {
    console.log(`  ✓ ${resultats.length} chunk(s) trouvé(s)`)
    for (const r of resultats.slice(0, 2)) {
      console.log(`    → ${r.chemin}:${r.debut}-${r.fin} (score: ${r.score.toFixed(3)})`)
    }
  }

  const enrichis = enrichirMessages([{ role: 'user', content: q }], db)
  const contexteInjecte = enrichis.find(m => m.role === 'system')
  if (contexteInjecte) {
    console.log(`  ✓ Contexte injecté (${contexteInjecte.content.length} chars)`)
    console.log(`    Extrait : ${contexteInjecte.content.slice(0, 120).replace(/\n/g, ' ')}...`)
  } else {
    console.log('  ❌ Aucun contexte injecté')
  }
}
