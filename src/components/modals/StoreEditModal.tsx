import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemizedListWithDates, type ItemizedListColumn } from '@/components/ui/itemized-list-with-dates'
import { Save, Trash2 } from 'lucide-react'
import type { Store, StoreFixedCost } from '@/types'
import { logger } from '@/utils/logger'

interface StoreEditModalProps {
  store: Store | null
  isOpen: boolean
  onClose: () => void
  onSave: (updatedStore: Store) => void
  onDelete?: (store: Store) => void
  allStores?: Store[]  // キットグループ選択用
}

export function StoreEditModal({ store, isOpen, onClose, onSave, onDelete, allStores = [] }: StoreEditModalProps) {
  const [formData, setFormData] = useState<Partial<Store>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (store) {
      // 編集モード：既存データをセット
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
        franchise_fee: store.franchise_fee ?? (store.ownership_type === 'franchise' ? 1000 : undefined),
        capacity: store.capacity,
        rooms: store.rooms,
        notes: store.notes,
        color: store.color,
        fixed_costs: store.fixed_costs || [],
        region: store.region || '',
        transport_allowance: store.transport_allowance ?? undefined,
        kit_group_id: store.kit_group_id
      })
    } else if (isOpen) {
      // 新規作成モード：初期値をセット
      setFormData({
        name: '',
        short_name: '',
        address: '',
        phone_number: '',
        email: '',
        opening_date: new Date().toISOString().split('T')[0],
        manager_name: '',
        status: 'active',
        ownership_type: 'corporate',
        franchise_fee: undefined,
        capacity: 0,
        rooms: 0,
        notes: '',
        color: '#3B82F6',
        fixed_costs: [],
        region: '',
        transport_allowance: undefined
      })
    }
  }, [store, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setLoading(true)
    try {
      if (store) {
        // 編集モード：既存データとマージ
        const updatedStore = { ...store, ...formData } as Store
        await onSave(updatedStore)
      } else {
        // 新規作成モード：formDataをそのまま渡す
        await onSave(formData as Store)
      }
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

  // 固定費のカラム定義
  const fixedCostColumns: ItemizedListColumn[] = [
    {
      key: 'item',
      label: '項目名',
      type: 'text',
      width: '2fr',
      placeholder: '家賃、光熱費など'
    },
    {
      key: 'frequency',
      label: '頻度',
      type: 'select',
      width: '1fr',
      options: [
        { value: 'monthly', label: '毎月' },
        { value: 'yearly', label: '毎年' },
        { value: 'one-time', label: '一過性' }
      ]
    },
    {
      key: 'amount',
      label: '金額（円）',
      type: 'number',
      width: '1.2fr',
      placeholder: '0'
    }
  ]

  // 固定費の操作
  const handleAddFixedCost = () => {
    setFormData(prev => ({
      ...prev,
      fixed_costs: [...(prev.fixed_costs || []), {
        item: '',
        amount: 0,
        frequency: 'monthly'
      }]
    }))
  }

  const handleRemoveFixedCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fixed_costs: prev.fixed_costs?.filter((_, i) => i !== index) || []
    }))
  }

  const handleUpdateFixedCost = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      fixed_costs: prev.fixed_costs?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-7xl max-h-[90vh] sm:max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6 pb-2 sm:pb-4 border-b shrink-0">
          <DialogTitle>{store ? '店舗情報編集' : '新規店舗作成'}</DialogTitle>
          <DialogDescription>
            {store ? `${store.name}の情報を編集します` : '新しい店舗を登録します'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
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
                          placeholder="例: 馬場、大塚、別館①"
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          シナリオ一覧やスケジュール画面で表示される短い店舗名
                        </p>
                      </div>
                    </div>

                    {/* ステータス・店舗タイプ・地域 */}
                    <div className="grid grid-cols-3 gap-4">
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
                            <SelectItem value="office">オフィス</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          都道府県
                        </label>
                        <Select
                          value={formData.region || ''}
                          onValueChange={(value) => handleInputChange('region', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="選択..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {/* 北海道・東北 */}
                            <SelectItem value="北海道">北海道</SelectItem>
                            <SelectItem value="青森県">青森県</SelectItem>
                            <SelectItem value="岩手県">岩手県</SelectItem>
                            <SelectItem value="宮城県">宮城県</SelectItem>
                            <SelectItem value="秋田県">秋田県</SelectItem>
                            <SelectItem value="山形県">山形県</SelectItem>
                            <SelectItem value="福島県">福島県</SelectItem>
                            {/* 関東 */}
                            <SelectItem value="茨城県">茨城県</SelectItem>
                            <SelectItem value="栃木県">栃木県</SelectItem>
                            <SelectItem value="群馬県">群馬県</SelectItem>
                            <SelectItem value="埼玉県">埼玉県</SelectItem>
                            <SelectItem value="千葉県">千葉県</SelectItem>
                            <SelectItem value="東京都">東京都</SelectItem>
                            <SelectItem value="神奈川県">神奈川県</SelectItem>
                            {/* 中部 */}
                            <SelectItem value="新潟県">新潟県</SelectItem>
                            <SelectItem value="富山県">富山県</SelectItem>
                            <SelectItem value="石川県">石川県</SelectItem>
                            <SelectItem value="福井県">福井県</SelectItem>
                            <SelectItem value="山梨県">山梨県</SelectItem>
                            <SelectItem value="長野県">長野県</SelectItem>
                            <SelectItem value="岐阜県">岐阜県</SelectItem>
                            <SelectItem value="静岡県">静岡県</SelectItem>
                            <SelectItem value="愛知県">愛知県</SelectItem>
                            {/* 近畿 */}
                            <SelectItem value="三重県">三重県</SelectItem>
                            <SelectItem value="滋賀県">滋賀県</SelectItem>
                            <SelectItem value="京都府">京都府</SelectItem>
                            <SelectItem value="大阪府">大阪府</SelectItem>
                            <SelectItem value="兵庫県">兵庫県</SelectItem>
                            <SelectItem value="奈良県">奈良県</SelectItem>
                            <SelectItem value="和歌山県">和歌山県</SelectItem>
                            {/* 中国 */}
                            <SelectItem value="鳥取県">鳥取県</SelectItem>
                            <SelectItem value="島根県">島根県</SelectItem>
                            <SelectItem value="岡山県">岡山県</SelectItem>
                            <SelectItem value="広島県">広島県</SelectItem>
                            <SelectItem value="山口県">山口県</SelectItem>
                            {/* 四国 */}
                            <SelectItem value="徳島県">徳島県</SelectItem>
                            <SelectItem value="香川県">香川県</SelectItem>
                            <SelectItem value="愛媛県">愛媛県</SelectItem>
                            <SelectItem value="高知県">高知県</SelectItem>
                            {/* 九州・沖縄 */}
                            <SelectItem value="福岡県">福岡県</SelectItem>
                            <SelectItem value="佐賀県">佐賀県</SelectItem>
                            <SelectItem value="長崎県">長崎県</SelectItem>
                            <SelectItem value="熊本県">熊本県</SelectItem>
                            <SelectItem value="大分県">大分県</SelectItem>
                            <SelectItem value="宮崎県">宮崎県</SelectItem>
                            <SelectItem value="鹿児島県">鹿児島県</SelectItem>
                            <SelectItem value="沖縄県">沖縄県</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          店舗選択でグループ分け
                        </p>
                      </div>
                    </div>

                    {/* フランチャイズ手数料（フランチャイズ店のみ） */}
                    {formData.ownership_type === 'franchise' && (
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          フランチャイズ登録手数料（円）
                        </label>
                        <Input
                          type="number"
                          value={formData.franchise_fee ?? 1000}
                          onChange={(e) => handleInputChange('franchise_fee', parseInt(e.target.value) || 1000)}
                          min={0}
                          placeholder="1000"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          フランチャイズ店に登録されるシナリオごとに発生する手数料
                        </p>
                      </div>
                    )}

                    {/* 交通費 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        交通費（円）
                      </label>
                      <Input
                        type="number"
                        value={formData.transport_allowance ?? ''}
                        onChange={(e) => handleInputChange('transport_allowance', e.target.value === '' ? undefined : parseInt(e.target.value))}
                        min={0}
                        placeholder="0"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        担当店舗に設定していないスタッフがこの店舗で働く場合に加算される金額
                      </p>
                    </div>
                    
                    {/* キットグループ（同一拠点） */}
                    {allStores.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          キットグループ（同一拠点）
                        </label>
                        <Select
                          value={formData.kit_group_id || 'none'}
                          onValueChange={(value) => handleInputChange('kit_group_id', value === 'none' ? null : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="なし（単独店舗）" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">なし（単独店舗）</SelectItem>
                            {allStores
                              .filter(s => s.status === 'active' && s.id !== store?.id)
                              .map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.short_name || s.name}
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          同じ住所の店舗を選択すると、キット移動計算で同一拠点として扱います
                        </p>
                      </div>
                    )}

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
                <div>
                  <h3 className="text-lg font-semibold mb-2">固定費</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    家賃、光熱費など店舗運営に必要な固定費を設定できます。<br />
                    開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。
                  </p>
                </div>
                
                <ItemizedListWithDates
                  title=""
                  addButtonLabel="固定費を追加"
                  emptyMessage="固定費設定がありません"
                  items={formData.fixed_costs || []}
                  columns={fixedCostColumns}
                  defaultNewItem={() => ({
                    item: '',
                    amount: 0,
                    frequency: 'monthly'
                  })}
                  onAdd={handleAddFixedCost}
                  onRemove={handleRemoveFixedCost}
                  onUpdate={handleUpdateFixedCost}
                  showDateRange={true}
                  dateRangeLabel="期間設定"
                  enableStatusChange={true}
                />

                {/* 月額合計表示 */}
                {formData.fixed_costs && formData.fixed_costs.length > 0 && (
                  <div className="text-sm font-medium text-right pt-2 border-t">
                    月額合計: ¥{(formData.fixed_costs.filter(c => c.frequency === 'monthly').reduce((sum, cost) => sum + cost.amount, 0)).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            
            {/* 削除ボタン（スクロールコンテンツの最下部） */}
            {onDelete && store && (
              <div className="pt-4 sm:pt-6 md:pt-8 pb-2 sm:pb-4 px-3 sm:px-4 md:px-6 border-t mt-4 sm:mt-6 md:mt-8">
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
          <div className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 border-t bg-background shrink-0">
            <div className="flex flex-col sm:flex-row gap-2">
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

    </Dialog>
  )
}
