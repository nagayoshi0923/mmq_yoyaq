// 貸切リクエスト確認ページの「希望店舗を変更」シート（QW-20261022-013。2026-10-22 社長「店舗を間違えた人が変更する動線がほしい」）。
// 選び直した店舗で、いまの候補日時が選べるかを既存の空き判定（DB の private_booking_candidate_slot_availability）で確かめ、
// 選べなくなる候補を確定前に知らせる。候補は黙って消さない（確定後も確認画面に理由を出し、送信させない）。
// 取り消しで閉じたら元の店舗のまま。確定したときだけ onConfirm で反映する。
import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { formatDate } from '../utils/privateBookingFormatters'

export interface StoreOption {
  id: string
  name: string
  short_name?: string
  region?: string
}

/** 店舗を変えると選べなくなる候補（理由は既存の判定の文面） */
export interface UnavailableCandidate {
  date: string
  label: string
  reason: string
}

interface ChangeStoresSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** この作品の貸切を受け付ける店舗だけ */
  stores: StoreOption[]
  currentStoreIds: string[]
  /** 選び直した店舗で、いまの候補のうち選べなくなるものを返す（既存の空き判定をそのまま使う） */
  checkCandidates: (storeIds: string[]) => Promise<UnavailableCandidate[]>
  onConfirm: (storeIds: string[]) => void
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; key: string; unavailable: UnavailableCandidate[] }
  | { kind: 'error'; key: string }

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

export function ChangeStoresSheet({ open, onOpenChange, stores, currentStoreIds, checkCandidates, onConfirm }: ChangeStoresSheetProps) {
  const [draft, setDraft] = useState<string[]>(currentStoreIds)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })

  // 開くたびに、いまの店舗から始める（前回取り消した選び直しを持ち越さない）
  useEffect(() => {
    if (open) {
      setDraft(currentStoreIds)
      setCheck({ kind: 'idle' })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const draftKey = draft.join(',')
  const unchanged = sameIds(draft, currentStoreIds)
  useEffect(() => {
    if (!open || draft.length === 0 || unchanged) {
      setCheck({ kind: 'idle' })
      return
    }
    let cancelled = false
    setCheck({ kind: 'checking' })
    checkCandidates(draft)
      .then((unavailable) => { if (!cancelled) setCheck({ kind: 'done', key: draftKey, unavailable }) })
      .catch(() => { if (!cancelled) setCheck({ kind: 'error', key: draftKey }) })
    return () => { cancelled = true }
  }, [open, draftKey, unchanged]) // eslint-disable-line react-hooks/exhaustive-deps

  const checked = (check.kind === 'done' || check.kind === 'error') && check.key === draftKey
  const unavailable = check.kind === 'done' && check.key === draftKey ? check.unavailable : []
  const canConfirm = draft.length > 0 && !unchanged && checked

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-4 sm:p-6"
        data-testid="change-stores-sheet"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">希望店舗を変更</SheetTitle>
          <SheetDescription className="text-xs">
            店舗を選び直して「この店舗に変更する」を押すと、確認内容に反映します。作品・候補日時・お客様情報はそのまま残ります。
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          <StoreMultiSelect
            stores={stores}
            selectedStoreIds={draft}
            onStoreIdsChange={setDraft}
            label="希望店舗"
            placeholder="店舗を選択してください"
            selectedDisplay="badges"
          />

          {draft.length === 0 && (
            <p className="text-xs text-red-700" data-testid="change-stores-empty">希望店舗を 1 店舗以上選んでください</p>
          )}

          {check.kind === 'checking' && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              候補日時がこの店舗で選べるか確認しています…
            </p>
          )}

          {check.kind === 'error' && check.key === draftKey && (
            <p className="text-xs text-amber-700" role="status">
              空き状況を確認できませんでした。変更はできますが、確認画面で選べない候補があれば送信できません。
            </p>
          )}

          {unavailable.length > 0 && (
            <div className="space-y-1.5 border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert" data-testid="change-stores-unavailable">
              <p className="flex items-start gap-1.5 font-bold">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                この店舗では選べない候補日時があります（{unavailable.length} 件）
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {unavailable.map((c) => (
                  <li key={`${c.date}-${c.label}`}>{formatDate(c.date)} {c.label}: {c.reason}</li>
                ))}
              </ul>
              <p>変更しても候補は消えません。確認画面でこの候補を外すか選び直すまで、送信できません。</p>
            </div>
          )}

          {check.kind === 'done' && check.key === draftKey && unavailable.length === 0 && (
            <p className="text-xs text-green-700" data-testid="change-stores-ok">いまの候補日時はすべてこの店舗で選べます。</p>
          )}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            変更しない
          </Button>
          <Button
            type="button"
            className="min-h-11 bg-purple-600 hover:bg-purple-700"
            disabled={!canConfirm}
            onClick={() => { onConfirm(draft); onOpenChange(false) }}
          >
            この店舗に変更する
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
