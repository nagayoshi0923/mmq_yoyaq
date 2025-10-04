import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select'
import type { Staff, Store } from '@/types'
import { formatDateJST, getCurrentJST } from '@/utils/dateUtils'

interface StaffEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (staff: Staff) => void
  staff: Staff | null
  stores: Store[]
  scenarios: Scenario[]
}

interface Scenario {
  id: string
  title: string
  description: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  difficulty: number
  genre: string[]
  status: string
}

const roleOptions: MultiSelectOption[] = [
  { id: 'gm', name: 'GM', displayInfo: 'ゲームマスター' },
  { id: 'manager', name: 'マネージャー', displayInfo: '店舗管理' },
  { id: 'staff', name: 'スタッフ', displayInfo: '一般スタッフ' },
  { id: 'trainee', name: '研修生', displayInfo: '新人研修中' },
  { id: 'admin', name: '管理者', displayInfo: 'システム管理' }
]

const statusOptions = [
  { value: 'active', label: 'アクティブ', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: '非アクティブ', color: 'bg-gray-100 text-gray-800' },
  { value: 'on_leave', label: '休職中', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'resigned', label: '退職', color: 'bg-red-100 text-red-800' }
]


export function StaffEditModal({ isOpen, onClose, onSave, staff, stores, scenarios }: StaffEditModalProps) {
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    x_account: '',
    email: '',
    phone: '',
    role: [],
    stores: [],
    status: 'active',
    special_scenarios: [],
    notes: '',
    avatar_color: undefined
  })

  // スタッフデータが変更されたときにフォームを初期化
  useEffect(() => {
    if (staff) {
      setFormData({
        ...staff,
        role: Array.isArray(staff.role) ? staff.role : [staff.role],
        stores: staff.stores || [],
        special_scenarios: staff.special_scenarios || []
      })
    } else {
      setFormData({
        name: '',
        x_account: '',
        email: '',
        phone: '',
        role: [],
        stores: [],
        status: 'active',
        special_scenarios: [],
        notes: '',
        avatar_color: undefined
      })
    }
  }, [staff])

  const handleSave = () => {
    if (!formData.name || !formData.email) {
      alert('必須項目を入力してください')
      return
    }

    const staffData: Staff = {
      id: staff?.id || '',
      name: formData.name!,
      line_name: '', // 削除された項目はデフォルト値
      x_account: formData.x_account || '',
      email: formData.email!,
      phone: formData.phone || '',
      role: formData.role!,
      stores: formData.stores!,
      status: formData.status!,
      experience: 0, // 削除された項目はデフォルト値
      availability: [], // 削除された項目はデフォルト値
      ng_days: [], // 削除された項目はデフォルト値
      special_scenarios: formData.special_scenarios!,
      notes: formData.notes || '',
      avatar_color: formData.avatar_color || null,
      created_at: staff?.created_at || formatDateJST(getCurrentJST()),
      updated_at: formatDateJST(getCurrentJST())
    }

    onSave(staffData)
    onClose()
  }


  const storeOptions: MultiSelectOption[] = stores.map(store => ({
    id: store.id,
    name: store.name,
    displayInfo: store.short_name
  }))

  const scenarioOptions: MultiSelectOption[] = scenarios.map(scenario => ({
    id: scenario.id,
    name: scenario.title,
    displayInfo: `${scenario.duration}分 | ${scenario.player_count_min}-${scenario.player_count_max}人`
  }))

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{staff ? 'スタッフ編集' : 'スタッフ新規作成'}</DialogTitle>
          <DialogDescription>
            スタッフの基本情報、役割、勤務可能日などを設定してください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 基本情報 */}
          <div>
            <Label htmlFor="name">名前 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="田中 太郎"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">メールアドレス *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="tanaka@example.com"
              />
            </div>
            <div>
              <Label htmlFor="phone">電話番号</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="090-1234-5678"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="x_account">X(Twitter)アカウント</Label>
            <Input
              id="x_account"
              value={formData.x_account}
              onChange={(e) => setFormData(prev => ({ ...prev, x_account: e.target.value }))}
              placeholder="@tanaka_gm"
            />
          </div>

          {/* アバター色選択 */}
          <div>
            <Label>アバター色</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { bg: '#EFF6FF', text: '#2563EB', name: '青' },
                { bg: '#F0FDF4', text: '#16A34A', name: '緑' },
                { bg: '#FFFBEB', text: '#D97706', name: '黄' },
                { bg: '#FEF2F2', text: '#DC2626', name: '赤' },
                { bg: '#F5F3FF', text: '#7C3AED', name: '紫' },
                { bg: '#FDF2F8', text: '#DB2777', name: 'ピンク' }
              ].map((color) => (
                <Badge
                  key={color.bg}
                  variant="outline"
                  className={`cursor-pointer px-3 py-1.5 font-normal transition-all border ${
                    formData.avatar_color === color.bg 
                      ? 'ring-2 ring-offset-2' 
                      : 'hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: color.bg,
                    color: color.text,
                    borderColor: color.text + '40'
                  }}
                  onClick={() => setFormData(prev => ({ ...prev, avatar_color: color.bg }))}
                >
                  {color.name}
                </Badge>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFormData(prev => ({ ...prev, avatar_color: undefined }))}
                className="text-xs h-auto py-1.5"
              >
                自動選択に戻す
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {formData.avatar_color 
                ? `選択中: ${[
                    { bg: '#EFF6FF', name: '青' },
                    { bg: '#F0FDF4', name: '緑' },
                    { bg: '#FFFBEB', name: '黄' },
                    { bg: '#FEF2F2', name: '赤' },
                    { bg: '#F5F3FF', name: '紫' },
                    { bg: '#FDF2F8', name: 'ピンク' }
                  ].find(c => c.bg === formData.avatar_color)?.name || ''}` 
                : '未設定（名前から自動選択）'}
            </p>
          </div>

          {/* 役割・ステータス */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="role">役割</Label>
              <MultiSelect
                options={roleOptions}
                selectedValues={formData.role || []}
                onSelectionChange={(values) => setFormData(prev => ({ ...prev, role: values }))}
                placeholder="役割を選択"
                showBadges={true}
              />
            </div>
            <div>
              <Label htmlFor="status">ステータス</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as any }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <Badge size="sm" className={option.color} variant="static">
                        {option.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 担当店舗 */}
          <div>
            <Label htmlFor="stores">担当店舗</Label>
            <MultiSelect
              options={storeOptions}
              selectedValues={formData.stores?.map(id => stores.find(s => s.id === id)?.name || id) || []}
              onSelectionChange={(values) => {
                const storeIds = values.map(name => stores.find(s => s.name === name)?.id || name)
                setFormData(prev => ({ ...prev, stores: storeIds }))
              }}
              placeholder="担当店舗を選択"
              showBadges={true}
            />
          </div>


          {/* 担当シナリオ */}
          <div>
            <Label htmlFor="special_scenarios">担当シナリオ</Label>
            {(() => {
              // selectedScenarioIds（UUID）をシナリオタイトルに変換してMultiSelectに渡す
              const selectedScenarioTitles = (formData.special_scenarios || []).map(scenarioId => {
                const scenario = scenarios.find(s => s.id === scenarioId)
                return scenario?.title || scenarioId
              })
              
              return (
                <MultiSelect
                  options={scenarioOptions}
                  selectedValues={selectedScenarioTitles}
                  onSelectionChange={(selectedTitles) => {
                    // シナリオタイトルをIDに変換
                    const scenarioIds = selectedTitles.map(title => {
                      const scenario = scenarios.find(s => s.title === title)
                      return scenario?.id || title
                    })
                    setFormData(prev => ({ ...prev, special_scenarios: scenarioIds }))
                  }}
                  placeholder="担当シナリオを選択"
                  showBadges={true}
                />
              )
            })()}
          </div>

          {/* 備考 */}
          <div>
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="特記事項があれば入力してください"
              rows={3}
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave}>
            {staff ? '保存' : '作成'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
