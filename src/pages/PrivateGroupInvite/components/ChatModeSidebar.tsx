/**
 * 貸切グループのチャット表示の PC 用サイドバー（進捗・希望店舗・候補日程・メンバー・主催者の操作）。
 * 招待画面（index.tsx）から見た目を変えずに切り出したもの。
 */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Circle, UserPlus, Users } from 'lucide-react'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
type GroupMember = NonNullable<GroupType['members']>[number]

export interface ChatModeSidebarProps {
  group: GroupType
  joinedMembers: GroupMember[]
  allMembersResponded: boolean
  isScheduleConfirmedUi: boolean
  confirmedByName: string | null | undefined
  isOrganizer: boolean
  canMutateScheduleBeforeStoreReply: boolean
  preferredStoreNames: Array<{ id: string; name: string }>
  formatDateJaMd: (dateStr: string) => string
  openStoreEditSheet: () => void
  onShowAllDates: () => void
  onOpenInvite: () => void
  handleOpenBookingDialog: () => void
  /** 「申込内容」の箱（返事待ち・確定後のみ中身が出る） */
  bookingSummary: ReactNode
}

export function ChatModeSidebar({
  group, joinedMembers, allMembersResponded, isScheduleConfirmedUi, confirmedByName, isOrganizer,
  canMutateScheduleBeforeStoreReply, preferredStoreNames, formatDateJaMd, openStoreEditSheet,
  onShowAllDates, onOpenInvite, handleOpenBookingDialog, bookingSummary,
}: ChatModeSidebarProps) {
  return (
    <div className="hidden lg:block w-80 border-l bg-gray-50 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* 進捗ステップ */}
        <div className="bg-white rounded-lg p-3 border">
          <h3 className="font-semibold text-sm mb-2">進捗</h3>
          <div className="space-y-1.5">
            {/* メンバー招待: 1名以上または申込済みなら完了 */}
            <div className={`flex items-center gap-2 text-xs ${joinedMembers.length >= 1 || group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
              {joinedMembers.length >= 1 || group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              メンバー招待 ({joinedMembers.length}名)
            </div>
            <div className={`flex items-center gap-2 text-xs ${(group.candidate_dates?.length || 0) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
              {(group.candidate_dates?.length || 0) > 0 ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              候補日追加 ({group.candidate_dates?.length || 0}件)
            </div>
            {/* 日程回答: 全員回答済み、または申込済みなら完了 */}
            <div className={`flex items-center gap-2 text-xs ${allMembersResponded || group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
              {allMembersResponded || group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              日程回答
            </div>
            <div className={`flex items-center gap-2 text-xs ${group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
              {group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              予約申込
            </div>
            <div className={`flex items-center gap-2 text-xs ${isScheduleConfirmedUi ? 'text-green-600' : 'text-gray-500'}`}>
              {isScheduleConfirmedUi ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              日程確定
              {isScheduleConfirmedUi && confirmedByName && (
                <span className="text-green-700">（{confirmedByName}）</span>
              )}
            </div>
          </div>
        </div>

        {/* 申込内容（返事待ち・確定後） */}
        {bookingSummary}

        {/* 希望店舗 */}
        <div className="bg-white rounded-lg p-3 border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">希望店舗</h3>
            {isOrganizer && canMutateScheduleBeforeStoreReply && (
              <button
                onClick={openStoreEditSheet}
                className="text-xs text-purple-600 hover:underline"
              >
                編集
              </button>
            )}
          </div>
          {preferredStoreNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {preferredStoreNames.map(store => (
                <span
                  key={store.id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs"
                >
                  {store.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">未設定</p>
          )}
        </div>

        {/* 候補日程 */}
        {group.candidate_dates && group.candidate_dates.length > 0 && (
          <div className="bg-white rounded-lg p-3 border">
            <h3 className="font-semibold text-sm mb-2">{group.confirmed_performance ? '申請時の候補日程（履歴）' : '候補日程'}</h3>
            <div className="space-y-2">
              {group.candidate_dates.slice(0, 3).map((cd) => (
                <div key={cd.id} className="text-xs">
                  <div className="font-medium">{formatDateJaMd(cd.date)}</div>
                  <div className="text-muted-foreground">{candidateTimeSlotFromDb(cd.time_slot)}</div>
                </div>
              ))}
              {group.candidate_dates.length > 3 && (
                <button 
                  onClick={onShowAllDates}
                  className="text-xs text-purple-600 hover:underline"
                >
                  他{group.candidate_dates.length - 3}件を表示
                </button>
              )}
            </div>
          </div>
        )}

        {/* メンバー（クリックで管理ダイアログを開く） */}
        <div 
          className={`bg-white rounded-lg p-3 border ${isOrganizer ? 'cursor-pointer hover:border-purple-300 transition-colors' : ''}`}
          onClick={() => isOrganizer && onOpenInvite()}
        >
          <h3 className="font-semibold text-sm mb-2 flex items-center justify-between">
            <span>メンバー ({joinedMembers.length}名)</span>
            {isOrganizer && <UserPlus className="w-4 h-4 text-purple-600" />}
          </h3>
          <div className="space-y-1.5">
            {joinedMembers.slice(0, 5).map(member => (
              <div key={member.id} className="flex items-center gap-2 text-xs">
                <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                  <Users className="w-3 h-3 text-purple-600" />
                </div>
                <span className="truncate">{member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}</span>
              </div>
            ))}
            {joinedMembers.length > 5 && (
              <p className="text-xs text-muted-foreground">
                他{joinedMembers.length - 5}名
              </p>
            )}
          </div>
        </div>

        {/* 主催者向け機能（日程調整中・再調整中の両方） */}
        {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
          <div className="pt-2 border-t">
            <Button
              size="sm"
              className="w-full text-xs bg-green-600 hover:bg-green-700"
              onClick={handleOpenBookingDialog}
            >
              予約リクエストを作成
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
