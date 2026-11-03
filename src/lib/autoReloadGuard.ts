/**
 * 新しい版へ切り替えるための「自動の再読み込み」を、同じ版について 1 タブ 1 回に制限する。
 *
 * 記録はページの起動をまたいで残す（起動時に消さない）。以前は起動のたびに記録を消していたため、
 * 読み込み直しても古い HTML や読めないチャンクが続くと、起動ごとに再読み込みを繰り返せた。
 * 切り替え先の版を覚えるので、さらに新しい版が出たときは改めて 1 回だけ自動で切り替える。
 * 覚える版は直近の数個に限る。直近 1 個だけだと、配信が A・B 交互に返るとき A→B→A… と際限なく切り替えられる。
 * 保存領域が使えない環境では回数を数えられないので、自動では読み込み直さない
 * （画面の「最新版を読み込む」は使える）。
 * 手動の「最新版を読み込む」は clearAutoReloadRecord で記録を消してから読み込み直す。
 */
export const AUTO_RELOAD_KEY = 'chunk-auto-reload'

/** 覚えておく版の数（記録が増え続けないように古いものから捨てる） */
export const MAX_REMEMBERED_HASHES = 10

/** 自動で切り替えた版の一覧。以前の形式（'1' や版 1 つの文字列）もそのまま 1 件として扱う。読めなければ null */
function readReloadedHashes(): string[] | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(AUTO_RELOAD_KEY)
  } catch {
    return null
  }
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    // 以前の形式
  }
  return [raw]
}

/** この版へまだ自動で切り替えておらず、記録も読めるときだけ true */
export function canAutoReloadFor(hash: string): boolean {
  const hashes = readReloadedHashes()
  return hashes !== null && !hashes.includes(hash)
}

/** 自動の再読み込みの直前に呼ぶ。この版へまだ切り替えておらず、記録を残せたときだけ true */
export function claimAutoReloadFor(hash: string): boolean {
  const hashes = readReloadedHashes()
  if (hashes === null || hashes.includes(hash)) return false
  try {
    sessionStorage.setItem(AUTO_RELOAD_KEY, JSON.stringify([...hashes, hash].slice(-MAX_REMEMBERED_HASHES)))
    return true
  } catch {
    return false
  }
}

export function clearAutoReloadRecord(): void {
  try {
    sessionStorage.removeItem(AUTO_RELOAD_KEY)
  } catch {
    // 保存領域が使えない環境では記録も無い
  }
}
