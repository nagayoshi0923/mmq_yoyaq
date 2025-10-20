import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, MapPin, CheckCircle2, XCircle } from 'lucide-react'
import type { GMRequest } from '../hooks/useGMRequests'
import { getElapsedTime } from '../utils/gmFormatters'
import { CandidateSelector } from './CandidateSelector'
import { NotesInput } from './NotesInput'

interface RequestCardProps {
  request: GMRequest
  selectedCandidates: number[]
  candidateAvailability: Record<number, boolean>
  notes: string
  submitting: boolean
  onToggleCandidate: (order: number) => void
  onNotesChange: (value: string) => void
  onSubmit: (allUnavailable: boolean) => void
}

/**
 * GMリクエストカード
 */
export function RequestCard({
  request,
  selectedCandidates,
  candidateAvailability,
  notes,
  submitting,
  onToggleCandidate,
  onNotesChange,
  onSubmit
}: RequestCardProps) {
  const isResponded = request.response_status === 'available' || request.response_status === 'all_unavailable'
  const isConfirmed = request.reservation_status === 'confirmed'
  const isGMConfirmed = request.reservation_status === 'gm_confirmed'
  const elapsedTime = getElapsedTime(request.created_at)

  return (
    <Card className="shadow-none">
      <CardHeader className="bg-purple-50 border-b">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl font-bold text-purple-900">
              {request.scenario_title}
            </CardTitle>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-sm text-purple-700">
                <Users className="w-4 h-4" />
                <span>お客様: {request.customer_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-700">
                <span>予約番号: {request.reservation_number}</span>
              </div>
            </div>
            {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className="text-sm text-purple-700">希望店舗:</span>
                {request.candidate_datetimes.requestedStores.map((store: any, index: number) => (
                  <Badge key={index} variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs">
                    {store.storeName}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge
              variant="secondary"
              className={
                isConfirmed
                  ? 'bg-blue-100 text-blue-800'
                  : isGMConfirmed
                    ? 'bg-orange-100 text-orange-800'
                    : isResponded
                      ? 'bg-green-100 text-green-800'
                      : request.has_other_gm_response
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-purple-100 text-purple-800'
              }
            >
              {isConfirmed
                ? '確定済み'
                : isGMConfirmed
                  ? 'GM確認済み（店側確認待ち）'
                  : isResponded
                    ? '回答済み'
                    : request.has_other_gm_response
                      ? '他GM回答済み'
                      : '未回答'}
            </Badge>
            <span className="text-xs text-muted-foreground">{elapsedTime}の申込</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* 開催予定店舗 */}
          <div className="mb-4">
            <div className="text-sm text-muted-foreground mb-1">開催予定店舗</div>
            {request.candidate_datetimes?.confirmedStore ? (
              <div className="font-medium">{request.candidate_datetimes.confirmedStore.storeName}</div>
            ) : request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 ? (
              <>
                <div className="flex gap-2 flex-wrap">
                  {request.candidate_datetimes?.requestedStores?.map((store: any, index: number) => (
                    <span key={index} className="font-medium">
                      {store.storeName}{index < (request.candidate_datetimes?.requestedStores?.length || 0) - 1 ? ' / ' : ''}
                    </span>
                  ))}
                </div>
                {(request.candidate_datetimes?.requestedStores?.length || 0) > 1 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    ※ 最終店舗は店舗管理者が決定します
                  </div>
                )}
              </>
            ) : (
              <div className="text-muted-foreground">店舗未定（店舗管理者が決定します）</div>
            )}
          </div>

          {/* 候補日時選択 */}
          <CandidateSelector
            candidates={request.candidate_datetimes?.candidates || []}
            selectedCandidates={selectedCandidates}
            candidateAvailability={candidateAvailability}
            isResponded={isResponded}
            isConfirmed={isConfirmed}
            isGMConfirmed={isGMConfirmed}
            onToggle={onToggleCandidate}
          />

          {/* 確定済み店舗の表示 */}
          {(isConfirmed || isGMConfirmed) && request.candidate_datetimes?.confirmedStore && (
            <div className="p-3 rounded border bg-purple-50 border-purple-200">
              <div className="text-sm">
                <span className="font-medium text-purple-800">開催店舗: </span>
                <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
              </div>
            </div>
          )}

          {/* メモ入力 */}
          <NotesInput
            value={notes}
            onChange={onNotesChange}
            isResponded={isResponded}
          />

          {/* ボタン */}
          {!isResponded && !isConfirmed && !isGMConfirmed && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-red-200 hover:bg-red-50"
                onClick={() => onSubmit(true)}
                disabled={submitting}
              >
                <XCircle className="w-4 h-4 mr-2" />
                すべて出勤不可
              </Button>
              <Button
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                onClick={() => onSubmit(false)}
                disabled={submitting || selectedCandidates.length === 0}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {submitting ? '送信中...' : '回答を送信'}
              </Button>
            </div>
          )}

          {/* 確定済みの表示 */}
          {isConfirmed && (
            <div className="p-3 rounded border bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-800">
                  この予約は確定されました
                </span>
              </div>
            </div>
          )}
          
          {/* GM確認済み（店側確認待ち）の表示 */}
          {isGMConfirmed && (
            <div className="p-3 rounded border bg-orange-50 border-orange-200">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                <span className="font-medium text-orange-800">
                  GMの確認は完了しました。店側で最終的な開催日を決定します。
                </span>
              </div>
            </div>
          )}

          {/* 回答済みの表示（未確定・GM確認済み以外） */}
          {isResponded && !isConfirmed && !isGMConfirmed && (
            <div className={`p-3 rounded border ${
              request.response_status === 'available' 
                ? 'bg-green-50 border-green-200' 
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2 text-sm">
                {request.response_status === 'available' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-green-800">
                      回答済み：候補{request.available_candidates.join(', ')}が出勤可能
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-gray-800">
                      回答済み：すべて出勤不可
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 他GMが回答済みの警告 */}
          {!isResponded && request.has_other_gm_response && (
            <div className="p-3 rounded border bg-yellow-50 border-yellow-200">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-yellow-600" />
                <span className="font-medium text-yellow-800">
                  他のGMが既に回答しています。この予約は確定される可能性があります。
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

