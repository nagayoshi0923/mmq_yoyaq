import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ItemizedSettings } from '@/components/ui/itemized-settings'
import { X, Save } from 'lucide-react'
import type { Store, StoreFixedCost } from '@/types'
import { logger } from '@/utils/logger'

interface StoreEditModalProps {
  store: Store | null
  isOpen: boolean
  onClose: () => void
  onSave: (updatedStore: Store) => void
}

export function StoreEditModal({ store, isOpen, onClose, onSave }: StoreEditModalProps) {
  const [formData, setFormData] = useState<Partial<Store>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (store) {
      setFormData({
        name: store.name,
        short_name: store.short_name,
        address: store.address,
        phone_number: store.phone_number,
        email: store.email,
        opening_date: store.opening_date,
        manager_name: store.manager_name,
        status: store.status,
        capacity: store.capacity,
        rooms: store.rooms,
        notes: store.notes,
        color: store.color,
        fixed_costs: store.fixed_costs || []
      })
    }
  }, [store])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store) return

    setLoading(true)
    try {
      const updatedStore = { ...store, ...formData } as Store
      await onSave(updatedStore)
      onClose()
    } catch (error) {
      logger.error('Error saving store:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof Store, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleFixedCostsChange = (costs: StoreFixedCost[]) => {
    setFormData(prev => ({ ...prev, fixed_costs: costs }))
  }

  const getItemStatus = (amount: number, usageCount?: number): 'active' | 'legacy' | 'unused' | 'ready' => {
    if (!usageCount || usageCount === 0) return 'unused'
    return 'active'
  }

  // 固定費の頻度オプション
  const frequencyOptions = [
    { value: 'monthly', label: '毎月' },
    { value: 'yearly', label: '毎年' },
    { value: 'one-time', label: '一過性' }
  ]

  // StoreFixedCostをItemizedSettingに変換
  const fixedCostsAsItems = (formData.fixed_costs || []).map(cost => ({
    item: cost.item,
    amount: cost.amount,
    status: cost.status || 'active' as const,
    usageCount: cost.usageCount || 0,
    startDate: cost.startDate,
    endDate: cost.endDate,
    originalRole: cost.frequency || 'monthly' // frequencyを保持
  }))

  // ItemizedSettingをStoreFixedCostに変換
  const handleItemizedSettingsChange = (items: { item: string; amount: number; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number; startDate?: string; endDate?: string; originalRole?: string }[]) => {
    const costs: StoreFixedCost[] = items.map(item => ({
      item: item.item,
      amount: item.amount,
      frequency: (item.originalRole || 'monthly') as 'monthly' | 'yearly' | 'one-time',
      status: item.status,
      usageCount: item.usageCount,
      startDate: item.startDate,
      endDate: item.endDate
    }))
    handleFixedCostsChange(costs)
  }

  if (!isOpen || !store) return null

  return (
    <div 
      className="fixed inset-0 bg-black/5 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card 
        className="w-full max-w-7xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between bg-background border-b shrink-0">
          <div>
            <CardTitle>店舗情報編集</CardTitle>
            <CardDescription>
              {store.name}の情報を編集します
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* 左カラム: 基本情報 */}
              <div className="space-y-6">
                {/* 基本情報セクション */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 pb-2 border-b">基本情報</h3>
                  <div className="space-y-4">
                    {/* 店舗名・略称 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          店舗名 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.name || ''}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          略称 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.short_name || ''}
                          onChange={(e) => handleInputChange('short_name', e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          required
                        />
                      </div>
                    </div>

                    {/* ステータス */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        ステータス <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.status || 'active'}
                        onChange={(e) => handleInputChange('status', e.target.value as Store['status'])}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        required
                      >
                        <option value="active">営業中</option>
                        <option value="temporarily_closed">一時休業</option>
                        <option value="closed">閉鎖</option>
                      </select>
                    </div>

                    {/* 識別色 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">識別色</label>
                      <select
                        value={formData.color || 'blue'}
                        onChange={(e) => handleInputChange('color', e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="blue">青</option>
                        <option value="green">緑</option>
                        <option value="purple">紫</option>
                        <option value="orange">オレンジ</option>
                        <option value="red">赤</option>
                        <option value="amber">アンバー</option>
                        <option value="gray">グレー</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 連絡先情報セクション */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 pb-2 border-b">連絡先情報</h3>
                  <div className="space-y-4">
                    {/* 住所 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">住所</label>
                      <input
                        type="text"
                        value={formData.address || ''}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      />
                    </div>

                    {/* 電話番号・メール */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">電話番号</label>
                        <input
                          type="tel"
                          value={formData.phone_number || ''}
                          onChange={(e) => handleInputChange('phone_number', e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">メールアドレス</label>
                        <input
                          type="email"
                          value={formData.email || ''}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 運営情報セクション */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 pb-2 border-b">運営情報</h3>
                  <div className="space-y-4">
                    {/* 開店日・店長名 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">開店日</label>
                        <input
                          type="date"
                          value={formData.opening_date || ''}
                          onChange={(e) => handleInputChange('opening_date', e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">店長名</label>
                        <input
                          type="text"
                          value={formData.manager_name || ''}
                          onChange={(e) => handleInputChange('manager_name', e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        />
                      </div>
                    </div>

                    {/* 収容人数・部屋数 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          収容人数 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.capacity || ''}
                          onChange={(e) => handleInputChange('capacity', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          部屋数 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.rooms || ''}
                          onChange={(e) => handleInputChange('rooms', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          required
                        />
                      </div>
                    </div>

                    {/* メモ */}
                    <div>
                      <label className="block text-sm font-medium mb-1">メモ</label>
                      <textarea
                        value={formData.notes || ''}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        placeholder="店舗に関するメモや特記事項"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 右カラム: 固定費 */}
              <div>
                <h3 className="text-lg font-semibold mb-4 pb-2 border-b">固定費</h3>
                <ItemizedSettings
                  title=""
                  subtitle="家賃、光熱費など店舗運営に必要な固定費を設定できます。毎月・毎年の場合は開始時期、一過性の場合は発生月を指定してください。"
                  items={fixedCostsAsItems}
                  conditionOptions={frequencyOptions}
                  showTypeSelector={false}
                  showHideLegacyToggle={true}
                  itemType="固定費"
                  scenarioName={store?.name}
                  getItemStatus={getItemStatus}
                  onItemsChange={handleItemizedSettingsChange}
                  allowFreeTextItem={true}
                />
                
                {/* 月額合計表示 */}
                {formData.fixed_costs && formData.fixed_costs.length > 0 && (
                  <div className="text-sm font-medium text-right pt-4 mt-4 border-t">
                    月額合計: ¥{(formData.fixed_costs.filter(c => c.frequency === 'monthly').reduce((sum, cost) => sum + cost.amount, 0)).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </CardContent>

          {/* アクションボタン */}
          <div className="flex gap-2 p-6 border-t bg-background shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading}
            >
              {loading ? (
                '保存中...'
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  保存
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
