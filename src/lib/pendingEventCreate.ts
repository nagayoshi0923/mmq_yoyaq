/**
 * 結果が分からなかった公演の作成（応答が届かなかった等）を、画面の再読み込みをまたいで覚えておく（PR #1210、Codex 再レビュー 7658a64 の 1）。
 *
 * 作成には要求 ID（UUID）を付けており、DB は同じ利用者・組織の同じ要求 ID の公演があればそれを返す（二重に作らない）。
 * 結果不明のまま再読み込みすると画面のメモリが消え、次の保存が新しい ID になって二重作成になり得たため、
 * この端末のブラウザ（localStorage）に組織ごとに 1 件だけ残す。使えないとき（非公開ウィンドウ等）は画面のメモリだけで覚える。
 * 別の端末・別のブラウザとは共有しない。
 */
export type PendingEventCreate = {
  requestId: string
  /** 送った作成要求の本体（要求 ID を除く）。同じ入力かどうかの判定に使う */
  fingerprint: string
  /** 案内用の要点（日付・開始時刻・作品） */
  summary: string
  at: string
}

const memory = new Map<string, PendingEventCreate>()
const storageKey = (organizationId: string) => `mmq:pending-event-create:${organizationId}`

export function readPendingEventCreate(organizationId: string): PendingEventCreate | null {
  try {
    const raw = localStorage.getItem(storageKey(organizationId))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PendingEventCreate>
      if (typeof parsed.requestId === 'string' && typeof parsed.fingerprint === 'string') {
        return { requestId: parsed.requestId, fingerprint: parsed.fingerprint, summary: String(parsed.summary ?? ''), at: String(parsed.at ?? '') }
      }
    }
  } catch { /* 読めなければメモリの値を使う */ }
  return memory.get(organizationId) ?? null
}

export function writePendingEventCreate(organizationId: string, pending: PendingEventCreate): void {
  memory.set(organizationId, pending)
  try { localStorage.setItem(storageKey(organizationId), JSON.stringify(pending)) } catch { /* メモリだけで覚える */ }
}

export function clearPendingEventCreate(organizationId: string): void {
  memory.delete(organizationId)
  try { localStorage.removeItem(storageKey(organizationId)) } catch { /* 何もしない */ }
}
