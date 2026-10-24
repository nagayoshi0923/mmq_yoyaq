/**
 * 「公演をリクエスト」の入力（試作）。送信はこのブラウザの localStorage に保存するだけ。
 * 予約ではない（席の確保・来店の義務・キャンセル料なし）ことを、送信の前に必ず見せる。
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { submitRequest, subscribe } from './actions'
import { setPrototypeBusy } from './busy'
import { PROTO_STORES, type ProtoScenario } from './fixtures'
import { formatMonthLabel, REQUEST_NOT_RESERVATION_NOTICE, WEEKDAY_LABELS, type PerformanceRequest } from './model'
import { PROTO_STORAGE_SCOPE_LABEL } from './storage'

const MONTH_CHOICES = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface RequestFormProps {
  scenario: ProtoScenario
  inDialog?: boolean
  alreadySubscribed: boolean
  onCancel: () => void
  onSubmitted: (request: PerformanceRequest) => void
}

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'}`}
    >
      {children}
    </button>
  )
}

export function RequestForm({ scenario, alreadySubscribed, onCancel, onSubmitted, inDialog = false }: RequestFormProps) {
  const [storeIds, setStoreIds] = useState<string[]>([])
  const [participants, setParticipants] = useState(1)
  const [periodKind, setPeriodKind] = useState<'anytime' | 'months'>('months')
  const [months, setMonths] = useState<string[]>([])
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [dateDraft, setDateDraft] = useState('')
  const [wantsNotice, setWantsNotice] = useState(!alreadySubscribed)
  const [showErrors, setShowErrors] = useState(false)

  // 入力中は「公演追加のお知らせ」のポップアップを割り込ませない
  useEffect(() => {
    setPrototypeBusy('request-form', 'form-input')
    return () => setPrototypeBusy('request-form', null)
  }, [])

  const errors = useMemo(() => {
    const list: string[] = []
    if (storeIds.length === 0) list.push('希望店舗を 1 つ以上選んでください')
    if (periodKind === 'months' && months.length === 0) list.push('希望の月を選ぶか「いつでも」を選んでください')
    return list
  }, [storeIds, periodKind, months])

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  const handleSubmit = () => {
    if (errors.length > 0) { setShowErrors(true); return }
    const request = submitRequest({
      scenarioId: scenario.id,
      storeIds,
      participants,
      period: periodKind === 'anytime' ? { kind: 'anytime' } : { kind: 'months', months: [...months].sort() },
      weekdays: [...weekdays].sort(),
      dates: [...dates].sort(),
    })
    if (wantsNotice && !alreadySubscribed) subscribe(scenario.id, storeIds)
    onSubmitted(request)
  }

  return (
    <section aria-labelledby="proto-request-form-title" className={inDialog ? 'space-y-4' : 'space-y-4 rounded-lg border bg-background p-4'} data-testid="proto-request-form">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="proto-request-form-title" className="text-base font-semibold">公演をリクエスト</h2>
          <p className="text-xs text-muted-foreground">1 人から参加できるオープン公演の開催を希望します。ほかのお客様と一緒に遊ぶ公演です。</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="入力をやめる">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="proto-request-title">作品名</Label>
        <Input id="proto-request-title" value={scenario.title} disabled readOnly />
      </div>

      <div className="space-y-1">
        <StoreMultiSelect
          stores={PROTO_STORES}
          selectedStoreIds={storeIds}
          onStoreIdsChange={setStoreIds}
          label="希望店舗（複数可）"
          placeholder="店舗を選んでください"
          selectedDisplay="badges"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="proto-request-participants">参加予定人数</Label>
        <select
          id="proto-request-participants"
          value={participants}
          onChange={(e) => setParticipants(Number(e.target.value))}
          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm"
        >
          {Array.from({ length: scenario.playerMax }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}人</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">お連れ様を含めた人数の目安です。お席は確保されません。</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">希望時期</legend>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={periodKind === 'anytime'} onClick={() => setPeriodKind('anytime')}>いつでも</Chip>
          <Chip active={periodKind === 'months'} onClick={() => setPeriodKind('months')}>月を選ぶ</Chip>
        </div>
        {periodKind === 'months' ? (
          <div className="flex flex-wrap gap-1.5" aria-label="希望の月（複数可）">
            {MONTH_CHOICES.map((m) => (
              <Chip key={m} active={months.includes(m)} onClick={() => setMonths((prev) => toggle(prev, m))}>{formatMonthLabel(m)}</Chip>
            ))}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">希望の曜日（複数可・任意）</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_ORDER.map((w) => (
            <Chip key={w} active={weekdays.includes(w)} onClick={() => setWeekdays((prev) => toggle(prev, w))} label={`${WEEKDAY_LABELS[w]}曜日`}>
              {WEEKDAY_LABELS[w]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="proto-request-date">日付の指定（任意・3 日まで）</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="proto-request-date" type="date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} className="w-44" />
          <Button
            type="button"
            variant="outline"
            size="md"
            disabled={!dateDraft || dates.includes(dateDraft) || dates.length >= 3}
            onClick={() => { setDates((prev) => [...prev, dateDraft]); setDateDraft('') }}
          >
            追加
          </Button>
        </div>
        {dates.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                {d}
                <button type="button" aria-label={`${d} を外す`} onClick={() => setDates((prev) => prev.filter((x) => x !== d))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">日付を決めなくても送れます（曜日や月だけの希望も店舗に届きます）。</p>}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={alreadySubscribed || wantsNotice} disabled={alreadySubscribed} onCheckedChange={(v) => setWantsNotice(v === true)} className="mt-0.5" />
        <span>
          この作品の公演が公開されたらお知らせを受け取る（作品ページのベルと同じ登録）
          <span className="block text-xs text-muted-foreground">
            {alreadySubscribed ? 'すでに登録しています。' : ''}試作: 架空の登録です。お知らせは{PROTO_STORAGE_SCOPE_LABEL}の見本で、実際には届きません。
          </span>
        </span>
      </label>

      <div role="note" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="proto-request-notice">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{REQUEST_NOT_RESERVATION_NOTICE}</p>
          <p className="text-xs">来店のお約束やキャンセル料は発生しません。店舗が公演を立てても、ご来店の義務はありません。</p>
        </div>
      </div>

      {showErrors && errors.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-destructive" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>やめる</Button>
        <Button type="button" size="lg" onClick={handleSubmit}>リクエストを送る（このブラウザに保存）</Button>
      </div>
    </section>
  )
}
