import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DeleteEventCancelDialog } from '../../src/components/schedule/DeleteEventCancelDialog'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
apiClient.post = async () => ({ snapshot: { amount: 5000, category: 'open', coupon_name: '店舗都合中止のお詫び｜5,000円', recipients: [{ id: 'one', name: '確認用参加者', quantity: 2 }] } }) as never
const prompt = { variant: 'cancel' as const, count: 1, customers: ['確認用参加者'], defaultReason: 'GMの体調不良により公演を中止します。', compensationEventId: 'event',
  recipients: [{ reservationId: 'one', label: '確認用参加者', email: 'test@example.invalid' }],
  composeBody: () => '確認用参加者様\nGMの体調不良により公演を中止します。' }
function App() {
  const [done, setDone] = useState(false)
  return <><DeleteEventCancelDialog prompt={done ? null : prompt} onResolve={decision => {
    if (decision?.compensationSnapshot && decision.sendMail) setDone(true)
  }} />{done && <p role="status">中止と補償付きメールの確定を受け付けました（テスト）</p>}</>
}
createRoot(document.getElementById('root')!).render(<App />)
