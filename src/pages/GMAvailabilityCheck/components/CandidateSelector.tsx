import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, CheckCircle2, Circle } from 'lucide-react'
import { formatDate } from '../utils/gmFormatters'

interface Candidate {
  order: number
  date: string
  timeSlot: string
  startTime: string
  endTime: string
  status: string
}

interface CandidateSelectorProps {
  candidates: Candidate[]
  selectedCandidates: number[]
  candidateAvailability: Record<number, boolean>
  isResponded: boolean
  isConfirmed: boolean
  isGMConfirmed: boolean
  onToggle: (order: number) => void
}

/**
 * 候補日時選択コンポーネント
 */
export function CandidateSelector({
  candidates,
  selectedCandidates,
  candidateAvailability,
  isResponded,
  isConfirmed,
  isGMConfirmed,
  onToggle
}: CandidateSelectorProps) {
  return (
    <div>
      <p className="text-sm font-medium mb-2 text-purple-800">
        {isConfirmed 
          ? 'お客様希望候補日時（確定済み）' 
          : isGMConfirmed 
            ? 'お客様希望候補日時（GM回答済み・店側確認待ち）' 
            : isResponded
              ? 'お客様希望候補日時（回答済み）'
              : 'お客様希望候補日時（出勤可能な日時を選択）'}
      </p>
      {(isGMConfirmed || isResponded || isConfirmed) && selectedCandidates.length > 0 && (
        <p className="text-xs text-purple-600 mb-2">
          ✓ = GMが出勤可能と回答した日時
        </p>
      )}
      <div className="space-y-2">
        {candidates.map((candidate) => {
          const isSelected = selectedCandidates.includes(candidate.order)
          const isAvailable = candidateAvailability[candidate.order] !== false
          // 自分が未回答かつ予約が未確定なら選択可能（他GMが回答済みでも選択可能）
          const canClick = !isResponded && !isConfirmed && isAvailable
          
          // 状態に応じたスタイルを決定
          let cardStyle = ''
          if (!isAvailable) {
            // 満席
            cardStyle = 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
          } else if (isConfirmed && isSelected) {
            // 確定済み＋自分が選択した候補 → 強調表示
            cardStyle = 'border-green-500 bg-green-50 cursor-default'
          } else if (isConfirmed && !isSelected) {
            // 確定済み＋自分が選択していない候補 → disabled（灰色）
            cardStyle = 'bg-gray-50 border-gray-200 cursor-default opacity-60'
          } else if (isResponded && isSelected) {
            // 回答済み＋自分が選択した候補
            cardStyle = 'border-purple-500 bg-purple-50/30 cursor-default'
          } else if (isResponded && !isSelected) {
            // 回答済み＋自分が選択していない候補 → disabled（灰色）
            cardStyle = 'bg-gray-50 border-gray-200 cursor-default opacity-60'
          } else if (isSelected && canClick) {
            // 選択中（編集可能）
            cardStyle = 'border-purple-500 bg-purple-50/30 cursor-pointer'
          } else if (canClick) {
            // 未選択（編集可能）
            cardStyle = 'border-gray-200 hover:border-purple-300 cursor-pointer'
          } else {
            // その他（予期しないケース）
            cardStyle = 'border-gray-200 cursor-default'
          }
          
          return (
            <div
              key={candidate.order}
              className={`flex items-center gap-3 p-3 rounded border ${cardStyle}`}
              onClick={() => canClick && onToggle(candidate.order)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal">
                    候補{candidate.order}
                  </Badge>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="">{formatDate(candidate.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{candidate.timeSlot} {candidate.startTime} - {candidate.endTime}</span>
                  </div>
                </div>
              </div>
              {isAvailable && (
                isSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300" />
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

