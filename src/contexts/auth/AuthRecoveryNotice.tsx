import { buildAuthUrl, readReturnToFromSearch } from '@/lib/authReturn'

/** 認証方式・表示中のページによらず、失敗を隠さず回復手段を残す。セッションは削除しない。 */
export function AuthRecoveryNotice({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  const isLogin = /\/(login|signup)\/?$/.test(window.location.pathname)
  const returnTo = isLogin ? readReturnToFromSearch(window.location.search) : window.location.pathname + window.location.search
  return (
    <section role="alert" aria-label="ログイン情報の確認エラー" className="relative z-50 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <p>ログイン情報を確認できませんでした。通信状態を確認して再試行してください。</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <button type="button" disabled={retrying} onClick={onRetry} className="min-h-11 rounded-md border border-amber-700 px-3 disabled:opacity-50">
          {retrying ? '確認中…' : '再試行'}
        </button>
        <a href={buildAuthUrl('login', returnTo)} className="inline-flex min-h-11 items-center underline">ログイン画面へ</a>
      </div>
    </section>
  )
}
