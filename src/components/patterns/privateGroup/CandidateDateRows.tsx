/**
 * 貸切グループの候補日の一覧（日付・時間帯・○△× の集計・取り下げボタン・自分の回答ボタン）。
 * グループ画面の「日程・進捗」シートとマイページの「候補日を追加・編集」「日程に回答する」で共通。
 * GroupChatSheetPanels.tsx（DatesSheet）から見た目を変えずに切り出したもの。
 */
import { WithdrawCandidateButton } from '@/pages/PrivateGroupInvite/components/WithdrawCandidateButton'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'
import type { DateResponse, PrivateGroupCandidateDate } from '@/types'

type CandidateWithResponses = PrivateGroupCandidateDate & {
  responses?: Array<{ member_id: string; response: DateResponse }> | null
}

export interface CandidateDateRowsProps {
  group: { id: string; status: string; candidate_dates?: CandidateWithResponses[] | null }
  /** 参加中の人数（回答数の分母） */
  memberCount: number
  /** 自分のメンバー ID。あれば（日程調整中は）○△× の回答ボタンを出す */
  existingMemberId: string | null
  responses: Record<string, DateResponse | null>
  onResponseChange: (candidateDateId: string, response: DateResponse) => void
  /** 候補日の取り下げボタンを出すか（主催者・店舗への申込前） */
  canWithdraw: boolean
  onWithdrawn: () => unknown | Promise<unknown>
  formatDateJaMd: (dateStr: string) => string
}

export function CandidateDateRows({ group, memberCount, existingMemberId, responses, onResponseChange, canWithdraw, onWithdrawn, formatDateJaMd }: CandidateDateRowsProps) {
  return (
    <div className="space-y-1.5">
      {group.candidate_dates && group.candidate_dates.length > 0 ? (
        group.candidate_dates.map((cd, index) => {
          const currentResponse = responses[cd.id]
          const dateResponses = cd.responses || []
          const okCount = dateResponses.filter(r => r.response === 'ok').length
          const maybeCount = dateResponses.filter(r => r.response === 'maybe').length
          const ngCount = dateResponses.filter(r => r.response === 'ng').length
          const totalMembers = memberCount
          const respondedCount = dateResponses.length
          const isRejected = cd.status === 'rejected'
          const showResponseRow = existingMemberId && group.status === 'gathering' && !isRejected
          
          return (
            <div 
              key={cd.id} 
              className={`px-2 py-1.5 rounded-md ${isRejected ? 'bg-gray-100/90 opacity-70' : 'bg-gray-50'}`}
            >
              <div className={`flex items-center gap-2 ${showResponseRow ? 'mb-1.5' : ''}`}>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isRejected ? (
                      <span className="text-[10px] leading-none bg-red-100 text-red-700 px-1 py-0.5 rounded shrink-0">
                        却下
                      </span>
                    ) : (
                      <span className="text-[10px] leading-none bg-purple-100 text-purple-700 px-1 py-0.5 rounded shrink-0">
                        {index + 1}
                      </span>
                    )}
                    <span className={`font-medium text-xs ${isRejected ? 'line-through text-muted-foreground' : ''}`}>
                      {formatDateJaMd(cd.date)}
                    </span>
                  </div>
                  <div className={`text-[10px] text-muted-foreground mt-0.5 ${isRejected ? 'line-through' : ''}`}>
                    {candidateTimeSlotFromDb(cd.time_slot)} {cd.start_time} - {cd.end_time}
                  </div>
                </div>
                {canWithdraw && !isRejected && (
                  <WithdrawCandidateButton groupId={group.id} candidate={cd} onWithdrawn={onWithdrawn} />
                )}
                {/* 回答状況サマリー（却下された場合は非表示） */}
                {!isRejected && (
                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-0.5 text-[10px]">
                      <span className="text-green-600">○{okCount}</span>
                      <span className="text-amber-600">△{maybeCount}</span>
                      <span className="text-red-600">×{ngCount}</span>
                    </div>
                    <div className="text-[9px] text-muted-foreground leading-none mt-0.5">
                      {respondedCount}/{totalMembers}人
                    </div>
                  </div>
                )}
              </div>
              {/* 回答ボタン（日程申込前かつ却下されていない場合のみ表示） */}
              {showResponseRow && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onResponseChange(cd.id, 'ok')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      currentResponse === 'ok'
                        ? 'bg-green-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-green-50'
                    }`}
                  >
                    ○ OK
                  </button>
                  <button
                    onClick={() => onResponseChange(cd.id, 'maybe')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      currentResponse === 'maybe'
                        ? 'bg-amber-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-amber-50'
                    }`}
                  >
                    △ 微妙
                  </button>
                  <button
                    onClick={() => onResponseChange(cd.id, 'ng')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      currentResponse === 'ng'
                        ? 'bg-red-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-red-50'
                    }`}
                  >
                    × NG
                  </button>
                </div>
              )}
            </div>
          )
        })
      ) : (
        <div className="text-center text-muted-foreground py-6 text-sm">
          候補日がまだ追加されていません
        </div>
      )}
    </div>
  )
}
