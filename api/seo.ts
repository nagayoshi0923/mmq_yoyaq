import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'

const SITE_ORIGIN = 'https://mmq.game'

const STATIC_PAGES: Record<string, { title: string; description: string; heading: string; body: string }> = {
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
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlPage(input: {
  title: string
  description: string
  canonicalPath: string
  heading: string
  body: string
}): string {
  const canonical = input.canonicalPath === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${input.canonicalPath}`
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <meta name="description" content="${escapeHtml(input.description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${escapeHtml(input.title)}" />
  <meta property="og:description" content="${escapeHtml(input.description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:locale" content="ja_JP" />
</head>
<body>
  <h1>${escapeHtml(input.heading)}</h1>
  <p>${escapeHtml(input.body)}</p>
  <p><a href="${escapeHtml(canonical)}">このページを開く</a></p>
</body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }

  const kind = firstQuery(req.query.kind as string | string[] | undefined) || 'home'
  const slug = firstQuery(req.query.slug as string | string[] | undefined)

  if (kind === 'scenario' && slug && db) {
    const { data } = await db
      .from('public_scenarios')
      .select('title, description, author, slug')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle()
    const title = (data as { title?: string } | null)?.title || slug
    const description =
      (data as { description?: string } | null)?.description
      || `マーダーミステリー作品「${title}」の公演日程・予約。`
    const page = htmlPage({
      title: `${title} | マーダーミステリー公演予約 | MMQ`,
      description,
      canonicalPath: `/scenario/${slug}`,
      heading: title,
      body: description,
    })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
    res.status(200).send(page)
    return
  }

  if (kind === 'blog' && slug && db) {
    const { data } = await db
      .from('blog_posts')
      .select('title, excerpt, content, slug')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
    if (!data) {
      res.status(404).send('not found')
      return
    }
    const title = (data as { title: string }).title
    const description =
      (data as { excerpt?: string | null; content?: string | null }).excerpt
      || (data as { content?: string | null }).content?.slice(0, 120)
      || title
    const page = htmlPage({
      title: `${title} | MMQ`,
      description,
      canonicalPath: `/blog/${slug}`,
      heading: title,
      body: description,
    })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(page)
    return
  }

  const staticPage = STATIC_PAGES[kind] ?? STATIC_PAGES.home
  const path = kind === 'home' ? '/' : `/${kind}`
  const page = htmlPage({
    title: staticPage.title,
    description: staticPage.description,
    canonicalPath: path,
    heading: staticPage.heading,
    body: staticPage.body,
  })
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400')
  res.status(200).send(page)
}
