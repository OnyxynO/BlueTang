# BlueTang — Documentation projet

@../../PRINCIPES.md

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
| Validation config | Zod v4 | Typage runtime + messages d'erreur précis |
| CLI | Commander.js | Standard de facto |
| Tests | Vitest | Rapide, compatible ESM |
| Build | tsup | Bundler TypeScript simple |

## Commandes de développement

```bash
# Développement
npm run dev -- serve -v                        # avec logs détaillés
npm run dev -- init                            # wizard de configuration
npm run dev -- index ./src --ollama-url http://localhost:11434
npm run dev -- status
npm run dev -- watch ./src
npm run dev -- clean --all -y
npm run dev -- languages                       # lister les langages
npm run dev -- languages add                  # ajouter via menu
npm run dev -- languages remove               # désinstaller via menu

# Tests
npm test                                       # typecheck + vitest
npm run test:watch                             # watch mode
npm run typecheck

# Build
npm run build
```

## Architecture

```
src/
+-- index.ts              # CLI (Commander) : toutes les commandes
+-- config.ts             # Config + validation Zod + chargerConfigFichier()
+-- version.ts            # VERSION lue dynamiquement depuis package.json
+-- cli/
|   +-- init.ts           # lancerInit() — wizard @inquirer/prompts
|   +-- clean.ts          # lancerClean() — suppression index/sessions + backup .bak
|   +-- languages.ts      # listerLanguages(), ajouterLanguages(), supprimerLanguages()
+-- langages/
|   +-- catalogue.ts      # Catalogue centralisé : LANGAGES_INTEGRES, LANGAGES_OPTIONNELS,
|                         # LANGAGES_HEURISTIQUES, estInstalle(), chargerGrammaire(), mapExtensions()
+-- bdd/
|   +-- connexion.ts      # ouvrirBdd() + sqlite-vec + chmod 700
|   +-- schema.ts         # Tables + index idx_chunks_fichier_id
+-- indexation/
|   +-- chunker.ts        # chunkerFichier() — AST tree-sitter via catalogue (dynamique)
|   +-- scanner.ts        # scannerDossier() — extensions lues depuis catalogue
|   +-- pipeline.ts       # indexerDossier() — batch embeddings par 20
|   +-- watcher.ts        # surveillerDossier() — chokidar
+-- rag/
|   +-- embedder.ts       # obtenirEmbedding() + obtenirEmbeddingsBatch()
|   +-- recherche.ts      # BM25 + sémantique + hybride (0.4/0.6)
|   +-- assembleur.ts     # enrichirMessages() — injection contexte
+-- memoire/
|   +-- session.ts        # identifierSession, chargerContexte, injecterMemoire
|   +-- resume.ts         # extraireFaits (regex), mettreAJourResume (Ollama async)
+-- mcp/
|   +-- client.ts         # ClientMcp (SDK stdio, timeout 5s)
|   +-- gestionnaire.ts   # GestionnaireMcp (pool clients)
|   +-- pertinence.ts     # scorerPertinenceMcp (keyword matching, seuil 0.3)
|   +-- injecteur.ts      # injecterContexteMcp (resources → message système)
+-- serveur/
|   +-- app.ts            # creerApp() + demarrerServeur() + vérif modèle au startup
|   +-- completions.ts    # POST /v1/chat/completions — mémoire → RAG → MCP → Ollama
|   +-- modeles.ts        # /health, /stats, /v1/models, /v1/embeddings
+-- utils/
    +-- stopwords.ts      # Stopwords partagés (RAG + MCP)
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
| Audit A | ✅ Terminé | Version centralisée, clean, Zod, metadata npm, index SQLite, fichiers vides |
| Audit B | ✅ Terminé | Test LAN Mac mini M4, Continue CLI + Continue.dev configurés |
| Audit C | ✅ Terminé | Erreurs silencieuses, timeouts (300s), batching embeddings, validation MCP |
| Audit D | ✅ Terminé | README, CHANGELOG, CONTRIBUTING, tags GitHub, benchmark perf |
| Languages | ✅ Terminé | `bluetang languages [add\|remove]` — catalogue dynamique, install npm --no-save |
| v0.4.0 | ✅ Terminé | Logo ASCII `><{{{°>`, README bilingue EN/FR, publication npm |

**Projet terminé et publié sur npm : `npm install -g bluetang`**

## Endpoints

| Méthode | Route | Comportement |
|---------|-------|-------------|
| POST | `/v1/chat/completions` | Enrichi : mémoire → RAG → MCP → Ollama |
| GET | `/v1/models` | Passthrough vers Ollama |
| POST | `/v1/embeddings` | Passthrough vers Ollama |
| GET | `/health` | État proxy + version Ollama |
| GET | `/stats` | Métriques index + mémoire + Ollama |

## Décisions techniques clés

- **sqlite-vec plutôt que LanceDB** : bindings natifs plus stables, tout-en-un avec SQLite
- **Catalogue de langages dynamique** : `src/langages/catalogue.ts` centralise tout, `chargerGrammaire()` charge à la demande via `createRequire`
- **Langages optionnels = npm --no-save** : installés dans le répertoire de BlueTang sans modifier `package.json`
- **Recherche hybride** : BM25 (FTS5) + sémantique, pondération 0.4/0.6, seuil pertinence 0.35
- **Batching embeddings** : groupes de 20 via `/api/embed` avec `input: [...]`, ~5× plus rapide
- **Session best-effort** : ID hashé sur les premiers messages, imperfection acceptée
- **Timeout completions** : 300s (qwen3:8b peut dépasser 120s sur requêtes complexes)

## Pièges connus

- Les `.js` dans les imports sont obligatoires (ESM NodeNext)
- `creerApp()` exportée séparément de `demarrerServeur()` pour les tests
- Les tests mockent `fetch` globalement via `vi.stubGlobal('fetch', ...)`
- **FTS5 MATCH = AND par défaut** → filtrer stopwords + OR entre termes
- **FTS5 tokenizer `unicode61`** ne découpe pas le camelCase
- **`better-sqlite3` INSERT OR IGNORE** : `lastInsertRowid` après IGNORE = rowid précédent → SELECT après
- **sqlite-vec** : JSON string `'[1.0, 2.0, ...]'` — pas Float32Array ni Buffer
- **`StdioClientTransport` stderr** : passer `stderr: 'ignore'`
- **`bluetang init` détection dev/prod** : `process.argv[1]?.endsWith('src/index.ts')`
- **Zod v4** : `.errors` renommé en `.issues` sur ZodError
- **`bluetang clean` sans TTY** : @inquirer plante en SSH → utiliser `-y/--yes`
- **sqlite3 CLI ne charge pas vec0** → utiliser Node.js pour opérations directes sur la DB
- **PATH SSH macOS** : `/opt/homebrew/bin` absent du PATH SSH → `export PATH=/opt/homebrew/bin:$PATH`
- **Compatibilité grammaires tree-sitter** : moteur@0.21.x — les grammaires récentes (0.23+) peuvent être incompatibles. tree-sitter-ruby@0.23.1 fonctionne. Tester avant d'ajouter une grammaire au catalogue.
- **npm install --prefix sans --no-save** : modifie `package.json` — toujours passer `--no-save` pour les langages optionnels
