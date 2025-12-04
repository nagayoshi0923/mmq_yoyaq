import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select'
import { Link2, Unlink, Trash2 } from 'lucide-react'
import type { Staff, Store, Scenario } from '@/types'

interface StaffEditFormProps {
  staff: Staff | null
  stores: Store[]
  scenarios: Scenario[]
  onSave: (staff: Staff) => void
  onCancel: () => void
  onLink?: () => void
  onUnlink?: () => void
  onDelete?: () => void
}

const roleOptions: MultiSelectOption[] = [
  { id: 'gm', name: 'GM', displayInfo: 'ゲームマスター' },
  { id: 'manager', name: 'マネージャー', displayInfo: '店舗管理' },
  { id: 'staff', name: 'スタッフ', displayInfo: '一般スタッフ' },
  { id: 'trainee', name: '研修生', displayInfo: '新人研修中' },
  { id: 'admin', name: '管理者', displayInfo: 'システム管理' }
]

const statusOptions = [
  { value: 'active', label: 'アクティブ' },
  { value: 'inactive', label: '非アクティブ' },
  { value: 'on_leave', label: '休職中' },
  { value: 'resigned', label: '退職' }
]

export function StaffEditForm({ staff, stores, scenarios, onSave, onCancel, onLink, onUnlink, onDelete }: StaffEditFormProps) {
  const [formData, setFormData] = useState<Partial<Staff> & { experienced_scenarios?: string[] }>({
    name: '',
    x_account: '',
    discord_id: '',
    discord_channel_id: '',
    email: '',
    phone: '',
    line_name: '',
    role: [],
    stores: [],
    status: 'active',
    special_scenarios: [],
    experienced_scenarios: [],
    notes: '',
  })

  useEffect(() => {
    if (staff) {
      setFormData({
        ...staff,
        role: staff.role || [],
        stores: staff.stores || [],
        special_scenarios: staff.special_scenarios || [],
        experienced_scenarios: staff.experienced_scenarios || []
      })
    }
  }, [staff])
  
  // 担当シナリオ変更時：体験済みにも自動追加（担当=体験済み）
  const handleSpecialScenariosChange = (values: string[]) => {
    // 新しく追加されたシナリオを体験済みにも追加
    const currentExperienced = formData.experienced_scenarios || []
    const newExperienced = [...new Set([...currentExperienced, ...values])]
    
    setFormData({ 
      ...formData, 
      special_scenarios: values,
      experienced_scenarios: newExperienced
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData as Staff)
  }

  const storeOptions: MultiSelectOption[] = stores.map(store => ({
    id: store.id,
    name: store.name,
    displayInfo: store.location || ''
  }))

  const scenarioOptions: MultiSelectOption[] = scenarios.map(scenario => ({
    id: scenario.id,
    name: scenario.title,
    displayInfo: `${scenario.min_players || 0}-${scenario.max_players || 0}人`
  }))

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
          {/* 左カラム: 基本情報・連絡先 */}
          <div className="space-y-6">
            {/* 基本情報 */}
            <div>
              <h3 className="text-lg mb-4 pb-2 border-b">基本情報</h3>
              <div className="space-y-4">
            <div>
              <Label htmlFor="name">名前 *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="status">ステータス</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as Staff['status'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
              </div>
            </div>

            {/* 連絡先情報 */}
            <div>
              <h3 className="text-lg mb-4 pb-2 border-b">連絡先情報</h3>
              <div className="space-y-4">
            <div>
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="phone">電話番号</Label>
              <Input
                id="phone"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="line_name">LINE名</Label>
              <Input
                id="line_name"
                value={formData.line_name || ''}
                onChange={(e) => setFormData({ ...formData, line_name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="x_account">X (Twitter)</Label>
              <Input
                id="x_account"
                value={formData.x_account || ''}
                onChange={(e) => setFormData({ ...formData, x_account: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="discord_id">Discord ID</Label>
              <Input
                id="discord_id"
                value={formData.discord_id || ''}
                onChange={(e) => setFormData({ ...formData, discord_id: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="discord_channel_id">Discord チャンネルID</Label>
              <Input
                id="discord_channel_id"
                value={formData.discord_channel_id || ''}
                onChange={(e) => setFormData({ ...formData, discord_channel_id: e.target.value })}
                placeholder="シフト通知用のチャンネルID"
              />
            </div>
              </div>
            </div>
          </div>

          {/* 右カラム: 役割・担当店舗・備考 */}
          <div className="space-y-6">
            {/* 役割・担当店舗 */}
            <div>
              <h3 className="text-lg mb-4 pb-2 border-b">役割・担当店舗</h3>
              <div className="space-y-4">
            <div>
              <Label>役割</Label>
              <MultiSelect
                options={roleOptions}
                selectedValues={formData.role || []}
                onSelectionChange={(values) => setFormData({ ...formData, role: values })}
                placeholder="役割を選択"
                searchPlaceholder="役割を検索..."
                emptyText="役割がありません"
                emptySearchText="役割が見つかりません"
                useIdAsValue={true}
                showBadges={true}
              />
            </div>

            <div>
              <Label>担当店舗</Label>
              <MultiSelect
                options={storeOptions}
                selectedValues={formData.stores || []}
                onSelectionChange={(values) => setFormData({ ...formData, stores: values })}
                placeholder="店舗を選択"
                searchPlaceholder="店舗名で検索..."
                emptyText="店舗がありません"
                emptySearchText="店舗が見つかりません"
                useIdAsValue={true}
                showBadges={true}
              />
            </div>

            <div>
              <Label>担当シナリオ（GM可能）</Label>
              <MultiSelect
                options={scenarioOptions}
                selectedValues={formData.special_scenarios || []}
                onSelectionChange={handleSpecialScenariosChange}
                placeholder="GM可能なシナリオを選択"
                searchPlaceholder="シナリオ名で検索..."
                emptyText="シナリオがありません"
                emptySearchText="シナリオが見つかりません"
                useIdAsValue={true}
                showBadges={true}
                badgeClassName="bg-blue-50 border-blue-200 text-blue-700"
              />
              <p className="text-xs text-muted-foreground mt-1">※追加すると体験済みにも自動追加されます</p>
            </div>

            <div>
              <Label>体験済みシナリオ</Label>
              <MultiSelect
                options={scenarioOptions}
                selectedValues={formData.experienced_scenarios || []}
                onSelectionChange={(values) => setFormData({ ...formData, experienced_scenarios: values })}
                placeholder="体験済みシナリオを選択"
                searchPlaceholder="シナリオ名で検索..."
                emptyText="シナリオがありません"
                emptySearchText="シナリオが見つかりません"
                useIdAsValue={true}
                showBadges={true}
                badgeClassName="bg-green-50 border-green-200 text-green-700"
              />
              <p className="text-xs text-muted-foreground mt-1">※GMはできないが体験したシナリオ</p>
            </div>
              </div>
            </div>

            {/* 備考 */}
            <div>
              <h3 className="text-lg mb-4 pb-2 border-b">備考</h3>
              <div>
            <Textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={10}
              placeholder="メモ・特記事項"
            />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* フッターボタン（固定） */}
      <div className="flex justify-between px-4 sm:px-6 py-4 border-t bg-muted/30 shrink-0">
        {/* 左側：アクションボタン（既存スタッフのみ） */}
        <div className="flex gap-2">
          {staff?.id && (
            <>
              {onLink && (
                <Button type="button" variant="outline" size="sm" onClick={onLink} className="text-muted-foreground">
                  <Link2 className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">連携</span>
                </Button>
              )}
              {onUnlink && (
                <Button type="button" variant="outline" size="sm" onClick={onUnlink} className="text-orange-600 border-orange-200 hover:bg-orange-50">
                  <Unlink className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">連携解除</span>
                </Button>
              )}
              {onDelete && (
                <Button type="button" variant="outline" size="sm" onClick={onDelete} className="text-red-600 border-red-200 hover:bg-red-50">
                  <Trash2 className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">削除</span>
                </Button>
              )}
            </>
          )}
        </div>
        
        {/* 右側：保存・キャンセル */}
        <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit">
          保存
        </Button>
        </div>
      </div>
    </form>
  )
}

