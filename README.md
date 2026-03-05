# BlueTang

> Proxy intelligent entre un client LLM et Ollama — RAG codebase + mémoire + client MCP

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.3.0-orange)

BlueTang s'intercale de manière transparente entre ton client LLM (Continue.dev, Open WebUI, etc.) et Ollama. Il enrichit automatiquement chaque prompt avec :

- **RAG hybride** — extraits de code pertinents (BM25 + recherche sémantique via `nomic-embed-text`)
- **Mémoire de conversation** — résumé progressif + extraction de faits, persistés en SQLite
- **Chunking AST** — découpage syntaxiquement exact du code via tree-sitter (TS, JS, Python, PHP)
- **Client MCP** — connexion à des serveurs MCP stdio (filesystem, bases de données, APIs…) avec injection de contexte et exécution agentique des tools

Le client ne voit rien : il pointe sur `:11435` au lieu de `:11434`, tout le reste fonctionne comme avant.

```
Client LLM → bluetang :11435 → [RAG + mémoire + MCP] → Ollama :11434
```

---

## Installation

```bash
npm install -g bluetang
# ou sans installation globale :
npx bluetang serve
```

**Prérequis**
- Node.js ≥ 22
- [Ollama](https://ollama.ai) en cours d'exécution
- `ollama pull nomic-embed-text` pour le RAG sémantique (optionnel)

---

## Démarrage rapide

```bash
# 1. Configuration interactive (génère .bluetang.json)
bluetang init

# 2. Indexer ta codebase
bluetang index ./src --ollama-url http://localhost:11434

# 3. Lancer le proxy
bluetang serve

# 4. Pointer ton client LLM sur http://localhost:11435/v1
```

---

## Performance

BlueTang ajoute un surcoût de **50–200ms** par requête (enrichissement RAG + session). Sur des générations qui durent 10–300s avec un LLM local, ce surcoût est imperceptible.

Benchmark sur Mac mini M2 avec `qwen3:8b` :

| Question | Ollama direct | Via BlueTang | Surcoût |
|----------|--------------|-------------|---------|
| Simple (boucle Python) | 29.5s | 28.2s | < 1s (bruit) |
| Complexe (webhook FastAPI) | 339.9s | 204.3s | < 1s (variabilité modèle) |

---

## Configuration

### Fichier `.bluetang.json`

Crée un fichier `.bluetang.json` à la racine de ton projet pour éviter de répéter les options CLI :

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

### Serveurs MCP supportés

BlueTang se connecte à n'importe quel serveur MCP stdio. Exemples :

| Serveur | Commande | Capabilities |
|---------|----------|-------------|
| `@modelcontextprotocol/server-filesystem` | `npx -y @modelcontextprotocol/server-filesystem /dossier` | read_file, list_directory, write_file… |
| `@modelcontextprotocol/server-sqlite` | `npx -y @modelcontextprotocol/server-sqlite chemin.db` | query, list_tables… |
| `@modelcontextprotocol/server-github` | `npx -y @modelcontextprotocol/server-github` | issues, pull_requests, code search… |

BlueTang détermine automatiquement si un serveur MCP est pertinent pour chaque requête (keyword matching sur les noms et descriptions des tools). Si pertinent :
1. Les **resources** disponibles sont lues et injectées comme contexte système
2. Les **tools** sont exposés au modèle — si Ollama retourne un `tool_call`, BlueTang l'exécute et re-soumet (jusqu'à 3 tours agentiques)

### Exemple Continue.dev

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

### Utilisation sur le réseau local (LAN)

BlueTang écoute sur `0.0.0.0` par défaut — il est accessible depuis d'autres machines du réseau sans configuration supplémentaire.

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

---

## Commandes

### `bluetang init`

Assistant de configuration interactif. Génère `.bluetang.json` et indexe la codebase si souhaité.

```bash
bluetang init
```

### `bluetang serve`

Lance le proxy avec RAG et mémoire actifs.

```bash
bluetang serve [options]

Options :
  -p, --port <port>        Port du proxy (défaut : 11435)
  --ollama-url <url>       URL Ollama (défaut : http://localhost:11434)
  -m, --model <nom>        Modèle par défaut (défaut : qwen3:1.7b)
  --num-ctx <n>            Taille du contexte en tokens (défaut : 16384)
  --db-path <chemin>       Base de données (défaut : .bluetang/index.db)
  -v, --verbose            Logs détaillés
```

### `bluetang index [chemin]`

Indexe un dossier pour le RAG. Sans `--ollama-url`, seul le BM25 est activé.

```bash
bluetang index ./src
bluetang index ./src --ollama-url http://localhost:11434   # + embeddings sémantiques
bluetang index ./src -v                                    # afficher les fichiers traités
```

Langages supportés : TypeScript, JavaScript, Python, PHP, Markdown.

### `bluetang watch [chemin]`

Surveille les modifications en temps réel et met à jour l'index automatiquement.

```bash
bluetang watch ./src
bluetang watch ./src --ollama-url http://localhost:11434
```

### `bluetang status`

Affiche les statistiques de l'index courant.

```bash
bluetang status
# Fichiers indexés : 14
# Chunks total     : 87
# Vecteurs         : 87
# Sessions mémoire : 3 (42 messages)
# Dernière MAJ     : 2026-03-04 09:30:00
```

### `bluetang clean`

Supprime l'index et/ou les sessions. Crée une sauvegarde `.db.bak` avant suppression.

```bash
bluetang clean --index      # supprime l'index (fichiers, chunks, vecteurs)
bluetang clean --sessions   # supprime les sessions de mémoire
bluetang clean --all        # supprime tout
bluetang clean --all -y     # sans confirmation (scripts, SSH)
```

---

## Endpoints API

| Méthode | Route               | Description                              |
|---------|---------------------|------------------------------------------|
| POST    | `/v1/chat/completions` | Proxy enrichi (RAG + mémoire)         |
| GET     | `/v1/models`        | Liste les modèles Ollama                 |
| POST    | `/v1/embeddings`    | Passthrough vers Ollama                  |
| GET     | `/health`           | État du proxy et d'Ollama               |
| GET     | `/stats`            | Métriques temps réel (index + mémoire)  |

### Exemple `/stats`

```json
{
  "version": "0.3.0",
  "index": { "fichiers": 14, "chunks": 87, "vecteurs": 87, "derniere_indexation": "2026-03-04T09:30:00" },
  "memoire": { "sessions": 3, "messages": 42 },
  "ollama": { "url": "http://localhost:11434", "accessible": true, "version": "0.6.0" },
  "config": { "port": 11435, "modele": "qwen3:1.7b", "numCtx": 16384 }
}
```

---

## Architecture

```
src/
├── index.ts              # CLI (Commander) : serve, index, watch, status, clean, init
├── config.ts             # Config + validation Zod + chargement .bluetang.json
├── version.ts            # VERSION lue dynamiquement depuis package.json
├── bdd/
│   ├── connexion.ts      # ouvrirBdd() + sqlite-vec
│   └── schema.ts         # Tables : fichiers, chunks, chunks_fts, chunks_vec, sessions…
├── cli/
│   ├── init.ts           # Assistant interactif (@inquirer/prompts)
│   └── clean.ts          # Suppression index/sessions avec sauvegarde
├── indexation/
│   ├── chunker.ts        # Découpage AST tree-sitter (TS/JS/Python/PHP) + fallback regex
│   ├── scanner.ts        # Scan dossiers, filtre .gitignore
│   ├── pipeline.ts       # Indexation batch : chunks + embeddings (batching par 20)
│   └── watcher.ts        # Surveillance temps réel (chokidar)
├── rag/
│   ├── embedder.ts       # Embeddings via Ollama nomic-embed-text (batch + single)
│   ├── recherche.ts      # BM25 (FTS5) + sémantique (sqlite-vec) + hybride
│   └── assembleur.ts     # Injection contexte dans le prompt
├── memoire/
│   ├── session.ts        # Identification session, persistance, injection mémoire
│   └── resume.ts         # Résumé progressif + extraction de faits
├── mcp/
│   ├── client.ts         # ClientMcp — connexion stdio, listTools, callTool, readResource
│   ├── gestionnaire.ts   # GestionnaireMcp — pool de clients (un par serveur)
│   ├── pertinence.ts     # Keyword matching requête vs tools/resources (seuil 0.3)
│   └── injecteur.ts      # Injection resources + retour des tools disponibles
├── serveur/
│   ├── app.ts            # Hono app + init MCP + démarrage + vérif modèle
│   ├── completions.ts    # POST /v1/chat/completions : mémoire → RAG → MCP → Ollama
│   └── modeles.ts        # GET /v1/models, /health, /stats, POST /v1/embeddings
└── utils/
    └── stopwords.ts      # Stopwords partagés (RAG + MCP)
```

### Flux d'une requête

```
1. Client envoie POST /v1/chat/completions
2. BlueTang identifie la session (SHA-256 des 3 premiers messages)
3. Injecte la mémoire (résumé + faits) en premier message système
4. Recherche hybride BM25 + cosinus → injecte les extraits de code pertinents
5. Si serveurs MCP configurés → score pertinence → injecte resources + expose tools
6. Forward vers Ollama (avec tools si pertinents)
7. Si Ollama retourne tool_calls → exécute via MCP, re-soumet (max 3 tours)
8. Capture la réponse (stream ou JSON)
9. Sauvegarde l'échange + mise à jour du résumé si nécessaire
```

---

## Développement

```bash
git clone https://github.com/OnyxynO/BlueTang
cd BlueTang
npm install

npm run dev -- serve -v          # lancer en mode dev
npm test                          # tests (64 tests)
npm run typecheck                 # vérification TypeScript
npm run build                     # build pour production

npx tsx scripts/benchmark.ts     # benchmark BM25 recall sur la codebase
```

---

## Troubleshooting

### Port déjà utilisé

```
Error: listen EADDRINUSE :::11435
```

Un autre processus occupe le port. Changer le port dans `.bluetang.json` ou via `--port` :

```bash
bluetang serve --port 11436
```

### Modèle introuvable au démarrage

```
⚠ Modèle "qwen3:1.7b" introuvable dans Ollama. Modèles disponibles : ...
```

Installer le modèle manquant :

```bash
ollama pull qwen3:1.7b
```

### Ollama inaccessible (503)

```json
{ "error": "Ollama inaccessible : fetch failed" }
```

Vérifier qu'Ollama tourne et que l'URL est correcte :

```bash
curl http://localhost:11434/api/version   # doit retourner {"version":"..."}
brew services start ollama                # si installé via Homebrew
```

### Pas de contexte RAG injecté

Vérifier que l'index n'est pas vide :

```bash
bluetang status
```

Si `Chunks total : 0`, réindexer :

```bash
bluetang index ./src --ollama-url http://localhost:11434
```

### Base de données corrompue

```
SqliteError: database disk image is malformed
```

Supprimer la base et réindexer :

```bash
bluetang clean --all -y
bluetang index ./src --ollama-url http://localhost:11434
```

### Sessions non retrouvées (mémoire perdue)

La session est identifiée par un hash des 3 premiers messages. Si le client LLM ne renvoie pas l'historique complet à chaque requête, la session peut ne pas être retrouvée. C'est un comportement normal (best-effort).

---

## Pièges connus

- **FTS5 tokenizer** : ne découpe pas le camelCase — `envoyerEmail` est un token unique
- **sqlite-vec** v0.1.7-alpha : pas de rowid explicite en INSERT → table de liaison `chunks_vec_map`
- **Grammaires tree-sitter** : modules CJS → utiliser `createRequire(import.meta.url)` en ESM
- **Modèle minimum** : `qwen3:1.7b` recommandé — les modèles 0.6b exploitent mal le contexte RAG injecté

---

## Licence

MIT
