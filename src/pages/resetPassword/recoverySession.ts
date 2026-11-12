import type { Session } from '@supabase/supabase-js'

type RecoveryTokens = { accessToken: string | null; refreshToken: string | null }

type AuthLike = {
  getSession: () => Promise<{ data: { session: Session | null } }>
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{ data: { session: Session | null }; error: { message?: string } | null }>
}

export type RecoverySessionResult = { ok: true } | { ok: false; message: string }

/**
 * パスワード再設定メールのリンクで開いたときのログイン状態を整える。
 *
 * 2026-11-13 本番障害: 以前はここで signOut({ scope: 'local' }) してから setSession していた。
 * signOut は「この端末だけ」の指定でも認証サーバーへ /logout を送り、リンクで作られた
 * 再設定用のログインそのものを無効にする。その直後の setSession は同じトークンを使うため
 * 「Session not found」で必ず失敗し、全員がパスワードを変更できなかった。
 * ログアウトはしない。リンクのログインが既に有効ならそのまま使い、無いときだけ setSession する。
 */
export async function ensureRecoverySession(auth: AuthLike, tokens: RecoveryTokens): Promise<RecoverySessionResult> {
  const { data: current } = await auth.getSession()
  if (!tokens.accessToken || !tokens.refreshToken) {
    return current.session ? { ok: true } : { ok: false, message: 'セッションが無効です。もう一度パスワードリセットを申請してください。' }
  }
  if (current.session?.access_token === tokens.accessToken) return { ok: true }

  const { data, error } = await auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
  if (error) {
    const text = error.message ?? ''
    if (/expired|not found|invalid/i.test(text)) {
      return { ok: false, message: 'リセットリンクの有効期限が切れているか、すでに使われています。もう一度パスワードリセットを申請してください。' }
    }
    return { ok: false, message: 'セッションの確立に失敗しました。ブラウザを再読み込みしてもう一度お試しください。' }
  }
  if (data.session) return { ok: true }
  const { data: after } = await auth.getSession()
  return after.session ? { ok: true } : { ok: false, message: 'セッションの確立に失敗しました。ブラウザを再読み込みしてもう一度お試しください。' }
}
