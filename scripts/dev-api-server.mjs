#!/usr/bin/env node
// 手元の API サーバー（vercel dev の代わり）
//
// api/*.ts（Vercel Functions 形式の default handler）を Node の http サーバーから直接呼ぶ。
// macOS では `vercel dev` が spawn EBADF で関数を実行できないため、Vercel の req/res の形だけを再現する。
//
//   npm run dev:api                     # 単体で起動（ファイル変更で自動再起動）
//   npm run dev:full                    # Supabase・API・画面をまとめて起動
//
// - TypeScript は tsx で直接読み込む（.js 拡張子の import を .ts に解決でき、型注釈以外の TS 構文
//   〔constructor の public 引数など〕も扱えるため。Node 22 の --experimental-strip-types はどちらも不可）
// - 環境変数は .env.local → .env.api.local の順に読む（後の方が優先。既に設定済みの環境変数が最優先）
// - 接続先 Supabase が手元（localhost / 127.0.0.1）でなければ起動しない（DEV_API_ALLOW_REMOTE=1 で解除）
// - vercel.json の rewrites も同じ規則で再現する（/sitemap.xml → /api/sitemap、/ や /guide → /api/seo など）
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import dotenv from 'dotenv'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API_DIR = resolve(ROOT, 'api')

// ---------------------------------------------------------------------------
// TypeScript の読み込み（tsx watch 経由でなく node で直接起動された場合だけ登録する）
// ---------------------------------------------------------------------------
const underTsx = process.execArgv.some(arg => arg.includes('tsx')) || Boolean(process.env.TSX_RUNNING)
if (!underTsx) {
  const { register } = await import('tsx/esm/api')
  register()
}

// ---------------------------------------------------------------------------
// 環境変数
// ---------------------------------------------------------------------------
const preset = new Set(Object.keys(process.env))
for (const file of ['.env.local', '.env.api.local']) {
  const path = resolve(ROOT, file)
  if (!existsSync(path)) continue
  const parsed = dotenv.parse(readFileSync(path))
  for (const [key, value] of Object.entries(parsed)) {
    if (!preset.has(key)) process.env[key] = value
  }
}
process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
process.env.VITE_SUPABASE_URL ||= process.env.SUPABASE_URL
process.env.VITE_SUPABASE_ANON_KEY ||= process.env.SUPABASE_ANON_KEY

const PORT = Number(process.env.DEV_API_PORT || process.env.PORT || 3000)
const HOST = process.env.DEV_API_HOST || '127.0.0.1'

function assertLocalSupabase() {
  const url = process.env.SUPABASE_URL
  if (!url) {
    console.error('[dev-api] SUPABASE_URL が未設定です。cp .env.api.local.example .env.api.local を実行してください')
    process.exit(1)
  }
  const host = new URL(url).hostname
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'].includes(host)
  if (!isLocal && process.env.DEV_API_ALLOW_REMOTE !== '1') {
    console.error(`[dev-api] SUPABASE_URL が手元ではありません（${host}）。staging・本番へは接続しません。`)
    console.error('          意図して接続する場合だけ DEV_API_ALLOW_REMOTE=1 を付けてください。')
    process.exit(1)
  }
}
assertLocalSupabase()

// ---------------------------------------------------------------------------
// ルーティング
// ---------------------------------------------------------------------------
/** /api/<name>、/api/public/<name>、/api/public/scenarios/<slug>（[slug].ts）を api/ 配下のファイルに対応付ける */
export function resolveHandler(pathname) {
  const route = decodeURIComponent(pathname).replace(/^\/api\/?/, '').replace(/\/+$/, '')
  if (!route) return null
  const parts = route.split('/')
  // _lib などの内部モジュール、.. を含む経路、テストファイルは公開しない（Vercel と同じ扱い）
  if (parts.some(p => !p || p === '..' || p.startsWith('_') || p.startsWith('.'))) return null
  if (/\.test$|\.characterization$/.test(route)) return null
  const direct = resolve(API_DIR, `${route}.ts`)
  if (direct.startsWith(API_DIR + sep) && existsSync(direct)) return { file: direct, params: {} }
  const index = resolve(API_DIR, route, 'index.ts')
  if (index.startsWith(API_DIR + sep) && existsSync(index)) return { file: index, params: {} }
  // 動的ルート（例: api/public/scenarios/[slug].ts）
  if (parts.length > 1) {
    const dirPath = resolve(API_DIR, ...parts.slice(0, -1))
    if (dirPath.startsWith(API_DIR) && existsSync(dirPath)) {
      for (const name of ['[slug].ts', '[id].ts']) {
        const file = resolve(dirPath, name)
        if (existsSync(file)) return { file, params: { [name.slice(1, -4)]: parts.at(-1) } }
      }
    }
  }
  return null
}

/** vercel.json の rewrites を正規表現に変換する（:name と (正規表現) の 2 種類に対応） */
function compileRewrites() {
  const config = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'))
  return (config.rewrites ?? []).map(({ source, destination }) => {
    const names = []
    let pattern = ''
    for (let i = 0; i < source.length;) {
      const ch = source[i]
      if (ch === ':') {
        const name = /^:([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(i))[1]
        names.push(name)
        pattern += '([^/]+)'
        i += name.length + 1
      } else if (ch === '(') {
        // 括弧の対応を数えてそのまま正規表現として使う（vercel の (?!assets/) などの書き方）
        let depth = 0, j = i
        for (; j < source.length; j++) {
          if (source[j] === '\\') { j++; continue }
          if (source[j] === '(') depth++
          if (source[j] === ')' && --depth === 0) break
        }
        const group = source.slice(i, j + 1)
        names.push(null)
        pattern += group.replace(/\\\\/g, '\\')
        i = j + 1
      } else {
        pattern += ch.replace(/[.*+?^${}|[\]\\]/g, '\\$&')
        i++
      }
    }
    return { source, destination, regex: new RegExp(`^${pattern}$`), names }
  })
}
const REWRITES = compileRewrites()

export function applyRewrite(pathname) {
  for (const rule of REWRITES) {
    const m = rule.regex.exec(pathname)
    if (!m) continue
    let dest = rule.destination
    rule.names.forEach((name, idx) => {
      if (name) dest = dest.replaceAll(`:${name}`, encodeURIComponent(m[idx + 1]))
    })
    return dest
  }
  return null
}

// ---------------------------------------------------------------------------
// Vercel 互換の req / res
// ---------------------------------------------------------------------------
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks)
  if (raw.length === 0) return undefined
  const type = String(req.headers['content-type'] ?? '').toLowerCase()
  const text = raw.toString('utf8')
  if (type.includes('application/json')) {
    try { return JSON.parse(text) } catch { return text }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text))
  }
  if (type.startsWith('text/')) return text
  return raw
}

function parseCookies(header) {
  const out = {}
  for (const part of String(header ?? '').split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key) out[key] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function toQuery(searchParams, params) {
  const query = { ...params }
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }
  return query
}

function enhanceResponse(res) {
  res.status = code => { res.statusCode = code; return res }
  res.json = value => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(value))
    return res
  }
  res.send = value => {
    if (value === undefined || value === null) { res.end(); return res }
    if (Buffer.isBuffer(value)) {
      if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/octet-stream')
      res.end(value)
      return res
    }
    if (typeof value === 'object') return res.json(value)
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(String(value))
    return res
  }
  res.redirect = (a, b) => {
    const [code, location] = typeof a === 'number' ? [a, b] : [307, a]
    res.statusCode = code
    res.setHeader('location', location)
    res.end()
    return res
  }
  return res
}

async function callHandler(file, params, url, req, res) {
  Object.assign(req, {
    query: toQuery(url.searchParams, params),
    cookies: parseCookies(req.headers.cookie),
    body: await readBody(req),
  })
  const mod = await import(pathToFileURL(file).href)
  const handler = mod.default
  if (typeof handler !== 'function') throw new Error(`${file} に default export の handler がありません`)
  await handler(req, enhanceResponse(res))
}

function sendStaticAppShell(res) {
  // vercel.json の最後の規則（それ以外は /app.html）。dist を作っていなければ案内を返す
  const file = resolve(ROOT, 'dist/app.html')
  if (!existsSync(file)) {
    res.statusCode = 404
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('dist/app.html がありません。画面は http://localhost:5173 を開いてください（3000 番は API 用）。\n'
      + 'SEO 用の HTML を 3000 番で確かめるときは先に npm run build:fast を実行してください。\n')
    return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(readFileSync(file))
}

const server = createServer(async (req, res) => {
  const started = Date.now()
  res.on('finish', () => {
    if (process.env.DEV_API_QUIET !== '1') {
      console.log(`[dev-api] ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started}ms)`)
    }
  })
  let url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  try {
    if (!url.pathname.startsWith('/api/')) {
      const dest = applyRewrite(url.pathname)
      if (!dest) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      const destUrl = new URL(dest, url)
      for (const [k, v] of url.searchParams) if (!destUrl.searchParams.has(k)) destUrl.searchParams.append(k, v)
      if (destUrl.pathname === '/app.html') return sendStaticAppShell(res)
      url = destUrl
    }
    const target = resolveHandler(url.pathname)
    if (!target) {
      res.statusCode = 404
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: `dev-api: ${url.pathname} に対応する api/*.ts がありません` }))
      return
    }
    await callHandler(target.file, target.params, url, req, res)
  } catch (error) {
    console.error(`[dev-api] ${req.method} ${url.pathname} でエラー`, error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'dev-api: handler error', message: String(error?.message ?? error) }))
    } else {
      res.end()
    }
  }
})

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, HOST, () => {
    console.log(`[dev-api] http://${HOST}:${PORT} で起動（api/ → ${process.env.SUPABASE_URL}）`)
  })
}

export { server }
