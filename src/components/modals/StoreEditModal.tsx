import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { DateRangeModal } from '@/components/modals/DateRangeModal'
import { Save, Plus, Trash2, Calendar } from 'lucide-react'
import type { Store, StoreFixedCost } from '@/types'
import { logger } from '@/utils/logger'

interface StoreEditModalProps {
  store: Store | null
  isOpen: boolean
  onClose: () => void
  onSave: (updatedStore: Store) => void
  onDelete?: (store: Store) => void
}

export function StoreEditModal({ store, isOpen, onClose, onSave, onDelete }: StoreEditModalProps) {
  const [formData, setFormData] = useState<Partial<Store>>({})
  const [loading, setLoading] = useState(false)
  const [dateRangeModalOpen, setDateRangeModalOpen] = useState(false)
  const [editingCostIndex, setEditingCostIndex] = useState<number | null>(null)

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
        ownership_type: store.ownership_type || 'corporate',
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

  // 固定費の頻度オプション
  const frequencyOptions = [
    { value: 'monthly', label: '毎月' },
    { value: 'yearly', label: '毎年' },
    { value: 'one-time', label: '一過性' }
  ]

  // ステータス判定（GM報酬と同じロジック）
  const getFixedCostStatus = (cost: StoreFixedCost): 'active' | 'ready' | 'legacy' => {
    if (!cost.startDate && !cost.endDate) {
      return 'active'
    }
    
    const now = new Date()
    const start = cost.startDate ? new Date(cost.startDate) : null
    const end = cost.endDate ? new Date(cost.endDate) : null
    
    if (start && now < start) {
      return 'ready'
    }
    
    if (end && now > end) {
      return 'legacy'
    }
    
    return 'active'
  }

  // ステータスラベル
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active': return '使用中'
      case 'ready': return '待機中'
      case 'legacy': return '過去の設定'
      default: return status
    }
  }

  // 固定費の追加
  const handleAddFixedCost = () => {
    const newCost: StoreFixedCost = {
      item: '',
      amount: 0,
      frequency: 'monthly',
      status: 'active',
      usageCount: 0
    }
    setFormData(prev => ({
      ...prev,
      fixed_costs: [...(prev.fixed_costs || []), newCost]
    }))
  }

  // 固定費の削除
  const handleRemoveFixedCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fixed_costs: prev.fixed_costs?.filter((_, i) => i !== index) || []
    }))
  }

  // 固定費の更新
  const handleUpdateFixedCost = (index: number, field: keyof StoreFixedCost, value: any) => {
    setFormData(prev => ({
      ...prev,
      fixed_costs: prev.fixed_costs?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  // 期間設定モーダルを開く
  const handleOpenDateRangeModal = (index: number) => {
    setEditingCostIndex(index)
    setDateRangeModalOpen(true)
  }

  // 期間設定を保存
  const handleSaveDateRange = (startDate?: string, endDate?: string) => {
    if (editingCostIndex !== null) {
      setFormData(prev => ({
        ...prev,
        fixed_costs: prev.fixed_costs?.map((item, i) => 
          i === editingCostIndex ? { ...item, startDate, endDate } : item
        ) || []
      }))
    }
  }

  if (!store) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>店舗情報編集</DialogTitle>
          <DialogDescription>
            {store.name}の情報を編集します
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 pt-6">
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
                        <Input
                          type="text"
                          value={formData.name || ''}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          略称 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="text"
                          value={formData.short_name || ''}
                          onChange={(e) => handleInputChange('short_name', e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* ステータス・店舗タイプ */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          ステータス <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={formData.status || 'active'}
                          onValueChange={(value) => handleInputChange('status', value as Store['status'])}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">営業中</SelectItem>
                            <SelectItem value="temporarily_closed">一時休業</SelectItem>
                            <SelectItem value="closed">閉鎖</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          店舗タイプ
                        </label>
                        <Select
                          value={formData.ownership_type || 'corporate'}
                          onValueChange={(value) => handleInputChange('ownership_type', value as Store['ownership_type'])}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="corporate">直営店</SelectItem>
                            <SelectItem value="franchise">フランチャイズ</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                      <Input
                        type="text"
                        value={formData.address || ''}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                      />
                    </div>

                    {/* 電話番号・メール */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">電話番号</label>
                        <Input
                          type="tel"
                          value={formData.phone_number || ''}
                          onChange={(e) => handleInputChange('phone_number', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">メールアドレス</label>
                        <Input
                          type="email"
                          value={formData.email || ''}
                          onChange={(e) => handleInputChange('email', e.target.value)}
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
                        <Input
                          type="date"
                          value={formData.opening_date || ''}
                          onChange={(e) => handleInputChange('opening_date', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">店長名</label>
                        <Input
                          type="text"
                          value={formData.manager_name || ''}
                          onChange={(e) => handleInputChange('manager_name', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* 収容人数・部屋数 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          収容人数 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={formData.capacity || ''}
                          onChange={(e) => handleInputChange('capacity', parseInt(e.target.value) || 0)}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          部屋数 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={formData.rooms || ''}
                          onChange={(e) => handleInputChange('rooms', parseInt(e.target.value) || 0)}
                          required
                        />
                      </div>
                    </div>

                    {/* メモ */}
                    <div>
                      <label className="block text-sm font-medium mb-1">メモ</label>
                      <Textarea
                        value={formData.notes || ''}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        rows={3}
                        placeholder="店舗に関するメモや特記事項"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 右カラム: 固定費 */}
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">固定費</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      家賃、光熱費など店舗運営に必要な固定費を設定できます。<br />
                      開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddFixedCost}
                    size="sm"
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    固定費を追加
                  </Button>
                </div>
                <div className="space-y-3">
                    {(!formData.fixed_costs || formData.fixed_costs.length === 0) ? (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        <p>固定費設定がありません</p>
                        <p className="text-sm mt-2">「固定費を追加」ボタンから追加してください</p>
                      </div>
                    ) : (
                      <>
                        {formData.fixed_costs.map((cost, index) => {
                          const status = getFixedCostStatus(cost)
                          return (
                            <Card key={index} className="border-2">
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  {/* ステータスバッジ */}
                                  <div className="pt-6">
                                    <StatusBadge status={status} label={getStatusLabel(status)} />
                                  </div>

                                  {/* フォームフィールド */}
                                  <div className="flex-1">
                                    <div className="grid grid-cols-[2fr_1fr_1.2fr_auto_auto] gap-3 items-end">
                                      {/* 項目名（自由入力） */}
                                      <div>
                                        <Label className="text-xs">項目名</Label>
                                        <Input
                                          type="text"
                                          value={cost.item}
                                          onChange={(e) => handleUpdateFixedCost(index, 'item', e.target.value)}
                                          placeholder="家賃、光熱費など"
                                        />
                                      </div>

                                      {/* 頻度（公演カテゴリ→頻度） */}
                                      <div>
                                        <Label className="text-xs">頻度</Label>
                                        <Select
                                          value={cost.frequency || 'monthly'}
                                          onValueChange={(value) => handleUpdateFixedCost(index, 'frequency', value)}
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {frequencyOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      {/* 金額 */}
                                      <div>
                                        <Label className="text-xs">金額（円）</Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="100"
                                          value={cost.amount}
                                          onChange={(e) => handleUpdateFixedCost(index, 'amount', parseInt(e.target.value) || 0)}
                                          className="text-right"
                                        />
                                      </div>

                                      {/* 期間設定ボタン */}
                                      <div>
                                        {(cost.startDate || cost.endDate) && (
                                          <div className="text-xs text-muted-foreground mb-1">
                                            {cost.startDate && !cost.endDate && `${cost.startDate}〜`}
                                            {!cost.startDate && cost.endDate && `〜${cost.endDate}`}
                                            {cost.startDate && cost.endDate && `${cost.startDate}〜${cost.endDate}`}
                                          </div>
                                        )}
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleOpenDateRangeModal(index)}
                                          className="gap-2"
                                        >
                                          <Calendar className="h-4 w-4" />
                                          期間設定
                                        </Button>
                                      </div>

                                      {/* 削除ボタン */}
                                      <div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleRemoveFixedCost(index)}
                                          className="text-destructive hover:text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                        
                        {/* 月額合計表示 */}
                        <div className="text-sm font-medium text-right pt-2 border-t">
                          月額合計: ¥{(formData.fixed_costs.filter(c => c.frequency === 'monthly').reduce((sum, cost) => sum + cost.amount, 0)).toLocaleString()}
                        </div>
                      </>
                    )}
                </div>
              </div>
            </div>
            
            {/* 削除ボタン（スクロールコンテンツの最下部） */}
            {onDelete && store && (
              <div className="pt-8 pb-4 px-6 border-t mt-8">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`店舗「${store.name}」を削除してもよろしいですか？この操作は取り消せません。`)) {
                      onDelete(store)
                      onClose()
                    }
                  }}
                  className="w-full text-muted-foreground hover:text-destructive"
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  この店舗を削除
                </Button>
              </div>
            )}
          </div>

          {/* アクションボタン */}
          <div className="px-6 py-4 border-t bg-background shrink-0">
            <div className="flex gap-2">
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
          </div>
        </form>
      </DialogContent>

      {/* 期間設定モーダル */}
      {editingCostIndex !== null && formData.fixed_costs && (
        <DateRangeModal
          isOpen={dateRangeModalOpen}
          onClose={() => {
            setDateRangeModalOpen(false)
            setEditingCostIndex(null)
          }}
          onSave={handleSaveDateRange}
          initialStartDate={formData.fixed_costs[editingCostIndex]?.startDate}
          initialEndDate={formData.fixed_costs[editingCostIndex]?.endDate}
          title="固定費の適用期間設定"
          description="開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。"
        />
      )}
    </Dialog>
  )
}
