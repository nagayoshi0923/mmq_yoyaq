import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Pencil } from 'lucide-react'
import type { GMRequest } from '../hooks/useGMRequests'
import { getElapsedTime, getElapsedDays } from '../utils/gmFormatters'
import { CandidateSelector } from './CandidateSelector'
import { NotesInput } from './NotesInput'

interface RequestCardProps {
  request: GMRequest
  selectedCandidates: number[]
  candidateAvailability: Record<number, boolean>
  gmScheduleConflicts?: Record<number, boolean>
  notes: string
  submitting: boolean
  isEditing?: boolean
  onToggleCandidate: (order: number) => void
  onNotesChange: (value: string) => void
  onSubmit: (allUnavailable: boolean) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
}

/**
 * GMリクエストカード
 */
export function RequestCard({
  request,
  selectedCandidates,
  candidateAvailability,
  gmScheduleConflicts,
  notes,
  submitting,
  isEditing = false,
  onToggleCandidate,
  onNotesChange,
  onSubmit,
  onStartEdit,
  onCancelEdit
}: RequestCardProps) {
  const isResponded = request.response_status === 'available' || request.response_status === 'all_unavailable'
  const isConfirmed = request.reservation_status === 'confirmed'
  const isGMConfirmed = request.reservation_status === 'gm_confirmed'
  const elapsedTime = getElapsedTime(request.created_at)
  const elapsedDays = getElapsedDays(request.created_at)
  const elapsedTimeColor = elapsedDays >= 3 ? 'text-red-600 font-medium' : 'text-purple-600'

  return (
    <Card className="shadow-none border">
      <CardHeader className="pt-3 pb-2 space-y-0">
        {/* タイトル + ステータスバッジ */}
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{request.scenario_title}</CardTitle>
          <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal shrink-0">
            {isConfirmed
              ? '確定済み'
              : isGMConfirmed
                ? 'GM確認済み'
                : isResponded
                  ? '回答済み'
                  : request.has_other_gm_response
                    ? '他GM回答済み'
                    : '未回答'}
          </Badge>
        </div>

        {/* サマリー1行 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
          <span>#{request.reservation_number}</span>
          <span>{request.customer_name}</span>
          <span className={elapsedTimeColor}>{elapsedTime}</span>
        </div>

        {/* 希望店舗 */}
        {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground shrink-0">希望店舗:</span>
            {request.candidate_datetimes.requestedStores.map((store: any, index: number) => (
              <span key={index} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                {store.storeName}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="md:pt-0">
        <div className="space-y-3">
          {/* 候補日時選択 */}
          <CandidateSelector
            candidates={request.candidate_datetimes?.candidates || []}
            selectedCandidates={selectedCandidates}
            candidateAvailability={candidateAvailability}
            gmScheduleConflicts={gmScheduleConflicts}
            isResponded={isResponded && !isEditing}
            isConfirmed={isConfirmed}
            isGMConfirmed={isGMConfirmed}
            onToggle={onToggleCandidate}
          />

          {/* 確定済み店舗の表示 */}
          {(isConfirmed || isGMConfirmed) && request.candidate_datetimes?.confirmedStore && (
            <div className="p-3 rounded border bg-purple-50 border-purple-200">
              <div className="text-sm">
                <span className="text-purple-800">開催店舗: </span>
                <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
              </div>
            </div>
          )}

          {/* メモ入力 */}
          <NotesInput
            value={notes}
            onChange={onNotesChange}
            isResponded={isResponded && !isEditing}
          />

          {/* ボタン：自分が未回答または編集中かつ予約が未確定なら表示 */}
          {(!isResponded || isEditing) && !isConfirmed && (
            <div className="flex gap-2">
              {isEditing && onCancelEdit && (
                <Button
                  variant="outline"
                  className="flex-1 text-sm"
                  onClick={onCancelEdit}
                  disabled={submitting}
                  size="sm"
                >
                  キャンセル
                </Button>
              )}
              {!isEditing && (
                <Button
                  variant="outline"
                  className="flex-1 border-red-200 hover:bg-red-50 text-sm"
                  onClick={() => onSubmit(true)}
                  disabled={submitting}
                  size="sm"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  すべて不可
                </Button>
              )}
              <Button
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-sm"
                onClick={() => onSubmit(false)}
                disabled={submitting || selectedCandidates.length === 0}
                size="sm"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                {submitting ? '送信中...' : isEditing ? '回答を更新' : '回答送信'}
              </Button>
            </div>
          )}

          {/* 確定済みの表示 */}
          {isConfirmed && (
            <div className="p-3 rounded border bg-green-50 border-green-200">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-green-800">
                  この予約は確定されました
                </span>
              </div>
            </div>
          )}
          
          {/* GM確認済み（店側確認待ち）の表示：自分が回答済みの場合のみ＋編集ボタン */}
          {isGMConfirmed && isResponded && !isEditing && (
            <div className="p-3 rounded border bg-purple-50 border-purple-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-purple-600" />
                  <span className="text-purple-800">
                    あなたの回答は送信済みです。店側で最終的な開催日を決定します。
                  </span>
                </div>
                {onStartEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-purple-600 hover:text-purple-800 hover:bg-purple-100"
                    onClick={onStartEdit}
                  >
                    <Pencil className="w-4 h-4 mr-1" />
                    編集
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 回答済みの表示（未確定・GM確認済み以外）＋編集ボタン */}
          {isResponded && !isConfirmed && !isGMConfirmed && !isEditing && (
            <div className={`p-3 rounded border ${
              request.response_status === 'available' 
                ? 'bg-green-50 border-green-200' 
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {request.response_status === 'available' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-green-800">
                        回答済み：候補{(request.available_candidates || []).map(c => c + 1).join(', ')}が出勤可能
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-gray-600" />
                      <span className="text-gray-800">
                        回答済み：すべて出勤不可
                      </span>
                    </>
                  )}
                </div>
                {onStartEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                    onClick={onStartEdit}
                  >
                    <Pencil className="w-4 h-4 mr-1" />
                    編集
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 他GMが回答済みの情報 */}
          {!isResponded && request.has_other_gm_response && (
            <div className="p-3 rounded border bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span className="text-blue-800">
                  他のGMも回答済みです。あなたも回答できます（店側が最終的に担当GMを決定します）
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

