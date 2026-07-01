import type { Dispatch, SetStateAction } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { EventFormData } from '@/types/schedule'

interface CategorySelectSectionProps {
  formData: EventFormData
  setFormData: Dispatch<SetStateAction<EventFormData>>
}

/** カテゴリ（クイック選択）ブロック。PerformanceModal から逐語抽出（presentational・挙動不変） */
export function CategorySelectSection({
  formData,
  setFormData,
}: CategorySelectSectionProps) {
            const PRIMARY_CATS: { value: string; label: string }[] = [
              { value: 'open',     label: 'オープン' },
              { value: 'private',  label: '貸切' },
              { value: 'gmtest',   label: 'GMテスト' },
              { value: 'testplay', label: 'テストプレイ' },
              { value: 'offsite',  label: '出張' },
            ]
            const OTHER_CATS: { value: string; label: string }[] = [
              { value: 'venue_rental',      label: '場所貸し' },
              { value: 'venue_rental_free', label: '場所貸無料' },
              { value: 'package',           label: 'パッケージ会' },
              { value: 'mtg',               label: 'MTG' },
              { value: '__custom__',       label: 'カスタム…' },
            ]
            const isPrimary = PRIMARY_CATS.some(c => c.value === formData.category)
            const otherMatch = OTHER_CATS.find(c => c.value === formData.category)
            const otherTriggerLabel = otherMatch?.label
              ?? (formData.category && !isPrimary ? formData.category : 'その他')
            return (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRIMARY_CATS.map(c => {
                    const active = formData.category === c.value
                    return (
                      <button
                        key={c.value}
                        type="button"
                        disabled={formData.is_private_request}
                        onClick={() => setFormData((prev: EventFormData) => ({ ...prev, category: c.value }))}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                  <Select
                    value={isPrimary ? '' : (formData.category || '')}
                    onValueChange={(value: string) => setFormData((prev: EventFormData) => ({ ...prev, category: value }))}
                    disabled={formData.is_private_request}
                  >
                    <SelectTrigger
                      className={`h-7 w-auto px-2.5 text-xs rounded-full gap-1 bg-white ${
                        isPrimary
                          ? 'text-gray-700 border-gray-300'
                          : 'text-slate-900 border-slate-900 border-2 font-medium'
                      }`}
                    >
                      <SelectValue placeholder="その他">{otherTriggerLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OTHER_CATS.map(c => (
                        <SelectItem key={c.value} value={c.value} className="text-xs py-1">{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(formData.category === '__custom__' || (formData.category && !isPrimary && !otherMatch)) && !formData.is_private_request && (
                  <Input
                    value={formData.category === '__custom__' ? '' : formData.category}
                    onChange={(e) => setFormData((prev: EventFormData) => ({ ...prev, category: e.target.value || '__custom__' }))}
                    placeholder="カスタム種別名（例: 体験公演）"
                    className="h-7 text-xs"
                  />
                )}
                {formData.is_private_request && <p className="text-[11px] text-purple-600">※ 貸切のためカテゴリ変更不可</p>}
              </div>
            )
}
