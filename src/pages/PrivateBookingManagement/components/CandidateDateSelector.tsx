import { Calendar, Clock, XCircle, CheckCircle2 } from 'lucide-react'

/**
 * 候補日時の日付をフォーマット
 */
const formatCandidateDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) {
    return '日付不明'
  }
  
  const date = new Date(dateStr)
  
  // 無効な日付の場合
  if (isNaN(date.getTime())) {
    console.error('Invalid date string:', dateStr)
    return '日付エラー'
  }
  
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = weekdays[date.getDay()]
  
  return `${year}年${month}月${day}日(${weekday})`
}

interface Candidate {
  order: number
  date: string
  timeSlot: string
  startTime: string
  endTime: string
  status: string
}

interface ConflictInfo {
  storeDateConflicts: Set<string>
  gmDateConflicts: Set<string>
}

interface CandidateDateSelectorProps {
  candidates: Candidate[]
  selectedCandidateOrder: number | null
  selectedStoreId: string
  selectedGMId: string
  conflictInfo: ConflictInfo
  onSelectCandidate: (order: number) => void
}

/**
 * 候補日時選択コンポーネント
 */
export const CandidateDateSelector = ({
  candidates,
  selectedCandidateOrder,
  selectedStoreId,
  selectedGMId,
  conflictInfo,
  onSelectCandidate
}: CandidateDateSelectorProps) => {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-purple-800">
        <Calendar className="w-4 h-4" />
        開催日時を選択
      </h3>
      <div className="space-y-2">
        {candidates.map((candidate) => {
          const isSelected = selectedCandidateOrder === candidate.order

          // この日時に競合があるかチェック
          const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${candidate.date}-${candidate.timeSlot}` : null
          const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${candidate.timeSlot}` : null
          const hasStoreConflict = storeConflictKey && conflictInfo.storeDateConflicts.has(storeConflictKey)
          const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
          const hasConflict = hasStoreConflict || hasGMConflict

          return (
            <div
              key={candidate.order}
              onClick={() => !hasConflict && onSelectCandidate(candidate.order)}
              className={`flex items-center gap-3 p-3 rounded border-2 transition-all ${
                hasConflict
                  ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                  : isSelected
                  ? 'border-purple-500 bg-purple-50 cursor-pointer'
                  : 'border-gray-200 bg-background hover:border-purple-300 cursor-pointer'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                hasConflict
                  ? 'border-red-500 bg-red-500'
                  : isSelected
                  ? 'border-purple-500 bg-purple-500'
                  : 'border-gray-300'
              }`}>
                {hasConflict ? (
                  <XCircle className="w-4 h-4 text-white" />
                ) : isSelected ? (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                ) : null}
              </div>
              <div className="flex-1">
                <div className="">候補{candidate.order}</div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatCandidateDate(candidate.date)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{candidate.timeSlot} {candidate.startTime} - {candidate.endTime}</span>
                  </div>
                </div>
                {hasConflict && (
                  <div className="text-xs text-red-600 mt-1">
                    {hasStoreConflict && '店舗に予定あり'}
                    {hasStoreConflict && hasGMConflict && ' / '}
                    {hasGMConflict && 'GMに予定あり'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

