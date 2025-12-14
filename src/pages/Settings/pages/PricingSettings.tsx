import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Save, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('*')
        .order('name')

      if (storesError) throw storesError

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
        .select('*')
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
        const { data, error } = await supabase
          .from('pricing_settings')
          .insert({
            store_id: formData.store_id,
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
    <div className="space-y-6">
      <PageHeader
        title="料金設定"
        description="料金体系と割引設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* デフォルト参加費 */}
      <Card>
        <CardHeader>
          <CardTitle>デフォルト参加費</CardTitle>
          <CardDescription>基本的な参加費を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">参加費</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={formData.default_participation_fee}
                onChange={(e) => setFormData(prev => ({ ...prev, default_participation_fee: parseInt(e.target.value) || 0 }))}
                min="0"
                max="100000"
                step="100"
                className="w-32"
              />
              <span className="text-xs text-muted-foreground">円</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 時間帯別料金 */}
      <Card>
        <CardHeader>
          <CardTitle>時間帯別料金</CardTitle>
          <CardDescription>曜日や時間帯によって異なる料金を設定できます</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <span className="text-xs text-muted-foreground">円</span>
            </div>
            <Button onClick={addTimePricing} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.time_based_pricing.length > 0 && (
            <div className="space-y-2">
              {formData.time_based_pricing.map((pricing, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-4">
                    <span className="w-32">{pricing.time_slot}</span>
                    <span className="text-muted-foreground">¥{pricing.price.toLocaleString()}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTimePricing(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 早割設定 */}
      <Card>
        <CardHeader>
          <CardTitle>早割設定</CardTitle>
          <CardDescription>早期予約による割引を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>早割を有効にする</Label>
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
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label>予約期限（日前）</Label>
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
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.early_bird_discount.days}日前までの予約で割引適用
                </p>
              </div>
              <div>
                <Label>割引額</Label>
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
                  <span className="text-xs text-muted-foreground">円</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 団体割引設定 */}
      <Card>
        <CardHeader>
          <CardTitle>団体割引設定</CardTitle>
          <CardDescription>一定人数以上の予約による割引を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>団体割引を有効にする</Label>
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
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label>最小人数</Label>
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
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.group_discount.min_people}名以上で割引適用
                </p>
              </div>
              <div>
                <Label>割引額（1人あたり）</Label>
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
                  <span className="text-xs text-muted-foreground">円</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* キャンセル料設定 */}
      <Card>
        <CardHeader>
          <CardTitle>キャンセル料設定</CardTitle>
          <CardDescription>キャンセル時の料金を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>キャンセル料発生（日前）</Label>
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
              <p className="text-xs text-muted-foreground mt-1">
                公演日の{formData.cancellation_fee.days_before}日前からキャンセル料が発生
              </p>
            </div>
            <div>
              <Label>キャンセル料</Label>
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
                <span className="text-xs text-muted-foreground">円</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                期限を過ぎたキャンセルで発生する料金
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

