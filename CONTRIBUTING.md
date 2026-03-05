# Contribuer à BlueTang

## Prérequis

- Node.js ≥ 22
- Ollama en cours d'exécution avec `nomic-embed-text` et un modèle de chat (ex. `qwen3:1.7b`)
- Git

## Installation en développement

```bash
git clone https://github.com/OnyxynO/BlueTang
cd BlueTang
npm install
```

## Lancer en mode développement

```bash
npm run dev -- serve -v           # proxy avec logs détaillés
npm run dev -- index ./src        # indexer la codebase
npm run dev -- init               # assistant de configuration
```

## Tests

```bash
npm test                  # tous les tests (typecheck + vitest)
npm run test:watch        # mode watch
npm run typecheck         # TypeScript uniquement
```

Les tests mockent `fetch` globalement via `vi.stubGlobal` — pas besoin d'Ollama pour les faire tourner.

## Conventions

### Commits

[Conventional Commits](https://www.conventionalcommits.org/) en français :

```
feat: ajouter la commande export
fix: corriger le crash si .bluetang.json absent
docs: mettre à jour la section MCP du README
refactor: extraire la logique de scoring
test: ajouter tests pour rechercherHybrid
```

### Code

- TypeScript strict — `tsc --noEmit` doit passer sans erreur
- ESM NodeNext — `.js` obligatoire dans tous les imports
- Noms de variables, commentaires et messages en **français**
- Pas de `as any` — utiliser des types explicites

### Structure

- Nouveaux modules dans le sous-dossier correspondant (`rag/`, `mcp/`, `cli/`…)
- Logique métier dans des fonctions pures testables
- Tests dans `tests/` ou en `.test.ts` à côté du fichier source

## Soumettre une PR

1. Fork + branche depuis `main`
2. `npm test` doit passer
3. Description claire de ce que la PR ajoute/corrige
4. Une PR = une fonctionnalité ou un correctif

## Signaler un bug

Ouvrir une [issue GitHub](https://github.com/OnyxynO/BlueTang/issues) avec :
- Version de BlueTang (`bluetang --version`)
- Version de Node.js et d'Ollama
- Commande utilisée et message d'erreur complet
