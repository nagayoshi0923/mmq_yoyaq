import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Calendar, Clock, CheckCircle2, XCircle, CircleDashed, RefreshCw } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import {
  formatDate,
  formatDateTime,
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
  customer_name: string
  participant_count: number
  joined_member_count?: number
  scenario_player_count_range?: { min: number; max: number } | null
  status: string
  created_at: string
  notes?: string
  candidate_datetimes?: {
    candidates: Candidate[]
    requestedStores?: Array<{ storeId: string; storeName: string }>
    confirmedStore?: { storeId: string; storeName: string }
  }
  gm_responses?: GMResponse[]
}

interface BookingRequestCardProps {
  request: BookingRequest
  onSelectRequest: (request: BookingRequest) => void
  showActionButton?: boolean
  onResendDiscordNotification?: (request: { id: string; scenario_title: string }) => Promise<void>
}

/**
 * 貸切リクエストカードコンポーネント
 */
import { cn } from '@/lib/utils'

// ...

export const BookingRequestCard = ({
  request,
  onSelectRequest,
  showActionButton = false,
  onResendDiscordNotification
}: BookingRequestCardProps) => {
  const [resending, setResending] = useState(false)
  const elapsedDays = getElapsedDays(request.created_at)
  const elapsedTimeColor = elapsedDays >= 3 ? 'text-red-600 font-medium' : 'text-purple-600'
  
  const hasUnrespondedGMs = request.gm_responses?.some(r => !hasGmResponded(r))
  const isWaitingStatus = request.status === 'pending' || request.status === 'pending_gm' || request.status === 'pending_store'

  const handleResend = async () => {
    if (!onResendDiscordNotification || resending) return
    setResending(true)
    // ブラウザに描画を先に済ませてもらう（INP対策）
    await new Promise(resolve => setTimeout(resolve, 0))
    try {
      await onResendDiscordNotification(request)
    } finally {
      setResending(false)
    }
  }
  
  return (
    <Card className={cn(getCardClassName(request.status), "shadow-none")}>
      <CardHeader className="pb-2">
        {/* ── 1行目: タイトル + ステータス ── */}
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{request.scenario_title}</CardTitle>
          <StatusBadge status={request.status} />
        </div>

        {/* ── 2行目: サマリー情報（スキャン用） ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
          <span>#{request.reservation_number}</span>
          <span>
            {request.customer_name}・{formatPrivateBookingParticipantLabel(request.participant_count, request.joined_member_count)}
          </span>
          <span className={elapsedTimeColor}>{getElapsedTime(request.created_at)}</span>
        </div>

        {/* ── 希望店舗（折り畳み） ── */}
        {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-xs text-muted-foreground mr-0.5">希望店舗:</span>
            {request.candidate_datetimes.requestedStores.map((store, index) => (
              <Badge key={index} variant="secondary" className="bg-gray-100 text-gray-700 border-0 rounded font-normal text-xs py-0">
                {store.storeName}
              </Badge>
            ))}
          </div>
        )}
        {request.scenario_player_count_range &&
          isPlannedCountOutsideScenarioRange(
            request.participant_count,
            request.scenario_player_count_range
          ) && (
            <Alert variant="default" className="mt-2 border-amber-400 bg-amber-50 py-2 text-amber-950">
              <AlertTitle className="text-xs font-semibold text-amber-900">
                参加予定人数がシナリオの人数帯と一致しません
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-900/90">
                申込は <strong>{request.participant_count}名</strong> ですが、推奨人数は{' '}
                <strong>{formatScenarioPlayerRange(request.scenario_player_count_range)}</strong>{' '}
                です。
              </AlertDescription>
            </Alert>
          )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* GM回答表示 */}
          {request.gm_responses && request.gm_responses.length > 0 && (
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-purple-900">GM回答状況</h4>
                {onResendDiscordNotification && hasUnrespondedGMs && isWaitingStatus && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-purple-700 hover:text-purple-900 hover:bg-purple-100"
                    onClick={handleResend}
                    disabled={resending}
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5 mr-1", resending && "animate-spin")} />
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
                      <div>
                        {response.gm_name || 'GM名不明'}:{' '}
                        {!responded
                          ? <span className="text-gray-500">⏳ 未回答</span>
                          : isGmMarkedAvailable(response) ? '✅ 出勤可能' : '❌ 出勤不可'
                        }
                        {responded && response.available_candidates && response.available_candidates.length > 0 && (
                          <span className="ml-2 text-purple-600">
                            (候補{response.available_candidates.map((idx) => idx + 1).join(', ')})
                          </span>
                        )}
                        {replyLabel ? (
                          <span className="ml-2 text-xs text-purple-600 font-normal">
                            ・回答 {replyLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 候補日時表示 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              候補日時
            </p>
            <div className="space-y-1.5">
              {request.candidate_datetimes?.candidates?.map((candidate) => {
                // GMが回答した候補かどうかをチェック
                const isGMSelected = request.gm_responses?.some((response) =>
                  isGmAvailableForCandidate(response, candidate.order - 1)
                )
                
                // ステータスに応じたアイコンとスタイルを決定
                const isWaitingForGM = request.status === 'pending' || request.status === 'pending_gm'
                const isGMResponded = request.status === 'gm_confirmed' || request.status === 'pending_store'
                const isConfirmed = request.status === 'confirmed'
                
                return (
                <div
                  key={candidate.order}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                    isConfirmed && isGMSelected ? 'bg-green-50 border border-green-200' :
                    isGMResponded && isGMSelected ? 'bg-purple-50 border border-purple-200' :
                    isWaitingForGM ? 'bg-gray-50 border border-gray-200' :
                    'bg-gray-50 border border-gray-200 opacity-60'
                  }`}
                >
                  {isConfirmed && isGMSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  ) : isGMResponded && isGMSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                  ) : isWaitingForGM ? (
                    <CircleDashed className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">候補{candidate.order}</span>
                  <span className="font-medium">{formatDate(candidate.date)}</span>
                  <span className="text-muted-foreground">{candidate.timeSlot} {candidate.startTime}–{candidate.endTime}</span>
                </div>
                )
              })}
            </div>
          </div>

          {/* 確定済み店舗の表示 */}
          {request.candidate_datetimes?.confirmedStore && (
            <div className="p-3 rounded border bg-purple-50 border-purple-200">
              <div className="text-sm">
                <span className="text-purple-800">開催店舗: </span>
                <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
              </div>
            </div>
          )}

          {/* 顧客メモ */}
          {request.notes && (
            <div className="pt-3 border-t">
              <p className="text-sm mb-2 text-muted-foreground">お客様からのメモ</p>
              <p className="text-sm bg-background p-3 rounded border">{request.notes}</p>
            </div>
          )}

          {/* 詳細確認ボタン */}
          {showActionButton && (
            <div className="pt-3 border-t">
              <Button
                onClick={() => onSelectRequest(request)}
                className="w-full"
                variant="default"
              >
                詳細確認・承認/却下
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

