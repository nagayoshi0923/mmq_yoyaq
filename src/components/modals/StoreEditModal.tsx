import React, { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/patterns/modal'
import './ScenarioEditDialogV2.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemizedListWithDates, type ItemizedListColumn } from '@/components/ui/itemized-list-with-dates'
import type { Store, StoreTravelTime, StoreTravelTimeInput } from '@/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { supabase } from '@/lib/supabase'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { StoreHoursSection, type StoreHoursHandle } from '@/components/modals/storeEdit/StoreHoursSection'
import { StoreClosureSection, type StoreClosureHandle } from '@/components/modals/storeEdit/StoreClosureSection'

interface StoreEditModalProps {
  store: Store | null
  isOpen: boolean
  onClose: () => void
  onSave: (updatedStore: Store) => void
  onSaveTravelTimes?: (items: StoreTravelTimeInput[]) => Promise<void>
  onDelete?: (store: Store) => void
  allStores?: Store[]  // キットグループ選択・店舗間移動時間用
  travelTimes?: StoreTravelTime[]
}

const STORE_TABS = [
  { id: 'basic', label: '基本情報' },
  { id: 'contact', label: '連絡先' },
  { id: 'hours', label: '営業時間' },
  { id: 'closure', label: '休業設定' },
  { id: 'operation', label: '運営' },
  { id: 'costs', label: '費用' },
  { id: 'travel', label: '移動時間' },
] as const

type StoreTabId = typeof STORE_TABS[number]['id']

export function StoreEditModal({
  store,
  isOpen,
  onClose,
  onSave,
  onSaveTravelTimes,
  onDelete,
  allStores = [],
  travelTimes = []
}: StoreEditModalProps) {
  const [formData, setFormData] = useState<Partial<Store>>({})
  const [travelTimeDrafts, setTravelTimeDrafts] = useState<Record<string, { minutes: string; memo: string }>>({})
  const [loading, setLoading] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  // D-5d: 削除可否チェック（紐づく公演/予約/キットの件数）
  const [isCheckingDelete, setIsCheckingDelete] = useState(false)
  const [deleteBlockedCounts, setDeleteBlockedCounts] = useState<{ events: number; reservations: number; kits: number } | null>(null)
  const [deleteBlockedDialogOpen, setDeleteBlockedDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<StoreTabId>('basic')
  const hoursRef = useRef<StoreHoursHandle>(null)
  const closureRef = useRef<StoreClosureHandle>(null)

  const normalizePair = (storeAId: string, storeBId: string): [string, string] =>
    storeAId < storeBId ? [storeAId, storeBId] : [storeBId, storeAId]

  const getStoreGroupId = (storeId: string): string => {
    const target = allStores.find(s => s.id === storeId)
    return target?.kit_group_id || storeId
  }

  const normalizeAddress = (address?: string | null): string => (address || '').trim().replace(/\s+/g, '')

  const isSameTravelGroup = (a: Store, b: Store): boolean => {
    const groupA = getStoreGroupId(a.id)
    const groupB = getStoreGroupId(b.id)
    if (groupA === groupB) return true
    const addressA = normalizeAddress(a.address)
    const addressB = normalizeAddress(b.address)
    return addressA !== '' && addressA === addressB
  }

  useEffect(() => {
    if (isOpen) {
      setActiveTab('basic')
    }
  }, [isOpen])

  useEffect(() => {
    if (store) {
      // 編集モード：既存データをセット
      setFormData({
        name: store.name,
        short_name: store.short_name,
        address: store.address,
        access_info: store.access_info || '',
        phone_number: store.phone_number,
        email: store.email,
        opening_date: store.opening_date,
        manager_name: store.manager_name,
        status: store.status,
        ownership_type: store.ownership_type || 'corporate',
        franchise_fee: store.franchise_fee ?? (store.ownership_type === 'franchise' ? 1000 : undefined),
        franchise_fee_type: store.franchise_fee_type ?? 'fixed',
        franchise_fee_percent: store.franchise_fee_percent ?? undefined,
        capacity: store.capacity,
        rooms: store.rooms,
        notes: store.notes,
        color: store.color,
        fixed_costs: store.fixed_costs || [],
        venue_cost_per_performance: store.venue_cost_per_performance ?? 0,
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
        access_info: '',
        phone_number: '',
        email: '',
        opening_date: new Date().toISOString().split('T')[0],
        manager_name: '',
        status: 'active',
        ownership_type: 'corporate',
        franchise_fee: undefined,
        franchise_fee_type: 'fixed',
        franchise_fee_percent: undefined,
        capacity: 0,
        rooms: 0,
        notes: '',
        color: '#3B82F6',
        fixed_costs: [],
        venue_cost_per_performance: 0,
        region: '',
        transport_allowance: undefined
      })
    }
  }, [store, isOpen])

  useEffect(() => {
    if (!store || !isOpen) {
      setTravelTimeDrafts({})
      return
    }

    const drafts: Record<string, { minutes: string; memo: string }> = {}
    for (const otherStore of allStores.filter(s => s.id !== store.id)) {
      const [storeAId, storeBId] = normalizePair(store.id, otherStore.id)
      const existing = travelTimes.find(
        t => t.store_a_id === storeAId && t.store_b_id === storeBId
      )
      drafts[otherStore.id] = {
        minutes: existing ? String(existing.minutes) : '',
        memo: existing?.memo || ''
      }
    }
    setTravelTimeDrafts(drafts)
  }, [store, isOpen, allStores, travelTimes])

  // D-5d: 「この店舗を削除」押下時に紐づき件数をチェックしてから確認ダイアログを出し分ける
  const handleDeleteButtonClick = async () => {
    if (!store) return
    setIsCheckingDelete(true)
    try {
      const [eventsResult, reservationsResult, kitsResult] = await Promise.all([
        supabase
          .from('schedule_events_staff_view')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', store.id),
        supabase
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', store.id),
        supabase
          .from('performance_kits')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', store.id),
      ])

      if (eventsResult.error || reservationsResult.error || kitsResult.error) {
        const err = eventsResult.error || reservationsResult.error || kitsResult.error
        showToast.error(getSafeErrorMessage(err, '紐づきデータの確認に失敗しました'))
        return
      }

      const counts = {
        events: eventsResult.count ?? 0,
        reservations: reservationsResult.count ?? 0,
        kits: kitsResult.count ?? 0,
      }

      if (counts.events > 0 || counts.reservations > 0 || counts.kits > 0) {
        setDeleteBlockedCounts(counts)
        setDeleteBlockedDialogOpen(true)
      } else {
        setDeleteConfirmOpen(true)
      }
    } catch (e) {
      logger.error('店舗削除の紐づき確認に失敗:', e)
      showToast.error('紐づきデータの確認に失敗しました')
    } finally {
      setIsCheckingDelete(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      showToast.warning('店舗名を入力してください')
      setActiveTab('basic')
      return
    }
    if (!formData.short_name?.trim()) {
      showToast.warning('略称を入力してください')
      setActiveTab('basic')
      return
    }
    if (!formData.capacity || formData.capacity < 1) {
      showToast.warning('収容人数を入力してください')
      setActiveTab('operation')
      return
    }
    if (!formData.rooms || formData.rooms < 1) {
      showToast.warning('部屋数を入力してください')
      setActiveTab('operation')
      return
    }

    if (store) {
      const hoursOk = await hoursRef.current?.save()
      if (hoursOk === false) {
        setActiveTab('hours')
        return
      }
      const closureOk = await closureRef.current?.save()
      if (closureOk === false) {
        setActiveTab('closure')
        return
      }
    }

    setLoading(true)
    try {
      if (store) {
        // 編集モード：既存データとマージ
        const updatedStore = { ...store, ...formData } as Store
        const travelTimeItems: StoreTravelTimeInput[] = onSaveTravelTimes
          ? allStores
            .filter(otherStore => otherStore.id !== store.id && !isSameTravelGroup(updatedStore, otherStore))
            .map(otherStore => {
              const draft = travelTimeDrafts[otherStore.id] || { minutes: '', memo: '' }
              const minutesText = draft.minutes.trim()
              const minutes = minutesText === '' ? null : Number(minutesText)
              if (
                minutes !== null &&
                (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440)
              ) {
                const message = '店舗間移動時間は1〜1440分の整数で入力してください'
                showToast.error(message)
                setActiveTab('travel')
                throw new Error(message)
              }

              return {
                store_a_id: store.id,
                store_b_id: otherStore.id,
                minutes,
                memo: draft.memo.trim() || null
              }
            })
          : []
        await onSave(updatedStore)
        if (onSaveTravelTimes) {
          await onSaveTravelTimes(travelTimeItems)
        }
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

  const handleTravelTimeChange = (
    storeId: string,
    field: 'minutes' | 'memo',
    value: string
  ) => {
    setTravelTimeDrafts(prev => ({
      ...prev,
      [storeId]: {
        minutes: prev[storeId]?.minutes || '',
        memo: prev[storeId]?.memo || '',
        [field]: value
      }
    }))
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

  const renderTabContent = (tabId: StoreTabId) => {
    switch (tabId) {
      case 'basic':
        return (
          <>
            <div className="scenario-edit-card">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="store-name">店舗名 *</Label>
                  <Input
                    id="store-name"
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="store-short-name">略称 *</Label>
                  <Input
                    id="store-short-name"
                    type="text"
                    value={formData.short_name || ''}
                    onChange={(e) => handleInputChange('short_name', e.target.value)}
                    placeholder="例: 馬場、大塚、別館①"
                  />
                  <p className="scenario-edit-card__note">
                    シナリオ一覧やスケジュール画面で表示される短い店舗名
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>店舗タイプ</Label>
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
                  <Label>都道府県</Label>
                  <Select
                    value={formData.region || ''}
                    onValueChange={(value) => handleInputChange('region', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選択..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="北海道">北海道</SelectItem>
                      <SelectItem value="青森県">青森県</SelectItem>
                      <SelectItem value="岩手県">岩手県</SelectItem>
                      <SelectItem value="宮城県">宮城県</SelectItem>
                      <SelectItem value="秋田県">秋田県</SelectItem>
                      <SelectItem value="山形県">山形県</SelectItem>
                      <SelectItem value="福島県">福島県</SelectItem>
                      <SelectItem value="茨城県">茨城県</SelectItem>
                      <SelectItem value="栃木県">栃木県</SelectItem>
                      <SelectItem value="群馬県">群馬県</SelectItem>
                      <SelectItem value="埼玉県">埼玉県</SelectItem>
                      <SelectItem value="千葉県">千葉県</SelectItem>
                      <SelectItem value="東京都">東京都</SelectItem>
                      <SelectItem value="神奈川県">神奈川県</SelectItem>
                      <SelectItem value="新潟県">新潟県</SelectItem>
                      <SelectItem value="富山県">富山県</SelectItem>
                      <SelectItem value="石川県">石川県</SelectItem>
                      <SelectItem value="福井県">福井県</SelectItem>
                      <SelectItem value="山梨県">山梨県</SelectItem>
                      <SelectItem value="長野県">長野県</SelectItem>
                      <SelectItem value="岐阜県">岐阜県</SelectItem>
                      <SelectItem value="静岡県">静岡県</SelectItem>
                      <SelectItem value="愛知県">愛知県</SelectItem>
                      <SelectItem value="三重県">三重県</SelectItem>
                      <SelectItem value="滋賀県">滋賀県</SelectItem>
                      <SelectItem value="京都府">京都府</SelectItem>
                      <SelectItem value="大阪府">大阪府</SelectItem>
                      <SelectItem value="兵庫県">兵庫県</SelectItem>
                      <SelectItem value="奈良県">奈良県</SelectItem>
                      <SelectItem value="和歌山県">和歌山県</SelectItem>
                      <SelectItem value="鳥取県">鳥取県</SelectItem>
                      <SelectItem value="島根県">島根県</SelectItem>
                      <SelectItem value="岡山県">岡山県</SelectItem>
                      <SelectItem value="広島県">広島県</SelectItem>
                      <SelectItem value="山口県">山口県</SelectItem>
                      <SelectItem value="徳島県">徳島県</SelectItem>
                      <SelectItem value="香川県">香川県</SelectItem>
                      <SelectItem value="愛媛県">愛媛県</SelectItem>
                      <SelectItem value="高知県">高知県</SelectItem>
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
                  <p className="scenario-edit-card__note">店舗選択でグループ分け</p>
                </div>
              </div>
            </div>

            {formData.ownership_type === 'franchise' && (
              <div className="scenario-edit-card">
                <p className="scenario-edit-card__title">フランチャイズ料金</p>
                <div>
                  <Label>FC料金の方式</Label>
                  <Select
                    value={formData.franchise_fee_type ?? 'fixed'}
                    onValueChange={(value) => handleInputChange('franchise_fee_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">定額（公演ごと）</SelectItem>
                      <SelectItem value="percent">売上の％</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(formData.franchise_fee_type ?? 'fixed') === 'fixed' ? (
                  <div>
                    <Label htmlFor="franchise-fee">フランチャイズ登録手数料（円）</Label>
                    <Input
                      id="franchise-fee"
                      type="number"
                      value={formData.franchise_fee ?? 1000}
                      onChange={(e) => handleInputChange('franchise_fee', parseInt(e.target.value) || 1000)}
                      min={0}
                      placeholder="1000"
                    />
                    <p className="scenario-edit-card__note">フランチャイズ店で公演ごとに発生する手数料</p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="franchise-fee-percent">FC料金（売上の％）</Label>
                    <Input
                      id="franchise-fee-percent"
                      type="number"
                      value={formData.franchise_fee_percent ?? ''}
                      onChange={(e) => handleInputChange('franchise_fee_percent', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="10"
                    />
                    <p className="scenario-edit-card__note">公演売上に対する割合（例: 10 = 売上の10%）</p>
                  </div>
                )}
              </div>
            )}

            <div className="scenario-edit-card">
              <div>
                <Label htmlFor="transport-allowance">交通費（円）</Label>
                <Input
                  id="transport-allowance"
                  type="number"
                  value={formData.transport_allowance ?? ''}
                  onChange={(e) => handleInputChange('transport_allowance', e.target.value === '' ? undefined : parseInt(e.target.value))}
                  min={0}
                  placeholder="0"
                />
                <p className="scenario-edit-card__note">
                  担当店舗に設定していないスタッフがこの店舗で働く場合に加算される金額
                </p>
              </div>

              {allStores.length > 0 && (
                <div>
                  <Label>キットグループ（同一拠点）</Label>
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
                  <p className="scenario-edit-card__note">
                    同じ住所の店舗を選択すると、キット移動計算で同一拠点として扱います
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="store-color">識別色</Label>
                <select
                  id="store-color"
                  value={formData.color || 'blue'}
                  onChange={(e) => handleInputChange('color', e.target.value)}
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
          </>
        )

      case 'contact':
        return (
          <div className="scenario-edit-card">
            <div>
              <Label htmlFor="store-address">住所</Label>
              <Input
                id="store-address"
                type="text"
                value={formData.address || ''}
                onChange={(e) => handleInputChange('address', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="store-access">アクセス方法</Label>
              <Textarea
                id="store-access"
                value={formData.access_info || ''}
                onChange={(e) => handleInputChange('access_info', e.target.value)}
                rows={3}
                placeholder="例: JR渋谷駅ハチ公口から徒歩5分。○○ビル3F"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="store-phone">電話番号</Label>
                <Input
                  id="store-phone"
                  type="tel"
                  value={formData.phone_number || ''}
                  onChange={(e) => handleInputChange('phone_number', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="store-email">メールアドレス</Label>
                <Input
                  id="store-email"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                />
              </div>
            </div>
          </div>
        )

      case 'operation':
        return (
          <div className="scenario-edit-card">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="opening-date">開店日</Label>
                <Input
                  id="opening-date"
                  type="date"
                  value={formData.opening_date || ''}
                  onChange={(e) => handleInputChange('opening_date', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="manager-name">店長名</Label>
                <Input
                  id="manager-name"
                  type="text"
                  value={formData.manager_name || ''}
                  onChange={(e) => handleInputChange('manager_name', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="capacity">収容人数 *</Label>
                <Input
                  id="capacity"
                  type="number"
                  min="1"
                  value={formData.capacity || ''}
                  onChange={(e) => handleInputChange('capacity', parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="rooms">部屋数 *</Label>
                <Input
                  id="rooms"
                  type="number"
                  min="1"
                  value={formData.rooms || ''}
                  onChange={(e) => handleInputChange('rooms', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="store-notes">メモ</Label>
              <Textarea
                id="store-notes"
                value={formData.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                placeholder="店舗に関するメモや特記事項"
              />
            </div>
          </div>
        )

      case 'costs':
        return (
          <>
            <div className="scenario-edit-card">
              <p className="scenario-edit-card__title">固定費</p>
              <p className="scenario-edit-card__note">
                家賃、光熱費など店舗運営に必要な固定費を設定できます。開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。
              </p>
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
              {formData.fixed_costs && formData.fixed_costs.length > 0 && (
                <p className="scenario-edit-card__note">
                  月額合計: ¥{(formData.fixed_costs.filter(c => c.frequency === 'monthly').reduce((sum, cost) => sum + cost.amount, 0)).toLocaleString()}
                </p>
              )}
            </div>
            <div className="scenario-edit-card">
              <p className="scenario-edit-card__title">1公演あたり会場費</p>
              <p className="scenario-edit-card__note">
                シナリオの収益計算で1公演ごとに差し引かれる会場費（家賃按分）
              </p>
              <div className="flex items-center gap-2">
                <span className="scenario-edit-card__note">¥</span>
                <Input
                  type="number"
                  value={formData.venue_cost_per_performance || 0}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    venue_cost_per_performance: parseInt(e.target.value) || 0
                  }))}
                />
                <span className="scenario-edit-card__note">/ 公演</span>
              </div>
            </div>
          </>
        )

      case 'travel':
        if (!store || allStores.length <= 1) {
          return (
            <div className="scenario-edit-card">
              <p className="scenario-edit-card__note">
                店舗を作成したあと、他店舗への移動時間を設定できます。
              </p>
            </div>
          )
        }
        return (
          <div className="scenario-edit-card">
            <p className="scenario-edit-card__title">他店舗への移動時間</p>
            <p className="scenario-edit-card__note">
              キット移動ルートの並び順に使う移動時間です。未入力の組み合わせは移動計画で暫定30分として扱われます。
            </p>
            <div className="space-y-3">
              {[...allStores]
                .filter(otherStore => otherStore.id !== store.id)
                .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999))
                .map(otherStore => {
                  const sameGroup = isSameTravelGroup(store, otherStore)
                  const draft = travelTimeDrafts[otherStore.id] || { minutes: '', memo: '' }
                  return (
                    <div key={otherStore.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="scenario-edit-card__sublabel">
                            {otherStore.short_name || otherStore.name}
                          </p>
                          <p className="scenario-edit-card__note">
                            {otherStore.status === 'active' ? '営業中' : otherStore.status === 'temporarily_closed' ? '一時休業' : '閉鎖'}
                          </p>
                        </div>
                        {sameGroup && (
                          <span className="scenario-edit-dialog__status is-public">
                            同一拠点 0分
                          </span>
                        )}
                      </div>
                      {sameGroup ? (
                        <p className="scenario-edit-card__note">
                          同じキットグループまたは同じ住所のため、移動時間入力は不要です。
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
                          <div>
                            <Label htmlFor={`travel-minutes-${otherStore.id}`}>分</Label>
                            <Input
                              id={`travel-minutes-${otherStore.id}`}
                              type="number"
                              min={1}
                              max={1440}
                              value={draft.minutes}
                              onChange={(e) => handleTravelTimeChange(otherStore.id, 'minutes', e.target.value)}
                              placeholder="30"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`travel-memo-${otherStore.id}`}>メモ</Label>
                            <Input
                              id={`travel-memo-${otherStore.id}`}
                              value={draft.memo}
                              onChange={(e) => handleTravelTimeChange(otherStore.id, 'memo', e.target.value)}
                              placeholder="例: 山手線、徒歩込み"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="xl"
        overlayClassName="scenario-edit-dialog-overlay"
        className="scenario-edit-dialog-host [&>button]:hidden"
      >
        <DialogTitle className="sr-only">{store ? '店舗編集' : '店舗新規作成'}</DialogTitle>
        <DialogDescription className="sr-only">
          基本情報・連絡先・運営・費用を設定
        </DialogDescription>

        <header className="scenario-edit-dialog__header">
          <div className="scenario-edit-dialog__header-left">
            <span className="scenario-edit-dialog__title">
              {store ? '店舗編集' : '店舗新規作成'}
            </span>
            {formData.name && (
              <span className="scenario-edit-dialog__scenario">{formData.name}</span>
            )}
          </div>
          <button type="button" className="scenario-edit-dialog__close" onClick={onClose}>
            閉じる
          </button>
        </header>

        <div className="scenario-edit-dialog__body">
          <nav className="scenario-edit-dialog__nav" aria-label="店舗編集セクション">
            {STORE_TABS.map((tab) => {
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={selected ? 'page' : undefined}
                  className={selected ? 'scenario-edit-dialog__nav-item is-selected' : 'scenario-edit-dialog__nav-item'}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>

          <div className="scenario-edit-dialog__content">
            <h2 className="scenario-edit-dialog__page-title">
              {STORE_TABS.find((tab) => tab.id === activeTab)?.label}
            </h2>
            <div className={activeTab === 'hours' ? 'space-y-4' : 'hidden'}>
              <StoreHoursSection ref={hoursRef} storeId={store?.id} />
            </div>
            <div className={activeTab === 'closure' ? 'space-y-4' : 'hidden'}>
              <StoreClosureSection
                ref={closureRef}
                store={store}
                status={formData.status || 'active'}
                onStatusChange={(value) => handleInputChange('status', value)}
              />
            </div>
            {activeTab !== 'hours' && activeTab !== 'closure' ? renderTabContent(activeTab) : null}
          </div>
        </div>

        <footer className="scenario-edit-dialog__footer">
          <div className="scenario-edit-dialog__meta">
            <span>{formData.name || '新規店舗'}</span>
            {onDelete && store && (
              <button
                type="button"
                className="scenario-edit-dialog__btn"
                onClick={handleDeleteButtonClick}
                disabled={loading || isCheckingDelete}
              >
                {isCheckingDelete ? '確認中...' : 'この店舗を削除'}
              </button>
            )}
          </div>
          <div className="scenario-edit-dialog__actions">
            <button type="button" className="scenario-edit-dialog__btn" onClick={onClose} disabled={loading}>
              キャンセル
            </button>
            <button
              type="button"
              className="scenario-edit-dialog__btn-primary"
              onClick={() => void handleSave()}
              disabled={loading}
            >
              {loading ? '保存中...' : '保存して閉じる'}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="店舗を削除しますか？"
        message={store ? `店舗「${store.name}」を削除してもよろしいですか？営業時間・料金などの店舗設定も一緒に削除されます。この操作は取り消せません。` : ''}
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={() => {
          if (!onDelete || !store) return
          onDelete(store)
          onClose()
        }}
      />

      {/* D-5d: 紐づきデータがある場合は削除不可の説明のみ（実行ボタンなし・閉じるのみ） */}
      <Dialog open={deleteBlockedDialogOpen} onOpenChange={setDeleteBlockedDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>この店舗は削除できません</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="scenario-edit-card__note">
              {store && deleteBlockedCounts
                ? `店舗「${store.name}」には 公演 ${deleteBlockedCounts.events} 件・予約 ${deleteBlockedCounts.reservations} 件・キット ${deleteBlockedCounts.kits} 件 が紐づいているため削除できません。先にこれらを整理してください。`
                : ''}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteBlockedDialogOpen(false)}>
              閉じる
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
