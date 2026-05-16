import { Calendar } from 'lucide-react'
import { formatJapanCalendarDateLabel } from '@/lib/japanCalendarDate'
import { isGmAvailableForCandidate } from '../utils/gmAvailabilityStatus'

const formatCandidateDate = (dateStr: string | undefined | null): string =>
  formatJapanCalendarDateLabel(dateStr)

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
  existingEvents?: Array<{ storeId: string; date: string; startTime: string; endTime: string; scenario: string }>
}

interface GMResponse {
  gm_id: string
  gm_name: string
  response_status: 'available' | 'unavailable' | string
  available_candidates: number[]
  avatar_color?: string | null
  responded_at?: string | null
}

interface Store {
  id: string
  name: string
  short_name?: string
  region?: string
}

interface GMSelectOption {
  gm: { id: string; name?: string }
  isGMDisabled: boolean
  label: string
}

interface CandidateDateSelectorProps {
  candidates: Candidate[]
  selectedCandidateOrder: number | null
  selectedStoreId: string
  selectedGMId: string
  selectedSubGmId?: string
  conflictInfo: ConflictInfo
  onSelectCandidate: (order: number) => void
  onSelectStore: (storeId: string) => void
  onSelectGM: (gmId: string) => void
  onSelectSubGM?: (gmId: string) => void
  gmSelectOptions: GMSelectOption[]
  stores: Store[]
  requiredGmCount?: number
  gmSelectedCandidates?: number[]
  gmResponses?: GMResponse[]
  isReadOnly?: boolean
  isConfirmed?: boolean
}

const COLOR_MAP: Record<string, string> = {
  '#EFF6FF': '#2563EB', '#F0FDF4': '#16A34A',
  '#FFFBEB': '#D97706', '#FEF2F2': '#DC2626',
  '#F5F3FF': '#7C3AED', '#FDF2F8': '#DB2777',
  '#ECFEFF': '#0891B2', '#F7FEE7': '#65A30D',
}

const getGMBadgeStyle = (avatarColor?: string | null, name?: string) => {
  if (avatarColor && COLOR_MAP[avatarColor]) {
    return { bgColor: avatarColor, textColor: COLOR_MAP[avatarColor] }
  }
  const COLORS = ['#2563EB','#16A34A','#D97706','#DC2626','#7C3AED','#DB2777','#0891B2','#65A30D']
  const BGS   = ['#EFF6FF','#F0FDF4','#FFFBEB','#FEF2F2','#F5F3FF','#FDF2F8','#ECFEFF','#F7FEE7']
  const h = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return { bgColor: BGS[h % COLORS.length], textColor: COLORS[h % COLORS.length] }
}

const getShortName = (name: string) => name?.length <= 2 ? name : name?.slice(0, 2)

const normalizeTimeSlot = (ts: string) => {
  if (['午前','午後','夜'].includes(ts)) return ts
  if (ts.includes('朝') || ts.includes('午前')) return '午前'
  if (ts.includes('昼') || ts.includes('午後')) return '午後'
  if (ts.includes('夜')) return '夜'
  return ts
}

export const CandidateDateSelector = ({
  candidates,
  selectedCandidateOrder,
  selectedStoreId,
  selectedGMId,
  selectedSubGmId = '',
  conflictInfo,
  onSelectCandidate,
  onSelectStore,
  onSelectGM,
  onSelectSubGM,
  gmSelectOptions,
  stores = [],
  requiredGmCount = 1,
  gmSelectedCandidates,
  gmResponses = [],
  isReadOnly = false,
  isConfirmed = false,
}: CandidateDateSelectorProps) => {

  const getAvailableStores = (candidate: Candidate) => {
    const norm = normalizeTimeSlot(candidate.timeSlot)
    return stores.filter(s => !conflictInfo.storeDateConflicts.has(`${s.id}-${candidate.date}-${norm}`))
  }

  const getAvailableGMsForCandidate = (candidate: Candidate) =>
    gmResponses.filter(gm => isGmAvailableForCandidate(gm, candidate.order - 1))

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-800">
        <Calendar className="w-4 h-4" />
        開催日時を選択
      </h3>
      <div className="space-y-1.5">
        {candidates.map((candidate) => {
          const isSelected = selectedCandidateOrder === candidate.order
          const availableStores = getAvailableStores(candidate)
          const availableGMs = getAvailableGMsForCandidate(candidate)
          const hasNoStore = stores.length > 0 && availableStores.length === 0
          const isDisabled = hasNoStore || (isReadOnly && !isSelected)

          // 選択中候補で使えるGMオプション（available_candidatesにこの候補が含まれるもの）
          const filteredGMOptions = gmSelectOptions.filter(({ gm }) =>
            availableGMs.some(ag => String(ag.gm_id) === String(gm.id))
          )
          // 使えるGMがいない場合は全GMを表示（未回答GMも含む）
          const gmOptionsToShow = filteredGMOptions.length > 0 ? filteredGMOptions : gmSelectOptions

          return (
            <div key={candidate.order}>
              {/* ── 候補行 ── */}
              <div
                onClick={() => !isDisabled && !isReadOnly && onSelectCandidate(candidate.order)}
                className={`flex items-center gap-2 px-3 py-2 rounded border transition-all text-sm ${
                  hasNoStore
                    ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                    : isDisabled
                    ? 'bg-gray-50 border-gray-200 cursor-default opacity-50'
                    : isSelected && isConfirmed
                    ? 'border-green-400 bg-green-50 cursor-default'
                    : isSelected
                    ? 'border-purple-400 bg-purple-50 cursor-pointer'
                    : 'border-gray-200 bg-background hover:border-purple-300 cursor-pointer'
                }`}
              >
                {/* ラジオ */}
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  hasNoStore ? 'border-red-400 bg-red-400'
                  : isSelected && isConfirmed ? 'border-green-500 bg-green-500'
                  : isSelected ? 'border-purple-500 bg-purple-500'
                  : 'border-gray-300'
                }`}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>

                {/* 日付・時間 */}
                <span className="font-medium whitespace-nowrap">{formatCandidateDate(candidate.date)}</span>
                <span className="text-muted-foreground whitespace-nowrap text-xs">{candidate.timeSlot} {candidate.startTime}–{candidate.endTime}</span>

                {/* 対応可能GM */}
                {availableGMs.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {availableGMs.map(gm => {
                      const c = getGMBadgeStyle(gm.avatar_color, gm.gm_name)
                      return (
                        <span key={gm.gm_id}
                          className="text-xs px-1.5 py-0.5 rounded border font-medium"
                          style={{ backgroundColor: c.bgColor, color: c.textColor, borderColor: c.textColor + '40' }}
                        >
                          {getShortName(gm.gm_name)}
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* 空き店舗 */}
                <div className="flex items-center gap-1 flex-wrap ml-auto">
                  {hasNoStore
                    ? <span className="text-xs text-red-500">空き店舗なし</span>
                    : availableStores.length === stores.length
                    ? <span className="text-xs text-gray-400">全店舗空き</span>
                    : availableStores.slice(0, 3).map(s => (
                        <span key={s.id} className="text-xs px-1 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                          {s.short_name || s.name}
                        </span>
                      ))
                  }
                  {availableStores.length > 3 && stores.length !== availableStores.length && (
                    <span className="text-xs text-gray-400">+{availableStores.length - 3}</span>
                  )}
                </div>
              </div>

              {/* ── 選択時：店舗・GMプルダウン ── */}
              {isSelected && !isReadOnly && (
                <div className="mx-1 px-3 py-3 border border-t-0 border-purple-200 rounded-b-md bg-purple-50/60 space-y-2">
                  {/* 店舗 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-700 font-medium shrink-0 w-12">店舗</span>
                    <select
                      className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
                      value={selectedStoreId}
                      onChange={e => onSelectStore(e.target.value)}
                    >
                      <option value="">選択してください</option>
                      {availableStores.map(s => {
                        const reqStores = [] as string[] // requestedStores は親から渡す必要があるが簡略化
                        const ev = (conflictInfo.existingEvents || []).find(e =>
                          e.storeId === s.id && e.date === candidate.date &&
                          candidate.startTime < e.endTime && candidate.endTime > e.startTime
                        )
                        return (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.region ? ` (${s.region})` : ''}{ev ? ` ⚠️${ev.scenario}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {/* GM（メイン） */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-700 font-medium shrink-0 w-12">
                      {requiredGmCount >= 2 ? 'メインGM' : 'GM'}
                    </span>
                    <select
                      className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
                      value={selectedGMId}
                      onChange={e => {
                        onSelectGM(e.target.value)
                        if (selectedSubGmId === e.target.value) onSelectSubGM?.('')
                      }}
                    >
                      <option value="">選択してください</option>
                      {gmOptionsToShow.map(({ gm, isGMDisabled, label }) => (
                        <option key={gm.id} value={gm.id}
                          disabled={isGMDisabled || (requiredGmCount >= 2 && gm.id === selectedSubGmId)}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* サブGM（2GM以上のシナリオ） */}
                  {requiredGmCount >= 2 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-purple-700 font-medium shrink-0 w-12">サブGM</span>
                      <select
                        className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
                        value={selectedSubGmId}
                        onChange={e => onSelectSubGM?.(e.target.value)}
                      >
                        <option value="">選択してください</option>
                        {gmOptionsToShow.map(({ gm, isGMDisabled, label }) => (
                          <option key={gm.id} value={gm.id}
                            disabled={isGMDisabled || gm.id === selectedGMId}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {filteredGMOptions.length === 0 && gmResponses.length > 0 && (
                    <p className="text-xs text-amber-600">⚠️ この日時に対応可能と回答したGMがいません</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
