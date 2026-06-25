/**
 * 公演モーダル「公演内容」セクション（PerformanceModal から子コンポーネント抽出・挙動不変）。
 * シナリオ選択（参加者ありでの変更確認・未登録/公演不可/キット未配置の各警告・編集リンク）、
 * 最大定員、場所貸し公演料金。
 * JSX は元 PerformanceModal の該当ブロックを逐語移植し、クロージャ参照を同名 props 化しただけ。
 */
import type { Dispatch, SetStateAction } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { BookOpen, ExternalLink } from 'lucide-react'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import type { Scenario, Store } from '@/types'
import { EventFormData } from '@/types/schedule'
import { CATEGORY_TONE } from '../constants'

interface PerformanceContentSectionProps {
  formData: EventFormData
  setFormData: Dispatch<SetStateAction<EventFormData>>
  mode: 'add' | 'edit'
  scenarios: Scenario[]
  stores: Store[]
  scenarioOptions: React.ComponentProps<typeof SearchableSelect>['options']
  kitStoreIds: string[]
  localCurrentParticipants: number
  setPendingScenarioTitle: Dispatch<SetStateAction<string | null>>
  applyScenarioChange: (scenarioTitle: string) => void
  setIsScenarioDialogOpen: Dispatch<SetStateAction<boolean>>
  setEditingScenarioId: Dispatch<SetStateAction<string | null>>
}

export function PerformanceContentSection({
  formData,
  setFormData,
  mode,
  scenarios,
  stores,
  scenarioOptions,
  kitStoreIds,
  localCurrentParticipants,
  setPendingScenarioTitle,
  applyScenarioChange,
  setIsScenarioDialogOpen,
  setEditingScenarioId,
}: PerformanceContentSectionProps) {
  // シナリオが選択中の店舗で公演可能かどうかをチェック
  const isScenarioAvailableAtVenue = (scenario: Scenario) => {
    if (!formData.venue) return true
    // available_storesが未設定または空の場合は全店舗対応
    if (!scenario.available_stores || scenario.available_stores.length === 0) {
      return true
    }
    // 選択中の店舗がavailable_storesに含まれているかチェック
    return scenario.available_stores.includes(formData.venue)
  }

  return (
    <div className="rounded-lg border p-3 space-y-2" style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section, borderColor: CATEGORY_TONE[formData.category].border } : { backgroundColor: "rgb(248 250 252 / 0.7)" }}>
      <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
        <BookOpen className="h-3.5 w-3.5" />公演内容
      </p>

      {/* シナリオ */}
      <div className="flex items-start gap-3">
        <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">シナリオ</Label>
        <div className="flex-1 min-w-0">
          <SearchableSelect
            value={formData.scenario}
            onValueChange={(scenarioTitle) => {
              const hasParticipants = localCurrentParticipants > 0
              const isScenarioChanged = scenarioTitle !== formData.scenario
              if (mode === 'edit' && hasParticipants && isScenarioChanged) {
                setPendingScenarioTitle(scenarioTitle)
                return
              }
              applyScenarioChange(scenarioTitle)
            }}
            options={scenarioOptions}
            placeholder="シナリオ"
            searchPlaceholder="検索..."
            emptyText="シナリオが見つかりません"
            emptyActionLabel="シナリオを作成"
            onEmptyAction={() => setIsScenarioDialogOpen(true)}
            className="h-7 text-xs"
            allowClear={!formData.is_private_request}
            headerContent={
              <span className="flex gap-1 text-[9px] text-muted-foreground">
                <span className="inline-flex items-center px-1 rounded bg-green-100 text-green-700 border border-green-300">担当+出勤</span>
                <span className="inline-flex items-center px-1 rounded bg-blue-100 text-blue-700 border border-blue-300">担当</span>
                <span className="inline-flex items-center px-1 rounded bg-white text-gray-400 border border-gray-200">出勤</span>
              </span>
            }
          />
          {formData.is_private_request && <p className="text-[11px] text-purple-600 mt-0.5">※ 貸切のシナリオ変更不可</p>}
          {formData.scenario && !scenarios.find(s => s.title === formData.scenario) && (
            <div className="mt-0.5 p-1.5 bg-orange-50 border border-orange-200 rounded text-[11px]">
              <div className="flex items-center gap-1 text-orange-700">
                <span className="font-semibold">⚠️ 未登録:</span>
                <span className="font-mono break-all">{formData.scenario}</span>
              </div>
              <p className="mt-0.5 text-orange-500">プルダウンから選択してください</p>
            </div>
          )}
          {formData.scenario && formData.venue && (() => {
            const selectedScenario = scenarios.find(s => s.title === formData.scenario)
            if (selectedScenario && !isScenarioAvailableAtVenue(selectedScenario)) {
              const storeName = stores.find(s => s.id === formData.venue)?.name || formData.venue
              return (
                <div className="mt-0.5 p-1.5 bg-orange-50 border border-orange-200 rounded text-[11px]">
                  <div className="flex items-center gap-1 text-orange-700">
                    <span className="font-semibold">⚠️ 公演不可店舗:</span>
                    <span>{storeName}</span>
                  </div>
                  <p className="mt-0.5 text-orange-500">このシナリオは選択中の店舗では公演できません</p>
                </div>
              )
            }
            return null
          })()}
          {/* キット配置警告: シナリオに紐づくキットが選択中の店舗に無い時に出す
             (kitStoreIds が空 = キット未登録のシナリオは判定スキップ) */}
          {formData.scenario && formData.venue && kitStoreIds.length > 0 && !kitStoreIds.includes(formData.venue) && (() => {
            const storeName = stores.find(s => s.id === formData.venue)?.name || formData.venue
            const kitStoreNames = kitStoreIds
              .map(id => stores.find(s => s.id === id)?.short_name || stores.find(s => s.id === id)?.name)
              .filter(Boolean)
              .join(', ')
            return (
              <div className="mt-0.5 p-1.5 bg-amber-50 border border-amber-200 rounded text-[11px]">
                <div className="flex items-center gap-1 text-amber-700">
                  <span className="font-semibold">⚠️ キット未配置:</span>
                  <span>{storeName}</span>
                </div>
                <p className="mt-0.5 text-amber-600">
                  この店舗には{kitStoreNames ? `キットが置かれていません (現在の配置: ${kitStoreNames})` : 'キットが置かれていません'}
                </p>
              </div>
            )
          })()}
          {formData.scenario && (() => {
            const selectedScenario = scenarios.find(s => s.title === formData.scenario)
            if (selectedScenario) {
              return (
                <Button type="button" variant="link" size="sm" className="mt-0.5 h-auto p-0 text-xs"
                  onClick={() => { setEditingScenarioId(selectedScenario.id); setIsScenarioDialogOpen(true) }}>
                  <ExternalLink className="h-3 w-3 mr-1" />シナリオを編集
                </Button>
              )
            }
            return null
          })()}
        </div>
      </div>

      {/* 最大参加者数 */}
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">最大定員</Label>
        <div className="w-24">
          <Input id="max_participants" type="number" min="1" max="20"
            value={formData.max_participants}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || DEFAULT_MAX_PARTICIPANTS }))}
            disabled={formData.is_private_request} className="h-7 text-xs" />
        </div>
        {formData.scenario && <span className="text-[11px] text-muted-foreground">※ シナリオから自動設定</span>}
      </div>

      {/* 公演料金（場所貸しのみ） */}
      {(formData.category === 'venue_rental' || formData.category === 'venue_rental_free') && (
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">公演料金</Label>
          <div className="w-32">
            <Input id="venue_rental_fee" type="number" min="0" step="1000" placeholder="12000"
              value={formData.venue_rental_fee ?? ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, venue_rental_fee: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="h-7 text-xs" />
          </div>
          <span className="text-[11px] text-muted-foreground">※ 未入力時は12,000円</span>
        </div>
      )}
    </div>
  )
}
