/**
 * 店舗への申込シート（見本 RequestSheet.dc.html の B。候補日の編集・事前配役アンケートと同じ全画面シート。?sheet=booking）。
 * 入口は「いまの状態」の箱（チャットでは 1 行）・日程タブの表の下・マイページの貸切カードの「候補日を選んで店舗に申し込む」（行ごとの申込はやめた）。
 *   上に固定: 「店舗に申し込む」・作品・参加 N/M名、紫の帯（複数可・店舗が 1 つ確定・上から優先）
 *   1. 候補日（複数選択・選んだ順＝優先順・並べ替え）→ 2. 希望店舗 → 3. 参加人数 → 4. 店舗への連絡 → 料金の目安
 *   下に固定: 「注意事項を確認して申し込む（候補日 N 件）」→ 2 段目で注意事項・キャンセル規定に同意して送る
 * 送信は従来の submitGroupBookingRequest（create_private_booking_request_with_notice）。
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Loader2, Minus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { calculatePrivateCandidateFees } from '@/pages/ScenarioDetailPage/utils/pricingUtils'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import { submitGroupBookingRequest } from '../../submitBookingRequest'
import { buildAnswerTable } from '../groupPageModel'
import { yenRange } from '../overviewModel'
import { useGroupScenarioInfo } from '../useGroupScenarioInfo'
import { BookingRequestConfirm } from './BookingRequestConfirm'
import { RequestCandidateList } from './RequestCandidateList'
import {
  MAX_REQUEST_DATES, candidateBlockedReason, defaultParticipants, initialPicks, movePick, participantsNote, sheetCandidates,
  storeChips, storesToSend, togglePick,
} from './requestSheetModel'
import { useStoreAvailability } from './useStoreAvailability'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
type GroupMember = NonNullable<GroupType['members']>[number]

export const REQUEST_SHEET_TITLE = '店舗に申し込む'

interface BookingRequestSheetProps {
  group: GroupType
  myMemberId: string
  user: { id: string; email?: string | null }
  scenarioTitle: string
  playerRange: { min: number | null; max: number | null }
  preferredStores: Array<{ id: string; name: string }>
  organizerMember: GroupMember | undefined
  canMutateSchedule: boolean
  isCustomHoliday: (date: string) => boolean
  onClose: () => void
  /** 送ったあと（シートを閉じてグループを読み直す） */
  onSubmitted: () => void
}

export function BookingRequestSheet(props: BookingRequestSheetProps) {
  const { group, myMemberId, user, scenarioTitle, playerRange, preferredStores, organizerMember, canMutateSchedule, isCustomHoliday, onClose, onSubmitted } = props
  const table = useMemo(() => buildAnswerTable(group, myMemberId), [group, myMemberId])
  const candidates = useMemo(() => sheetCandidates(table, group.candidate_dates ?? []), [table, group.candidate_dates])
  const members = table.memberCount
  const { data: scenarioData } = useGroupScenarioInfo(group.scenario_master_id ?? null, group.organization_id)
  const info = scenarioData?.scenario ?? null
  const min = info?.playerMin ?? playerRange.min
  const max = info?.playerMax ?? playerRange.max

  // 読み込み中は呼び出し側の既定値（毎回新しい空の配列）になるので、id の並びで比べる
  const storeKey = preferredStores.map(s => s.id).join(',')
  const storeIds = useMemo(() => (storeKey ? storeKey.split(',') : []), [storeKey])
  const { availability, loading: availabilityLoading } = useStoreAvailability({
    organizationId: group.organization_id,
    scenarioMasterId: group.scenario_master_id,
    storeIds,
    dates: candidates.map(c => c.date),
  })
  const blockedReason = (id: string) => {
    const c = candidates.find(x => x.id === id)
    return c ? candidateBlockedReason(availability, storeIds, c) : null
  }

  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [picks, setPicks] = useState<string[] | null>(null)
  const [selectedStores, setSelectedStores] = useState<Set<string>>(() => new Set(storeIds))
  const [participants, setParticipants] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 参加人数は変えるまで「登録メンバー数を作品の人数に収めた数」
  // 初期値: 全員○の日と○が最多の日（空きの読み込みを待ってから。空きの無い日は選ばない）
  useEffect(() => {
    if (picks !== null || availabilityLoading) return
    setPicks(initialPicks(candidates, members, id => blockedReason(id) !== null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityLoading, candidates, members, picks])
  useEffect(() => { setSelectedStores(new Set(storeIds)) }, [storeIds])

  // 連絡先の電話番号（従来の申込と同じく、主催者の登録済みの番号を入れておく）
  const { data: savedPhone } = useQuery({
    queryKey: ['request-sheet-phone', user.id, organizerMember?.guest_phone ?? null],
    queryFn: async () => {
      if (organizerMember?.guest_phone) return organizerMember.guest_phone
      const { data } = await privateGroupPageReadApi.findOwnCustomerPhone(user.id)
      return (data as { phone?: string | null } | null)?.phone ?? ''
    },
  })
  useEffect(() => { if (savedPhone && !phone) setPhone(savedPhone) }, [savedPhone, phone])

  const order = picks ?? []
  const picked = order.map(id => candidates.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const chips = storeChips(preferredStores, picked, availability)
  const sendStoreIds = storesToSend(chips, selectedStores)
  const sendStores = preferredStores.filter(s => sendStoreIds.includes(s.id))
  const warning = (id: string) => {
    const c = candidates.find(x => x.id === id)
    if (!c) return null
    return candidateBlockedReason(availability, sendStoreIds, c) ? '選んだ店舗にはこの日の空きがありません' : null
  }
  const count = participants ?? defaultParticipants(members, min, max)
  const lo = min && min > 0 ? min : 1
  const hi = max && max >= lo ? max : Math.max(lo, members)

  const fee = info?.participationFee ?? null
  const fees = fee && fee > 0 && picked.length
    ? calculatePrivateCandidateFees(fee, info?.participationCosts ?? [], picked.map(c => ({ date: c.date, slot: { startTime: c.startTime } })), isCustomHoliday)
    : []
  const priceText = fees.length
    ? `${yenRange(Math.min(...fees), Math.max(...fees))} × ${count} 名 = ${yenRange(Math.min(...fees) * count, Math.max(...fees) * count)}`
    : null

  const toggle = (id: string) => {
    const next = togglePick(order, id)
    if (!next) {
      toast.error(`候補日は ${MAX_REQUEST_DATES} 件まで選べます`)
      return
    }
    setPicks(next)
  }
  const canProceed = canMutateSchedule && picked.length > 0 && sendStores.length > 0
  const canSend = canProceed && agreed && phone.trim().length > 0 && !submitting

  const send = async () => {
    const ok = await submitGroupBookingRequest({
      group, user, isOrganizer: true, canMutateScheduleBeforeStoreReply: canMutateSchedule,
      orderedCandidateIds: order, bookingPhone: phone, bookingNotes: notes, requestedStores: sendStores, participantCount: count,
      organizerMember, isCustomHoliday, setIsSubmittingBooking: setSubmitting,
    })
    if (ok) onSubmitted()
  }

  const meta = [scenarioTitle, `参加 ${members}${max ? `/${max}` : ''}名`].filter(Boolean).join(' ・ ')
  const anyNg = picked.some(c => c.hasNg)

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-background sm:bg-black/40" role="dialog" aria-modal="true" aria-label={REQUEST_SHEET_TITLE} data-testid="request-sheet">
      <div className="flex h-dvh w-full max-w-lg flex-col bg-background sm:border-x sm:border-border">
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-3.5 py-3">
          {step === 'confirm' && (
            <button type="button" onClick={() => setStep('form')} aria-label="内容の選択に戻る" className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" disabled={submitting}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold">{step === 'form' ? REQUEST_SHEET_TITLE : '注意事項を確認して申し込む'}</h1>
            <p className="truncate text-xs text-muted-foreground" data-testid="request-meta">{meta}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="-mr-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" disabled={submitting}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <p className="shrink-0 bg-violet-50 px-3.5 py-1.5 text-xs text-violet-800">
          {step === 'form'
            ? '送る候補日を選んでください（複数可）。店舗はこの中から 1 つを確定します。順番は上から優先です。'
            : '店舗は候補日の中から 1 つを確定します。確定すると連絡が届きます。'}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">
          {!canMutateSchedule ? (
            <p className="py-8 text-center text-sm text-muted-foreground">店舗の返事を待っているため、いまは申し込めません。</p>
          ) : step === 'confirm' ? (
            <BookingRequestConfirm
              picked={picked}
              storeNames={sendStores.map(s => s.name)}
              participants={count}
              priceText={priceText}
              notes={notes}
              phone={phone}
              onPhoneChange={setPhone}
              agreed={agreed}
              onAgreedChange={setAgreed}
              orgSlug={scenarioData?.orgSlug ?? null}
              scenarioMasterId={group.scenario_master_id ?? null}
              policyStoreId={sendStores.length === 1 ? sendStores[0].id : null}
              hasPreReading={info?.hasPreReading ?? false}
              disabled={submitting}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <section aria-label="候補日">
                <h2 className="mb-2 text-sm font-bold">1. 候補日 <span className="text-xs font-normal text-muted-foreground">{picked.length} 件選択中</span></h2>
                {picks === null ? (
                  <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-1 h-5 w-5 animate-spin" aria-hidden="true" />空き状況を確認しています</div>
                ) : (
                  <RequestCandidateList candidates={candidates} picks={order} blockedReason={blockedReason} warning={warning} onToggle={toggle} onMove={(from, to) => setPicks(movePick(order, from, to))} />
                )}
                {anyNg && <p className="mt-2 text-xs text-amber-700" data-testid="request-ng-note">× の人がいる日も選んでいます。その日に決まると、× の人は参加できない前提になります。</p>}
              </section>

              <section aria-label="希望店舗">
                <h2 className="mb-2 text-sm font-bold">2. 希望店舗 {sendStores.length > 1 && <span className="text-xs font-normal text-muted-foreground">どれでも可</span>}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map(chip => {
                    const on = !chip.disabled && selectedStores.has(chip.id)
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        disabled={chip.disabled}
                        aria-pressed={on}
                        onClick={() => setSelectedStores(prev => { const next = new Set(prev); if (next.has(chip.id)) next.delete(chip.id); else next.add(chip.id); return next })}
                        className={`rounded-full px-3 py-1.5 text-sm ${on ? 'border-2 border-violet-600 bg-violet-50 font-bold text-violet-800' : chip.disabled ? 'border border-zinc-300 bg-muted/60 text-muted-foreground' : 'border border-zinc-300 bg-background hover:bg-muted'}`}
                        data-testid="request-store"
                      >
                        {chip.name}{chip.disabled ? `（${picked.length > 1 ? '選んだ日はどれも空きなし' : 'この日は空きなし'}）` : ''}
                      </button>
                    )
                  })}
                </div>
                {chips.filter(c => !c.disabled && c.partialDates.length > 0 && selectedStores.has(c.id)).map(c => (
                  <p key={c.id} className="mt-1 text-xs text-muted-foreground">{c.name}は {c.partialDates.join('・')} に空きがありません</p>
                ))}
                {preferredStores.length > 0 && sendStores.length === 0 && <p className="mt-1 text-xs text-amber-700">店舗を 1 つ以上選んでください。</p>}
                {preferredStores.length === 0 && <p className="text-xs text-amber-700">希望店舗がありません。概要タブの「日程と場所」から店舗を選んでください。</p>}
              </section>

              <section aria-label="参加人数">
                <h2 className="mb-2 text-sm font-bold">3. 参加人数 <span className="text-xs font-normal text-muted-foreground">料金の計算に使います</span></h2>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" size="sm" className="h-9 w-11 border-zinc-300" onClick={() => setParticipants(Math.max(lo, count - 1))} disabled={count <= lo} aria-label="1 人減らす"><Minus className="h-4 w-4" aria-hidden="true" /></Button>
                  <span className="min-w-12 text-center text-base font-bold tabular-nums" data-testid="request-participants">{count} 名</span>
                  <Button type="button" variant="outline" size="sm" className="h-9 w-11 border-zinc-300" onClick={() => setParticipants(Math.min(hi, count + 1))} disabled={count >= hi} aria-label="1 人増やす"><Plus className="h-4 w-4" aria-hidden="true" /></Button>
                  <span className="text-xs text-muted-foreground">{participantsNote(count, members)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">作品の人数は {lo === hi ? `${lo}` : `${lo}〜${hi}`} 名です。</p>
              </section>

              <section aria-label="店舗への連絡">
                <h2 className="mb-2 text-sm font-bold">4. 店舗への連絡 <span className="text-xs font-normal text-muted-foreground">任意</span></h2>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="初めての方が 2 名います、など" rows={2} className="resize-none text-sm" aria-label="店舗への連絡" />
              </section>

              {priceText && (
                <div className="rounded-lg bg-muted px-3 py-2.5 text-xs" data-testid="request-price">
                  <div className="flex justify-between gap-2"><span>料金の目安</span><span className="font-bold tabular-nums">{priceText}</span></div>
                  <p className="text-muted-foreground">税込・当日店舗払い。確定した日の料金になります。</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">申込後は候補日を増やせません。店舗の返事（目安 2〜3 日）を待つ間は取り下げができます。</p>
            </div>
          )}
        </div>

        {canMutateSchedule && (
          <footer className="shrink-0 border-t border-border px-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-2.5" data-testid="request-footer">
            {step === 'form' ? (
              <Button type="button" className="w-full bg-violet-600 text-white hover:bg-violet-700" disabled={!canProceed} onClick={() => { setAgreed(false); setStep('confirm') }} data-testid="request-next">
                {picked.length === 0 ? '候補日を選んでください' : `注意事項を確認して申し込む（候補日 ${picked.length} 件）`}
              </Button>
            ) : (
              <Button type="button" className="w-full bg-violet-600 text-white hover:bg-violet-700" disabled={!canSend} onClick={() => void send()} data-testid="request-submit">
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />送信中...</> : `同意して申し込む（候補日 ${picked.length} 件）`}
              </Button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
