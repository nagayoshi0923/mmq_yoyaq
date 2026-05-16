import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Calendar, Clock, CheckCircle2, XCircle, CircleDashed,
  RefreshCw, ChevronDown, ChevronUp, Copy, Check, Mail, Phone
} from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import {
  formatDate,
  formatGmReplyReceivedAt,
  pickGmReplyIsoString,
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
  // インライン承認
  isApprovalOpen?: boolean
  onToggleApproval?: () => void
  inlineApprovalContent?: React.ReactNode
}

export const BookingRequestCard = ({
  request,
  onResendDiscordNotification,
  isApprovalOpen = false,
  onToggleApproval,
  inlineApprovalContent,
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
      <CardHeader className="pb-2">
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
        {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-xs text-muted-foreground mr-0.5 self-center">希望店舗:</span>
            {request.candidate_datetimes.requestedStores.map((store, i) => (
              <Badge key={i} variant="secondary" className="bg-gray-100 text-gray-700 border-0 rounded font-normal text-xs py-0">
                {store.storeName}
              </Badge>
            ))}
          </div>
        )}

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

      <CardContent>
        <div className="space-y-3">
          {/* ── GM回答状況 ── */}
          {request.gm_responses && request.gm_responses.length > 0 && (
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-purple-900">GM回答状況</h4>
                {onResendDiscordNotification && hasUnrespondedGMs && isWaitingStatus && (
                  <Button variant="ghost" size="sm"
                    className="h-7 px-2 text-xs text-purple-700 hover:text-purple-900 hover:bg-purple-100"
                    onClick={handleResend} disabled={resending}
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5 mr-1', resending && 'animate-spin')} />
                    {resending ? '送信中...' : 'Discord再通知'}
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {request.gm_responses.map((response, index) => {
                  const responded = hasGmResponded(response)
                  const replyIso = responded ? pickGmReplyIsoString(response) : null
                  const replyLabel = formatGmReplyReceivedAt(replyIso)
                  return (
                    <div key={index} className="text-sm text-purple-800">
                      {response.gm_name || 'GM名不明'}:{' '}
                      {!responded
                        ? <span className="text-gray-500">⏳ 未回答</span>
                        : isGmMarkedAvailable(response) ? '✅ 出勤可能' : '❌ 出勤不可'
                      }
                      {responded && (response.available_candidates?.length ?? 0) > 0 && (
                        <span className="ml-2 text-purple-600">
                          (候補{response.available_candidates!.map(i => i + 1).join(', ')})
                        </span>
                      )}
                      {replyLabel && (
                        <span className="ml-2 text-xs text-purple-600">・回答 {replyLabel}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 候補日時 ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">候補日時</p>
            <div className="space-y-1.5">
              {request.candidate_datetimes?.candidates?.map((candidate) => {
                const isGMSelected = request.gm_responses?.some(r => isGmAvailableForCandidate(r, candidate.order - 1))
                const isWaitingForGM = ['pending', 'pending_gm'].includes(request.status)
                const isGMResponded = ['gm_confirmed', 'pending_store'].includes(request.status)
                const isConfirmed = request.status === 'confirmed'
                return (
                  <div key={candidate.order} className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                    isConfirmed && isGMSelected ? 'bg-green-50 border border-green-200' :
                    isGMResponded && isGMSelected ? 'bg-purple-50 border border-purple-200' :
                    isWaitingForGM ? 'bg-gray-50 border border-gray-200' :
                    'bg-gray-50 border border-gray-200 opacity-60'
                  }`}>
                    {isConfirmed && isGMSelected ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      : isGMResponded && isGMSelected ? <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                      : isWaitingForGM ? <CircleDashed className="w-4 h-4 text-gray-400 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    <span className="text-xs text-muted-foreground shrink-0">候補{candidate.order}</span>
                    <span className="font-medium">{formatDate(candidate.date)}</span>
                    <span className="text-muted-foreground">{candidate.timeSlot} {candidate.startTime}–{candidate.endTime}</span>
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

          {/* ── 承認・処理トグル ── */}
          {onToggleApproval && (
            <div className="pt-2 border-t">
              <button
                onClick={onToggleApproval}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isApprovalOpen
                    ? 'bg-purple-100 text-purple-900 hover:bg-purple-200'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                )}
              >
                <span>{isApprovalOpen ? '承認フォームを閉じる' : '承認・処理を行う'}</span>
                {isApprovalOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {/* ── インライン承認フォーム ── */}
              {isApprovalOpen && inlineApprovalContent && (
                <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/40 p-4 space-y-4">
                  {inlineApprovalContent}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
