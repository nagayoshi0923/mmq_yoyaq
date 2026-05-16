import { Calendar, Clock, XCircle, CheckCircle2, MapPin } from 'lucide-react'
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
}

interface GMResponse {
  gm_id: string
  gm_name: string
  response_status: 'available' | 'unavailable' | string
  available_candidates: number[] // 0始まりのインデックス
  avatar_color?: string | null
  responded_at?: string | null
}

interface Store {
  id: string
  name: string
  short_name?: string
}

interface CandidateDateSelectorProps {
  candidates: Candidate[]
  selectedCandidateOrder: number | null
  selectedStoreId: string
  selectedGMId: string
  conflictInfo: ConflictInfo
  onSelectCandidate: (order: number) => void
  gmSelectedCandidates?: number[] // GM確認済み・確定済みの場合の選択候補
  gmResponses?: GMResponse[] // 全GMの回答情報
  isReadOnly?: boolean // 閲覧専用モード（GM確認済み・確定済み）
  isConfirmed?: boolean // 確定済みフラグ（緑色表示用）
  stores?: Store[] // シナリオ対応店舗リスト（空き店舗表示用）
}

/**
 * 候補日時選択コンポーネント
 */
// GMの名前を省略形で表示（スケジュールページと同じスタイル）
const getShortName = (name: string): string => {
  if (!name) return '?'
  // 2文字以下ならそのまま
  if (name.length <= 2) return name
  // 3文字以上なら最初の2文字
  return name.slice(0, 2)
}

// avatar_color（背景色）から文字色を取得するマップ（スケジュールと同じ）
const COLOR_MAP: Record<string, string> = {
  '#EFF6FF': '#2563EB', '#F0FDF4': '#16A34A',
  '#FFFBEB': '#D97706', '#FEF2F2': '#DC2626',
  '#F5F3FF': '#7C3AED', '#FDF2F8': '#DB2777',
  '#ECFEFF': '#0891B2', '#F7FEE7': '#65A30D',
}

// スタッフの色からスタイルを取得
const getGMBadgeStyle = (avatarColor?: string | null, name?: string): { bgColor: string, textColor: string } => {
  if (avatarColor && COLOR_MAP[avatarColor]) {
    return {
      bgColor: avatarColor,
      textColor: COLOR_MAP[avatarColor]
    }
  }
  // avatar_color未設定の場合は名前からハッシュ値を計算して色を決定
  const AVATAR_TEXT_COLORS = [
    '#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'
  ]
  const AVATAR_BG_COLORS = [
    '#EFF6FF', '#F0FDF4', '#FFFBEB', '#FEF2F2', '#F5F3FF', '#FDF2F8', '#ECFEFF', '#F7FEE7'
  ]
  const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const colorIndex = hash % AVATAR_TEXT_COLORS.length
  return {
    bgColor: AVATAR_BG_COLORS[colorIndex],
    textColor: AVATAR_TEXT_COLORS[colorIndex]
  }
}

// 時間帯を正規化する関数（「夜公演」→「夜」、「朝公演」→「午前」など）
// 競合チェック時のキーと一致させる必要がある
const normalizeTimeSlot = (timeSlot: string): string => {
  // 標準ラベル（午前/午後/夜）をそのまま使用
  if (timeSlot === '午前' || timeSlot === '午後' || timeSlot === '夜') {
    return timeSlot
  }
  // 朝/昼/夜が含まれる場合は標準ラベルに変換
  if (timeSlot.includes('朝') || timeSlot.includes('午前')) return '午前'
  if (timeSlot.includes('昼') || timeSlot.includes('午後')) return '午後'
  if (timeSlot.includes('夜')) return '夜'
  // それ以外はそのまま返す
  return timeSlot
}

export const CandidateDateSelector = ({
  candidates,
  selectedCandidateOrder,
  selectedStoreId,
  selectedGMId,
  conflictInfo,
  onSelectCandidate,
  gmSelectedCandidates,
  gmResponses = [],
  isReadOnly = false,
  isConfirmed = false,
  stores = []
}: CandidateDateSelectorProps) => {
  // 候補日時に対して空き店舗を計算する関数
  const getAvailableStores = (candidate: Candidate): Store[] => {
    if (stores.length === 0) return []
    
    // 時間帯を正規化（「夜公演」→「夜」など）
    const normalizedTimeSlot = normalizeTimeSlot(candidate.timeSlot)
    
    return stores.filter(store => {
      const conflictKey = `${store.id}-${candidate.date}-${normalizedTimeSlot}`
      const hasConflict = conflictInfo.storeDateConflicts.has(conflictKey)
      return !hasConflict
    })
  }
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-800">
        <Calendar className="w-4 h-4" />
        開催日時を選択
      </h3>
      <div className="space-y-1.5">
        {candidates.map((candidate) => {
          const isSelected = selectedCandidateOrder === candidate.order
          const isGMSelected = gmSelectedCandidates && gmSelectedCandidates.includes(candidate.order)
          const availableStoresForCandidate = getAvailableStores(candidate)
          const hasNoAvailableStore = stores.length > 0 && availableStoresForCandidate.length === 0
          const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${candidate.timeSlot}` : null
          const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
          const hasConflict = hasNoAvailableStore
          const isDisabledInReadOnlyMode = isReadOnly && !isSelected
          const isConfirmedAndSelected = isConfirmed && isSelected
          const availableGMs = gmResponses.filter(gm => isGmAvailableForCandidate(gm, candidate.order - 1))

          return (
            <div
              key={candidate.order}
              onClick={() => !hasConflict && !isReadOnly && onSelectCandidate(candidate.order)}
              className={`flex items-center gap-2 px-3 py-2 rounded border transition-all text-sm ${
                hasConflict
                  ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                  : isDisabledInReadOnlyMode
                  ? 'bg-gray-50 border-gray-200 cursor-default opacity-50'
                  : isConfirmedAndSelected
                  ? 'border-green-400 bg-green-50 cursor-default'
                  : isSelected
                  ? 'border-purple-400 bg-purple-50 cursor-pointer'
                  : 'border-gray-200 bg-background hover:border-purple-300 cursor-pointer'
              }`}
            >
              {/* ラジオアイコン */}
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                hasConflict ? 'border-red-400 bg-red-400'
                : isConfirmedAndSelected ? 'border-green-500 bg-green-500'
                : isSelected ? 'border-purple-500 bg-purple-500'
                : 'border-gray-300'
              }`}>
                {hasConflict ? <XCircle className="w-3 h-3 text-white" />
                  : isSelected ? <CheckCircle2 className="w-3 h-3 text-white" />
                  : null}
              </div>

              {/* 日付・時間 */}
              <span className="font-medium whitespace-nowrap">{formatCandidateDate(candidate.date)}</span>
              <span className="text-muted-foreground whitespace-nowrap text-xs">{candidate.timeSlot} {candidate.startTime}–{candidate.endTime}</span>

              {/* GMバッジ */}
              {gmResponses.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {availableGMs.length === 0
                    ? <span className="text-xs text-gray-400">GM回答なし</span>
                    : availableGMs.map(gm => {
                        const c = getGMBadgeStyle(gm.avatar_color, gm.gm_name)
                        return (
                          <span key={gm.gm_id}
                            className="text-xs px-1.5 py-0.5 rounded border font-medium"
                            style={{ backgroundColor: c.bgColor, color: c.textColor, borderColor: c.textColor + '40' }}
                            title={gm.gm_name}
                          >
                            {getShortName(gm.gm_name)}
                          </span>
                        )
                      })
                  }
                </div>
              )}

              {/* 空き店舗 */}
              {stores.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap ml-auto">
                  <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                  {availableStoresForCandidate.length === 0
                    ? <span className="text-xs text-red-500">空き店舗なし</span>
                    : availableStoresForCandidate.length === stores.length
                    ? <span className="text-xs text-green-600">全店舗空き</span>
                    : availableStoresForCandidate.slice(0, 3).map(s => (
                        <span key={s.id} className="text-xs px-1 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 whitespace-nowrap" title={s.name}>
                          {s.short_name || s.name}
                        </span>
                      ))
                  }
                  {availableStoresForCandidate.length > 3 && (
                    <span className="text-xs text-gray-500">+{availableStoresForCandidate.length - 3}</span>
                  )}
                </div>
              )}

              {/* 警告テキスト */}
              {(hasGMConflict || (isSelected && !isGMSelected && gmSelectedCandidates?.length)) && (
                <span className="text-xs text-orange-600 whitespace-nowrap ml-1">
                  {hasGMConflict ? '⚠️ GMに予定あり' : '⚠️ GM未回答'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

