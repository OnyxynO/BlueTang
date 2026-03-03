import http from 'http'

const srv = http.createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body)
      const msgs = parsed.messages || []
      console.log('\n=== Messages reçus par Ollama ===')
      msgs.forEach((m, i) => {
        const extrait = m.content.slice(0, 120).replace(/\n/g, '↵')
        console.log(`  ${i}. [${m.role}] ${extrait}`)
      })
    } catch {}

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Réponse mock.' } }],
      })
    )
  })
})

srv.listen(11434, () => console.log('Mock Ollama → http://localhost:11434'))
