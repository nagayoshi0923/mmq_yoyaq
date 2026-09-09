import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import { STATIC_PUBLIC_META, ADMIN_PAGE_IDS } from '../src/lib/seo.js'
import { buildPrice } from './_lib/publicScenario.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderSeoShell, escapeHtml, hasPublicStore } from './_lib/seoShell.js'

const SITE_ORIGIN = 'https://mmq.game'

const STATIC_PAGES: Record<string, { title: string; description: string; heading: string; body: string }> = {
  ...Object.fromEntries(Object.values(STATIC_PUBLIC_META).map(meta => [meta.path.slice(1) || 'home', { ...meta, heading: meta.title.split(' | ')[0], body: meta.description }])),
  home: {
    title: 'マーダーミステリー（マダミス）公演予約 | MMQ',
    description: 'マーダーミステリー（マダミス）の公演検索・予約。全国の店舗から作品を探して、そのまま予約できます。',
    heading: 'マーダーミステリー（マダミス）公演予約',
    body: 'MMQは全国の店舗のマーダーミステリー公演を検索し、予約できるサービスです。',
  },
  guide: {
    title: 'マーダーミステリーとは・予約の使い方 | MMQ',
    description: 'マーダーミステリー（マダミス）の遊び方と、MMQでの公演の探し方・予約手順。',
    heading: 'マーダーミステリー（マダミス）とは',
    body: 'マーダーミステリーは、参加者が物語の登場人物になりきり、会話と推理で事件の真相を探る体験型ゲームです。MMQから公演を予約できます。',
  },
  faq: {
    title: 'よくある質問 | マーダーミステリー予約 MMQ',
    description: 'マーダーミステリー公演の予約・キャンセル・初めての参加について。',
    heading: 'よくある質問',
    body: '予約方法、初めての参加、キャンセルについて案内しています。',
  },
  stores: {
    title: '参加店舗一覧 | マーダーミステリー MMQ',
    description: 'MMQで公演を予約できるマーダーミステリー店舗・団体の一覧です。',
    heading: '参加店舗一覧',
    body: 'MMQに参加しているマーダーミステリー店舗・団体の一覧です。',
  },
}

function firstQuery(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

const PRIVATE_ROUTES = new Set([...ADMIN_PAGE_IDS, 'login', 'signup', 'reset-password', 'set-password',
  'complete-profile', 'coupon-present', 'coupon-claim', 'recruitment-response', 'register',
  'start', 'accept-invitation', 'author-dashboard', 'author-login', 'mypage', 'my-page',
  'dashboard', 'admin', 'lp'])

// Vercel includes the exact Vite output, including hashed JS/CSS assets.
let shell: string | undefined
function getShell() {
  return shell ??= readFileSync(resolve(process.cwd(), 'dist/app.html'), 'utf8')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end()
  const kind = firstQuery(req.query.kind) || 'home'
  const slug = firstQuery(req.query.slug)
  const orgSlug = firstQuery(req.query.org)
  const path = kind === 'home' ? '/' : kind === 'org' ? `/${slug}`
    : kind === 'scenario' && slug ? `${orgSlug ? `/${orgSlug}` : ''}/scenario/${slug}`
    : kind === 'blog' ? `/blog/${slug}` : `/${kind}`

  function send(title: string, description: string, body: string, status = 200, noindex = false) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', status === 200 && !noindex
      ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store')
    if (noindex) res.setHeader('X-Robots-Tag', 'noindex')
    const html = renderSeoShell(getShell(), {title, description, canonical: SITE_ORIGIN + path, body, noindex})
    return req.method === 'HEAD' ? res.status(status).end() : res.status(status).send(html)
  }
  const unavailable = () => send('一時的に読み込めません | MMQ', '時間をおいて再度お試しください。',
    '<h1>一時的に読み込めません</h1><p>時間をおいて再度お試しください。</p>', 503, true)
  const missing = () => send('ページが見つかりません | MMQ', 'ページが見つかりません。',
    '<h1>ページが見つかりません</h1><a href="/">公演を探す</a>', 404, true)
  const list = (rows: Array<{slug: string; title: string}>, prefix = '/scenario/') =>
    '<ul>' + rows.map(row => `<li><a href="${prefix}${encodeURIComponent(row.slug)}">${escapeHtml(row.title)}</a></li>`).join('') + '</ul>'

  try {
    if (kind === 'org' && PRIVATE_ROUTES.has(slug) && !STATIC_PAGES[slug]) {
      return send('MMQ', 'マーダーミステリー公演予約', '', 200, true)
    }
    const staticPage = STATIC_PAGES[kind === 'org' ? slug : kind]
    if (staticPage && !(kind === 'scenario' && slug)) {
      let links = ''
      if (['home', 'scenario', 'stores'].includes(kind === 'org' ? slug : kind)) {
        if (!db) return unavailable()
        const {data: rows, error} = await db.from('public_scenarios')
          .select('title, slug').not('slug', 'is', null).order('title').limit(1000)
        if (error) return unavailable()
        const unique = [...new Map((rows ?? []).map(row => [row.slug, row])).values()]
        links = '<h2>公開中の作品</h2>' + list(unique)
      }
      if (['home', 'stores'].includes(kind === 'org' ? slug : kind)) {
        if (!db) return unavailable()
        const {data: orgs, error} = await db.from('organizations')
          .select('name, slug, stores(status, ownership_type)').eq('is_active', true).not('slug', 'is', null)
        if (error) return unavailable()
        const publicOrgs = (orgs ?? []).filter(org => hasPublicStore(org.stores))
        const orgLinks = '<h2>公演を予約できる店舗・団体</h2>' + list(publicOrgs.map(org => ({slug:org.slug, title:org.name})), '/')
        links = orgLinks + (kind === 'stores' || slug === 'stores' ? '' : links)
      }
      return send(staticPage.title, staticPage.description,
        `<h1>${escapeHtml(staticPage.heading)}</h1><p>${escapeHtml(staticPage.body)}</p>${links}`)
    }
    if (!db) return unavailable()
    if (kind === 'scenario' && slug) {
      let query = db.from('public_scenarios')
        .select('title, description, author, slug, player_count_min, player_count_max, duration, participation_fee, participation_costs')
        .eq('slug', slug)
      if (orgSlug) {
        const {data: org, error} = await db.from('organizations').select('id')
          .eq('slug', orgSlug).eq('is_active', true).maybeSingle()
        if (error) return unavailable()
        if (!org) return missing()
        query = query.eq('organization_id', org.id)
      }
      const {data, error} = await query.order('organization_id').limit(1).maybeSingle()
      if (error) return unavailable()
      if (!data) return missing()
      const title = data.title || slug
      const description = data.description || `マーダーミステリー作品「${title}」の公演日程・予約。`
      const details = [data.author && `作者：${data.author}`,
        data.player_count_min != null && `参加人数：${data.player_count_min}${data.player_count_max != null && data.player_count_max !== data.player_count_min ? '〜' + data.player_count_max : ''}人`,
        data.duration != null && `所要時間：${data.duration}分`,
        orgSlug && buildPrice(data.participation_costs, data.participation_fee).display && `料金：${buildPrice(data.participation_costs, data.participation_fee).display}`].filter(Boolean)
      return send(`${title} | マーダーミステリー公演予約 | MMQ`, description.replace(/\s+/g, ' ').slice(0, 160),
        `<h1>${escapeHtml(title)}</h1><p style="white-space:pre-line">${escapeHtml(description)}</p>` +
        details.map(text => `<p>${escapeHtml(String(text))}</p>`).join('') +
        '<p>公演日程・空席・料金は予約画面でご確認ください。</p>')
    }
    if (kind === 'org' && slug) {
      const {data: org, error} = await db.from('organizations').select('id, name')
        .eq('slug', slug).eq('is_active', true).maybeSingle()
      if (error) return unavailable()
      if (!org) return missing()
      const {data: rows, error: listError} = await db.from('public_scenarios').select('title, slug')
        .eq('organization_id', org.id).not('slug', 'is', null).order('title').limit(1000)
      if (listError) return unavailable()
      const description = `${org.name}のマーダーミステリー公演を検索・予約できます。`
      return send(`${org.name} | マーダーミステリー予約 | MMQ`, description,
        `<h1>${escapeHtml(org.name)}</h1><p>${escapeHtml(description)}</p><h2>公演作品</h2>` +
        list(rows ?? [], `/${encodeURIComponent(slug)}/scenario/`))
    }
    if (kind === 'blog' && slug) {
      const {data, error} = await db.from('blog_posts').select('title, excerpt, content')
        .eq('slug', slug).eq('is_published', true).maybeSingle()
      if (error) return unavailable()
      if (!data) return missing()
      return send(`${data.title} | MMQ`, data.excerpt || data.title,
        `<h1>${escapeHtml(data.title)}</h1><div style="white-space:pre-line">${escapeHtml(data.content || data.excerpt || '')}</div>`)
    }
    return missing()
  } catch {
    // Never turn a data outage into a cacheable "not found" page.
    return unavailable()
  }
}
