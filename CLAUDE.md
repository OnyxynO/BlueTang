# BlueTang — Documentation projet

> Consulter `../GUIDELINES_PROJETS.md` avant tout développement significatif.

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
├── index.ts           # CLI (Commander)
├── config.ts          # Interface Config + valeurs par défaut
└── serveur/
    ├── app.ts         # creerApp() + demarrerServeur()
    ├── completions.ts # POST /v1/chat/completions
    └── modeles.ts     # GET /v1/models, /health, POST /v1/embeddings
```

## Phases

| Phase | État | Contenu |
|-------|------|---------|
| 1 — Proxy transparent | ✅ Terminé | Passthrough pur, SSE streaming |
| 2 — RAG BM25 | ⬜ À faire | Chunking heuristique + FTS5 SQLite |
| 3 — RAG sémantique + hybrid | ⬜ À faire | sqlite-vec + nomic-embed-text |
| 4 — Mémoire de conversation | ⬜ À faire | Sessions SQLite + résumé progressif |
| 5 — Finition | ⬜ À faire | tree-sitter AST, benchmarks, npm publish |

## Endpoints (Phase 1)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| POST | `/v1/chat/completions` | Passthrough vers Ollama (stream ou JSON) |
| GET | `/v1/models` | Passthrough vers Ollama |
| POST | `/v1/embeddings` | Passthrough vers Ollama |
| GET | `/health` | État proxy + version Ollama |

## Configuration Continue.dev

```json
{
  "models": [{
    "title": "Qwen3 8B (BlueTang)",
    "provider": "openai",
    "model": "qwen3:8b",
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
