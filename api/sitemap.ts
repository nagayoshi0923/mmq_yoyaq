import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'

const SITE_ORIGIN = 'https://mmq.game'

const STATIC_PATHS = [
  '/',
  '/guide',
  '/faq',
  '/stores',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
  '/legal',
  '/cancel-policy',
  '/for-business',
]

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function urlEntry(path: string, changefreq: string, priority: string, lastmod?: string | null): string {
  const loc = path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`
  const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod.slice(0, 10))}</lastmod>` : ''
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodTag}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }

  const missing = getMissingEnvError()
  if (missing || !db) {
    res.status(500).send('sitemap unavailable')
    return
  }

  const entries: string[] = STATIC_PATHS.map((path) =>
    urlEntry(path, path === '/' ? 'daily' : 'weekly', path === '/' ? '1.0' : '0.6'),
  )

  const { data: orgs } = await db
    .from('organizations')
    .select('slug, updated_at')
    .eq('is_active', true)
    .not('slug', 'is', null)

  for (const org of orgs ?? []) {
    const slug = (org as { slug: string | null }).slug
    if (!slug) continue
    entries.push(urlEntry(`/${slug}`, 'daily', '0.8', (org as { updated_at?: string }).updated_at))
  }

  const { data: scenarios } = await db
    .from('public_scenarios')
    .select('slug, updated_at')
    .not('slug', 'is', null)

  const seenSlug = new Set<string>()
  for (const row of scenarios ?? []) {
    const slug = (row as { slug: string | null }).slug
    if (!slug || seenSlug.has(slug)) continue
    seenSlug.add(slug)
    entries.push(urlEntry(`/scenario/${slug}`, 'daily', '0.9', (row as { updated_at?: string }).updated_at))
  }

  const { data: posts } = await db
    .from('blog_posts')
    .select('slug, updated_at, published_at')
    .eq('is_published', true)
    .not('slug', 'is', null)

  const seenBlog = new Set<string>()
  for (const row of posts ?? []) {
    const slug = (row as { slug: string | null }).slug
    if (!slug || seenBlog.has(slug)) continue
    seenBlog.add(slug)
    entries.push(
      urlEntry(
        `/blog/${slug}`,
        'weekly',
        '0.5',
        (row as { updated_at?: string; published_at?: string }).updated_at
          || (row as { published_at?: string }).published_at,
      ),
    )
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.status(200).send(xml)
}
