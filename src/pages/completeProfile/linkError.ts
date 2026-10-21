/**
 * 確認メールのリンクを開いたときのエラー（期限切れ・使用済みなど）を URL から読む（点検 2026-10-11 の 11）。
 * Supabase はリンクが使えないとき、戻り先の URL のハッシュ（または ?）に error / error_code を付けて返す。
 * 例: /complete-profile#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
 */
export type SignupLinkError = 'expired' | 'other' | null

export function readSignupLinkError(hash: string, search: string): SignupLinkError {
  const fromHash = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const fromSearch = new URLSearchParams(search)
  const code = fromHash.get('error_code') ?? fromSearch.get('error_code')
  const error = fromHash.get('error') ?? fromSearch.get('error')
  const description = (fromHash.get('error_description') ?? fromSearch.get('error_description') ?? '').toLowerCase()
  if (!code && !error) return null
  if (code === 'otp_expired' || description.includes('expired') || description.includes('invalid')) return 'expired'
  return 'other'
}
