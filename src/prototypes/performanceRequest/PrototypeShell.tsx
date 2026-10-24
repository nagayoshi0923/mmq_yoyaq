import { useCallback, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { PopupHost, type PopupDebugLog } from './PopupHost'
import { protoPaths } from './routes'
import { resetProtoState, PROTO_STORAGE_SCOPE_LABEL } from './storage'
import { useProtoState } from './useProtoState'
import { PROTO_USER_ID } from './fixtures'

const NAV = [
  { to: protoPaths.customer(), label: 'お客様: 作品ページ', match: (p: string) => p === protoPaths.customer() },
  { to: protoPaths.notifications(), label: 'お客様: 通知一覧', match: (p: string) => p.endsWith('/notifications') },
  { to: protoPaths.admin(), label: '管理: スケジュール', match: (p: string) => p.endsWith('/admin') },
]

/** 試作の画面の共通の枠。本番では表示されない（ルートごと無い）ことと、保存の範囲を常に出す */
export function PrototypeShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const location = useLocation()
  const [state] = useProtoState()
  const [logs, setLogs] = useState<PopupDebugLog[]>([])
  const onLog = useCallback((log: PopupDebugLog) => setLogs((prev) => [log, ...prev].slice(0, 8)), [])
  const unread = state.notifications.filter((n) => n.userId === PROTO_USER_ID && !n.readAt).length

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        <div className={`mx-auto flex flex-wrap items-center gap-x-3 gap-y-1 ${wide ? 'max-w-[1440px]' : 'max-w-5xl'}`}>
          <span className="flex items-center gap-1 font-semibold"><FlaskConical className="h-3.5 w-3.5" aria-hidden />試作（開催リクエスト・公演追加のお知らせ）</span>
          <span>本番では表示されません。データはすべて架空です。保存は{PROTO_STORAGE_SCOPE_LABEL}（サーバーには送りません・通知も実際には届きません）。</span>
          <button
            type="button"
            className="underline"
            onClick={() => { resetProtoState(); setLogs([]) }}
          >
            試作のデータを消す
          </button>
        </div>
      </div>
      <nav className="border-b bg-background px-4" aria-label="試作の画面">
        <div className={`mx-auto flex gap-1 overflow-x-auto py-1 ${wide ? 'max-w-[1440px]' : 'max-w-5xl'}`}>
          {NAV.map((item) => {
            const active = item.match(location.pathname)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {item.label}
                {item.label.includes('通知') && unread > 0 ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs leading-none text-white">{unread}</span> : null}
              </Link>
            )
          })}
        </div>
      </nav>
      <main className={`mx-auto px-4 py-4 ${wide ? 'max-w-[1440px]' : 'max-w-5xl'}`}>{children}</main>
      <details className={`mx-auto px-4 pb-24 text-xs text-muted-foreground ${wide ? 'max-w-[1440px]' : 'max-w-5xl'}`}>
        <summary className="cursor-pointer">試作の記録（お知らせを確かめた時刻・待機の理由）</summary>
        <ul className="mt-1 space-y-0.5" data-testid="proto-popup-log">
          {logs.length === 0 ? <li>まだありません</li> : logs.map((l, i) => <li key={i}>{l.at} {l.text}</li>)}
        </ul>
      </details>
      <PopupHost onLog={onLog} />
    </div>
  )
}
