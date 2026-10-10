import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

/** ログアウトの完了をこれ以上は待たない（ミリ秒） */
export const SIGN_OUT_WAIT_LIMIT_MS = 1500

/**
 * ローカルのログイン情報を消してトップページへ移る。
 * signOut はロックの取り合い等で返ってこないことがあり、待ち続けると「押しても画面が変わらない」
 * 状態になるため、上限時間で打ち切って必ず移動する。
 */
export async function signOutAndGoHome(
  deps: {
    signOut?: () => Promise<unknown>
    go?: (url: string) => void
    waitLimitMs?: number
  } = {},
): Promise<void> {
  const signOut = deps.signOut ?? (() => supabase.auth.signOut({ scope: 'local' }))
  const go = deps.go ?? ((url: string) => window.location.replace(url))
  const waitLimitMs = deps.waitLimitMs ?? SIGN_OUT_WAIT_LIMIT_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(signOut),
      new Promise<void>(resolve => {
        timer = setTimeout(() => {
          logger.warn('signOut が上限時間内に終わらないため、待たずに移動します')
          resolve()
        }, waitLimitMs)
      }),
    ])
  } catch (err) {
    logger.warn('signOut error (continuing anyway):', err)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  go('/')
}
