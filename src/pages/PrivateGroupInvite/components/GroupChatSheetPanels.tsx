/**
 * 貸切グループページのシート（グループ設定・希望店舗の編集）。店舗への申込は全画面の申込シート（groupPage/booking/BookingRequestSheet）。
 * 候補日の回答・メンバー招待のシートは、グループページ刷新 段階 1 で「日程」「メンバー」タブに置き換えた。
 */
import { PreferredStoreChecklist } from '@/components/patterns/privateGroup/PreferredStoreChecklist'
import { Button } from '@/components/ui/button'
import { Loader2, LogOut, MessageCircle, X } from 'lucide-react'
import type { GroupChatSheetsProps } from './GroupChatSheets'

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
