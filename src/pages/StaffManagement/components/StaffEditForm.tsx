import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select'
import type { Staff, Store, Scenario } from '@/types'

interface StaffEditFormProps {
  staff: Staff | null
  stores: Store[]
  scenarios: Scenario[]
  onSave: (staff: Staff) => void
  onCancel: () => void
  activeTab: string
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

export function StaffEditForm({ staff, stores, scenarios, onSave, onCancel, activeTab }: StaffEditFormProps) {
  const [formData, setFormData] = useState<Partial<Staff>>({
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
    notes: '',
  })

  useEffect(() => {
    if (staff) {
      setFormData({
        ...staff,
        role: staff.role || [],
        stores: staff.stores || [],
        special_scenarios: staff.special_scenarios || []
      })
    }
  }, [staff])

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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 基本情報 */}
      {activeTab === 'basic' && (
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      )}

      {/* 連絡先情報 */}
      {activeTab === 'contact' && (
        <Card>
          <CardHeader>
            <CardTitle>連絡先情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      )}

      {/* 役割・担当店舗 */}
      {activeTab === 'role-store' && (
        <Card>
          <CardHeader>
            <CardTitle>役割・担当店舗</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>役割</Label>
              <MultiSelect
                options={roleOptions}
                selectedIds={formData.role || []}
                onChange={(ids) => setFormData({ ...formData, role: ids })}
                placeholder="役割を選択"
              />
            </div>

            <div>
              <Label>担当店舗</Label>
              <MultiSelect
                options={storeOptions}
                selectedIds={formData.stores || []}
                onChange={(ids) => setFormData({ ...formData, stores: ids })}
                placeholder="店舗を選択"
              />
            </div>

            <div>
              <Label>特別シナリオ</Label>
              <MultiSelect
                options={scenarioOptions}
                selectedIds={formData.special_scenarios || []}
                onChange={(ids) => setFormData({ ...formData, special_scenarios: ids })}
                placeholder="シナリオを選択"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 備考 */}
      {activeTab === 'notes' && (
        <Card>
          <CardHeader>
            <CardTitle>備考</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={10}
              placeholder="メモ・特記事項"
            />
          </CardContent>
        </Card>
      )}

      {/* フッターボタン */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit">
          保存
        </Button>
      </div>
    </form>
  )
}

