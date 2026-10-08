/**
 * 貸切グループのチャット表示のシート（候補日の回答・メンバー招待・グループ設定・希望店舗の編集・予約申請）。
 * GroupChatSheets.tsx から見た目を変えずに切り出したもの。
 */
import { WithdrawCandidateButton } from './WithdrawCandidateButton'
import { ConfirmedGroupSchedule } from './ConfirmedGroupSchedule'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Calendar, Users, CheckCircle2, Loader2, LogOut, MessageCircle, Check, Copy, ArrowLeft, Settings, MapPin, X } from 'lucide-react'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import type { GroupChatSheetsProps } from './GroupChatSheets'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'

/** 候補日の回答 のシート（GroupChatSheets から見た目を変えずに切り出し） */
export function DatesSheet(props: GroupChatSheetsProps) {
  const { group, joinedMembers, existingMemberId, responses, isOrganizer, isScheduleConfirmedUi, allMembersResponded, canMutateScheduleBeforeStoreReply, actionLoading, preferredStoreNames, refetch, formatDateJaMd, closeSheet, closeSheetReplace, openStoreEditSheet, handleResponseChange, handleOpenBookingDialog, handleSubmit, bookingSummary } = props
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={() => closeSheet()}>
      <div 
        className="absolute bottom-0 left-0 right-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl bg-white lg:bottom-4 lg:left-auto lg:right-4 lg:w-[520px] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ハンドル（モバイルのみ） */}
        <div className="flex shrink-0 justify-center py-1 lg:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        
        {/* ヘッダー */}
        <div className="flex shrink-0 items-center justify-between border-b px-3 pb-1.5 pt-0 sm:px-4 sm:pb-2">
          <h3 className="font-semibold">日程・進捗</h3>
          <button 
            onClick={() => closeSheet()}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        {/* コンテンツ（min-h-0 で子の flex / sticky が効く） */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 sm:space-y-4 sm:p-4">
          {isOrganizer && !canMutateScheduleBeforeStoreReply && (group.status === 'gathering' || group.status === 'date_adjusting') && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-snug text-amber-900">
              店舗の返答待ちのため、候補日の追加・希望店舗の変更・予約リクエストの作成はできません。
            </div>
          )}
          {/* 申込内容（返事待ち・確定後） */}
          {bookingSummary}
          {/* 進捗ステップ */}
          <div className="rounded-lg bg-gray-50 p-2 sm:p-3">
            <h4 className="mb-1 text-xs font-medium sm:text-sm">進捗状況</h4>
            <div className="grid grid-cols-5 gap-0.5 sm:gap-1">
              <div className={`rounded p-1 text-center sm:p-1.5 ${joinedMembers.length >= 1 || group.status !== 'gathering' ? 'bg-green-100' : 'bg-gray-200'}`}>
                <div className={`text-xs font-medium ${joinedMembers.length >= 1 || group.status !== 'gathering' ? 'text-green-700' : 'text-gray-500'}`}>
                  {joinedMembers.length >= 1 || group.status !== 'gathering' ? '✓' : '1'}
                </div>
                <div className="text-[10px] text-muted-foreground">招待</div>
              </div>
              <div className={`rounded p-1 text-center sm:p-1.5 ${(group.candidate_dates?.length || 0) > 0 ? 'bg-green-100' : 'bg-gray-200'}`}>
                <div className={`text-xs font-medium ${(group.candidate_dates?.length || 0) > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                  {(group.candidate_dates?.length || 0) > 0 ? '✓' : '2'}
                </div>
                <div className="text-[10px] text-muted-foreground">候補日</div>
              </div>
              <div className={`rounded p-1 text-center sm:p-1.5 ${allMembersResponded || group.status !== 'gathering' ? 'bg-green-100' : 'bg-gray-200'}`}>
                <div className={`text-xs font-medium ${allMembersResponded || group.status !== 'gathering' ? 'text-green-700' : 'text-gray-500'}`}>
                  {allMembersResponded || group.status !== 'gathering' ? '✓' : '3'}
                </div>
                <div className="text-[10px] text-muted-foreground">回答</div>
              </div>
              <div className={`rounded p-1 text-center sm:p-1.5 ${group.status !== 'gathering' ? 'bg-green-100' : 'bg-gray-200'}`}>
                <div className={`text-xs font-medium ${group.status !== 'gathering' ? 'text-green-700' : 'text-gray-500'}`}>
                  {group.status !== 'gathering' ? '✓' : '4'}
                </div>
                <div className="text-[10px] text-muted-foreground">申込</div>
              </div>
              <div className={`rounded p-1 text-center sm:p-1.5 ${isScheduleConfirmedUi ? 'bg-green-100' : 'bg-gray-200'}`}>
                <div className={`text-xs font-medium ${isScheduleConfirmedUi ? 'text-green-700' : 'text-gray-500'}`}>
                  {isScheduleConfirmedUi ? '✓' : '5'}
                </div>
                <div className="text-[10px] text-muted-foreground">確定</div>
              </div>
            </div>
          </div>

          {/* 希望店舗 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-medium sm:text-sm">希望店舗（{preferredStoreNames.length}件）</h4>
              {isOrganizer && canMutateScheduleBeforeStoreReply && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={openStoreEditSheet}
                >
                  <Settings className="mr-0.5 h-3 w-3" />
                  編集
                </Button>
              )}
            </div>
            {preferredStoreNames.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {preferredStoreNames.map(store => (
                  <span
                    key={store.id}
                    className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 sm:text-xs"
                  >
                    {store.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground sm:text-sm">店舗が指定されていません</p>
            )}
          </div>

          {/* 候補日追加 */}
          {isOrganizer && canMutateScheduleBeforeStoreReply && (
            <div className="mb-1">
              <AddCandidateDates
                groupId={group.id}
                organizationId={group.organization_id || ''}
                scenarioId={group.scenario_master_id || ''}
                storeIds={group.preferred_store_ids || []}
                existingDates={group.candidate_dates || []}
                onDatesAdded={() => {
                  refetch()
                  closeSheetReplace()
                }}
              />
            </div>
          )}

          <ConfirmedGroupSchedule group={group} />
          {/* 候補日リスト */}
          <div>
            <h4 className="font-medium text-xs sm:text-sm mb-1.5">{group.confirmed_performance ? '申請時の候補日程（履歴）' : '候補日程'}（{group.candidate_dates?.length || 0}件）</h4>
            <div className="space-y-1.5">
              {group.candidate_dates && group.candidate_dates.length > 0 ? (
                group.candidate_dates.map((cd, index) => {
                  const currentResponse = responses[cd.id]
                  const dateResponses = cd.responses || []
                  const okCount = dateResponses.filter(r => r.response === 'ok').length
                  const maybeCount = dateResponses.filter(r => r.response === 'maybe').length
                  const ngCount = dateResponses.filter(r => r.response === 'ng').length
                  const totalMembers = joinedMembers.length
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
                        {isOrganizer && canMutateScheduleBeforeStoreReply && !isRejected && (
                          <WithdrawCandidateButton groupId={group.id} candidate={cd} onWithdrawn={() => refetch()} />
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
                            onClick={() => handleResponseChange(cd.id, 'ok')}
                            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              currentResponse === 'ok'
                                ? 'bg-green-500 text-white'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-green-50'
                            }`}
                          >
                            ○ OK
                          </button>
                          <button
                            onClick={() => handleResponseChange(cd.id, 'maybe')}
                            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              currentResponse === 'maybe'
                                ? 'bg-amber-500 text-white'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-amber-50'
                            }`}
                          >
                            △ 微妙
                          </button>
                          <button
                            onClick={() => handleResponseChange(cd.id, 'ng')}
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
          </div>

          {/* メンバー */}
          <div>
            <h4 className="font-medium text-sm mb-2">メンバー（{joinedMembers.length}名）</h4>
            <div className="flex flex-wrap gap-2">
              {joinedMembers.map(member => (
                <div key={member.id} className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-full text-xs">
                  <div className="w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center">
                    <Users className="w-2.5 h-2.5 text-purple-600" />
                  </div>
                  <span>{member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}</span>
                  {member.is_organizer && <span className="text-amber-600">★</span>}
                  {member.id === existingMemberId && <span className="text-purple-600">（自分）</span>}
                </div>
              ))}
            </div>
          </div>

        </div>
        
        {/* アクションボタン */}
        <div className="p-4 border-t shrink-0 space-y-2">
          {/* 回答保存ボタン（日程申込前のみ表示） */}
          {existingMemberId && group.status === 'gathering' && Object.keys(responses).length > 0 && (
            <Button 
              onClick={async () => {
                await handleSubmit({ skipSuccessPage: true })
                closeSheetReplace()
              }}
              disabled={actionLoading}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : '回答を保存'}
            </Button>
          )}
          
          {/* 主催者向け申請ボタン（日程調整中・再調整中の両方） */}
          {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
            <Button
              onClick={() => {
                handleOpenBookingDialog()
              }}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              予約リクエストを作成
            </Button>
          )}
          
          {/* チャットに戻るボタン */}
          <Button
            variant="outline"
            onClick={() => closeSheet()}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            チャットに戻る
          </Button>
        </div>
      </div>
    </div>
  )
}

/** メンバー招待 のシート（GroupChatSheets から見た目を変えずに切り出し） */
export function InviteSheet(props: GroupChatSheetsProps) {
  const { joinedMembers, copied, getInviteUrl, closeSheet, handleRemoveMember, handleShareLine, handleCopyUrl } = props
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={() => closeSheet()}>
      <div 
        className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ハンドル（モバイルのみ） */}
        <div className="flex justify-center py-2 shrink-0 lg:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
          <h3 className="font-semibold">メンバー招待・管理</h3>
          <button 
            onClick={() => closeSheet()}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        {/* コンテンツ */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* 招待URL */}
          <div>
            <h4 className="font-medium text-sm mb-2">招待リンク</h4>
            <div className="flex gap-2">
              <Input
                value={getInviteUrl()}
                readOnly
                className="text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyUrl}
                className="shrink-0"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full gap-1.5 text-[#06C755] border-[#06C755] hover:bg-[#06C755]/10"
              onClick={handleShareLine}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              LINEで共有
            </Button>
          </div>

          {/* メンバー一覧 */}
          <div>
            <h4 className="font-medium text-sm mb-2">参加メンバー（{joinedMembers.length}名）</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {joinedMembers.map(member => (
                <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}
                      </p>
                      {member.is_organizer && (
                        <span className="text-xs text-amber-600">主催者</span>
                      )}
                    </div>
                  </div>
                  {!member.is_organizer && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-red-600 border-red-200 hover:text-red-700 hover:bg-red-50 hover:border-red-300 shrink-0"
                    >
                      外す
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* フッター */}
        <div className="p-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={() => closeSheet()}
            className="w-full"
          >
            閉じる
          </Button>
        </div>
      </div>
    </div>
  )
}

/** グループ設定 のシート（GroupChatSheets から見た目を変えずに切り出し） */
export function SettingsSheet(props: GroupChatSheetsProps & { setShowLeaveGroupConfirm: (v: boolean) => void }) {
  const { group, scenario, memberCount, user, existingMemberId, isOrganizer, isScheduleConfirmedUi, actionLoading, navigate, closeSheet, setShowLeaveGroupConfirm, onOpenInquiry } = props
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={() => closeSheet()}>
      <div 
        className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ハンドル（モバイルのみ） */}
        <div className="flex justify-center py-2 shrink-0 lg:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
          <h3 className="font-semibold">グループ設定</h3>
          <button 
            onClick={() => closeSheet()}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        {/* コンテンツ */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* グループ情報 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              {scenario?.key_visual_url && (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title || ''}
                  className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                />
              )}
              <div>
                <h4 
                  className="font-medium cursor-pointer hover:text-primary transition-colors"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                >
                  {scenario?.title || 'グループ'}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {memberCount}名参加 • 
                  {isScheduleConfirmedUi ? ' 確定' : group.status === 'booking_requested' ? ' 確定待ち' : ' 日程調整中'}
                </p>
              </div>
            </div>
          </div>
          
          {/* 主催者のグループを閉じる・取り下げ・キャンセルは歯車の「操作」メニューにまとめた（マイページ改修 段階 2） */}
          {isOrganizer && (
            <p className="text-xs text-muted-foreground">
              グループを閉じる・申込の取り下げ・キャンセルは、歯車の「操作」メニューから行えます。
            </p>
          )}

          {/* 非主催者用: 退出オプション */}
          {!isOrganizer && (existingMemberId || (user && group?.members?.some(m => m.user_id === user.id))) && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-red-600">グループから抜ける</h4>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setShowLeaveGroupConfirm(true)}
                disabled={actionLoading}
              >
                <LogOut className="h-4 w-4" />
                <span>このグループから抜ける</span>
              </Button>
              <p className="text-xs text-muted-foreground">
                抜けると、このグループのチャットや日程は見られなくなり、あなたの日程の回答も消えます。
              </p>
            </div>
          )}
          
          {/* 店舗への問い合わせ（共通部品を開く） */}
          <Button variant="outline" className="w-full justify-start gap-3" onClick={onOpenInquiry}>
            <MessageCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>店舗に問い合わせる</span>
          </Button>
        </div>
        
        {/* フッター */}
        <div className="p-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={() => closeSheet()}
            className="w-full"
          >
            閉じる
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 希望店舗の編集 のシート（GroupChatSheets から見た目を変えずに切り出し） */
export function StoreEditSheet(props: GroupChatSheetsProps) {
  const { isFilteredByScenario, loadingStoresForEdit, savingStores, selectedStoreIds, allStores, setSelectedStoreIds, closeSheet, handleSavePreferredStores } = props
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={() => closeSheet()}>
      <div 
        className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ハンドル（モバイルのみ） */}
        <div className="flex justify-center py-2 shrink-0 lg:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
          <h3 className="font-semibold">希望店舗を編集</h3>
          <button 
            onClick={() => closeSheet()}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        {/* コンテンツ */}
        <div className="overflow-y-auto flex-1 p-4">
          <p className="text-sm text-muted-foreground mb-2">
            利用を希望する店舗を選択してください。
          </p>
          {isFilteredByScenario && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
              このシナリオで公演可能な店舗のみ表示しています。
            </p>
          )}
          <div className="space-y-2">
            {loadingStoresForEdit ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                店舗を読み込み中...
              </div>
            ) : allStores.length > 0 ? (
              allStores.map(store => (
                <label
                  key={store.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedStoreIds.includes(store.id)
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-gray-50 border-transparent hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedStoreIds.includes(store.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStoreIds([...selectedStoreIds, store.id])
                      } else {
                        setSelectedStoreIds(selectedStoreIds.filter(id => id !== store.id))
                      }
                    }}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    selectedStoreIds.includes(store.id)
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-300'
                  }`}>
                    {selectedStoreIds.includes(store.id) && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <span className="font-medium text-sm">{store.name}</span>
                </label>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                表示できる店舗がありません。しばらくしてから再度お試しください。
              </div>
            )}
          </div>
        </div>
        
        {/* フッター */}
        <div className="p-4 border-t shrink-0 space-y-2">
          <Button
            onClick={handleSavePreferredStores}
            className="w-full"
            disabled={savingStores || selectedStoreIds.length === 0}
          >
            {savingStores ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                保存中...
              </>
            ) : (
              `保存する（${selectedStoreIds.length}件選択中）`
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => closeSheet()}
            className="w-full"
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 予約申請（日程選択と送信） のシート（GroupChatSheets から見た目を変えずに切り出し） */
export function BookingSheet(props: GroupChatSheetsProps) {
  const { group, joinedMembers, inviteMemberCap, responses, canMutateScheduleBeforeStoreReply, isSubmittingBooking, bookingNotes, bookingPhone, bookingSelectedDates, preferredStoreNames, MAX_BOOKING_DATES, setBookingNotes, setBookingPhone, formatDateJaMd, closeSheet, openStoreEditSheet, toggleBookingDate, handleSubmitBooking } = props
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={() => closeSheet()}>
      <div 
        className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ハンドル（モバイルのみ） */}
        <div className="flex justify-center py-2 shrink-0 lg:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
          <h3 className="font-semibold">予約リクエスト</h3>
          <button 
            onClick={() => closeSheet()}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        {/* コンテンツ */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* 日程選択 */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              希望日程を選択（{bookingSelectedDates.size}/{MAX_BOOKING_DATES}件）
            </h4>
            <div className="space-y-2">
              {group.candidate_dates && group.candidate_dates.length > 0 ? (
                group.candidate_dates
                  .filter(cd => cd.status !== 'rejected')
                  .map((cd) => {
                    const isSelected = bookingSelectedDates.has(cd.id)
                    const dateResponses = cd.responses || []
                    const okCount = dateResponses.filter(r => r.response === 'ok').length
                    const maybeCount = dateResponses.filter(r => r.response === 'maybe').length
                    const ngCount = dateResponses.filter(r => r.response === 'ng').length
                    
                    return (
                      <label
                        key={cd.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-purple-50 border-purple-500'
                            : 'bg-gray-50 border-transparent hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleBookingDate(cd.id)}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-purple-500 border-purple-500 text-white'
                            : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">
                            {formatDateJaMd(cd.date)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {candidateTimeSlotFromDb(cd.time_slot)} {cd.start_time}-{cd.end_time}
                          </div>
                        </div>
                        <div className="text-xs text-right shrink-0">
                          <span className="text-green-600">○{okCount}</span>
                          <span className="text-amber-600 ml-1">△{maybeCount}</span>
                          <span className="text-red-600 ml-1">×{ngCount}</span>
                        </div>
                      </label>
                    )
                  })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  候補日程がありません
                </p>
              )}
            </div>
          </div>
          
          {/* 希望店舗 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                希望店舗
              </h4>
              {canMutateScheduleBeforeStoreReply ? (
                <button
                  onClick={() => {
                    openStoreEditSheet()
                  }}
                  className="text-xs text-purple-600 hover:underline"
                >
                  変更
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">変更不可</span>
              )}
            </div>
            {preferredStoreNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {preferredStoreNames.map(store => (
                  <span
                    key={store.id}
                    className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium"
                  >
                    {store.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-2">
                店舗が未選択です。「変更」から店舗を選択してください。
              </p>
            )}
          </div>
          
          {/* 参加人数 */}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              参加人数
            </span>
            <span>
              {joinedMembers.length}名 / 招待上限 {inviteMemberCap ?? '-'}名
            </span>
          </div>
          
          {/* 連絡先電話番号 */}
          <div>
            <Label htmlFor="booking-phone" className="text-sm mb-2 block">
              連絡先電話番号 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="booking-phone"
              type="tel"
              value={bookingPhone}
              onChange={(e) => setBookingPhone(e.target.value)}
              placeholder="090-1234-5678"
              className="text-sm"
            />
          </div>
          
          {/* 備考 */}
          <div>
            <Label htmlFor="booking-notes" className="text-sm mb-2 block">
              備考・リクエスト（任意）
            </Label>
            <Textarea
              id="booking-notes"
              value={bookingNotes}
              onChange={(e) => setBookingNotes(e.target.value)}
              placeholder="特別なリクエストがあればご記入ください"
              className="resize-none text-sm"
              rows={2}
            />
          </div>
        </div>
        
        {/* フッター */}
        <div className="p-4 border-t shrink-0 space-y-2">
          <Button
            onClick={handleSubmitBooking}
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={isSubmittingBooking || bookingSelectedDates.size === 0 || preferredStoreNames.length === 0 || !bookingPhone.trim()}
          >
            {isSubmittingBooking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                送信中...
              </>
            ) : bookingSelectedDates.size === 0 ? (
              '日程を選択してください'
            ) : !bookingPhone.trim() ? (
              '電話番号を入力してください'
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {bookingSelectedDates.size}件の日程で申請する
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => closeSheet()}
            className="w-full"
            disabled={isSubmittingBooking}
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}
