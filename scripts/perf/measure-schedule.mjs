// スケジュール管理と管理画面の操作時間・通信回数・React の描画回数を手元で測る（local-repro 専用）
// 前提: scripts/perf/seed-schedule-perf.sql を流した local-repro DB と、画面（既定 http://127.0.0.1:5186）
// 使い方: node scripts/perf/measure-schedule.mjs [--base http://127.0.0.1:5186] [--runs 3] [--latency 0] [--out result.json]
//   --latency: 往復の遅延（ms）を Chrome の回線模擬で足す（本番の距離感を見るため）
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://127.0.0.1:5186')
const RUNS = Number(arg('runs', '3'))
const LATENCY = Number(arg('latency', '0'))
const OUT = arg('out', '')
const ONLY = arg('only', '')
const STOP_AFTER = arg('stop-after', '') // この名前を含む操作を測ったら、その回を打ち切る（必要な操作だけ測るとき）
class StopRun extends Error {}
const WATCH_RENDERS = process.argv.includes('--renders') // コンポーネントごとの描画回数も数える（木を毎回たどるので時間は少し伸びる）
const EMAIL = 'perf-admin@perf.test'
const PASSWORD = process.env.PERF_PASSWORD || 'repro-local-2026' // local-repro/README.md の共通値（手元専用）
const ORG = 'perf-org'

// React DevTools のフックを模して、コミット回数と描画時間（開発版の actualDuration）を数える
const reactHook = () => {
  const stats = { commits: 0, renderMs: 0, maxCommitMs: 0, names: {} }
  window.__perfReact = stats
  window.__perfWatch = null // 例: ['PerformanceCard','TimeSlotCell']
  let nextId = 1
  const PerformedWork = 1
  const nameOf = (f) => { const t = f.type; if (!t) return null; if (typeof t === 'string') return null; return t.displayName || t.name || (t.type && (t.type.displayName || t.type.name)) || (t.render && (t.render.displayName || t.render.name)) || null }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false, supportsFiber: true, renderers: new Map(),
    inject(r) { const id = nextId++; this.renderers.set(id, r); return id },
    checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {},
    onCommitFiberRoot(_id, root) {
      stats.commits++
      const d = root.current && typeof root.current.actualDuration === 'number' ? root.current.actualDuration : 0
      stats.renderMs += d
      if (d > stats.maxCommitMs) stats.maxCommitMs = d
      const watch = window.__perfWatch
      if (!watch) return
      // 描画し直したコンポーネントを数える。PerformedWork の印は描画を飛ばした部分木に前回の値のまま残るので、
      // 前回のコミットで見たのと同じ fiber（＝今回は作り直されていない）は数えない
      const seenNow = new WeakSet()
      const prev = window.__perfSeen || new WeakSet()
      const stack = [root.current]
      while (stack.length) {
        const f = stack.pop()
        seenNow.add(f)
        const n = nameOf(f)
        if (n && watch.includes(n) && (f.flags & PerformedWork) && !prev.has(f)) {
          stats.names[n] = (stats.names[n] || 0) + 1
          // memo 済みの部品が描き直された理由（変わった props の名前）を数える
          if ((n === 'TimeSlotCellBase' || n === 'PerformanceCardBase' || n === 'MemoCellBase') && f.alternate && f.alternate.memoizedProps) {
            const a = f.alternate.memoizedProps, b = f.memoizedProps
            const changed = Object.keys(b).filter(k => a[k] !== b[k])
            const key = `${n}:${changed.join(',') || '(propsは同じ=内部状態/購読)'}`
            stats.names[key] = (stats.names[key] || 0) + 1
          }
        }
        if (f.child) stack.push(f.child)
        if (f.sibling) stack.push(f.sibling)
      }
      window.__perfSeen = seenNow
    },
  }
}

function classify(url) {
  const u = new URL(url)
  if (u.pathname.startsWith('/rest/v1/rpc/')) return `rpc:${u.pathname.slice(13)}`
  if (u.pathname.startsWith('/rest/v1/')) return `rest:${u.pathname.slice(9)}`
  if (u.pathname.startsWith('/api/')) {
    const t = u.searchParams.get('type') || u.searchParams.get('action') || ''
    return `api:${u.pathname.slice(5)}${t ? '?' + t : ''}`
  }
  if (u.pathname.startsWith('/auth/v1/')) return `auth:${u.pathname.slice(9)}`
  if (u.pathname.startsWith('/functions/v1/')) return `fn:${u.pathname.slice(14)}`
  if (u.pathname.startsWith('/storage/')) return 'storage'
  return null // 画面のファイル（JS・CSS・画像）は数えない
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const results = []
  for (let run = 1; run <= RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.addInitScript(reactHook)
    if (LATENCY > 0) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LATENCY, downloadThroughput: -1, uploadThroughput: -1 })
    }
    // 通信の記録
    let reqs = []
    const inflight = new Map()
    let lastNetAt = Date.now()
    page.on('request', r => {
      const c = classify(r.url()); if (!c) return
      const rec = { c, url: r.url(), method: r.method(), start: Date.now(), end: null }
      reqs.push(rec); inflight.set(r, rec); lastNetAt = Date.now()
    })
    const fin = r => { const rec = inflight.get(r); if (rec) { rec.end = Date.now(); inflight.delete(r); lastNetAt = Date.now() } }
    page.on('requestfinished', fin); page.on('requestfailed', fin)
    const quiet = async (ms = 600, max = 30000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < max) {
        if (inflight.size === 0 && Date.now() - lastNetAt >= ms) return
        await page.waitForTimeout(50)
      }
    }
    const reactStats = () => page.evaluate(() => ({ ...window.__perfReact, names: { ...window.__perfReact.names } }))
    const resetReact = (watch) => page.evaluate((w) => { Object.assign(window.__perfReact, { commits: 0, renderMs: 0, maxCommitMs: 0, names: {} }); window.__perfWatch = w }, watch)

    async function measure(name, action, ready, watch = null) {
      if (ONLY && !name.includes(ONLY)) { await action(); await ready(); return }
      await quiet(400)
      reqs = []
      await resetReact(WATCH_RENDERS ? watch : null)
      const t0 = Date.now()
      try {
        await action()
        await ready()
      } catch (e) {
        const shot = `${process.env.PERF_SHOT_DIR || '/tmp'}/perf-fail-${run}-${results.length}.png`
        await page.screenshot({ path: shot }).catch(() => {})
        console.error(`失敗: ${name}: ${String(e).split('\n')[0]}（画面: ${shot}）`)
        results.push({ run, name, error: String(e).split('\n')[0] })
        return
      }
      const tReady = Date.now() - t0
      await quiet()
      const tIdle = Math.max(tReady, (Math.max(0, ...reqs.map(r => r.end || 0)) || t0) - t0)
      const rs = await reactStats()
      const byKind = {}
      for (const r of reqs) byKind[r.c] = (byKind[r.c] || 0) + 1
      const dupes = Object.entries(reqs.reduce((m, r) => { const k = r.method + ' ' + r.url; m[k] = (m[k] || 0) + 1; return m }, {})).filter(([, n]) => n > 1).map(([k, n]) => `${n}x ${k.slice(0, 160)}`)
      // 直列の深さ: 前の通信の終了後に始まった通信の段数（おおよそ）
      const sorted = [...reqs].sort((a, b) => a.start - b.start)
      let depth = 0; let frontierEnd = -1
      for (const r of sorted) { if (r.start >= frontierEnd) { depth++; frontierEnd = r.end || r.start } else frontierEnd = Math.max(frontierEnd, Math.min(frontierEnd, r.end || r.start)) }
      const timeline = process.argv.includes('--timeline') ? [...reqs].sort((a, b) => a.start - b.start).map(r => `${String(r.start - t0).padStart(5)}-${String((r.end || r.start) - t0).padStart(5)} ${r.c} ${decodeURIComponent(r.url.replace(/^https?:\/\/[^/]+/, '')).slice(0, 150)}`) : undefined
      const row = { run, name, timeline, readyMs: tReady, idleMs: tIdle, requests: reqs.length, waves: depth, byKind, dupes, commits: rs.commits, renderMs: Math.round(rs.renderMs), maxCommitMs: Math.round(rs.maxCommitMs), renders: rs.names }
      results.push(row)
      console.log(JSON.stringify(row))
      if (STOP_AFTER && name.includes(STOP_AFTER)) throw new StopRun()
    }

    try {
    // ログイン（手元の試験アカウント）
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }), page.click('button[type="submit"]')])
    await quiet(800)

    const cards = page.locator('[data-schedule-scroll] [draggable="true"]')
    const firstDateRow = () => page.locator('[data-date]').first().getAttribute('data-date')
    const waitMonth = async (prefix) => {
      await page.waitForFunction((p) => {
        const row = document.querySelector('[data-date]')
        return row && row.getAttribute('data-date').startsWith(p) && document.querySelectorAll('[data-schedule-scroll] [draggable="true"]').length > 50
      }, prefix, { timeout: 60000 })
    }
    const nextBtn = page.locator('button[aria-label^="次月へ移動"]').first()
    const prevBtn = page.locator('button[aria-label^="前月へ移動"]').first()
    const WATCH = ['ScheduleTable', 'TimeSlotCellBase', 'PerformanceCardBase', 'MemoCellBase', 'EmptySlot', 'SlotMemoInput', 'CategoryGmStatsBar', 'ScheduleToolbar', 'PerformanceModal', 'MultiSelect']

    // 1. 初期表示（キャッシュなし）
    await measure('schedule: 初期表示（キャッシュなし）', () => page.goto(`${BASE}/${ORG}/schedule`), () => waitMonth('2026-10'), WATCH)
    // 2. 再読み込み（IndexedDB にキャッシュあり）
    await measure('schedule: 再読み込み', () => page.reload(), () => waitMonth('2026-10'), WATCH)
    // 2b. キャッシュを消して開き直す（その日初めて・別の端末で開いたとき）。ログイン状態（mmq-supabase-auth）だけ残す
    const clearCaches = () => page.evaluate(async () => {
      const dbs = indexedDB.databases ? await indexedDB.databases() : []
      await Promise.all(dbs.map(d => new Promise(r => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r() })))
      sessionStorage.clear()
      for (const k of Object.keys(localStorage)) if (!k.startsWith('sb-') && k !== 'mmq-supabase-auth') localStorage.removeItem(k)
    })
    await page.goto(`${BASE}/${ORG}/dashboard`); await quiet()
    await clearCaches()
    await measure('schedule: キャッシュなしで直接開く', () => page.goto(`${BASE}/${ORG}/schedule`), () => waitMonth('2026-10'), WATCH)
    // 3. 月移動（翌月・先読み済み）
    await measure('schedule: 翌月へ（先読み済み）', () => nextBtn.click(), () => waitMonth('2026-11'), WATCH)
    // 4. 月移動（前月へ戻る）
    await measure('schedule: 前月へ戻る', () => prevBtn.click(), () => waitMonth('2026-10'), WATCH)
    // 5. 月移動を 4 回続けて（先読みの外へ）
    await measure('schedule: 3か月先まで連続移動（先読みの外）', async () => { for (let i = 0; i < 3; i++) { await nextBtn.click(); await page.waitForTimeout(150) } }, () => waitMonth('2027-01'), WATCH)
    for (let i = 0; i < 3; i++) await prevBtn.click()
    await waitMonth('2026-10'); await quiet()
    // 6. 絞り込み（カテゴリ「貸切」）
    const privBtn = page.locator('[data-schedule-toolbar] button', { hasText: /^貸切\s*\d/ }).first()
    await measure('schedule: 種別で絞り込み（貸切）', () => privBtn.click(), async () => { await page.waitForTimeout(0) }, WATCH)
    await measure('schedule: 絞り込み解除', () => privBtn.click(), async () => { await page.waitForTimeout(0) }, WATCH)
    // 7. 公演詳細を開く
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '公演情報' })
    // sticky の操作行の下に隠れないよう、画面の中央へ寄せてから押す
    const openCard = async (i) => { await cards.nth(i).evaluate(el => el.scrollIntoView({ block: 'center' })); const b = await cards.nth(i).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2) }
    await cards.nth(5).evaluate(el => el.scrollIntoView({ block: 'center' })); await cards.nth(40).evaluate(el => el.scrollIntoView({ block: 'center' })); await quiet()
    await measure('schedule: 公演を開く（編集フォーム）', () => openCard(5), () => dialog.first().waitFor({ state: 'visible' }), WATCH)
    // 8. GM 選択リストを開く
    const gmTrigger = dialog.locator('button', { hasText: /試験スタッフ|^GM$/ }).first()
    await measure('schedule: GM選択リストを開く', () => gmTrigger.click(), () => page.locator('.scrollable-list > div').nth(5).waitFor({ state: 'visible', timeout: 10000 }), WATCH)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    // 8b. 編集フォームの備考に 10 文字入力（1 文字ごとの再描画）
    const notes = dialog.locator('textarea').first()
    await notes.click()
    await measure('schedule: 備考に10文字入力', () => page.keyboard.type('あいうえおかきくけこ'), async () => {}, WATCH)
    // 9. 閉じる（キャンセル）
    await measure('schedule: 公演を閉じる', () => dialog.locator('button', { hasText: 'キャンセル' }).first().click(), () => dialog.first().waitFor({ state: 'hidden', timeout: 10000 }), WATCH)
    // 変更の破棄確認が出たら破棄する
    const discard = page.locator('[role="alertdialog"] button', { hasText: /破棄|閉じる|はい/ }).first()
    if (await discard.isVisible().catch(() => false)) await discard.click()
    // 10. 新規追加（空き枠をダブルクリックではなくセルの＋）→ 省略。代わりに別の公演を開閉
    await measure('schedule: 2件目の公演を開く', () => openCard(40), () => dialog.first().waitFor({ state: 'visible' }), WATCH)
    await dialog.locator('button', { hasText: 'キャンセル' }).first().click()
    await dialog.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    // 11. その他の管理画面（初回表示）
    const pages = [
      ['予約管理', 'reservations'], ['貸切管理', 'private-booking-management'], ['顧客管理', 'customer-management'],
      ['作品管理', 'scenarios'], ['スタッフ管理', 'staff'], ['ダッシュボード', 'dashboard'],
    ]
    for (const [label, path] of pages) {
      await measure(`${label}: 初期表示`, () => page.goto(`${BASE}/${ORG}/${path}`), async () => { await page.waitForLoadState('domcontentloaded') })
    }
    } catch (e) { if (!(e instanceof StopRun)) throw e }
    await context.close()
  }
  await browser.close()
  if (OUT) writeFileSync(OUT, JSON.stringify({ base: BASE, latency: LATENCY, runs: RUNS, at: new Date().toISOString(), results }, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
