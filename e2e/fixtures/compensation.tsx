import React from 'react'
import { createRoot } from 'react-dom/client'
import { RepresentativeCompensation } from '../../src/pages/CouponManagement/components/RepresentativeCompensation'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
apiClient.get = async () => [{ id: 'event', date: '2026-09-08', start_time: '19:00', scenario: '確認用の公演' }] as never
apiClient.post = async (path, body) => {
  if (path.includes('preview-event')) return [
    { reservation_id: 'one', name: '参加者A', quantity: 1, state: 'ready', snapshot: { amount: 5000, quantity: 1 } },
    { reservation_id: 'group', name: 'まとめ予約B', quantity: 2, state: 'ready', snapshot: { amount: 5000, quantity: 2 } },
    { reservation_id: 'cancelled', name: 'キャンセルC', quantity: 1, state: 'excluded', reason: '公演中止前にキャンセル済み' },
  ] as never
  const id = (body as {reservation_id: string}).reservation_id
  if (id === 'cancelled') throw new Error('対象外への付与')
  return { quantity: id === 'group' ? 2 : 1, already_granted: false } as never
}
createRoot(document.getElementById('root')!).render(<main className="p-6 max-w-4xl mx-auto"><RepresentativeCompensation /></main>)
