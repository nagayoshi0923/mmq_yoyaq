import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save, ArrowUp, ArrowDown, GripVertical, Store, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface StoreSettings {
  id: string
  name: string
  short_name: string
  address?: string
  access_info?: string
  phone_number?: string
  email?: string
  opening_date?: string
  manager_name?: string
  status?: 'active' | 'temporarily_closed' | 'closed'
  capacity?: number
  rooms?: number
  color?: string
  notes?: string
  display_order?: number
  is_temporary?: boolean
  ownership_type?: string
  kit_group_id?: string | null  // キットグループの親店舗ID
}

interface StoreBasicSettingsProps {
  storeId?: string
}

export function StoreBasicSettings({ storeId }: StoreBasicSettingsProps) {
  const [stores, setStores] = useState<StoreSettings[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<StoreSettings>({
    id: '',
    name: '',
    short_name: '',
    address: '',
    access_info: '',
    phone_number: '',
    email: '',
    opening_date: '',
    manager_name: '',
    status: 'active',
    capacity: 8,
    rooms: 1,
    color: '#3B82F6',
    notes: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    setLoading(true)
    try {
      // 組織対応済みの店舗取得
      const data = await storeApi.getAll()

      if (data && data.length > 0) {
        setStores(data)
        setSelectedStoreId(data[0].id)
        setFormData(data[0])
      }
    } catch (error) {
      logger.error('店舗データ取得エラー:', error)
      showToast.error('店舗データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // 店舗の並び順を変更
  const moveStore = async (index: number, direction: 'up' | 'down') => {
    // 通常店舗と仮設店舗を含む（オフィスのみ除外）
    const regularStores = stores.filter(s => s.ownership_type !== 'office')
    const targetIndex = regularStores.findIndex(s => s.id === stores[index].id)

    if (targetIndex === -1) return
    if (direction === 'up' && targetIndex === 0) return
    if (direction === 'down' && targetIndex === regularStores.length - 1) return

    const swapIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1
    const newOrder = [...regularStores]
    ;[newOrder[targetIndex], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[targetIndex]]

    // display_orderを再計算
    const updates = newOrder.map((store, i) => ({
      id: store.id,
      display_order: i + 1
    }))

    try {
      await storeApi.updateDisplayOrder(updates)
      showToast.success('表示順を更新しました')
      fetchStores() // リロード
    } catch (error) {
      logger.error('表示順更新エラー:', error)
      showToast.error('表示順の更新に失敗しました')
    }
  }

  const handleStoreChange = (storeId: string) => {
    setSelectedStoreId(storeId)
    const store = stores.find(s => s.id === storeId)
    if (store) {
      setFormData(store)
    }
  }

  const handleSave = async () => {
    if (!formData.name || !formData.short_name) {
      showToast.warning('店舗名と略称は必須です')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('stores')
        .update({
          name: formData.name,
          short_name: formData.short_name,
          address: formData.address,
          access_info: formData.access_info,
          phone_number: formData.phone_number,
          email: formData.email,
          opening_date: formData.opening_date || null,
          manager_name: formData.manager_name,
          status: formData.status,
          capacity: formData.capacity,
          rooms: formData.rooms,
          color: formData.color,
          notes: formData.notes,
          kit_group_id: formData.kit_group_id || null
        })
        .eq('id', formData.id)

      if (error) throw error

      // ローカルステートを更新
      setStores(prev => prev.map(s => s.id === formData.id ? formData : s))

      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="店舗基本設定"
        description="店舗の基本情報と表示設定を管理します"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 店舗情報 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Store}
          label="店舗情報"
          description="店名・識別子・表示色・並び順など、予約サイトやスケジュール画面に反映される基本情報です"
        />

        {/* 店舗選択 */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">編集する店舗</Label>
            <Select value={selectedStoreId} onValueChange={handleStoreChange}>
              <SelectTrigger>
                <SelectValue placeholder="店舗を選択" />
              </SelectTrigger>
              <SelectContent>
                {stores.map(store => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.short_name || store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">店舗名 *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例: クイーンズワルツ渋谷店"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">略称 *</Label>
              <Input
                value={formData.short_name}
                onChange={(e) => setFormData(prev => ({ ...prev, short_name: e.target.value }))}
                placeholder="例: 馬場、大塚、別館①"
              />
              <p className="text-xs text-muted-foreground">シナリオ一覧やスケジュール画面で使われる短縮表示名</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">店舗カラー</Label>
            <div className="flex items-center gap-4">
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                className="w-20 h-10"
              />
              <div
                className="h-10 flex-1 rounded border"
                style={{ backgroundColor: formData.color }}
              />
            </div>
            <p className="text-xs text-muted-foreground">スケジュール・予約管理画面のUI色として使用されます</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">営業ステータス</Label>
            <Select
              value={formData.status}
              onValueChange={(value: 'active' | 'temporarily_closed' | 'closed') =>
                setFormData(prev => ({ ...prev, status: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">営業中</SelectItem>
                <SelectItem value="temporarily_closed">一時休業</SelectItem>
                <SelectItem value="closed">閉店</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">「閉店」にすると予約サイトへの公開が停止されます</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">表示順（並び替え）</Label>
            <div className="space-y-2">
              {stores
                .filter(s => s.ownership_type !== 'office')
                .map((store, index, filteredStores) => (
                  <div
                    key={store.id}
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: store.color || '#gray' }}
                    />
                    <span className="flex-1 font-medium">{store.short_name || store.name}</span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const originalIndex = stores.findIndex(s => s.id === store.id)
                          moveStore(originalIndex, 'up')
                        }}
                        disabled={index === 0}
                        className="h-8 w-8 p-0"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const originalIndex = stores.findIndex(s => s.id === store.id)
                          moveStore(originalIndex, 'down')
                        }}
                        disabled={index === filteredStores.length - 1}
                        className="h-8 w-8 p-0"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">スケジュール管理・予約サイトでの店舗の並び順に反映されます</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">収容人数</Label>
              <Input
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 0 }))}
                min="1"
                max="100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">部屋数</Label>
              <Input
                type="number"
                value={formData.rooms}
                onChange={(e) => setFormData(prev => ({ ...prev, rooms: parseInt(e.target.value) || 1 }))}
                min="1"
                max="10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">住所</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="例: 東京都渋谷区..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">電話番号</Label>
              <Input
                value={formData.phone_number}
                onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                placeholder="例: 03-1234-5678"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">アクセス方法</Label>
            <Textarea
              value={formData.access_info || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, access_info: e.target.value }))}
              placeholder="例: JR渋谷駅ハチ公口から徒歩5分。○○ビル3F"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">予約確認メールや予約サイトのアクセス欄に表示されます</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">メールアドレス</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="例: info@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">営業開始日</Label>
              <Input
                type="date"
                value={formData.opening_date}
                onChange={(e) => setFormData(prev => ({ ...prev, opening_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">店舗責任者</Label>
            <Input
              value={formData.manager_name}
              onChange={(e) => setFormData(prev => ({ ...prev, manager_name: e.target.value }))}
              placeholder="例: 山田太郎"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">メモ</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="店舗に関するメモ"
            />
          </div>
        </div>
      </section>

      {/* キットグループ設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Link2}
          label="キットグループ設定"
          description="同一拠点にある複数の店舗をグループ化することで、キット移動計算が正確になります"
        />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">キット管理グループの紐付け</Label>
            <Select
              value={formData.kit_group_id || 'none'}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                kit_group_id: value === 'none' ? null : value
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="なし（単独店舗）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし（単独店舗）</SelectItem>
                {stores
                  .filter(s => s.status === 'active' && s.id !== formData.id)
                  .map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.short_name || store.name}
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              同じ住所にある別店舗を選択すると、キット移動計算で同一拠点として扱います（例：森1と森2）
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
