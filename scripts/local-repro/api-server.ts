// 不具合再現用: api/*.ts（Vercel 関数）をローカル Supabase につないで手元で動かす最小サーバー。
// `vercel dev` は macOS で EBADF になるため、Vercel の req/res 形だけを再現して各ハンドラを直接呼ぶ。
// 起動: npx tsx scripts/local-repro/api-server.ts（通常は scripts/local-repro/web.sh から起動される）
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PORT = Number(process.env.LOCAL_REPRO_API_PORT ?? 5189)
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../api')

// ローカル Supabase 以外へ接続させない
process.env.SUPABASE_URL = 'http://127.0.0.1:55321'
process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_REPRO_SERVICE_ROLE_KEY ?? ''
process.env.SUPABASE_ANON_KEY = process.env.LOCAL_REPRO_PUBLISHABLE_KEY ?? ''
process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY
process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
process.env.ALLOWED_ORIGIN = `http://127.0.0.1:${process.env.LOCAL_REPRO_WEB_PORT ?? 5176}`

function resolveHandler(pathname: string): { file: string; params: Record<string, string> } | null {
  const route = pathname.replace(/^\/api\//, '').replace(/\/$/, '')
  if (!route || route.includes('..') || route.startsWith('_lib')) return null
  const direct = resolve(API_DIR, `${route}.ts`)
  if (existsSync(direct)) return { file: direct, params: {} }
  // public/scenarios/[slug].ts のような動的ルート
  const parts = route.split('/')
  const dynamic = resolve(API_DIR, ...parts.slice(0, -1), '[slug].ts')
  if (parts.length > 1 && existsSync(dynamic)) return { file: dynamic, params: { slug: parts.at(-1)! } }
  return null
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return undefined
  if ((req.headers['content-type'] ?? '').includes('application/json')) {
    try { return JSON.parse(raw) } catch { return raw }
  }
  return raw
}

function vercelResponse(res: ServerResponse) {
  const r = res as ServerResponse & Record<string, unknown>
  r.status = (code: number) => { res.statusCode = code; return r }
  r.json = (value: unknown) => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(value))
    return r
  }
  r.send = (value: unknown) => {
    if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) return (r.json as (v: unknown) => unknown)(value)
    res.end(value as string)
    return r
  }
  r.redirect = (a: number | string, b?: string) => {
    res.statusCode = typeof a === 'number' ? a : 307
    res.setHeader('location', typeof a === 'number' ? b! : a)
    res.end()
    return r
  }
  return r
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = resolveHandler(url.pathname)
  if (!target) {
    res.statusCode = 404
    res.end(JSON.stringify({ error: `local-repro: ${url.pathname} は未対応` }))
    return
  }
  try {
    const query: Record<string, string | string[]> = { ...target.params }
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key)
      query[key] = values.length > 1 ? values : values[0]
    }
    Object.assign(req, { query, body: await readBody(req), cookies: {} })
    const mod = await import(pathToFileURL(target.file).href)
    await mod.default(req, vercelResponse(res))
  } catch (error) {
    console.error(`[local-repro api] ${req.method} ${url.pathname}`, error)
    if (!res.headersSent) res.statusCode = 500
    res.end(JSON.stringify({ error: 'local-repro api error' }))
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`local-repro api: http://127.0.0.1:${PORT} → ${API_DIR}`)
})
