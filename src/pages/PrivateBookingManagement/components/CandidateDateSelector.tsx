import { Calendar, Clock, XCircle, CheckCircle2, MapPin } from 'lucide-react'
import { logger } from '@/utils/logger'

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
    logger.error('Invalid date string:', dateStr)
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

interface GMResponse {
  gm_id: string
  gm_name: string
  response_status: 'available' | 'unavailable' | string
  available_candidates: number[] // 0始まりのインデックス
  avatar_color?: string | null
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
      <div className="space-y-2">
        {candidates.map((candidate) => {
          const isSelected = selectedCandidateOrder === candidate.order
          // GMが選択した候補かどうか
          const isGMSelected = gmSelectedCandidates && gmSelectedCandidates.includes(candidate.order)

          // この日時に競合があるかチェック
          // 空き店舗があるかどうかで判定（選択店舗ではなく全体の空き状況）
          const availableStoresForCandidate = getAvailableStores(candidate)
          const hasNoAvailableStore = stores.length > 0 && availableStoresForCandidate.length === 0
          
          // 選択されたGMの競合チェック
          const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${candidate.timeSlot}` : null
          const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
          
          // 空き店舗がない場合のみ競合とみなす
          const hasConflict = hasNoAvailableStore

          // 閲覧専用モード（確定済み）で未選択の候補はdisabled表示
          const isDisabledInReadOnlyMode = isReadOnly && !isSelected
          // 確定済みかつ選択された候補は緑色で表示
          const isConfirmedAndSelected = isConfirmed && isSelected

          return (
            <div
              key={candidate.order}
              onClick={() => !hasConflict && !isReadOnly && onSelectCandidate(candidate.order)}
              className={`flex items-center gap-3 p-3 rounded border-2 transition-all ${
                hasConflict
                  ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                  : isDisabledInReadOnlyMode
                  ? 'bg-gray-50 border-gray-200 cursor-default opacity-60'
                  : isConfirmedAndSelected
                  ? 'border-green-500 bg-green-50 cursor-default'
                  : isSelected
                  ? 'border-purple-500 bg-purple-50 cursor-pointer'
                  : 'border-gray-200 bg-background hover:border-purple-300 cursor-pointer'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                hasConflict
                  ? 'border-red-500 bg-red-500'
                  : isConfirmedAndSelected
                  ? 'border-green-500 bg-green-500'
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">候補{candidate.order}</span>
                  {/* この候補に対応可能なGMのバッジを表示 */}
                  {gmResponses.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {gmResponses
                        .filter(gm => 
                          gm.response_status === 'available' && 
                          gm.available_candidates?.includes(candidate.order - 1) // 0始まり
                        )
                        .map((gm) => {
                          const colors = getGMBadgeStyle(gm.avatar_color, gm.gm_name)
                          return (
                            <span
                              key={gm.gm_id}
                              className="text-xs px-1.5 py-0.5 rounded border font-medium"
                              style={{ 
                                backgroundColor: colors.bgColor, 
                                color: colors.textColor,
                                borderColor: colors.textColor + '40' // 25% opacity
                              }}
                              title={`GM: ${gm.gm_name}`}
                            >
                              {getShortName(gm.gm_name)}
                            </span>
                          )
                        })
                      }
                      {gmResponses.filter(gm => 
                        gm.response_status === 'available' && 
                        gm.available_candidates?.includes(candidate.order - 1)
                      ).length === 0 && (
                        <span className="text-xs text-gray-400">GM回答なし</span>
                      )}
                    </div>
                  )}
                </div>
                {/* 空き店舗の表示 */}
                {stores.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <MapPin className="w-3 h-3 text-gray-400" />
                    {availableStoresForCandidate.length === 0 ? (
                      <span className="text-xs text-red-500">空き店舗なし</span>
                    ) : availableStoresForCandidate.length === stores.length ? (
                      <span className="text-xs text-green-600">全店舗空き</span>
                    ) : (
                      availableStoresForCandidate.map(store => (
                        <span
                          key={store.id}
                          className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200"
                          title={store.name}
                        >
                          {store.short_name || store.name}
                        </span>
                      ))
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
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
                    空き店舗なし
                  </div>
                )}
                {!hasConflict && hasGMConflict && (
                  <div className="text-xs text-orange-600 mt-1">
                    選択中のGMに予定あり（他のGMを選択可能）
                  </div>
                )}
                {isSelected && !isGMSelected && gmSelectedCandidates && gmSelectedCandidates.length > 0 && (
                  <div className="text-xs text-orange-600 mt-1">
                    ⚠️ GMが未回答の候補です
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

