# BlueTang — Documentation projet

@../GUIDELINES_PROJETS.md

## Description

Proxy intelligent entre un client LLM (Continue.dev, Open WebUI, CLI) et Ollama.
Ajoute RAG (recherche sémantique dans la codebase) et mémoire de conversation aux petits modèles locaux.

**Architecture** : transparent pour le client — pointe sur `:11435` au lieu de `:11434`, tout fonctionne sans modification.

## Stack technique

| Composant | Choix | Pourquoi |
|-----------|-------|---------|
| Langage | TypeScript 5 strict + Node.js 22 ESM | Typage, écosystème, apprentissage |
| Serveur HTTP | Hono + @hono/node-server | Léger, streaming natif, bon DX |
| Stockage | better-sqlite3 + sqlite-vec | Tout-en-un : FTS5 (BM25) + vecteurs |
| CLI | Commander.js | Standard de facto |
| Tests | Vitest | Rapide, compatible ESM |
| Build | tsup | Bundler TypeScript simple |

## Commandes

```bash
# Développement
npm run dev -- serve -v           # avec logs détaillés
npm run dev -- serve -p 11435     # port custom

# Tests
npm test                          # une fois
npm run test:watch                # watch mode

# Vérification TypeScript
npm run typecheck

# Build
npm run build
```

## Architecture

```
src/
├── index.ts              # CLI (Commander) : init, serve, index, status, watch
├── config.ts             # Interface Config + valeurs par défaut
├── cli/
│   └── init.ts           # lancerInit() — wizard interactif @inquirer/prompts
├── bdd/
│   ├── connexion.ts      # ouvrirBdd() + type Db
│   └── schema.ts         # CREATE TABLE fichiers, chunks, chunks_fts (FTS5)
├── indexation/
│   ├── chunker.ts        # chunkerFichier() — découpage heuristique par langage
│   ├── scanner.ts        # scannerDossier() — scan + filtre .gitignore + hash
│   └── pipeline.ts       # indexerDossier() — orchestration complète
├── rag/
│   ├── recherche.ts      # rechercherBM25() — FTS5 + OR entre termes
│   └── assembleur.ts     # enrichirMessages() — injection contexte dans le prompt
├── mcp/
│   ├── client.ts         # ClientMcp (SDK stdio, stderr: 'ignore')
│   ├── gestionnaire.ts   # GestionnaireMcp (pool clients)
│   ├── pertinence.ts     # scorerPertinenceMcp (keyword matching, seuil 0.3)
│   └── injecteur.ts      # injecterContexteMcp (resources → message système)
└── serveur/
    ├── app.ts            # creerApp() + demarrerServeur()
    ├── completions.ts    # POST /v1/chat/completions + enrichissement RAG
    └── modeles.ts        # GET /v1/models, /health, /stats, POST /v1/embeddings
```

## Phases

| Phase | État | Contenu |
|-------|------|---------|
| 1 — Proxy transparent | ✅ Terminé | Passthrough pur, SSE streaming |
| 2 — RAG BM25 | ✅ Terminé | Chunking heuristique + FTS5 SQLite + CLI index/status |
| 3 — RAG sémantique + hybrid | ✅ Terminé | sqlite-vec, nomic-embed-text (768 dim), hybrid 0.4/0.6, watcher |
| 4 — Mémoire de conversation | ✅ Terminé | Sessions SQLite + résumé progressif + faits regex |
| 5 — Finition | ✅ Terminé | tree-sitter AST, .bluetang.json, /stats, benchmark (Recall@1=90%), README |
| 6 — Client MCP | ✅ Terminé | ClientMcp stdio, GestionnaireMcp, pertinence, tool_calls agentique |
| 7 — DX & init | ✅ Terminé | Commande `bluetang init` (wizard @inquirer/prompts) |

## Suivi de projet

- **GitHub Project** : https://github.com/users/OnyxynO/projects/1
- **Issues** : une par phase, liées au repo — déplacer en "In Progress" en début de phase, "Done" à la fin
- **Backlog détaillé** : `docs/03_BACKLOG.md`

## Endpoints (Phase 1)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| POST | `/v1/chat/completions` | Passthrough vers Ollama (stream ou JSON) |
| GET | `/v1/models` | Passthrough vers Ollama |
| POST | `/v1/embeddings` | Passthrough vers Ollama |
| GET | `/health` | État proxy + version Ollama |

## Commandes complètes

```bash
# Setup initial interactif (génère .bluetang.json + indexe si souhaité)
npm run dev -- init

# Indexer la codebase courante
npm run dev -- index ./src

# Voir les stats de l'index
npm run dev -- status

# Surveiller les modifications en temps réel
npm run dev -- watch ./src

# Lancer le proxy avec RAG actif
npm run dev -- serve
```

## Configuration Continue.dev

```json
{
  "models": [{
    "title": "Qwen3 1.7B (BlueTang)",
    "provider": "openai",
    "model": "qwen3:1.7b",
    "apiBase": "http://localhost:11435/v1",
    "apiKey": "not-needed"
  }]
}
```

## Décisions techniques clés

- **sqlite-vec plutôt que LanceDB** : bindings natifs plus stables, tout-en-un avec SQLite
- **Chunking heuristique d'abord** : tree-sitter ajouté en Phase 5, une fois le RAG validé
- **Recherche hybride** : BM25 (FTS5) + sémantique, pondération 0.4/0.6
- **Session best-effort** : ID hashé sur les premiers messages, imperfection acceptée
- **Même modèle pour les résumés** : pas de swap Ollama (coûte 2-5s)
- **Proxy passthrough Phase 1** : en Phase 2+, les messages sont interceptés et enrichis avant forward

## Pièges connus

- `hono/logger` : logger middleware actif seulement si `verbose: true`
- Les `.js` dans les imports sont obligatoires (ESM NodeNext)
- `creerApp()` est exportée séparément de `demarrerServeur()` pour les tests (sans serveur réel)
- Les tests mockent `fetch` globalement via `vi.stubGlobal('fetch', ...)`
- **FTS5 MATCH = AND par défaut** : "Que fait la fonction X" échoue car "Que", "fait" ne sont pas dans le code → filtrer les stopwords et utiliser OR entre les termes significatifs
- **FTS5 tokenizer `unicode61` ne découpe pas le camelCase** : "envoyerEmail" est un seul token, chercher "email" ne le trouve pas
- **`better-sqlite3` INSERT OR IGNORE** : `lastInsertRowid` après un IGNORE retourne le rowid de l'insert précédent → toujours faire un SELECT après pour récupérer l'id fiable
- **qwen3:1.7b minimum** recommandé pour exploiter le contexte RAG injecté — 0.6b trop limité
- **sqlite-vec** : ne pas passer `Float32Array` ou `Buffer` — utiliser du JSON string `'[1.0, 2.0, ...]'` pour les insertions et les requêtes MATCH
- **Phase 3 prérequis validés** : `nomic-embed-text` (768 dim) + `sqlite-vec` v0.1.7 fonctionnels
- **`StdioClientTransport` stderr** : passer `stderr: 'ignore'` pour supprimer les logs du processus MCP enfant (défaut = `'inherit'`, pollue la console)
- **`bluetang init` détection dev/prod** : vérifier `process.argv[1]?.endsWith('src/index.ts')` pour afficher `npm run dev -- serve` vs `bluetang serve`
