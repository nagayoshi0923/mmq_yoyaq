import React from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { StaffCheckinBubble, StaffCheckinFallback, type StaffCheckinClient } from './StaffCheckinBubble'
import '@/index.css'

type PreviewState = 'loading' | 'unchecked' | 'checked' | 'error' | 'empty' | 'unavailable' | 'flow' | 'error-boundary'

const context = {
  staff_name: 'ソラ',
  performance: {
    start_time: '13:30:00',
    scenario: 'REDRUM05 目醒めゆくフローライト',
    store_name: 'クインズワルツ高田馬場店',
  },
}

const previewState = (new URLSearchParams(window.location.search).get('state') ?? 'unchecked') as PreviewState
let flowCheckedInAt: string | null = null

const client: StaffCheckinClient = {
  getState: async () => {
    if (previewState === 'loading') return await new Promise<never>(() => undefined)
    if (previewState === 'error') throw new Error('APIから出勤打刻を取得できませんでした。')
    if (previewState === 'empty') return null
    if (previewState === 'unavailable') return { available: false }
    if (previewState === 'checked') return { available: true, my_checkin: { checked_in_at: '2026-08-03T04:30:00.000Z' }, ...context }
    if (previewState === 'flow') return { available: true, my_checkin: flowCheckedInAt ? { checked_in_at: flowCheckedInAt } : null, ...context }
    return { available: true, my_checkin: null, ...context }
  },
  checkIn: async () => {
    flowCheckedInAt = new Date().toISOString()
    return { checked_in_at: flowCheckedInAt }
  },
  cancel: async () => {
    flowCheckedInAt = null
    return { cancelled: true }
  },
}

function PreviewApp() {
  return (
    <div className="min-h-screen bg-muted/20 px-4 py-7 md:px-10">
      <header className="rounded-2xl border bg-white p-5">
        <h1>店舗ダッシュボード（YOYAQ-021 fixture）</h1>
        <p>実DB・session・実API mutationを使わないin-memory確認画面です。</p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="確認状態">
          {(['loading', 'unchecked', 'checked', 'error', 'empty', 'unavailable', 'flow', 'error-boundary'] as PreviewState[]).map(state => (
            <a key={state} className="rounded-lg border bg-white px-3 py-2" href={`?state=${state}`}>{state}</a>
          ))}
        </nav>
      </header>
      <main className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-[420px] rounded-2xl border bg-white p-5">
          <h2>本日の公演・来客予定</h2>
          <p className="mt-4">参加費・中止公演など、店舗ダッシュボード本体は打刻UIから独立して描画されます。</p>
          <div className="mt-5 rounded-xl bg-muted/40 p-4">13:00〜 中止公演 / 参加費: ¥4,000/人</div>
        </section>
        <aside className="rounded-2xl border bg-white p-5">
          <h2>店舗連絡</h2>
          <p className="mt-4">打刻UIが失敗してもこの領域は残ります。</p>
        </aside>
      </main>
      <ErrorBoundary fallback={<StaffCheckinFallback />}>
        {previewState === 'error-boundary'
          ? <RenderFailure />
          : <StaffCheckinBubble storeId="fixture-store" client={client} />}
      </ErrorBoundary>
    </div>
  )
}

function RenderFailure(): React.ReactElement {
  throw new Error('打刻UIの描画例外fixture')
}

const root = document.getElementById('root')
if (!root) throw new Error('preview root not found')
createRoot(root).render(<PreviewApp />)
