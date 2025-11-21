import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, Users, CheckCircle2, XCircle } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { formatDate, formatDateTime, getElapsedTime, getCardClassName } from '../utils/bookingFormatters'

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
  response_type: string
  available_candidates?: number[]
  selected_candidate_index?: number
  notes?: string
}

interface BookingRequest {
  id: string
  reservation_number: string
  scenario_title: string
  customer_name: string
  participant_count: number
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
}

/**
 * 貸切リクエストカードコンポーネント
 */
export const BookingRequestCard = ({
  request,
  onSelectRequest,
  showActionButton = false
}: BookingRequestCardProps) => {
  return (
    <Card className={getCardClassName(request.status)}>
      <CardHeader className="p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-base md:text-lg break-words">{request.scenario_title}</CardTitle>
          <StatusBadge status={request.status} />
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground space-y-1 mt-2">
          <div>予約番号: {request.reservation_number}</div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span>申込日時: {formatDateTime(request.created_at)}</span>
            <span className="text-orange-600 font-medium">({getElapsedTime(request.created_at)})</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span>お客様: {request.customer_name} ({request.participant_count}名)</span>
          </div>
          {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span>希望店舗:</span>
              {request.candidate_datetimes.requestedStores.map((store, index) => (
                <Badge key={index} variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal text-xs">
                  {store.storeName}
                </Badge>
              ))}
            </div>
          )}
          {(!request.candidate_datetimes?.requestedStores || request.candidate_datetimes.requestedStores.length === 0) && (
            <div className="text-blue-600 text-xs sm:text-sm">
              希望店舗: 全ての店舗（顧客希望）
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="space-y-3 sm:space-y-4">
          {/* GM回答表示 */}
          {request.gm_responses && request.gm_responses.length > 0 && (
            <div className="bg-blue-50 p-2.5 sm:p-3 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2 text-xs sm:text-sm">GM回答状況</h4>
              <div className="space-y-1">
                {request.gm_responses.map((response, index) => (
                  <div key={index} className="text-xs sm:text-sm text-blue-800">
                    {response.gm_name || 'GM名不明'}: {response.response_type === 'available' ? '✅ 出勤可能' : '❌ 出勤不可'}
                    {response.available_candidates && response.available_candidates.length > 0 && (
                      <span className="ml-1.5 sm:ml-2 text-blue-600">
                        (候補{response.available_candidates.map((idx) => idx + 1).join(', ')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 候補日時表示 */}
          <div>
            <p className="text-xs sm:text-sm font-medium mb-2 sm:mb-3 text-purple-800">
              {request.status === 'confirmed' ? '確定した候補日時' : 
               (request.status === 'gm_confirmed' || request.status === 'pending_store') ? 'GMが選択した候補日時（店舗確認待ち）' : 
               'リクエストされた候補日時'}
            </p>
            <div className="space-y-2">
              {request.candidate_datetimes?.candidates?.map((candidate) => (
                <div
                  key={candidate.order}
                  className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded border ${
                    request.status === 'confirmed' ? 'bg-green-50 border-green-300' :
                    (request.status === 'gm_confirmed' || request.status === 'pending_store') ? 'bg-purple-50 border-purple-300' :
                    'bg-gray-50 border-gray-300'
                  }`}
                >
                  {request.status === 'confirmed' ? (
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                  ) : (request.status === 'gm_confirmed' || request.status === 'pending_store') ? (
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal text-xs w-fit">
                        候補{candidate.order}
                      </Badge>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                        <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">{formatDate(candidate.date)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                        <span className="break-words">{candidate.timeSlot} {candidate.startTime} - {candidate.endTime}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 確定済み店舗の表示 */}
          {request.candidate_datetimes?.confirmedStore && (
            <div className="p-2.5 sm:p-3 rounded border bg-purple-50 border-purple-200">
              <div className="text-xs sm:text-sm">
                <span className="font-medium text-purple-800">開催店舗: </span>
                <span className="text-purple-900 break-words">{request.candidate_datetimes.confirmedStore.storeName}</span>
              </div>
            </div>
          )}

          {/* 顧客メモ */}
          {request.notes && (
            <div className="pt-3 border-t">
              <p className="text-xs sm:text-sm font-medium mb-2 text-muted-foreground">お客様からのメモ</p>
              <p className="text-xs sm:text-sm bg-background p-2.5 sm:p-3 rounded border whitespace-pre-wrap break-words">{request.notes}</p>
            </div>
          )}

          {/* 詳細確認ボタン */}
          {showActionButton && (
            <div className="pt-3 border-t">
              <Button
                onClick={() => onSelectRequest(request)}
                className="w-full text-xs sm:text-sm"
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

