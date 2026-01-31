import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface RepeatCustomerDiscount {
  enabled: boolean
  visits: number
  discount: number
}

interface CustomerSettings {
  id: string
  store_id: string
  member_rank_enabled: boolean
  points_enabled: boolean
  repeat_customer_discount: RepeatCustomerDiscount
  birthday_benefit_enabled: boolean
}

interface CustomerSettingsProps {
  storeId?: string
}

export function CustomerSettings({ storeId }: CustomerSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<CustomerSettings>({
    id: '',
    store_id: '',
    member_rank_enabled: false,
    points_enabled: false,
    repeat_customer_discount: { enabled: false, visits: 5, discount: 500 },
    birthday_benefit_enabled: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
        .from('customer_settings')
        .select('id, store_id, organization_id, member_rank_enabled, points_enabled, repeat_customer_discount, birthday_benefit_enabled, updated_at')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData(data)
      } else {
        setFormData({
          id: '',
          store_id: storeId,
          member_rank_enabled: false,
          points_enabled: false,
          repeat_customer_discount: { enabled: false, visits: 5, discount: 500 },
          birthday_benefit_enabled: false
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

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('customer_settings')
          .update({
            member_rank_enabled: formData.member_rank_enabled,
            points_enabled: formData.points_enabled,
            repeat_customer_discount: formData.repeat_customer_discount,
            birthday_benefit_enabled: formData.birthday_benefit_enabled
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('customer_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            member_rank_enabled: formData.member_rank_enabled,
            points_enabled: formData.points_enabled,
            repeat_customer_discount: formData.repeat_customer_discount,
            birthday_benefit_enabled: formData.birthday_benefit_enabled
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
        title="顧客管理設定"
        description="顧客情報と会員管理設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 会員ランク制度 */}
      <Card>
        <CardHeader>
          <CardTitle>会員ランク制度</CardTitle>
          <CardDescription>顧客を来店回数や実績でランク分けします</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>会員ランク制度を有効にする</Label>
              <p className="text-xs text-muted-foreground mt-1">
                ブロンズ、シルバー、ゴールドなどのランク分け
              </p>
            </div>
            <Switch
              checked={formData.member_rank_enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, member_rank_enabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ポイント制度 */}
      <Card>
        <CardHeader>
          <CardTitle>ポイント制度</CardTitle>
          <CardDescription>来店や予約でポイントを付与します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>ポイント制度を有効にする</Label>
              <p className="text-xs text-muted-foreground mt-1">
                100円で1ポイント、次回利用時に1ポイント=1円で使用可能
              </p>
            </div>
            <Switch
              checked={formData.points_enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, points_enabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* リピーター割引 */}
      <Card>
        <CardHeader>
          <CardTitle>リピーター割引</CardTitle>
          <CardDescription>一定回数来店した顧客への割引を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>リピーター割引を有効にする</Label>
            <Switch
              checked={formData.repeat_customer_discount.enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({
                  ...prev,
                  repeat_customer_discount: { ...prev.repeat_customer_discount, enabled: checked }
                }))
              }
            />
          </div>

          {formData.repeat_customer_discount.enabled && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label>必要来店回数</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={formData.repeat_customer_discount.visits}
                    onChange={(e) => 
                      setFormData(prev => ({
                        ...prev,
                        repeat_customer_discount: { 
                          ...prev.repeat_customer_discount, 
                          visits: parseInt(e.target.value) || 0 
                        }
                      }))
                    }
                    min="1"
                    max="100"
                  />
                  <span className="text-xs text-muted-foreground">回</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.repeat_customer_discount.visits}回目以降の来店で割引適用
                </p>
              </div>
              <div>
                <Label>割引額</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={formData.repeat_customer_discount.discount}
                    onChange={(e) => 
                      setFormData(prev => ({
                        ...prev,
                        repeat_customer_discount: { 
                          ...prev.repeat_customer_discount, 
                          discount: parseInt(e.target.value) || 0 
                        }
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

      {/* 誕生日特典 */}
      <Card>
        <CardHeader>
          <CardTitle>誕生日特典</CardTitle>
          <CardDescription>誕生日月の顧客への特典を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>誕生日特典を有効にする</Label>
              <p className="text-xs text-muted-foreground mt-1">
                誕生日月に特別割引やプレゼントを提供
              </p>
            </div>
            <Switch
              checked={formData.birthday_benefit_enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, birthday_benefit_enabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

