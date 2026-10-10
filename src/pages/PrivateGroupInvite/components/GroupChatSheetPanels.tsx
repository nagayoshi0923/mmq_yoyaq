/**
 * 貸切グループページのシート（グループ設定・希望店舗の編集・予約申請）。
 * 候補日の回答・メンバー招待のシートは、グループページ刷新 段階 1 で「日程」「メンバー」タブに置き換えた。
 */
import { PreferredStoreChecklist } from '@/components/patterns/privateGroup/PreferredStoreChecklist'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Calendar, Users, CheckCircle2, Loader2, LogOut, MessageCircle, Check, MapPin, X } from 'lucide-react'
import type { GroupChatSheetsProps } from './GroupChatSheets'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'

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
          <PreferredStoreChecklist
            isFilteredByScenario={isFilteredByScenario}
            loading={loadingStoresForEdit}
            stores={allStores}
            selectedStoreIds={selectedStoreIds}
            onChange={setSelectedStoreIds}
          />
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
  const { group, joinedMembers, inviteMemberCap, canMutateScheduleBeforeStoreReply, isSubmittingBooking, bookingNotes, bookingPhone, bookingSelectedDates, preferredStoreNames, MAX_BOOKING_DATES, setBookingNotes, setBookingPhone, formatDateJaMd, closeSheet, openStoreEditSheet, toggleBookingDate, handleSubmitBooking } = props
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
