#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  try {
    ({ chromium } = await import('@playwright/test'))
  } catch {
    console.error('Playwright が未インストールです。`npx playwright install chromium` を実行してください。')
    process.exit(1)
  }
}

const BASE = 'https://queenswaltz.jp'
const OUT = join(process.cwd(), '.archive-queenswaltz')
const STATIC_URLS = [
  '/', '/制作_提携-1', '/2', '/escape', '/escape/toraware', '/catalog', '/search',
  '/catalog9', '/catalog8', '/catalog7', '/catalog6', '/catalog5', '/catalog_mystery',
  '/catalog_story', '/catalog_new', '/catalog_beginner', '/マダミスとは？', '/問い合わせ-完了',
  '/問い合わせ', '/QA', '/制作_提携', '/クインズワルツ', '/会社概要', '/プライバシーポリシー',
  '/mysteryfiles', '/3', '/topics',
  // sitemap には無いがサイト内リンクから発見した旧ページ
  '/old問い合わせ・その他',
].map((path) => `${BASE}${path}`)
const SITEMAPS = {
  topics: `${BASE}/sitemap-dynamic/sitemap-dynamic-topics-s--c-slug.xml`,
  catalog_detail: `${BASE}/sitemap-dynamic/sitemap-dynamic-catalog_detail-s--c-slug.xml`,
}

const args = process.argv.slice(2)
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const limit = getArg('--limit') ? Number(getArg('--limit')) : undefined
const only = getArg('--only')
const skipAssets = args.includes('--skip-assets')
const force = args.includes('--force')
const crawl = args.includes('--crawl')
const seeds = args.flatMap((arg, i) => arg === '--seed' ? [args[i + 1]] : []).filter(Boolean)

// 隠しページ（進行サイト）は「次へ」で一本道に繋がるため深さが深い。
// 上限に当たると探索が黙って打ち切られるので、実際の連鎖より十分大きく取る。
const MAX_DEPTH = 200
const MAX_PAGES = 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const absolute = (value, base = BASE) => { try { return new URL(value, base).href } catch { return value } }
const safeSlug = (rawUrl) => {
  const path = new URL(rawUrl).pathname
  if (path === '/') return '_root'
  return decodeURIComponent(path).replace(/^\//, '').replaceAll('/', '__').replace(/[?？:*"<>|\\]/g, '_') || '_root'
}
const hash8 = (value) => createHash('sha1').update(value).digest('hex').slice(0, 8)
const fileSafe = (value) => (value || 'asset').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^\.+$/, 'asset')
const interceptedUrls = new Set()
const interceptedAssets = new Map()
const contentTypeExtension = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'image/gif': '.gif', 'image/avif': '.avif', 'font/woff': '.woff', 'font/woff2': '.woff2',
  'font/ttf': '.ttf', 'font/otf': '.otf', 'application/font-woff': '.woff',
  'application/font-woff2': '.woff2', 'application/vnd.ms-fontobject': '.eot',
  'text/css': '.css', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3',
}

const assetContentType = (value) => (value || '').split(';', 1)[0].trim().toLowerCase()
const isInterceptableType = (value) => {
  const type = assetContentType(value)
  return type.startsWith('image/') || type.startsWith('font/') || type.startsWith('video/') || type.startsWith('audio/') || type === 'text/css' || type.startsWith('application/font-') || type === 'application/vnd.ms-fontobject'
}

async function interceptAssets(page, pageUrl) {
  const pending = new Set()
  page.on('response', (response) => {
    const type = assetContentType(response.headers()['content-type'])
    const originalUrl = response.url()
    if (!isInterceptableType(type) || interceptedUrls.has(originalUrl)) return
    interceptedUrls.add(originalUrl)
    const task = (async () => {
      try {
        const data = await response.body()
        const parsed = new URL(originalUrl)
        const urlExt = extname(parsed.pathname).toLowerCase()
        const ext = urlExt && urlExt.length <= 8 ? urlExt : (contentTypeExtension[type] || '.bin')
        const name = fileSafe(basename(parsed.pathname, urlExt)) || 'asset'
        const localPath = `assets/${name}__${hash8(originalUrl)}${ext}`
        const target = join(OUT, localPath)
        await mkdir(join(OUT, 'assets'), { recursive: true })
        if (!existsSync(target)) await writeFile(target, data)
        const current = interceptedAssets.get(originalUrl)
        if (current) current.foundOn = [...new Set([...current.foundOn, pageUrl])]
        else interceptedAssets.set(originalUrl, { originalUrl, localPath, bytes: data.length, contentType: type, foundOn: [pageUrl], ok: true, error: '' })
      } catch (error) {
        const current = interceptedAssets.get(originalUrl)
        if (current) current.foundOn = [...new Set([...current.foundOn, pageUrl])]
        else interceptedAssets.set(originalUrl, { originalUrl, localPath: '', bytes: 0, contentType: type, foundOn: [pageUrl], ok: false, error: String(error) })
      }
    })()
    pending.add(task)
    task.finally(() => pending.delete(task))
  })
  return async () => { await Promise.allSettled([...pending]) }
}

async function sitemapUrls(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`sitemap HTTP ${response.status}`)
  const xml = await response.text()
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim())
}

async function scrollPage(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let elapsed = 0
      const timer = setInterval(() => {
        window.scrollBy(0, 300)
        elapsed += 100
        if (elapsed >= 30000 || window.innerHeight + window.scrollY >= document.body.scrollHeight) {
          clearInterval(timer); resolve()
        }
      }, 100)
    })
  })
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(1500)
}

// 本文の文字数が「一定時間変化しなくなった」ら描画完了とみなす。
// 固定の文字数閾値だと、隠しページ（キャラ設定書など本文が短いページ）で
// 毎回タイムアウトまで待ってしまい実用にならないため安定検知にしている。
const MIN_TEXT = 40 // 「読み込まれました」だけの空ページ（約20〜30文字）を弾く下限
async function waitForRenderedText(page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const deadline = Date.now() + 20000
    let last = -1
    let stable = 0
    while (Date.now() < deadline) {
      const length = await page.evaluate(() => document.body?.innerText?.length || 0)
      if (length === last) stable += 1
      else { last = length; stable = 0 }
      if (last > MIN_TEXT && stable >= 3) return { renderWarning: false, renderedTextLength: last }
      await sleep(300)
    }
    if (last > MIN_TEXT) return { renderWarning: false, renderedTextLength: last }
    if (attempt === 0) await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
  }
  const renderedTextLength = await page.evaluate(() => document.body?.innerText?.length || 0)
  console.warn(`[render] 警告: ${page.url()} の本文が ${renderedTextLength} 文字です`)
  return { renderWarning: true, renderedTextLength }
}

async function collectMeta(page, url, slug) {
  return page.evaluate(({ url, slug }) => {
    const abs = (value) => { try { return new URL(value, location.href).href } catch { return value } }
    const internal = (href) => { try { return new URL(href).hostname === location.hostname } catch { return false } }
    const urls = (value) => [...String(value || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => abs(m[1]))
    const all = [...document.querySelectorAll('*')]
    const backgroundImages = [...new Set(all.flatMap((el) => urls(getComputedStyle(el).backgroundImage)))]
    const fontSet = new Set(); const colorSet = new Set()
    for (const el of all) { const s = getComputedStyle(el); fontSet.add(s.fontFamily); colorSet.add(s.color); colorSet.add(s.backgroundColor) }
    return {
      url, safeSlug: slug, title: document.title, description: document.querySelector('meta[name="description"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content ? abs(document.querySelector('meta[property="og:image"]').content) : '',
      links: [...document.querySelectorAll('a')].map((a) => ({ href: abs(a.href), text: (a.innerText || '').trim(), isInternal: internal(abs(a.href)) })),
      crawlAttributes: [...document.querySelectorAll('[data-href], [onclick], link[href]')].flatMap((el) => ['data-href', 'onclick', 'href'].map((name) => el.getAttribute(name)).filter(Boolean)),
      images: [...document.images].map((img) => ({ src: abs(img.currentSrc || img.src), alt: img.alt || '' })),
      backgroundImages, videos: [...document.querySelectorAll('video, source, iframe')].map((el) => abs(el.src || el.getAttribute('src'))).filter(Boolean),
      headings: [...document.querySelectorAll('h1,h2,h3,h4')].map((el) => (el.innerText || '').trim()), text: document.body?.innerText || '',
      fonts: [...fontSet].filter(Boolean), colors: [...colorSet].filter(Boolean).slice(0, 50),
    }
  }, { url, slug })
}

async function fetchPage(browser, url) {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const waitDesktopAssets = await interceptAssets(desktop, url)
  try {
    await desktop.goto(encodeURI(url), { waitUntil: 'networkidle', timeout: 60000 })
    const render = await waitForRenderedText(desktop)
    await scrollPage(desktop)
    const meta = await collectMeta(desktop, url, safeSlug(url))
    meta.renderWarning = render.renderWarning; meta.renderedTextLength = render.renderedTextLength
    const html = await desktop.content()
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
    const mobile = await mobileContext.newPage()
    const waitMobileAssets = await interceptAssets(mobile, url)
    await mobile.goto(encodeURI(url), { waitUntil: 'networkidle', timeout: 60000 }); await waitForRenderedText(mobile); await scrollPage(mobile)
    const dir = join(OUT, 'pages', safeSlug(url)); await mkdir(dir, { recursive: true })
    await desktop.screenshot({ path: join(dir, 'desktop.png'), fullPage: true })
    await mobile.screenshot({ path: join(dir, 'mobile.png'), fullPage: true })
    await writeFile(join(dir, 'page.html'), html)
    await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
    await waitDesktopAssets(); await waitMobileAssets()
    await mobileContext.close()
    return meta
  } finally { await desktop.close() }
}

async function withRetries(browser, url) {
  let error
  for (let attempt = 0; attempt < 3; attempt++) { try { return await fetchPage(browser, url) } catch (e) { error = e; if (attempt < 2) await sleep(1000) } }
  throw error
}

async function downloadAssets(metas) {
  const assetsDir = join(OUT, 'assets'); await mkdir(assetsDir, { recursive: true })
  const urls = [...new Set(metas.flatMap((m) => [...m.images.map((x) => x.src), ...m.backgroundImages, m.ogImage, ...m.videos].filter((x) => /^https?:\/\//i.test(x))))]
  const manifest = []; let cursor = 0
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      if (interceptedAssets.has(url)) continue
      const ext = extname(new URL(url).pathname).split('?')[0] || '.bin'
      const local = `assets/${fileSafe(basename(new URL(url).pathname, ext)) || 'asset'}__${hash8(url)}${ext.length < 2 ? '.bin' : ext}`
      const target = join(OUT, local)
      if (existsSync(target)) { const stat = await import('node:fs/promises').then((fs) => fs.stat(target)); manifest.push({ originalUrl: url, localPath: local, bytes: stat.size, contentType: '', foundOn: metas.filter((m) => [m.ogImage, ...m.images.map((x) => x.src), ...m.backgroundImages, ...m.videos].includes(url)).map((m) => m.url), ok: true, error: '' }); continue }
      try { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); const data = Buffer.from(await response.arrayBuffer()); await writeFile(target, data); manifest.push({ originalUrl: url, localPath: local, bytes: data.length, contentType: response.headers.get('content-type') || '', foundOn: metas.filter((m) => [m.ogImage, ...m.images.map((x) => x.src), ...m.backgroundImages, ...m.videos].includes(url)).map((m) => m.url), ok: true, error: '' }) }
      catch (e) { manifest.push({ originalUrl: url, localPath: local, bytes: 0, contentType: '', foundOn: metas.filter((m) => [m.ogImage, ...m.images.map((x) => x.src), ...m.backgroundImages, ...m.videos].includes(url)).map((m) => m.url), ok: false, error: String(e) }) }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  manifest.unshift(...interceptedAssets.values())
  await writeFile(join(OUT, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2)); return manifest
}

const crawlSeeds = seeds.length ? seeds : [`${BASE}/mysteryfiles/02/akui`, `${BASE}/mysteryfiles/01/sika`]
const normalizeCrawlUrl = (value, base) => {
  try {
    const parsed = new URL(value, base)
    parsed.hash = ''; parsed.search = ''
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    return parsed.href
  } catch { return '' }
}
const crawlCandidateValues = (meta, html) => [
  ...(meta.links || []).map((link) => link.href),
  ...(meta.crawlAttributes || []),
  ...(html.match(/\/mysteryfiles\/[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-]+)*/g) || []),
]
const crawlTarget = (url) => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'queenswaltz.jp') return { kind: 'ignore' }
    if (parsed.pathname.startsWith('/mysteryfiles/')) return { kind: 'expand' }
    if (parsed.pathname.startsWith('/catalog_detail/') || parsed.pathname.startsWith('/topics/')) return { kind: 'ignore' }
    return { kind: 'external' }
  } catch { return { kind: 'ignore' } }
}

async function runCrawl(browser) {
  const queue = crawlSeeds.map((url) => ({ url: normalizeCrawlUrl(url, BASE), depth: 0, foundFrom: [] }))
  const queued = new Set(queue.map((item) => item.url)); const visited = new Set(); const records = []
  const edges = []; const edgeSet = new Set(); const externalRefs = new Set(); const failures = []
  let truncated = false; let cursor = 0; let maxDepth = 0; let active = 0
  async function worker() {
    while (true) {
      const item = queue[cursor++]
      // キューが空でも、他のワーカーが処理中なら後からリンクが積まれる可能性がある。
      // 全ワーカーが手空きになるまで終了しない（ここで抜けると未探索ページが残る）。
      if (!item) {
        cursor -= 1
        if (active === 0) return
        await sleep(300)
        continue
      }
      if (visited.has(item.url)) continue
      if (records.length >= MAX_PAGES) { truncated = true; return }
      visited.add(item.url); maxDepth = Math.max(maxDepth, item.depth)
      const started = Date.now(); const slug = safeSlug(item.url); const metaPath = join(OUT, 'pages', slug, 'meta.json'); const htmlPath = join(OUT, 'pages', slug, 'page.html')
      active += 1
      try {
        let meta; let html
        if (!force && existsSync(metaPath) && existsSync(htmlPath)) { meta = JSON.parse(await readFile(metaPath, 'utf8')); html = await readFile(htmlPath, 'utf8') }
        else { meta = await withRetries(browser, item.url); html = await readFile(htmlPath, 'utf8') }
        const candidates = [...new Set(crawlCandidateValues(meta, html).map((value) => normalizeCrawlUrl(value, item.url)).filter(Boolean))]
        const newLinks = []
        for (const candidate of candidates) {
          const target = crawlTarget(candidate)
          if (target.kind === 'ignore') continue
          if (target.kind === 'external') { externalRefs.add(new URL(candidate).pathname); continue }
          const edgeKey = `${item.url}\n${candidate}`
          if (!edgeSet.has(edgeKey)) { edgeSet.add(edgeKey); edges.push({ from: item.url, to: candidate }) }
          if (!queued.has(candidate) && item.depth < MAX_DEPTH && queue.length < MAX_PAGES) { queued.add(candidate); queue.push({ url: candidate, depth: item.depth + 1, foundFrom: [item.url] }); newLinks.push(candidate) }
          else if (queued.has(candidate)) {
            const queuedItem = queue.find((entry) => entry.url === candidate); if (queuedItem && !queuedItem.foundFrom.includes(item.url)) queuedItem.foundFrom.push(item.url)
          }
        }
        records.push({ url: item.url, safeSlug: slug, title: meta.title || '', depth: item.depth, foundFrom: item.foundFrom, ok: true, error: '', renderWarning: Boolean(meta.renderWarning), linkCount: candidates.length })
        console.log(`[depth${item.depth}] OK  ${new URL(item.url).pathname}  (${((Date.now() - started) / 1000).toFixed(1)}s)  新規リンク${newLinks.length}件`)
      } catch (error) {
        records.push({ url: item.url, safeSlug: slug, title: '', depth: item.depth, foundFrom: item.foundFrom, ok: false, error: String(error), renderWarning: false, linkCount: 0 })
        failures.push({ type: 'page', url: item.url, error: String(error) }); console.log(`[depth${item.depth}] FAIL ${item.url}`)
      } finally {
        active -= 1
      }
      await sleep(500)
    }
  }
  await Promise.all([worker(), worker()]);
  if (queue.length >= MAX_PAGES || records.length >= MAX_PAGES) truncated = true
  await writeFile(join(OUT, 'crawl.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), seeds: crawlSeeds.map((url) => normalizeCrawlUrl(url, BASE)), pages: records, edges, externalRefs: [...externalRefs], failures, truncated }, null, 2))
  console.log(`完了: 取得 ${records.filter((p) => p.ok).length}ページ / 最大深さ ${maxDepth} / 失敗 ${failures.length} / 描画警告 ${records.filter((p) => p.renderWarning).length}件 / 打ち切り ${truncated ? 'あり' : 'なし'}`)
}

const main = async () => {
  await mkdir(join(OUT, 'pages'), { recursive: true })
  const browser = await chromium.launch()
  if (crawl) { await runCrawl(browser); await browser.close(); return }
  let dynamic = []
  try { const topics = await sitemapUrls(SITEMAPS.topics); const details = await sitemapUrls(SITEMAPS.catalog_detail); dynamic = [...topics, ...(args.includes('--all-details') ? details : details.slice(0, 5))] }
  catch (e) { console.error(`[sitemap] 失敗: ${e}`) }
  let urls = [...new Set([...STATIC_URLS, ...dynamic])].filter((url) => !only || url.includes(only)); if (limit !== undefined) urls = urls.slice(0, limit)
  const metas = []; const pages = []; const failures = []; let next = 0
  async function worker() { while (next < urls.length) { const i = next++; const url = urls[i]; const started = Date.now(); const slug = safeSlug(url); const metaPath = join(OUT, 'pages', slug, 'meta.json'); try { let meta; if (!force && existsSync(metaPath)) meta = JSON.parse(await readFile(metaPath, 'utf8')); else meta = await withRetries(browser, url); metas.push(meta); pages[i] = { url, safeSlug: slug, title: meta.title, ok: true, error: '', linkCount: meta.links.length, imageCount: meta.images.length, renderWarning: Boolean(meta.renderWarning) }; console.log(`[${i + 1}/${urls.length}] OK  ${new URL(url).pathname}  (${((Date.now() - started) / 1000).toFixed(1)}s)`) } catch (e) { pages[i] = { url, safeSlug: slug, title: '', ok: false, error: String(e), linkCount: 0, imageCount: 0, renderWarning: false }; failures.push({ type: 'page', url, error: String(e) }); console.log(`[${i + 1}/${urls.length}] FAIL ${url}`) } } }
  await Promise.all([worker(), worker(), worker()]); await browser.close()
  const allInternalLinks = [...new Set(metas.flatMap((m) => m.links.filter((l) => l.isInternal).map((l) => JSON.stringify({ from: m.url, to: l.href })).filter(Boolean)))].map((x) => JSON.parse(x))
  const targetSet = new Set(urls.map((u) => new URL(u).href)); const discoveredUrls = [...new Set(allInternalLinks.map((x) => x.to).filter((u) => !targetSet.has(u)))]
  let manifest = []; if (!skipAssets) manifest = await downloadAssets(metas); failures.push(...manifest.filter((x) => !x.ok).map((x) => ({ type: 'asset', ...x })))
  await writeFile(join(OUT, 'index.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), pages: pages.filter(Boolean), allInternalLinks, discoveredUrls, failures }, null, 2))
  console.log(`完了: 成功 ${pages.filter((p) => p?.ok).length} / 失敗 ${failures.length} / 描画警告 ${pages.filter((p) => p?.renderWarning).length}件 / アセット ${manifest.length}`)
}

await main()
