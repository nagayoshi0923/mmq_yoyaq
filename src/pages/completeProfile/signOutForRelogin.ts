import { supabase } from '@/lib/supabase'

/** 選び直しのログアウトを待つ上限（ミリ秒） */
export const RELOGIN_SIGN_OUT_LIMIT_MS = 3000

/**
 * ログイン方法を選び直すためのログアウト（このタブのログイン情報を消す）。消せたと分かったときだけ ok。
 * 失敗（{ error } が返る・投げる）・上限時間までに返らないときは ok にしない（ログインが残ったままログイン画面へ移ると、
 * ログイン済みとして同じ案内へ戻ってしまうため。2026-10-29 Codex レビュー）
 */
export async function signOutForRelogin(
  signOut: () => Promise<{ error?: unknown } | void> = () => supabase.auth.signOut({ scope: 'local' }),
  limitMs: number = RELOGIN_SIGN_OUT_LIMIT_MS,
): Promise<'ok' | 'failed' | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), limitMs) })
  try {
    return await Promise.race([
      Promise.resolve().then(signOut).then((r) => (r && (r as { error?: unknown }).error ? 'failed' as const : 'ok' as const), () => 'failed' as const),
      timeout,
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
