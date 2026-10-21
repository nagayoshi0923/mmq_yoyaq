/**
 * 結果が分からなかった公演の作成（応答が届かなかった等）を覚えておく（PR #1210、Codex 再レビュー 7658a64・929c857）。
 *
 * 作成には要求 ID（UUID）を付けており、DB は同じ利用者・組織の同じ要求 ID の公演があればそれを返す（二重に作らない）。
 * 覚えた要求は、次のどちらかで「確定」するまで消さない:
 *   (a) 同じ要求 ID の作成が成功した（既にある公演が返った場合を含む）
 *   (b) DB の照合（find_schedule_event_create_request）が答えた。作成済みなら公演 ID、未作成なら DB がその要求 ID を
 *       取消済みにしたうえで NULL を返す（以後、遅れて届いても作らない）
 * 同じ要求 ID で送り直したときの失敗（店舗確認などの前処理の失敗を含む）は、前回の要求が未作成である証拠にならないので消さない。
 *
 * 保存先: この端末のブラウザの localStorage（組織＋利用者ごと、要求 ID ごとに別のキー。複数タブでの別々の結果不明も上書きしない）。
 * localStorage に書けない（非公開ウィンドウ・容量超過等）ときは、この画面のメモリだけで覚える。その場合、再読み込みや画面を閉じた後は照合できない。
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

const memory = new Map<string, PendingEventCreate[]>()
const scopeKey = (organizationId: string, userId: string) => `${organizationId}:${userId}`
// 要求 ID ごとに別のキーへ書く。読んで足して書き戻す形にすると、複数タブで同時に書いたとき後の書き込みが
// 他のタブの要求を消す（Codex 再レビュー a649ec3 の 1）。各タブは自分の要求のキーだけを書き・消す。
const keyPrefix = (organizationId: string, userId: string) => `mmq:pending-event-create:${scopeKey(organizationId, userId)}:`

function isEntry(value: unknown): value is PendingEventCreate {
  const v = value as Partial<PendingEventCreate> | null
  return !!v && typeof v.requestId === 'string' && typeof v.fingerprint === 'string'
}

function readStored(organizationId: string, userId: string): PendingEventCreate[] | null {
  try {
    const prefix = keyPrefix(organizationId, userId)
    const entries: PendingEventCreate[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (isEntry(parsed) && key === prefix + parsed.requestId) entries.push({ ...parsed, summary: String(parsed.summary ?? ''), at: String(parsed.at ?? '') })
      } catch { /* 壊れた記録は読み飛ばす */ }
    }
    return entries.sort((a, b) => a.at.localeCompare(b.at))
  } catch {
    return null
  }
}

/** 覚えている未確定の要求（この利用者・組織の分だけ。古い順） */
export function listPendingEventCreates(organizationId: string, userId: string): PendingEventCreate[] {
  const stored = readStored(organizationId, userId) ?? []
  const inMemory = memory.get(scopeKey(organizationId, userId)) ?? []
  const merged = [...stored]
  for (const entry of inMemory) if (!merged.some(e => e.requestId === entry.requestId)) merged.push(entry)
  return merged
}

/** 未確定の要求を覚える。localStorage に残せたら true（再読み込み後も照合できる）、メモリだけなら false */
export function addPendingEventCreate(organizationId: string, userId: string, pending: PendingEventCreate): boolean {
  const key = scopeKey(organizationId, userId)
  const inMemory = (memory.get(key) ?? []).filter(e => e.requestId !== pending.requestId)
  memory.set(key, [...inMemory, pending])
  try {
    localStorage.setItem(keyPrefix(organizationId, userId) + pending.requestId, JSON.stringify(pending))
    return true
  } catch {
    return false
  }
}

/** 確定した要求だけを消す（他の要求・他の利用者の要求には触れない） */
export function removePendingEventCreate(organizationId: string, userId: string, requestId: string): void {
  const key = scopeKey(organizationId, userId)
  memory.set(key, (memory.get(key) ?? []).filter(e => e.requestId !== requestId))
  try { localStorage.removeItem(keyPrefix(organizationId, userId) + requestId) } catch { /* 何もしない */ }
}

/** 試験用 */
export function resetPendingEventCreateMemory(): void { memory.clear() }
