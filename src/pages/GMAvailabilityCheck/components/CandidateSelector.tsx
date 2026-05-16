import { CheckCircle2, CircleDashed } from 'lucide-react'
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
  gmScheduleConflicts?: Record<number, boolean>
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
  gmScheduleConflicts,
  isResponded,
  isConfirmed,
  isGMConfirmed,
  onToggle
}: CandidateSelectorProps) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        候補日時
        {!isConfirmed && !isResponded && !isGMConfirmed && (
          <span className="ml-1 font-normal normal-case text-purple-600">（出勤可能な日時を選択）</span>
        )}
      </p>
      <div className="space-y-1">
        {candidates.map((candidate) => {
          const isSelected = selectedCandidates.includes(candidate.order)
          const isAvailable = candidateAvailability[candidate.order] !== false
          const hasGmConflict = gmScheduleConflicts?.[candidate.order] === true
          const canClick = !isResponded && !isConfirmed && isAvailable

          let rowStyle = ''
          if (!isAvailable) {
            rowStyle = 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          } else if (hasGmConflict && canClick && isSelected) {
            rowStyle = 'border-orange-400 bg-orange-50 cursor-pointer'
          } else if (hasGmConflict && canClick) {
            rowStyle = 'border-orange-200 bg-orange-50 hover:border-orange-300 cursor-pointer'
          } else if (isConfirmed && isSelected) {
            rowStyle = 'border-green-400 bg-green-50 cursor-default'
          } else if (isConfirmed && !isSelected) {
            rowStyle = 'border-gray-200 bg-gray-50 cursor-default opacity-60'
          } else if (isResponded && isSelected) {
            rowStyle = 'border-purple-400 bg-purple-50 cursor-default'
          } else if (isResponded && !isSelected) {
            rowStyle = 'border-gray-200 bg-gray-50 cursor-default opacity-60'
          } else if (isSelected && canClick) {
            rowStyle = 'border-purple-400 bg-purple-50 cursor-pointer'
          } else if (canClick) {
            rowStyle = 'border-gray-200 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/40 cursor-pointer'
          } else {
            rowStyle = 'border-gray-200 bg-gray-50 cursor-default'
          }

          return (
            <div
              key={candidate.order}
              className={`px-3 py-2 rounded text-sm border transition-colors ${rowStyle}`}
              onClick={() => canClick && onToggle(candidate.order)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {isConfirmed && isSelected
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  : isSelected
                  ? <CheckCircle2 className="w-4 h-4 text-purple-500 shrink-0" />
                  : <CircleDashed className="w-4 h-4 text-gray-400 shrink-0" />}
                <span className="font-medium">{formatDate(candidate.date)}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {candidate.timeSlot} {candidate.startTime}–{candidate.endTime}
                </span>
                {hasGmConflict && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-200">
                    ⚠️ 予定と重複の可能性
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

