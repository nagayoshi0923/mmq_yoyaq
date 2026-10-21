// お知らせメールの送信処理（process-customer-notice-emails）に「この ID の行だけ送る」を伝える本文の読み取り（2026-10-21）。
// 本番公開の限定試験で、試験相手の 1 件だけを取り出すために使う（Codex 第 2 回再レビュー R1）。
// 定期実行は本文 {} で呼ぶので onlyIds は null（従来どおり送信待ちを順に取り出す）。
// only_ids が書かれているのに形が正しくない・本文が JSON として読めないときは、全件送信に落とさず拒否する。
export const CUSTOMER_NOTICE_ONLY_IDS_MAX = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CustomerNoticeOnlyIds = { ok: true; onlyIds: string[] | null } | { ok: false; error: string }

export function parseCustomerNoticeOnlyIds(rawBody: string): CustomerNoticeOnlyIds {
  if (!rawBody.trim()) return { ok: true, onlyIds: null }
  let body: unknown
  try { body = JSON.parse(rawBody) } catch { return { ok: false, error: '本文が JSON として読めません' } }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: '本文はオブジェクトにしてください' }
  if (!('only_ids' in body)) return { ok: true, onlyIds: null }
  const ids = (body as { only_ids: unknown }).only_ids
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'only_ids は 1 件以上の ID の配列にしてください' }
  if (ids.length > CUSTOMER_NOTICE_ONLY_IDS_MAX) return { ok: false, error: `only_ids は ${CUSTOMER_NOTICE_ONLY_IDS_MAX} 件までです` }
  if (!ids.every(id => typeof id === 'string' && UUID.test(id))) return { ok: false, error: 'only_ids に ID の形でないものがあります' }
  return { ok: true, onlyIds: [...new Set(ids.map(id => id.toLowerCase()))] }
}
