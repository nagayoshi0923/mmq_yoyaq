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
  const canEdit = isResponded && !isEditing
  const isConfirmed = request.reservation_status === 'confirmed'
  const isGMConfirmed = request.reservation_status === 'gm_confirmed'
  const elapsedTime = getElapsedTime(request.created_at)
  const elapsedDays = getElapsedDays(request.created_at)
  const elapsedTimeColor = elapsedDays >= 3 ? 'text-red-600 font-medium' : 'text-purple-600'

  return (
    <Card className="shadow-none border">
      <CardHeader className="bg-purple-50 border-b">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base text-purple-900">
              {request.scenario_title}
            </CardTitle>
            <div className="mt-2 space-y-1 text-xs text-purple-700">
              <div>お客様: {request.customer_name}</div>
              <div>予約番号: {request.reservation_number}</div>
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
                  ? 'bg-green-100 text-green-800'
                  : isGMConfirmed
                    ? 'bg-purple-100 text-purple-800'
                    : isResponded
                      ? 'bg-green-100 text-green-800'
                      : request.has_other_gm_response
                        ? 'bg-purple-100 text-purple-800'
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
            <span className={`text-xs ${elapsedTimeColor}`}>{elapsedTime}の申込</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-3">
          {/* 開催予定店舗 */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1">開催予定店舗</div>
            {request.candidate_datetimes?.confirmedStore ? (
              <div className="">{request.candidate_datetimes.confirmedStore.storeName}</div>
            ) : request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 ? (
              <>
                <div className="flex gap-2 flex-wrap">
                  {request.candidate_datetimes?.requestedStores?.map((store: any, index: number) => (
                    <span key={index} className="">
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

