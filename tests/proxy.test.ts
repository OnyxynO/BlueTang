import { describe, it, expect, vi, afterEach } from 'vitest'
import { creerApp } from '../src/serveur/app.js'
import { configDefaut } from '../src/config.js'

const config = { ...configDefaut, verbose: false }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/health', () => {
  it('retourne ok quand Ollama est accessible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ version: '0.5.1' }), { status: 200 })
      )
    )

    const app = creerApp(config)
    const rep = await app.fetch(new Request('http://localhost/health'))
    const donnees = (await rep.json()) as Record<string, string>

    expect(rep.status).toBe(200)
    expect(donnees.statut).toBe('ok')
    expect(donnees.ollama).toBe('0.5.1')
    expect(donnees.proxy).toBe('0.3.0')
  })

  it('retourne 503 si Ollama est inaccessible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')))

    const app = creerApp(config)
    const rep = await app.fetch(new Request('http://localhost/health'))

    expect(rep.status).toBe(503)
  })
})

describe('/v1/models', () => {
  it('proxyfie la liste des modèles Ollama', async () => {
    const modeles = { object: 'list', data: [{ id: 'qwen3:8b' }] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(modeles), { status: 200 })
      )
    )

    const app = creerApp(config)
    const rep = await app.fetch(new Request('http://localhost/v1/models'))
    const donnees = (await rep.json()) as typeof modeles

    expect(rep.status).toBe(200)
    expect(donnees.data[0].id).toBe('qwen3:8b')
  })

  it('retourne 503 si Ollama est inaccessible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')))

    const app = creerApp(config)
    const rep = await app.fetch(new Request('http://localhost/v1/models'))

    expect(rep.status).toBe(503)
  })
})

describe('/v1/chat/completions', () => {
  it('proxyfie une réponse JSON (non-streaming)', async () => {
    const repOllama = {
      id: 'chatcmpl-123',
      choices: [{ message: { role: 'assistant', content: 'Bonjour !' } }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(repOllama), { status: 200 })
      )
    )

    const app = creerApp(config)
    const rep = await app.fetch(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3:8b',
          messages: [{ role: 'user', content: 'Bonjour' }],
        }),
      })
    )
    const donnees = (await rep.json()) as typeof repOllama

    expect(rep.status).toBe(200)
    expect(donnees.choices[0].message.content).toBe('Bonjour !')
  })

  it('proxyfie le flux SSE (streaming)', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"Bon"}}]}\n\ndata: [DONE]\n\n'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(sse, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    )

    const app = creerApp(config)
    const rep = await app.fetch(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3:8b',
          messages: [{ role: 'user', content: 'Bonjour' }],
          stream: true,
        }),
      })
    )

    expect(rep.status).toBe(200)
    expect(rep.headers.get('Content-Type')).toContain('text/event-stream')
    const texte = await rep.text()
    expect(texte).toContain('[DONE]')
  })

  it('retourne 503 si Ollama est inaccessible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')))

    const app = creerApp(config)
    const rep = await app.fetch(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen3:8b', messages: [] }),
      })
    )

    expect(rep.status).toBe(503)
  })
})
