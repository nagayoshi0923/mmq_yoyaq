import { Clock, UserCog, Users } from 'lucide-react'
import { computeCategoryFee } from '../fee'
import type { EventFormData, ScheduleEvent } from '@/types/schedule'
import type { Scenario } from '@/types'

interface PerformanceSummaryProps {
  formData: EventFormData
  scenarios: Scenario[]
  staffParticipantsFromDB: string[]
  CATEGORY_TONE: Record<string, { bg: string; section: string; border: string }>
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null
  localCurrentParticipants: number
}

/** 公演情報サマリー（ヘッダー右上）。PerformanceModal の renderPerformanceSummary から逐語抽出（presentational・挙動不変） */
export function PerformanceSummary({
  formData,
  scenarios,
  staffParticipantsFromDB,
  CATEGORY_TONE,
  mode,
  event,
  localCurrentParticipants,
}: PerformanceSummaryProps) {
    const category = formData.category

    const selectedScenario = formData.scenario ? scenarios.find(s => s.title === formData.scenario) : null
    // カテゴリ別の料金サマリーは純関数へ抽出（performanceModal/fee）
    const categoryFee = computeCategoryFee(category, selectedScenario, {
      venueRentalFee: formData.venue_rental_fee,
      maxParticipants: formData.max_participants,
    })
    const hasGms = formData.gms && formData.gms.length > 0
    const CATEGORY_LABEL_MAP: Record<string, string> = {
      open: 'オープン', private: '貸切', offsite: '出張', testplay: 'テストプレイ',
      gmtest: 'GMテスト', venue_rental: '場所貸し', venue_rental_free: '場所貸無料',
      package: 'パッケージ', mtg: 'MTG', memo: 'メモ',
    }
    const categoryLabel = CATEGORY_LABEL_MAP[category] || category
    const tone = CATEGORY_TONE[category]

    const getRoleBadge = (name: string): { label: string; bg: string; text: string } => {
      const role = formData.gmRoles?.[name] || 'main'
      if (role === 'observer') return { label: '見学', bg: '#e0e7ff', text: '#3730a3' }
      if (role === 'reception') return { label: '受付', bg: '#ffedd5', text: '#9a3412' }
      if (role === 'staff') {
        const isBacked = staffParticipantsFromDB.includes(name)
        return { label: isBacked ? '参加' : '参加予定', bg: '#dcfce7', text: '#166534' }
      }
      if (role === 'sub') return { label: 'サブ', bg: '#dbeafe', text: '#1e40af' }
      // main: カテゴリ色 (CATEGORY_TONE) を使用
      return { label: 'メイン', bg: tone?.section ?? '#f3f4f6', text: '#1f2937' }
    }

    const categoryBadge = categoryLabel ? (
      <span
        className="inline-flex items-center shrink-0 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm whitespace-nowrap"
        style={tone ? { backgroundColor: tone.border, color: '#1f2937' } : { backgroundColor: '#f3f4f6', color: '#374151' }}
      >
        {categoryLabel}
      </span>
    ) : null

    const gmList = hasGms ? (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {formData.gms.map((name, idx) => {
          const badge = getRoleBadge(name)
          return (
            <span
              key={`${name}-${idx}`}
              className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: badge.bg, color: badge.text }}
              title={badge.label}
            >
              {name}
            </span>
          )
        })}
      </span>
    ) : null

    if (selectedScenario) {
      const playerMax = selectedScenario.player_count_max || formData.max_participants || 8
      const showParticipants = mode === 'edit' && event && !event.is_private_request && !event.is_private_booking
      return (
        <div className="flex flex-col items-end gap-1 min-w-0 max-w-[260px] sm:max-w-[340px]">
          <div className="flex items-center gap-2 min-w-0 w-full justify-end text-xs">
            {categoryBadge}
            <span className="font-semibold truncate min-w-0" title={selectedScenario.title}>{selectedScenario.title}</span>
            {categoryFee && (
              <span className="shrink-0 font-bold whitespace-nowrap pl-2 border-l border-muted-foreground/20">
                {categoryFee.fee}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground justify-end w-full">
            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{selectedScenario.duration}h</span>
            <span className="flex items-center gap-0.5">
              <Users className="w-3 h-3" />
              {showParticipants ? `${localCurrentParticipants}/${playerMax}` : `最大${playerMax}`}
            </span>
            {gmList && (<span className="flex items-center gap-1"><UserCog className="w-3 h-3" />{gmList}</span>)}
          </div>
        </div>
      )
    }

    if (categoryFee || hasGms || categoryLabel) {
      return (
        <div className="flex items-center gap-2 flex-wrap text-[11px] sm:text-xs justify-end max-w-[260px] sm:max-w-[320px]">
          {categoryBadge}
          {categoryFee && <span className="text-xs font-bold pl-2 border-l border-muted-foreground/20">{categoryFee.fee}</span>}
          {gmList && (
            <span className="flex items-center gap-1 ml-1">
              <UserCog className="w-3 h-3 text-muted-foreground" />
              {gmList}
            </span>
          )}
        </div>
      )
    }
    return null
}
