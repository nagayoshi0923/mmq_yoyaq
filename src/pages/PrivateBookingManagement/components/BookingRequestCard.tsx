import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  CheckCircle2, CircleDashed, XCircle, Clock,
  RefreshCw, Copy, Check, Mail, Phone
} from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import {
  formatDate,
  getElapsedTime,
  getElapsedDays,
  getCardClassName,
  formatPrivateBookingParticipantLabel,
  formatScenarioPlayerRange,
  isPlannedCountOutsideScenarioRange
} from '../utils/bookingFormatters'
import { isGmAvailableForCandidate, isGmMarkedAvailable, hasGmResponded } from '../utils/gmAvailabilityStatus'
import { cn } from '@/lib/utils'

interface Candidate {
  order: number
  date: string
  timeSlot: string
  startTime: string
  endTime: string
  status: string
}

interface GMResponse {
  gm_name?: string
  response_status: string
  available_candidates?: number[]
  selected_candidate_index?: number
  notes?: string
  response_datetime?: string | null
  responded_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}

interface BookingRequest {
  id: string
  reservation_number: string
  scenario_title: string
  scenario_master_id?: string
  customer_name: string
  customer_email?: string
  customer_phone?: string
  participant_count: number
  joined_member_count?: number
  scenario_player_count_range?: { min: number; max: number } | null
  status: string
  created_at: string
  notes?: string
  invite_code?: string
  candidate_datetimes?: {
    candidates: Candidate[]
    requestedStores?: Array<{ storeId: string; storeName: string }>
    confirmedStore?: { storeId: string; storeName: string }
  }
  gm_responses?: GMResponse[]
}

interface BookingRequestCardProps {
  request: BookingRequest
  onResendDiscordNotification?: (request: { id: string; scenario_title: string }) => Promise<void>
  // 候補日クリックで承認モードへ
  selectedCandidateOrder?: number | null
  onSelectCandidate?: (req: BookingRequest, order: number) => void
  inlineApprovalContent?: React.ReactNode
  cardActionsContent?: React.ReactNode
  // 候補ごとの空き店舗（承認モード時のみ渡す）
  storesPerCandidate?: Record<number, Array<{ id: string; name: string; short_name?: string }>>
}

export const BookingRequestCard = ({
  request,
  onResendDiscordNotification,
  selectedCandidateOrder,
  onSelectCandidate,
  inlineApprovalContent,
  cardActionsContent,
  storesPerCandidate,
}: BookingRequestCardProps) => {
  const [resending, setResending] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const elapsedDays = getElapsedDays(request.created_at)
  const elapsedTimeColor = elapsedDays >= 3 ? 'text-red-600 font-medium' : 'text-purple-600'
  const hasUnrespondedGMs = request.gm_responses?.some(r => !hasGmResponded(r))
  const isWaitingStatus = ['pending', 'pending_gm', 'pending_store'].includes(request.status)

  const handleResend = async () => {
    if (!onResendDiscordNotification || resending) return
    setResending(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    try { await onResendDiscordNotification(request) }
    finally { setResending(false) }
  }

  const handleCopyCode = async () => {
    if (!request.invite_code) return
    await navigator.clipboard.writeText(request.invite_code).catch(() => null)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  return (
    <Card className={cn(getCardClassName(request.status), 'shadow-none')}>
      <CardHeader className="pt-3 pb-2 space-y-0">
        {/* ── タイトル + ステータス ── */}
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{request.scenario_title}</CardTitle>
          <StatusBadge status={request.status} />
        </div>

        {/* ── サマリー1行 ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
          <span>#{request.reservation_number}</span>
          <span>{request.customer_name}・{formatPrivateBookingParticipantLabel(request.participant_count, request.joined_member_count)}</span>
          <span className={elapsedTimeColor}>{getElapsedTime(request.created_at)}</span>
        </div>

        {/* ── 連絡先・招待コード ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
          {request.customer_email && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />{request.customer_email}
            </span>
          )}
          {request.customer_phone && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />{request.customer_phone}
            </span>
          )}
          {request.invite_code && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded hover:bg-purple-100 transition-colors"
              title="招待コードをコピー"
            >
              {request.invite_code}
              {codeCopied
                ? <Check className="w-3 h-3 text-green-600" />
                : <Copy className="w-3 h-3 opacity-60" />}
            </button>
          )}
        </div>

        {/* ── 希望店舗 ── */}
        {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (() => {
          // storesPerCandidate から storeId → short_name のルックアップを構築
          const shortNameById: Record<string, string> = {}
          if (storesPerCandidate) {
            Object.values(storesPerCandidate).forEach(list =>
              list.forEach(s => { if (!shortNameById[s.id]) shortNameById[s.id] = s.short_name || s.name })
            )
          }
          return (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className="text-xs text-muted-foreground shrink-0">希望店舗:</span>
              {request.candidate_datetimes!.requestedStores!.map((store, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                  {shortNameById[store.storeId] || store.storeName}
                </span>
              ))}
            </div>
          )
        })()}

        {/* ── 人数警告 ── */}
        {request.scenario_player_count_range &&
          isPlannedCountOutsideScenarioRange(request.participant_count, request.scenario_player_count_range) && (
          <Alert variant="default" className="mt-2 border-amber-400 bg-amber-50 py-2 text-amber-950">
            <AlertTitle className="text-xs font-semibold text-amber-900">参加予定人数がシナリオの人数帯と一致しません</AlertTitle>
            <AlertDescription className="text-xs text-amber-900/90">
              予定 <strong>{request.participant_count}名</strong> / 推奨 <strong>{formatScenarioPlayerRange(request.scenario_player_count_range)}</strong>
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <CardContent className="md:pt-0">
        <div className="space-y-3">
          {/* ── GM回答状況 ── */}
          {request.gm_responses && request.gm_responses.length > 0 && (
            <div className="bg-purple-50 px-3 py-2 rounded-lg">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-semibold text-purple-800 uppercase tracking-wide">GM回答状況</h4>
                {onResendDiscordNotification && hasUnrespondedGMs && isWaitingStatus && (
                  <Button variant="ghost" size="sm"
                    className="h-6 px-2 text-xs text-purple-700 hover:text-purple-900 hover:bg-purple-100"
                    onClick={handleResend} disabled={resending}
                  >
                    <RefreshCw className={cn('w-3 h-3 mr-1', resending && 'animate-spin')} />
                    {resending ? '送信中...' : 'Discord再通知'}
                  </Button>
                )}
              </div>
              <ul className="space-y-1">
                {request.gm_responses.map((response, index) => {
                  const responded = hasGmResponded(response)
                  const available = isGmMarkedAvailable(response)
                  const candidates = response.available_candidates
                  return (
                    <li key={index} className={`text-xs flex items-center gap-1 ${!responded ? 'text-gray-400' : available ? 'text-purple-800' : 'text-gray-400 line-through'}`}>
                      {!responded
                        ? <Clock className="w-3 h-3 shrink-0" />
                        : available
                          ? <CheckCircle2 className="w-3 h-3 shrink-0 text-green-600" />
                          : <XCircle className="w-3 h-3 shrink-0 text-gray-400" />
                      }
                      {response.gm_name || 'GM名不明'}
                      {!responded && <span className="text-gray-400">未回答</span>}
                      {responded && available && (candidates?.length ?? 0) > 0 && (
                        <span className="text-purple-500">({candidates!.map(i => i + 1).join(',')})</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* ── 候補日時（クリックで選択 → 直下にプルダウン展開） ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              候補日時{onSelectCandidate ? <span className="ml-1 font-normal normal-case text-purple-600">（タップして承認処理）</span> : ''}
            </p>
            <div className="space-y-1">
              {request.candidate_datetimes?.candidates?.map((candidate) => {
                const isGMAvailable = request.gm_responses?.some(r => isGmAvailableForCandidate(r, candidate.order - 1))
                const availableGMs = request.gm_responses?.filter(r => isGmAvailableForCandidate(r, candidate.order - 1)) ?? []
                const isConfirmed = request.status === 'confirmed'
                const isThisSelected = selectedCandidateOrder === candidate.order
                const clickable = !!onSelectCandidate

                const availableStores = storesPerCandidate?.[candidate.order]

                return (
                  <div key={candidate.order}>
                    {/* 候補行 */}
                    <div
                      onClick={() => clickable && onSelectCandidate(request, candidate.order)}
                      className={cn(
                        'px-3 py-2 rounded text-sm border transition-colors',
                        clickable ? 'cursor-pointer' : '',
                        isThisSelected
                          ? 'border-purple-400 bg-purple-50 rounded-b-none'
                          : isConfirmed && isGMAvailable
                          ? 'border-green-200 bg-green-50'
                          : clickable
                          ? 'border-gray-200 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/40'
                          : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      {/* 1行目：アイコン + 日付 + 時間 + 店舗バッジ */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {isConfirmed && isGMAvailable
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          : isThisSelected
                          ? <CheckCircle2 className="w-4 h-4 text-purple-500 shrink-0" />
                          : <CircleDashed className="w-4 h-4 text-gray-400 shrink-0" />}
                        <span className="font-medium">{formatDate(candidate.date)}</span>
                        <span className="text-muted-foreground text-xs whitespace-nowrap">{candidate.timeSlot} {candidate.startTime}–{candidate.endTime}</span>
                        {availableStores && availableStores.length === 0 && (
                          <span className="text-xs text-red-500">空き店舗なし</span>
                        )}
                        {availableStores && availableStores.length > 0 && (
                          <>
                            {availableStores.slice(0, 4).map(s => (
                              <span key={s.id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                                {s.short_name || s.name}
                              </span>
                            ))}
                            {availableStores.length > 4 && (
                              <span className="text-xs text-gray-400">+{availableStores.length - 4}</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* 2行目：GMバッジ（対応可能GMがいる時のみ） */}
                      {availableGMs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-1 pl-6">
                          {availableGMs.map((gm, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                              {gm.gm_name?.slice(0, 4) ?? 'GM'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 選択時：店舗・GMプルダウンを直下展開 */}
                    {isThisSelected && inlineApprovalContent && (
                      <div className="border border-t-0 border-purple-300 rounded-b-md bg-purple-50/50 px-3 py-3">
                        {inlineApprovalContent}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── 確定済み店舗 ── */}
          {request.candidate_datetimes?.confirmedStore && (
            <div className="p-3 rounded border bg-purple-50 border-purple-200 text-sm">
              <span className="text-purple-800">開催店舗: </span>
              <span className="text-purple-900 font-medium">{request.candidate_datetimes.confirmedStore.storeName}</span>
            </div>
          )}

          {/* ── メモ ── */}
          {request.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">お客様メモ</p>
              <p className="text-sm bg-background p-2 rounded border">{request.notes}</p>
            </div>
          )}

        </div>

        {/* ── カード下部アクション（承認・却下） ── */}
        {cardActionsContent && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            {cardActionsContent}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
