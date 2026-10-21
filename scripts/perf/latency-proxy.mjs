// 手元の性能計測用: HTTP の要求 1 件ごとに一定の遅延を足して転送する（本番の距離を模す）。WebSocket はそのまま通す。
// 例: node scripts/perf/latency-proxy.mjs --listen 55331 --target 55321 --delay 45
// 転送先は 127.0.0.1 に限る（手元専用）。
import http from 'node:http'
import net from 'node:net'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const LISTEN = Number(arg('listen'))
const TARGET = Number(arg('target'))
let DELAY = Number(arg('delay', '0'))
if (!LISTEN || !TARGET) { console.error('usage: --listen <port> --target <port> --delay <ms>'); process.exit(2) }

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 })
const server = http.createServer((req, res) => {
  // 遅延の変更: GET /__latency?ms=150
  if (req.url.startsWith('/__latency')) {
    const ms = Number(new URL(req.url, 'http://x').searchParams.get('ms'))
    if (Number.isFinite(ms)) DELAY = ms
    res.end(String(DELAY)); return
  }
  setTimeout(() => {
    const up = http.request({ host: '127.0.0.1', port: TARGET, method: req.method, path: req.url, headers: req.headers, agent }, (r) => {
      res.writeHead(r.statusCode, r.headers)
      r.pipe(res)
    })
    up.on('error', (e) => { res.statusCode = 502; res.end(String(e)) })
    req.pipe(up)
  }, DELAY)
})
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(TARGET, '127.0.0.1', () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n')
    up.write(head)
    up.pipe(socket); socket.pipe(up)
  })
  up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy())
})
server.listen(LISTEN, '127.0.0.1', () => console.log(`latency-proxy :${LISTEN} -> :${TARGET} +${DELAY}ms`))
