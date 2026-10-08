/**
 * 貸切グループのチャット表示の見出し（戻る・作品・参加人数と進み具合・招待・日程・設定）。index.tsx から見た目を変えずに切り出したもの。
 */
import type { ReactNode } from 'react'
import { ArrowLeft, UserPlus, Calendar, Settings } from 'lucide-react'
import type { NavigateFunction } from 'react-router-dom'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>

export function ChatModeHeader({ scenario, memberCount, isScheduleConfirmedUi, group, completedSteps, confirmedByName, isOrganizer, navigate, openSheet, actionsMenu }: {
  scenario: { id?: string; slug?: string; title?: string; key_visual_url?: string } | undefined
  memberCount: number
  isScheduleConfirmedUi: boolean
  group: GroupType
  completedSteps: number
  confirmedByName: string | null | undefined
  isOrganizer: boolean | null | undefined
  navigate: NavigateFunction
  openSheet: (name: string) => void
  /** 主催者の「操作」メニュー（歯車）。あれば設定シートの代わりにこれを出す */
  actionsMenu?: ReactNode
}) {
  return (
    <div className="shrink-0 border-b lg:border lg:rounded-t-lg bg-white">
      <div className="flex items-center gap-3 px-4 py-2">
        <button 
          onClick={() => navigate('/mypage')}
          className="p-1.5 hover:bg-gray-100 rounded"
          aria-label="マイページに戻る"
          title="マイページに戻る"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        {scenario?.key_visual_url && (
          <img
            src={scenario.key_visual_url}
            alt={scenario.title || ''}
            className="w-8 h-8 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
          />
        )}
        <div className="flex-1 min-w-0">
          <h2 
            className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors"
            onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
          >
            {scenario?.title || 'グループチャット'}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{memberCount}名参加</span>
            <span>•</span>
            <span className={isScheduleConfirmedUi ? 'text-green-600' : group.status === 'booking_requested' ? 'text-blue-600' : ''}>
              {isScheduleConfirmedUi ? '確定' : group.status === 'booking_requested' ? '確定待ち' : `進捗 ${completedSteps}/5`}
            </span>
            {isScheduleConfirmedUi && confirmedByName && (
              <>
                <span>•</span>
                <span className="text-green-600">承認: {confirmedByName}</span>
              </>
            )}
          </div>
        </div>
      {isOrganizer && (
        <button
          onClick={() => openSheet('invite')}
          className="p-1.5 hover:bg-gray-100 rounded"
          aria-label="メンバーを招待"
          title="メンバーを招待"
        >
          <UserPlus className="w-5 h-5 text-gray-600" />
        </button>
      )}
        {/* 日程シートを開く */}
      <button
        onClick={() => openSheet('dates')}
        className="p-1.5 hover:bg-gray-100 rounded relative"
      >
        <Calendar className="w-5 h-5 text-gray-600" />
        {(group.candidate_dates?.length || 0) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-purple-600 text-white text-[10px] rounded-full flex items-center justify-center">
            {group.candidate_dates?.length}
          </span>
        )}
      </button>
      {/* 設定（主催者は「操作」メニュー、メンバーは設定シート） */}
      {actionsMenu ?? (
      <button 
        onClick={() => openSheet('settings')}
        className="p-1.5 hover:bg-gray-100 rounded"
        aria-label="グループ設定"
        title="グループ設定"
      >
        <Settings className="w-5 h-5 text-gray-600" />
      </button>
      )}
    </div>
        </div>
  )
}
