export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 検索向けの本文（#root の main）を、JS が動く端末では画面を組み立てるまで隠し、代わりに「読み込み中」を出す
 * （2026-10-25 社長報告「MMQ を開いた瞬間に作品名の一覧のような平文が出る」。本文は HTML に残すので検索向けの情報は変えない）。
 * - JS 無効: この script は動かないので、従来どおり本文とリンクが見える（読み込み中は出ない）
 * - JS 有効: html に mmq-booting を付け、本文は display:none（Tab で移らない・読み上げない）、読み込み中を出す。
 *   画面を組み立てると React が #root の中身を置き換えるので、どちらも消える
 * - 組み立てられないまま 10 秒: html を mmq-boot-timeout にし、本文と「再読み込み」の案内を出す（JS の読み込み失敗時の復旧導線）。
 *   html の状態の印（mmq-booting / mmq-boot-timeout）と、要素のクラス（mmq-boot-loading / mmq-boot-failed-msg）は名前を分ける
 *   （同じ名前だと html 自身が display:none に一致して全体が消える。Codex レビュー 2026-10-25）。
 *   再読み込みは location.reload()（URL・クエリ・# 以降をそのまま保つ）
 * stylesheet より前に置き、CSS の読み込みを待たずに実行する（最初の描画は CSS が届いてから）。
 */
export const SEO_BOOT_TIMEOUT_MS = 10000
const SEO_BOOT_HEAD = `<style>.mmq-boot-loading,.mmq-boot-failed-msg{display:none}html.mmq-booting [data-seo-shell]{display:none}html.mmq-booting .mmq-boot-loading{display:flex;min-height:60vh;align-items:center;justify-content:center;color:#6b7280;font-size:14px}html.mmq-boot-timeout .mmq-boot-failed-msg{display:block}.mmq-boot-failed-msg{margin:0 0 1rem}.mmq-boot-failed-msg button{color:#2563eb;text-decoration:underline;cursor:pointer}</style>
<script>(function(){var d=document.documentElement;d.classList.add('mmq-booting');setTimeout(function(){if(!d.classList.contains('mmq-booting'))return;d.classList.remove('mmq-booting');if(document.querySelector('#root > [data-seo-shell]'))d.classList.add('mmq-boot-timeout')},${SEO_BOOT_TIMEOUT_MS})})()</script>`

function insertBootHead(html: string): string {
  const i = html.search(/<link\b[^>]*rel=["']stylesheet["']/i)
  if (i >= 0) return html.slice(0, i) + SEO_BOOT_HEAD + '\n' + html.slice(i)
  return html.replace('</head>', SEO_BOOT_HEAD + '\n</head>')
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
  return insertBootHead(shell.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots)["']|property=["']og:(?:title|description|url)["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', head + '\n</head>')
    .replace('<div id="root"></div>', () => `<div id="root"><div class="mmq-boot-loading" role="status" aria-live="polite">読み込み中…</div><main data-seo-shell style="max-width:64rem;margin:2rem auto;padding:1rem"><p class="mmq-boot-failed-msg" role="alert">画面を読み込めませんでした。<button type="button" onclick="location.reload()">再読み込み</button>してください。</p>${page.body}<nav aria-label="公開ページ"><a href="/">MMQ</a> · <a href="/scenario">作品を探す</a> · <a href="/stores">店舗を探す</a> · <a href="/guide">初めての方へ</a></nav></main></div>`))
}

export function hasPublicStore(stores: Array<{status?: string | null; ownership_type?: string | null}> | null | undefined): boolean {
  return (stores ?? []).some(store => store.status === 'active' && store.ownership_type !== 'office')
}
