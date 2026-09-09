export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderSeoShell(shell: string, page: {
  title: string; description: string; canonical: string; body: string; noindex?: boolean
}): string {
  const head = `<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${escapeHtml(page.canonical)}">
<meta name="robots" content="${page.noindex ? 'noindex, follow' : 'index, follow'}">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${escapeHtml(page.canonical)}">`
  return shell.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots)["']|property=["']og:(?:title|description|url)["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', head + '\n</head>')
    .replace('<div id="root"></div>', () => `<div id="root"><main style="max-width:64rem;margin:2rem auto;padding:1rem">${page.body}<nav aria-label="公開ページ"><a href="/">MMQ</a> · <a href="/scenario">作品を探す</a> · <a href="/stores">店舗を探す</a> · <a href="/guide">初めての方へ</a></nav></main></div>`)
}

export function hasPublicStore(stores: Array<{status?: string | null; ownership_type?: string | null}> | null | undefined): boolean {
  return (stores ?? []).some(store => store.status === 'active' && store.ownership_type !== 'office')
}
