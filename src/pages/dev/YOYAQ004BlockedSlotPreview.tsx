/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AlertTriangle, CalendarDays, CheckCircle2, MapPin, ShieldX } from 'lucide-react'
import '@/index.css'

type PreviewState =
  | 'all-blocked'
  | 'mixed-stores'
  | 'stale-submit'
  | 'blocked-after-request'
  | 'blocked-at-request'

const STATES: Array<{ id: PreviewState; label: string }> = [
  { id: 'all-blocked', label: '全店舗停止' },
  { id: 'mixed-stores', label: '一部／全部停止' },
  { id: 'stale-submit', label: '送信直前に停止' },
  { id: 'blocked-after-request', label: '申請後に停止' },
  { id: 'blocked-at-request', label: '既存不整合' },
]

const selectedState = (() => {
  const value = new URLSearchParams(window.location.search).get('state')
  return STATES.some((state) => state.id === value)
    ? (value as PreviewState)
    : 'all-blocked'
})()

function StateNav() {
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="プレビュー状態">
      {STATES.map((state) => (
        <a
          key={state.id}
          href={`?state=${state.id}`}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
            selectedState === state.id
              ? 'border-purple-600 bg-purple-600 text-white'
              : 'border-gray-200 bg-white text-gray-700'
          }`}
        >
          {state.label}
        </a>
      ))}
    </nav>
  )
}

function Slot({
  label,
  time,
  disabled = false,
  note,
}: {
  label: string
  time: string
  disabled?: boolean
  note?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`min-h-20 rounded-lg border p-3 text-left ${
        disabled
          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500'
          : 'border-purple-300 bg-white text-purple-900'
      }`}
    >
      <span className="block font-semibold">{label}</span>
      <span className="mt-1 block text-sm">{time}</span>
      {note && (
        <span className={`mt-2 block text-xs font-medium ${disabled ? 'text-red-700' : 'text-amber-700'}`}>
          {note}
        </span>
      )}
    </button>
  )
}

function CustomerCalendar({ mixed = false }: { mixed?: boolean }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">顧客向け貸切予約</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5 text-purple-600" />
            候補日時を選択
          </h2>
        </div>
        <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs text-purple-800">
          大塚・大久保
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Slot label="午前" time="10:00〜14:00" />
        <Slot
          label="午後"
          time="13:00〜17:00"
          disabled={!mixed}
          note={mixed ? '大塚は停止／大久保で受付中' : '現在受付停止中'}
        />
        <Slot
          label="夜"
          time="18:00〜22:00"
          disabled
          note="現在受付停止中"
        />
      </div>
      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
        {mixed
          ? '希望店舗のうち1店舗以上が受付中なら候補として選択できます。すべて停止中の枠は選べません。'
          : '希望店舗のすべてが停止中のため、この枠は選択できません。'}
      </div>
    </section>
  )
}

function StaleSubmitState() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">貸切リクエスト確認</p>
      <h2 className="mt-1 text-lg font-semibold">送信前の再確認</h2>
      <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-950">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div>
            <p className="font-semibold">候補日時を再選択してください</p>
            <p className="mt-1 text-sm">
              2026-10-25 午後（大塚、大久保）は、画面を開いた後に現在受付停止中へ変更されました。
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-gray-200 p-3">
        <p className="font-medium">候補1　2026年10月25日（日）</p>
        <p className="mt-1 text-sm text-gray-600">午後 13:00〜17:00</p>
        <p className="mt-2 text-sm font-medium text-red-700">現在受付停止中</p>
      </div>
      <button
        type="button"
        disabled
        className="mt-4 w-full cursor-not-allowed rounded-lg bg-gray-300 px-4 py-3 font-semibold text-gray-600"
      >
        送信できません — 候補日時を再選択
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        このfixtureは送信不能です。実データ・API・RPC・セッションを使用しません。
      </p>
    </section>
  )
}

function ManagementState({ preexisting }: { preexisting: boolean }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">貸切確認 ＞ 申請カード ＞ 候補日時</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">サンプルシナリオ貸切</h2>
          <p className="mt-1 text-sm text-gray-600">候補1　2026-10-25 午後 13:00〜17:00</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900">店舗確認待ち</span>
      </div>

      <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-950">
        <div className="flex gap-3">
          <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div>
            <p className="font-semibold">
              {preexisting ? '申請時点で募集停止（既存不整合）' : '申請後に募集停止'}
            </p>
            <p className="mt-1 text-sm">
              大塚 — 停止中は承認できません。事情を説明し、募集再開または別候補・店舗をご相談ください。
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-muted-foreground">選択店舗</p>
          <p className="mt-1 flex items-center gap-2 font-medium">
            <MapPin className="h-4 w-4" /> 大塚
          </p>
          <p className="mt-1 text-xs font-medium text-red-700">現在受付停止中</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-muted-foreground">申請データ</p>
          <p className="mt-1 flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> 保持
          </p>
          <p className="mt-1 text-xs text-gray-600">自動削除・自動却下なし</p>
        </div>
      </div>

      <button
        type="button"
        disabled
        className="mt-4 w-full cursor-not-allowed rounded-lg bg-gray-300 px-4 py-3 font-semibold text-gray-600"
      >
        停止中のため承認できません
      </button>
    </section>
  )
}

function PreviewApp() {
  return (
    <main className="min-h-screen overflow-x-clip bg-slate-50">
      <div className="mx-auto max-w-4xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
        <header>
          <p className="text-xs font-semibold tracking-wide text-purple-700">YOYAQ-004 PREVIEW</p>
          <h1 className="mt-1 text-2xl font-bold">募集停止枠の貸切受付ガード</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            認証不要・PIIなし・in-memory・送信不能の確認用fixture
          </p>
        </header>
        <StateNav />
        {selectedState === 'all-blocked' && <CustomerCalendar />}
        {selectedState === 'mixed-stores' && <CustomerCalendar mixed />}
        {selectedState === 'stale-submit' && <StaleSubmitState />}
        {selectedState === 'blocked-after-request' && <ManagementState preexisting={false} />}
        {selectedState === 'blocked-at-request' && <ManagementState preexisting />}
      </div>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>
)
