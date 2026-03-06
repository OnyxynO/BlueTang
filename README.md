# BlueTang

> Intelligent proxy between an LLM client and Ollama — RAG + memory + MCP

[![English](https://img.shields.io/badge/lang-English-blue)](#english) [![Français](https://img.shields.io/badge/lang-Français-blue)](#français)

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![npm](https://img.shields.io/npm/v/bluetang)

---

## English

BlueTang sits transparently between your LLM client (Continue.dev, Open WebUI, etc.) and Ollama. It automatically enriches every prompt with:

- **Hybrid RAG** — relevant code snippets (BM25 + semantic search via `nomic-embed-text`)
- **Conversation memory** — progressive summary + fact extraction, persisted in SQLite
- **AST chunking** — syntactically exact code splitting via tree-sitter (TS, JS, Python, PHP)
- **MCP client** — connects to stdio MCP servers (filesystem, databases, APIs…) with context injection and agentic tool execution

The client sees nothing: point it at `:11435` instead of `:11434`, everything works as before.

```
LLM client → bluetang :11435 → [RAG + memory + MCP] → Ollama :11434
```

### Installation

```bash
npm install -g bluetang
# or without global install:
npx bluetang serve
```

**Prerequisites**
- Node.js ≥ 22
- [Ollama](https://ollama.ai) running
- `ollama pull nomic-embed-text` for semantic RAG (optional)

### Quick start

```bash
# 1. Interactive setup (generates .bluetang.json)
bluetang init

# 2. Index your codebase
bluetang index ./src --ollama-url http://localhost:11434

# 3. Start the proxy
bluetang serve

# 4. Point your LLM client at http://localhost:11435/v1
```

### Performance

BlueTang adds **50–200ms** overhead per request (RAG enrichment + session). On generations that take 10–300s with a local LLM, this overhead is imperceptible.

Benchmark on Mac mini M4 with `qwen3:8b`:

| Question | Ollama direct | Via BlueTang | Overhead |
|----------|--------------|-------------|---------|
| Simple (Python loop) | 29.5s | 28.2s | < 1s (noise) |
| Complex (FastAPI webhook) | 339.9s | 204.3s | < 1s (model variability) |

### Configuration

#### `.bluetang.json`

Generated automatically by `bluetang init`. Full format:

```json
{
  "port": 11435,
  "ollamaUrl": "http://localhost:11434",
  "modele": "qwen3:1.7b",
  "numCtx": 16384,
  "cheminBdd": ".bluetang/index.db",
  "mcp": [
    {
      "nom": "filesystem",
      "commande": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/folder"]
    }
  ]
}
```

CLI options take priority over this file.

#### MCP servers

BlueTang connects to any stdio MCP server:

| Server | Command | Capabilities |
|--------|---------|-------------|
| `@modelcontextprotocol/server-filesystem` | `npx -y @modelcontextprotocol/server-filesystem /folder` | read_file, list_directory, write_file… |
| `@modelcontextprotocol/server-sqlite` | `npx -y @modelcontextprotocol/server-sqlite path.db` | query, list_tables… |
| `@modelcontextprotocol/server-github` | `npx -y @modelcontextprotocol/server-github` | issues, pull_requests, code search… |

BlueTang automatically determines if a MCP server is relevant for each request (keyword matching on tool names and descriptions). If relevant:
1. Available **resources** are read and injected as system context
2. **Tools** are exposed to the model — if Ollama returns a `tool_call`, BlueTang executes it and resubmits (up to 3 agentic rounds)

#### Continue.dev example

```json
{
  "models": [{
    "title": "Qwen3 (BlueTang)",
    "provider": "openai",
    "model": "qwen3:1.7b",
    "apiBase": "http://localhost:11435/v1",
    "apiKey": "not-needed"
  }]
}
```

#### LAN usage

BlueTang listens on `0.0.0.0` by default — accessible from other machines without extra configuration.

```json
{
  "models": [{
    "title": "BlueTang (Mac mini)",
    "provider": "openai",
    "model": "qwen3:8b",
    "apiBase": "http://192.168.1.X:11435/v1",
    "apiKey": "not-needed"
  }]
}
```

### Commands

| Command | Description |
|---------|-------------|
| `bluetang init` | Interactive setup wizard |
| `bluetang serve` | Start the proxy |
| `bluetang index [path]` | Index a folder for RAG |
| `bluetang watch [path]` | Watch for file changes and update index |
| `bluetang status` | Show index statistics |
| `bluetang clean` | Delete index and/or sessions |
| `bluetang languages` | Manage supported languages |

```bash
bluetang serve --port 11435 --ollama-url http://localhost:11434 -m qwen3:1.7b
bluetang index ./src --ollama-url http://localhost:11434
bluetang clean --all -y
bluetang languages add     # interactive menu to install grammars
bluetang languages remove  # uninstall optional languages
```

**Built-in languages** (always available): TypeScript, JavaScript, Python, PHP, Markdown.

**Optional languages** (installable on demand via `bluetang languages add`): Ruby, Go, Rust, Java, C, C++, C#, Bash, Lua, Kotlin.

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/v1/chat/completions` | Enriched proxy (RAG + memory) |
| GET | `/v1/models` | List Ollama models |
| POST | `/v1/embeddings` | Passthrough to Ollama |
| GET | `/health` | Proxy and Ollama status |
| GET | `/stats` | Real-time metrics (index + memory) |

### Architecture

```
LLM client sends POST /v1/chat/completions
→ BlueTang identifies session (SHA-256 of first 3 messages)
→ Injects memory (summary + facts) as first system message
→ Hybrid BM25 + cosine search → injects relevant code snippets
→ If MCP servers configured → relevance score → inject resources + expose tools
→ Forward to Ollama (with tools if relevant)
→ If Ollama returns tool_calls → execute via MCP, resubmit (max 3 rounds)
→ Capture response (stream or JSON)
→ Save exchange + update summary if needed
```

### Development

```bash
git clone https://github.com/OnyxynO/BlueTang
cd BlueTang
npm install

npm run dev -- serve -v     # dev mode
npm test                     # tests (118 tests)
npm run typecheck            # TypeScript check
npm run build                # production build
```

### Troubleshooting

**Port already in use**
```bash
bluetang serve --port 11436
```

**Model not found at startup**
```bash
ollama pull qwen3:1.7b
```

**Ollama unreachable (503)**
```bash
curl http://localhost:11434/api/version
brew services start ollama
```

**No RAG context injected**
```bash
bluetang status
bluetang index ./src --ollama-url http://localhost:11434
```

### Known caveats

- **FTS5 tokenizer**: does not split camelCase — `sendEmail` is one token
- **sqlite-vec** v0.1.7-alpha: no explicit rowid in INSERT
- **tree-sitter grammars**: CJS modules → use `createRequire(import.meta.url)` in ESM
- **Minimum model**: `qwen3:1.7b` recommended — 0.6b models poorly exploit injected RAG context
- **tree-sitter compatibility**: engine `0.21.x` — newer grammars may be incompatible; BlueTang falls back to heuristic chunking automatically

---

## Français

BlueTang s'intercale de manière transparente entre ton client LLM (Continue.dev, Open WebUI, etc.) et Ollama. Il enrichit automatiquement chaque prompt avec :

- **RAG hybride** — extraits de code pertinents (BM25 + recherche sémantique via `nomic-embed-text`)
- **Mémoire de conversation** — résumé progressif + extraction de faits, persistés en SQLite
- **Chunking AST** — découpage syntaxiquement exact du code via tree-sitter (TS, JS, Python, PHP)
- **Client MCP** — connexion à des serveurs MCP stdio (filesystem, bases de données, APIs…) avec injection de contexte et exécution agentique des tools

Le client ne voit rien : il pointe sur `:11435` au lieu de `:11434`, tout le reste fonctionne comme avant.

```
Client LLM → bluetang :11435 → [RAG + mémoire + MCP] → Ollama :11434
```

### Installation

```bash
npm install -g bluetang
# ou sans installation globale :
npx bluetang serve
```

**Prérequis**
- Node.js ≥ 22
- [Ollama](https://ollama.ai) en cours d'exécution
- `ollama pull nomic-embed-text` pour le RAG sémantique (optionnel)

### Démarrage rapide

```bash
# 1. Configuration interactive (génère .bluetang.json)
bluetang init

# 2. Indexer ta codebase
bluetang index ./src --ollama-url http://localhost:11434

# 3. Lancer le proxy
bluetang serve

# 4. Pointer ton client LLM sur http://localhost:11435/v1
```

### Performance

BlueTang ajoute un surcoût de **50–200ms** par requête (enrichissement RAG + session). Sur des générations qui durent 10–300s avec un LLM local, ce surcoût est imperceptible.

Benchmark sur Mac mini M4 avec `qwen3:8b` :

| Question | Ollama direct | Via BlueTang | Surcoût |
|----------|--------------|-------------|---------|
| Simple (boucle Python) | 29.5s | 28.2s | < 1s (bruit) |
| Complexe (webhook FastAPI) | 339.9s | 204.3s | < 1s (variabilité modèle) |

### Configuration

#### `.bluetang.json`

Généré automatiquement par `bluetang init`. Format complet :

```json
{
  "port": 11435,
  "ollamaUrl": "http://localhost:11434",
  "modele": "qwen3:1.7b",
  "numCtx": 16384,
  "cheminBdd": ".bluetang/index.db",
  "mcp": [
    {
      "nom": "filesystem",
      "commande": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/chemin/vers/dossier"]
    }
  ]
}
```

Les options CLI ont priorité sur ce fichier.

#### Serveurs MCP supportés

BlueTang se connecte à n'importe quel serveur MCP stdio :

| Serveur | Commande | Capabilities |
|---------|----------|-------------|
| `@modelcontextprotocol/server-filesystem` | `npx -y @modelcontextprotocol/server-filesystem /dossier` | read_file, list_directory, write_file… |
| `@modelcontextprotocol/server-sqlite` | `npx -y @modelcontextprotocol/server-sqlite chemin.db` | query, list_tables… |
| `@modelcontextprotocol/server-github` | `npx -y @modelcontextprotocol/server-github` | issues, pull_requests, code search… |

BlueTang détermine automatiquement si un serveur MCP est pertinent pour chaque requête. Si pertinent :
1. Les **resources** disponibles sont lues et injectées comme contexte système
2. Les **tools** sont exposés au modèle — si Ollama retourne un `tool_call`, BlueTang l'exécute et re-soumet (jusqu'à 3 tours agentiques)

#### Exemple Continue.dev

```json
{
  "models": [{
    "title": "Qwen3 (BlueTang)",
    "provider": "openai",
    "model": "qwen3:1.7b",
    "apiBase": "http://localhost:11435/v1",
    "apiKey": "not-needed"
  }]
}
```

#### Utilisation sur le réseau local (LAN)

BlueTang écoute sur `0.0.0.0` par défaut — accessible depuis d'autres machines sans configuration supplémentaire.

### Commandes

| Commande | Description |
|----------|-------------|
| `bluetang init` | Assistant de configuration interactif |
| `bluetang serve` | Lancer le proxy |
| `bluetang index [chemin]` | Indexer un dossier pour le RAG |
| `bluetang watch [chemin]` | Surveiller les modifications en temps réel |
| `bluetang status` | Statistiques de l'index |
| `bluetang clean` | Supprimer l'index et/ou les sessions |
| `bluetang languages` | Gérer les langages supportés |

**Langages intégrés** : TypeScript, JavaScript, Python, PHP, Markdown.

**Langages optionnels** (via `bluetang languages add`) : Ruby, Go, Rust, Java, C, C++, C#, Bash, Lua, Kotlin.

### Endpoints API

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/v1/chat/completions` | Proxy enrichi (RAG + mémoire) |
| GET | `/v1/models` | Liste les modèles Ollama |
| POST | `/v1/embeddings` | Passthrough vers Ollama |
| GET | `/health` | État du proxy et d'Ollama |
| GET | `/stats` | Métriques temps réel |

### Développement

```bash
git clone https://github.com/OnyxynO/BlueTang
cd BlueTang
npm install

npm run dev -- serve -v     # mode dev
npm test                     # tests (118 tests)
npm run build                # build production
```

---

## License / Licence

MIT
