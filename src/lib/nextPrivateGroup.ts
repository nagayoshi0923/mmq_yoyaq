/**
 * 「同じメンバーで次の貸切」（グループページ刷新 段階 4）。
 * 公演後のグループから作品選択へ進むとき、もとのグループをこのタブに覚えておき、
 * 新しいグループを作ったらその招待をもとのグループのチャットに流す（RPC private_group_after_action の announce_next_group）。
 * 覚えるのはこのタブの sessionStorage だけ（6 時間で忘れる）。
 */
const KEY = 'mmq.nextPrivateGroup'
const TTL_MS = 6 * 60 * 60 * 1000

export interface NextPrivateGroupSource {
  groupId: string
  memberId: string
  organizationId: string
  /** もとのグループの作品名（作成画面の案内に出す） */
  title: string
  /** 招待を流す相手の人数（自分を除く参加中の人） */
  memberCount: number
  savedAt: number
}

export function saveNextGroupSource(source: Omit<NextPrivateGroupSource, 'savedAt'>, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...source, savedAt: now }))
  } catch {
    // 保存できない環境では案内を出さないだけ
  }
}

export function parseNextGroupSource(raw: string | null, now = Date.now()): NextPrivateGroupSource | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<NextPrivateGroupSource>
    if (typeof v.groupId !== 'string' || typeof v.memberId !== 'string' || typeof v.organizationId !== 'string') return null
    if (typeof v.savedAt !== 'number' || now - v.savedAt > TTL_MS || now < v.savedAt) return null
    return { groupId: v.groupId, memberId: v.memberId, organizationId: v.organizationId, title: String(v.title ?? ''), memberCount: Number(v.memberCount) || 0, savedAt: v.savedAt }
  } catch {
    return null
  }
}

export function loadNextGroupSource(now = Date.now()): NextPrivateGroupSource | null {
  try {
    return parseNextGroupSource(sessionStorage.getItem(KEY), now)
  } catch {
    return null
  }
}

export function clearNextGroupSource(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // 何もしない
  }
}
