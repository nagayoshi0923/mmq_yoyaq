import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingScreen } from '@/components/layout/LoadingScreen'
import { buildAuthUrl } from '@/lib/authReturn'

/**
 * ログインが要る画面（マイページなど）の入口。
 * - ログイン状態の確認中: 「読み込み中」を出す（ゲスト扱いで中身を描かない）
 * - 未ログイン確定（セッション無し・期限切れ）: ログイン画面へ。戻り先に今の URL を載せる
 * - ログイン済み: そのまま表示
 *
 * isInitialized を使う理由: loading は 1.2 秒のタイムアウトでも false になり、
 * そのあとで user が入ることがある（モバイル Safari）。確認が本当に終わるまでは送らない。
 * URL ハッシュにトークンが残っている間は、セッションの組み立て直し中なので待つ。
 * 2026-10-20 社長の公開前点検「ログイン切れで /mypage を開くと『ゲスト さん』『予約がありません』」で追加。
 */
export function RequireLogin({ children, loadingMessage = '読み込み中...' }: { children: ReactNode; loadingMessage?: string }) {
  const { user, isInitialized } = useAuth()
  const location = useLocation()

  if (user) return <>{children}</>

  const hasPendingAuthToken = typeof window !== 'undefined' && window.location.hash.includes('access_token=')
  if (!isInitialized || hasPendingAuthToken) {
    return <LoadingScreen message={loadingMessage} />
  }

  return <Navigate to={buildAuthUrl('login', `${location.pathname}${location.search}`)} replace />
}
