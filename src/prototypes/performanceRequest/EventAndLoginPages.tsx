/**
 * 通知から進む先（架空の公演ページ）と、「ログイン直後に戻り先へ戻る途中」の模擬。
 * 本物のログイン画面へは進まない（試作では URL の形だけを見せる）。
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { normalizeReturnTo } from '@/lib/authReturn'
import { setPrototypeBusy } from './busy'
import { PROTO_SIMULATED_PERFORMANCES, findProtoScenario, findProtoStore } from './fixtures'
import { formatWhen, loginUrlForNotification, performancePath } from './notify'
import { PROTO_LOGIN_EVENT } from './PopupHost'
import { protoPaths } from './routes'

export function ProtoEventPage({ performanceId }: { performanceId: string }) {
  const perf = Object.values(PROTO_SIMULATED_PERFORMANCES).find((p) => p.id === performanceId)
  const scenario = perf ? findProtoScenario(perf.scenarioId) : undefined
  const store = perf ? findProtoStore(perf.storeId) : undefined
  const [note, setNote] = useState(false)
  const path = performancePath(performanceId)

  return (
    <>
      {!perf || !scenario || !store ? (
        <p className="text-sm">架空の公演が見つかりません。</p>
      ) : (
        <article className="space-y-3 rounded-lg border bg-background p-4" data-testid="proto-event-page">
          <p className="text-xs text-muted-foreground">公演ページ（試作・架空）</p>
          <h1 className="text-lg font-bold">{scenario.title}</h1>
          <p className="text-sm">{formatWhen(perf.date, perf.startTime)}／{store.name}</p>
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
            お知らせやリクエストでは、お席は確保されていません。ご参加にはこのページからご予約ください。
          </p>
          <Button type="button" size="lg" onClick={() => setNote(true)}>この公演を予約する</Button>
          {note ? <p className="text-xs text-muted-foreground">試作のため予約はできません（実際の予約・決済には進みません）。</p> : null}
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">ログインしていない方が通知から来たときの案</p>
            <p>ログイン画面へ <code className="rounded-md bg-muted px-1">{loginUrlForNotification(path)}</code> で進み、ログイン後にこの公演へ戻ります（戻り先は同じサイトの相対パスだけ）。</p>
            <Link className="underline" to={protoPaths.loginReturn(path)}>ログイン直後の戻り途中を模擬する</Link>
          </div>
        </article>
      )}
    </>
  )
}

/** ログインに成功した直後、戻り先へ戻る途中を模擬する。この間はポップアップを出さない */
export function ProtoLoginReturnPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const returnTo = normalizeReturnTo(params.get('redirect')) ?? protoPaths.customer()

  useEffect(() => {
    setPrototypeBusy('auth-return', 'auth-return')
    const timer = window.setTimeout(() => {
      navigate(returnTo, { replace: true })
      setPrototypeBusy('auth-return', null)
      window.dispatchEvent(new Event(PROTO_LOGIN_EVENT))
    }, 1500)
    return () => { window.clearTimeout(timer); setPrototypeBusy('auth-return', null) }
  }, [navigate, returnTo])

  return (
    <>
      <div className="rounded-lg border bg-background p-6 text-center text-sm" role="status">
        <p className="font-medium">ログインしました（模擬）。元のページへ戻っています…</p>
        <p className="mt-1 text-xs text-muted-foreground">戻り先: {returnTo}（この間はお知らせのポップアップを出しません）</p>
      </div>
    </>
  )
}
