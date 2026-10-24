/**
 * 開催リクエスト試作の入口（AppRoot.tsx から、試作が有効なビルドのときだけ読み込む）。
 * ログイン無しで開ける。架空データとこのブラウザの localStorage だけで動き、実 API には書き込まない。
 */
import { useLocation } from 'react-router-dom'
import { AdminSchedulePage } from './AdminSchedulePage'
import { CustomerScenarioPage } from './CustomerScenarioPage'
import { ProtoEventPage, ProtoLoginReturnPage } from './EventAndLoginPages'
import { NotificationsPage } from './NotificationsPage'
import { PrototypeShell } from './PrototypeShell'
import { resolvePrototypeView } from './routes'

export default function PerformanceRequestPrototype() {
  const location = useLocation()
  const route = resolvePrototypeView(location.pathname, true)
  if (!route) return null
  return (
    <PrototypeShell wide={route.view === 'admin'} detail={route.view === 'customer'}>
      {route.view === 'customer' ? <CustomerScenarioPage /> : null}
      {route.view === 'admin' ? <AdminSchedulePage /> : null}
      {route.view === 'notifications' ? <NotificationsPage /> : null}
      {route.view === 'event' ? <ProtoEventPage performanceId={route.performanceId} /> : null}
      {route.view === 'login-return' ? <ProtoLoginReturnPage /> : null}
    </PrototypeShell>
  )
}
