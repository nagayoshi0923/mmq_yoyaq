import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, CheckCircle2 } from 'lucide-react'
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
      <p className="text-sm mb-3 text-purple-800">
        {isConfirmed ? '確定した候補日時' : isGMConfirmed ? '選択した候補日時（店側確認待ち）' : '以下の候補から出勤可能な日時を選択してください（複数選択可）'}
      </p>
      <div className="space-y-2">
        {candidates.map((candidate) => {
          const isSelected = selectedCandidates.includes(candidate.order)
          const isAvailable = candidateAvailability[candidate.order] !== false
          const isDisabled = isResponded || isConfirmed || isGMConfirmed || !isAvailable
          
          return (
            <div
              key={candidate.order}
              className={`flex items-center gap-3 p-3 rounded border ${
                !isAvailable
                  ? 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                  : isConfirmed 
                    ? 'bg-gray-50 border-gray-200 cursor-default'
                    : isGMConfirmed
                      ? 'bg-orange-50 border-orange-200 cursor-default'
                      : isSelected 
                        ? 'bg-purple-50 border-purple-300 cursor-pointer' 
                        : 'bg-accent border-border hover:bg-accent/80 cursor-pointer'
              }`}
              onClick={() => !isDisabled && onToggle(candidate.order)}
            >
              <Checkbox
                checked={isSelected}
                disabled={isDisabled}
                className="pointer-events-none"
              />
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                    候補{candidate.order}
                  </Badge>
                  {!isAvailable && (
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                      満席
                    </Badge>
                  )}
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
              {isSelected && isAvailable && (
                <CheckCircle2 className="w-5 h-5 text-purple-600" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

