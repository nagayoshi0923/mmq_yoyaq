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
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
          <StatusBadge status={request.status} />
        </div>
        <div className="text-sm text-muted-foreground space-y-1 mt-2">
          <div>予約番号: {request.reservation_number}</div>
          <div className="flex items-center gap-2">
            <span>申込日時: {formatDateTime(request.created_at)}</span>
            <span className="text-orange-600 font-medium">({getElapsedTime(request.created_at)})</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            お客様: {request.customer_name} ({request.participant_count}名)
          </div>
          {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span>希望店舗:</span>
              {request.candidate_datetimes.requestedStores.map((store, index) => (
                <Badge key={index} variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs">
                  {store.storeName}
                </Badge>
              ))}
            </div>
          )}
          {(!request.candidate_datetimes?.requestedStores || request.candidate_datetimes.requestedStores.length === 0) && (
            <div className="text-blue-600 text-sm">
              希望店舗: 全ての店舗（顧客希望）
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* GM回答表示 */}
          {request.gm_responses && request.gm_responses.length > 0 && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">GM回答状況</h4>
              <div className="space-y-1">
                {request.gm_responses.map((response, index) => (
                  <div key={index} className="text-sm text-blue-800">
                    {response.gm_name || 'GM名不明'}: {response.response_type === 'available' ? '✅ 出勤可能' : '❌ 出勤不可'}
                    {response.available_candidates && response.available_candidates.length > 0 && (
                      <span className="ml-2 text-blue-600">
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
            <p className="text-sm font-medium mb-3 text-purple-800">
              {request.status === 'confirmed' ? '確定した候補日時' : 
               (request.status === 'gm_confirmed' || request.status === 'pending_store') ? 'GMが選択した候補日時（店舗確認待ち）' : 
               'リクエストされた候補日時'}
            </p>
            <div className="space-y-2">
              {request.candidate_datetimes?.candidates?.map((candidate) => (
                <div
                  key={candidate.order}
                  className={`flex items-center gap-3 p-3 rounded border ${
                    request.status === 'confirmed' ? 'bg-green-50 border-green-300' :
                    (request.status === 'gm_confirmed' || request.status === 'pending_store') ? 'bg-purple-50 border-purple-300' :
                    'bg-gray-50 border-gray-300'
                  }`}
                >
                  {request.status === 'confirmed' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (request.status === 'gm_confirmed' || request.status === 'pending_store') ? (
                    <CheckCircle2 className="w-5 h-5 text-purple-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                        候補{candidate.order}
                      </Badge>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{formatDate(candidate.date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span>{candidate.timeSlot} {candidate.startTime} - {candidate.endTime}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 確定済み店舗の表示 */}
          {request.candidate_datetimes?.confirmedStore && (
            <div className="p-3 rounded border bg-purple-50 border-purple-200">
              <div className="text-sm">
                <span className="font-medium text-purple-800">開催店舗: </span>
                <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
              </div>
            </div>
          )}

          {/* 顧客メモ */}
          {request.notes && (
            <div className="pt-3 border-t">
              <p className="text-sm font-medium mb-2 text-muted-foreground">お客様からのメモ</p>
              <p className="text-sm bg-background p-3 rounded border">{request.notes}</p>
            </div>
          )}

          {/* 詳細確認ボタン */}
          {showActionButton && (
            <div className="pt-3 border-t">
              <Button
                onClick={() => {
                  console.log('🔵 ボタンクリック:', request.id, request.scenario_title)
                  onSelectRequest(request)
                }}
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

