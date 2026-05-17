import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Save, Plus, X, CircleDollarSign, Clock, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface TimePricing {
  time_slot: string
  price: number
}

interface EarlyBirdDiscount {
  enabled: boolean
  days: number
  discount: number
}

interface GroupDiscount {
  enabled: boolean
  min_people: number
  discount: number
}

interface CancellationFee {
  days_before: number
  fee: number
}

interface PricingSettings {
  id: string
  store_id: string
  default_participation_fee: number
  time_based_pricing: TimePricing[]
  early_bird_discount: EarlyBirdDiscount
  group_discount: GroupDiscount
  cancellation_fee: CancellationFee
}

interface PricingSettingsProps {
  storeId?: string
}

export function PricingSettings({ storeId }: PricingSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<PricingSettings>({
    id: '',
    store_id: '',
    default_participation_fee: 3000,
    time_based_pricing: [],
    early_bird_discount: { enabled: false, days: 7, discount: 500 },
    group_discount: { enabled: false, min_people: 6, discount: 500 },
    cancellation_fee: { days_before: 3, fee: 1000 }
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newTimePricing, setNewTimePricing] = useState({ time_slot: '', price: 0 })

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 組織対応済みの店舗取得
      const storesData = await storeApi.getAll()

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        setSelectedStoreId(storesData[0].id)
        await fetchSettings(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('pricing_settings')
        .select('id, store_id, organization_id, default_participation_fee, time_based_pricing, early_bird_discount, group_discount, cancellation_fee, updated_at')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData(data)
      } else {
        setFormData({
          id: '',
          store_id: storeId,
          default_participation_fee: 3000,
          time_based_pricing: [],
          early_bird_discount: { enabled: false, days: 7, discount: 500 },
          group_discount: { enabled: false, min_people: 6, discount: 500 },
          cancellation_fee: { days_before: 3, fee: 1000 }
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    }
  }

  const handleStoreChange = async (storeId: string) => {
    setSelectedStoreId(storeId)
    await fetchSettings(storeId)
  }

  const addTimePricing = () => {
    if (!newTimePricing.time_slot) {
      showToast.warning('時間帯を入力してください')
      return
    }
    setFormData(prev => ({
      ...prev,
      time_based_pricing: [...prev.time_based_pricing, { ...newTimePricing }]
    }))
    setNewTimePricing({ time_slot: '', price: 0 })
  }

  const removeTimePricing = (index: number) => {
    setFormData(prev => ({
      ...prev,
      time_based_pricing: prev.time_based_pricing.filter((_, i) => i !== index)
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('pricing_settings')
          .update({
            default_participation_fee: formData.default_participation_fee,
            time_based_pricing: formData.time_based_pricing,
            early_bird_discount: formData.early_bird_discount,
            group_discount: formData.group_discount,
            cancellation_fee: formData.cancellation_fee
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        // 店舗からorganization_idを取得
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('pricing_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            default_participation_fee: formData.default_participation_fee,
            time_based_pricing: formData.time_based_pricing,
            early_bird_discount: formData.early_bird_discount,
            group_discount: formData.group_discount,
            cancellation_fee: formData.cancellation_fee
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
      }

      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="料金設定"
        description="参加費・時間帯別料金・割引設定を管理します"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 基本料金 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={CircleDollarSign}
          label="基本料金"
          description="時間帯別料金が設定されていない公演に適用されるデフォルトの参加費です。予約フォームの料金表示に反映されます"
        />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">デフォルト参加費</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={formData.default_participation_fee}
                onChange={(e) => setFormData(prev => ({ ...prev, default_participation_fee: parseInt(e.target.value) || 0 }))}
                min="0"
                max="100000"
                step="100"
                className="w-36"
              />
              <span className="text-sm text-muted-foreground">円</span>
            </div>
          </div>
        </div>
      </section>

      {/* 時間帯別料金 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Clock}
          label="時間帯別料金"
          description="朝・昼・夜・平日・休日など時間帯によって異なる料金を設定できます。公演登録時にここで設定した時間帯から選択できます"
        />
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newTimePricing.time_slot}
              onChange={(e) => setNewTimePricing(prev => ({ ...prev, time_slot: e.target.value }))}
              placeholder="時間帯（例: 平日、土日祝）"
              className="flex-1"
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={newTimePricing.price}
                onChange={(e) => setNewTimePricing(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))}
                placeholder="料金"
                className="w-32"
                step="100"
              />
              <span className="text-sm text-muted-foreground">円</span>
            </div>
            <Button onClick={addTimePricing} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.time_based_pricing.length > 0 && (
            <div className="space-y-2">
              {formData.time_based_pricing.map((pricing, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-4">
                    <span className="w-32 text-sm font-medium">{pricing.time_slot}</span>
                    <span className="text-sm text-muted-foreground">¥{pricing.price.toLocaleString()}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTimePricing(index)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {formData.time_based_pricing.length === 0 && (
            <p className="text-xs text-muted-foreground">時間帯別料金が未設定の場合、デフォルト参加費が適用されます</p>
          )}
        </div>
      </section>

      {/* 割引設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Tag}
          label="割引設定"
          description="早期予約割引・グループ割引を有効にすると、予約フォームで自動的に割引が適用されます"
        />
        <div className="space-y-6">
          {/* 早割 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">早期予約割引（早割）</p>
                <p className="text-xs text-muted-foreground">設定日数以上前の予約に対して割引を適用します</p>
              </div>
              <Switch
                checked={formData.early_bird_discount.enabled}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({
                    ...prev,
                    early_bird_discount: { ...prev.early_bird_discount, enabled: checked }
                  }))
                }
              />
            </div>

            {formData.early_bird_discount.enabled && (
              <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">予約期限（日前）</Label>
                  <Input
                    type="number"
                    value={formData.early_bird_discount.days}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        early_bird_discount: { ...prev.early_bird_discount, days: parseInt(e.target.value) || 0 }
                      }))
                    }
                    min="1"
                    max="90"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.early_bird_discount.days}日前までの予約で割引適用
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">割引額</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={formData.early_bird_discount.discount}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          early_bird_discount: { ...prev.early_bird_discount, discount: parseInt(e.target.value) || 0 }
                        }))
                      }
                      min="0"
                      step="100"
                    />
                    <span className="text-sm text-muted-foreground">円</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t" />

          {/* グループ割引 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">グループ割引</p>
                <p className="text-xs text-muted-foreground">一定人数以上の予約に対して1人あたりの割引を適用します</p>
              </div>
              <Switch
                checked={formData.group_discount.enabled}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({
                    ...prev,
                    group_discount: { ...prev.group_discount, enabled: checked }
                  }))
                }
              />
            </div>

            {formData.group_discount.enabled && (
              <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">最小人数</Label>
                  <Input
                    type="number"
                    value={formData.group_discount.min_people}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        group_discount: { ...prev.group_discount, min_people: parseInt(e.target.value) || 0 }
                      }))
                    }
                    min="2"
                    max="20"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.group_discount.min_people}名以上で割引適用
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">割引額（1人あたり）</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={formData.group_discount.discount}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          group_discount: { ...prev.group_discount, discount: parseInt(e.target.value) || 0 }
                        }))
                      }
                      min="0"
                      step="100"
                    />
                    <span className="text-sm text-muted-foreground">円</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t" />

          {/* キャンセル料 */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">キャンセル料</p>
              <p className="text-xs text-muted-foreground">公演日の一定日数前を過ぎたキャンセルに発生する料金です。予約キャンセル処理時に参照されます</p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">キャンセル料発生（日前）</Label>
                <Input
                  type="number"
                  value={formData.cancellation_fee.days_before}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      cancellation_fee: { ...prev.cancellation_fee, days_before: parseInt(e.target.value) || 0 }
                    }))
                  }
                  min="0"
                  max="30"
                />
                <p className="text-xs text-muted-foreground">
                  公演日の{formData.cancellation_fee.days_before}日前からキャンセル料が発生
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">キャンセル料</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={formData.cancellation_fee.fee}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        cancellation_fee: { ...prev.cancellation_fee, fee: parseInt(e.target.value) || 0 }
                      }))
                    }
                    min="0"
                    step="100"
                  />
                  <span className="text-sm text-muted-foreground">円</span>
                </div>
                <p className="text-xs text-muted-foreground">期限を過ぎたキャンセルで発生する料金</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
