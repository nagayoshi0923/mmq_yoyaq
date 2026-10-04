/**
 * 貸切グループの招待画面の「貸切予約の進捗」（参加済みメンバー向け）。GroupInviteView.tsx から見た目を変えずに切り出したもの。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, MessageCircle } from 'lucide-react'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
type GroupMember = NonNullable<GroupType['members']>[number]

export function InviteProgressCard({ group, joinedMembers, allMembersResponded, bookingProgressReady, hasCharacters, isScheduleConfirmedUi, confirmedByName, setActiveTab }: {
  group: GroupType
  joinedMembers: GroupMember[]
  allMembersResponded: boolean
  bookingProgressReady: boolean
  hasCharacters: boolean | undefined
  isScheduleConfirmedUi: boolean
  confirmedByName: string | null | undefined
  setActiveTab: (tab: string) => void
}) {
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="space-y-1 mb-3">
          <h3 className="font-semibold text-sm text-gray-700">貸切予約の進捗</h3>
          {group.status === 'gathering' && (
            <div className="text-xs text-muted-foreground">
              申込準備中（{[joinedMembers.length >= 1, (group.candidate_dates?.length || 0) > 0, allMembersResponded].filter(Boolean).length}/3 完了）
            </div>
          )}
          {group.status === 'booking_requested' && !isScheduleConfirmedUi && (
            <div className="text-xs text-blue-600 font-medium">日程確定待ち</div>
          )}
          {isScheduleConfirmedUi && (
            <div className="text-xs text-green-600 font-medium">公演日まであと少し！</div>
          )}
        </div>

        <div className="space-y-2">
          {/* STEP 1: メンバー招待（1名以上または申込済みで完了） */}
          <div className={`flex items-center gap-3 p-2 rounded-lg border ${
            group.status !== 'gathering' || joinedMembers.length >= 1 
              ? 'bg-green-50 border-green-200' 
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              group.status !== 'gathering' || joinedMembers.length >= 1 
                ? 'bg-green-600 text-white' 
                : 'bg-amber-500 text-white'
            }`}>
              {group.status !== 'gathering' || joinedMembers.length >= 1 ? <Check className="w-3 h-3" /> : '1'}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm">メンバーを招待</span>
              <span className="text-xs text-muted-foreground ml-2">{joinedMembers.length}名</span>
            </div>
          </div>

          {/* STEP 2: 候補日追加 */}
          <div className={`flex items-center gap-3 p-2 rounded-lg border ${
            group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 
              ? 'bg-green-50 border-green-200' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-400 text-white'
            }`}>
              {group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 ? <Check className="w-3 h-3" /> : '2'}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm">候補日を追加</span>
              <span className="text-xs text-muted-foreground ml-2">{group.candidate_dates?.length || 0}件</span>
            </div>
          </div>

          {/* STEP 3: 日程回答待ち */}
          <div className={`flex items-center gap-3 p-2 rounded-lg border ${
            group.status !== 'gathering' || allMembersResponded 
              ? 'bg-green-50 border-green-200' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              group.status !== 'gathering' || allMembersResponded 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-400 text-white'
            }`}>
              {group.status !== 'gathering' || allMembersResponded ? <Check className="w-3 h-3" /> : '3'}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm">日程回答を集める</span>
              <span className="text-xs text-muted-foreground ml-2">
                {group.status !== 'gathering' 
                  ? '完了' 
                  : `${joinedMembers.filter(m => group.candidate_dates?.every(cd => cd.responses?.some(r => r.member_id === m.id))).length}/${joinedMembers.length}名`}
              </span>
            </div>
          </div>

          {/* STEP 4: 予約申込 */}
          <div className={`flex items-center gap-3 p-2 rounded-lg border ${
            group.status === 'booking_requested' || group.status === 'confirmed'
              ? 'bg-green-50 border-green-200' 
              : (group.status === 'gathering' || group.status === 'date_adjusting') && bookingProgressReady
                ? 'bg-purple-50 border-purple-200'
                : 'bg-gray-50 border-gray-200'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              group.status === 'booking_requested' || group.status === 'confirmed'
                ? 'bg-green-600 text-white' 
                : (group.status === 'gathering' || group.status === 'date_adjusting') && bookingProgressReady
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-400 text-white'
            }`}>
              {group.status === 'booking_requested' || group.status === 'confirmed' ? <Check className="w-3 h-3" /> : '4'}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm">貸切を申し込む</span>
              <span className="text-xs text-muted-foreground ml-2">
                {group.status === 'booking_requested' || group.status === 'confirmed'
                  ? '申込完了' 
                  : bookingProgressReady ? '申込可能！' : '調整中'}
              </span>
            </div>
          </div>

          {/* STEP 5: 日程確定 */}
          <div className={`flex items-center gap-3 p-2 rounded-lg border ${
            isScheduleConfirmedUi
              ? 'bg-green-50 border-green-200' 
              : group.status === 'booking_requested'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-gray-50 border-gray-200'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              isScheduleConfirmedUi
                ? 'bg-green-600 text-white' 
                : group.status === 'booking_requested'
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-gray-400 text-white'
            }`}>
              {isScheduleConfirmedUi ? <Check className="w-3 h-3" /> : '5'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm">日程確定</span>
                <span className="text-xs text-muted-foreground">
                  {isScheduleConfirmedUi
                    ? '確定！' 
                    : group.status === 'booking_requested'
                      ? '連絡待ち'
                      : '申込後'}
                </span>
              </div>
              {isScheduleConfirmedUi && confirmedByName && (
                <div className="text-xs text-green-700">
                  承認者: {confirmedByName}
                </div>
              )}
            </div>
          </div>

          {/* STEP 6: 事前アンケート */}
          {hasCharacters && (
            <div className={`flex items-center gap-3 p-2 rounded-lg border ${
              isScheduleConfirmedUi
                ? 'bg-amber-50 border-amber-200'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                isScheduleConfirmedUi
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-400 text-white'
              }`}>
                6
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm">事前アンケート</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {isScheduleConfirmedUi ? '回答してください' : '確定後'}
                </span>
              </div>
            </div>
          )}

          {/* STEP 7: 配役確定 */}
          {hasCharacters && (
            <div className="flex items-center gap-3 p-2 rounded-lg border bg-gray-50 border-gray-200">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-400 text-white">
                7
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm">配役確定</span>
                <span className="text-xs text-muted-foreground ml-2">アンケート後</span>
              </div>
            </div>
          )}
        </div>
        
        {/* チャットを開くボタン */}
        <Button
          onClick={() => setActiveTab('chat')}
          className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          チャットを開く
        </Button>
      </CardContent>
    </Card>
  )
}
