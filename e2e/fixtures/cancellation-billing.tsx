import React from 'react'
import { createRoot } from 'react-dom/client'
import { CancellationBilling } from '../../src/pages/Settings/pages/CancellationBilling'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
let settings = { revision: 0, data: { accounts: [], activeAccountId: null, operatorEmail: '', matchingApproved: false, notificationsEnabled: false } }
apiClient.get = async () => ({ settings, claims: [], freeeConnected: false,
  cancelledReservations: [{ id: '10000000-0000-4000-8000-000000000001', reservation_number: 'TEST-001', title: '確認用公演' }] }) as never
apiClient.post = async (path, body) => {
  if (path.includes('settings')) { settings = { revision: 1, data: { ...settings.data, ...(body as object) } }; return { success: true } as never }
  if (path.includes('intake')) {
    const b = body as { receivedAt: string | null }
    return { assessment: { status: b.receivedAt ? 'payable' : 'pending' }, preview: b.receivedAt ? 'キャンセル料：3,000円\n保存条件に基づく料率50%を適用します。' : '受付時刻を確認中です。料金案内は保留しています。' } as never
  }
  if (path.includes('reconcile')) throw new Error('freee API認証が未接続です。未入金とは判定しません。')
  return { notices: [], unknown: [] } as never
}
createRoot(document.getElementById('root')!).render(<main className="p-4"><CancellationBilling /></main>)
