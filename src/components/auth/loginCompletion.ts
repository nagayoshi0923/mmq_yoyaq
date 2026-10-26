import { useSyncExternalStore } from 'react'

/**
 * ログイン画面がログインを完了させている途中か（パスワードのログイン中・利用者情報の読み取り中・読めずに再読み込みを出している間）。
 * この間は /login の「ログイン済みなら自動で移動」をしない（2026-10-26 本番ログイン障害: アプリ全体の利用者情報だけ先に確定すると、
 * 行き先（所属組織・戻り先）を確かめる前に /dashboard などへ移ってしまう）。ログイン済みで /login を開いただけなら従来どおり移動する
 */
let pending = false
const listeners = new Set<() => void>()

export function setLoginCompletionPending(value: boolean) {
  if (pending === value) return
  pending = value
  listeners.forEach((l) => l())
}

export function useLoginCompletionPending(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => pending,
    () => false,
  )
}

/** /login・/signup を開いたとき、ログイン済みなら移動する先（移動しないなら null）。AppRoot の判定をそのまま切り出したもの */
export function authPageRedirect(input: {
  isInitialized: boolean
  user: { role: string; isStoreRepresentative?: boolean } | null
  loginPending: boolean
  returnTo: string | null
  organizationSlug: string | null | undefined
}): string | null {
  const { isInitialized, user, loginPending, returnTo, organizationSlug } = input
  if (!isInitialized || !user || loginPending) return null
  const authenticatedHome = user.isStoreRepresentative
    ? `${organizationSlug ? `/${organizationSlug}` : ''}/store-dashboard`
    : '/dashboard'
  // 戻り先付きで開かれたお客様は、その画面へ（例: 別のタブで先にログインしていた）
  return user.role === 'customer' ? (returnTo ?? '/') : authenticatedHome
}
