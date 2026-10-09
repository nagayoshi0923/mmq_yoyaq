/**
 * 貸切グループの希望店舗の選択（チェックボックスの一覧）。
 * グループ画面の「希望店舗を編集」シートとマイページの「希望店舗を変更」で共通。
 * GroupChatSheetPanels.tsx（StoreEditSheet）から見た目を変えずに切り出したもの。読み込み・保存は usePreferredStoreEditor。
 */
import { Check, Loader2 } from 'lucide-react'

export interface PreferredStoreChecklistProps {
  /** シナリオで公演できる店舗に絞っているか */
  isFilteredByScenario: boolean
  loading: boolean
  stores: Array<{ id: string; name: string }>
  selectedStoreIds: string[]
  onChange: (ids: string[]) => void
}

export function PreferredStoreChecklist({ isFilteredByScenario, loading, stores, selectedStoreIds, onChange }: PreferredStoreChecklistProps) {
  return (
    <>
      <p className="text-sm text-muted-foreground mb-2">
        利用を希望する店舗を選択してください。
      </p>
      {isFilteredByScenario && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
          このシナリオで公演可能な店舗のみ表示しています。
        </p>
      )}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            店舗を読み込み中...
          </div>
        ) : stores.length > 0 ? (
          stores.map(store => (
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
                    onChange([...selectedStoreIds, store.id])
                  } else {
                    onChange(selectedStoreIds.filter(id => id !== store.id))
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
    </>
  )
}
