import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Save, Star, Gift } from 'lucide-react'
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
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="顧客管理設定"
        description="顧客情報と会員管理設定"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 会員ランク・ポイント */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Star}
          label="会員ランク・ポイント"
          description="顧客のランク制度・ポイント機能の有効化を設定します。有効にすると顧客詳細画面でランクやポイント残高が表示されます。"
        />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">会員ランク制度を有効にする</Label>
              </div>
              <Switch
                checked={formData.member_rank_enabled}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, member_rank_enabled: checked }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">ブロンズ・シルバー・ゴールドなど、来店実績によるランク分けが有効になります。</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">ポイント制度を有効にする</Label>
              </div>
              <Switch
                checked={formData.points_enabled}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, points_enabled: checked }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">来店・予約でポイントを付与します。100円で1ポイント、次回利用時に1ポイント＝1円で使用できます。</p>
          </div>
        </div>
      </section>

      {/* 特典設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Gift}
          label="特典設定"
          description="リピーター割引・誕生日特典を設定します。有効にすると対象顧客の予約画面に特典が自動適用されます。"
        />
        <div className="space-y-4">
          {/* リピーター割引 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">リピーター割引を有効にする</Label>
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
            <p className="text-xs text-muted-foreground">一定回数以上来店した顧客に対して自動的に割引を適用します。</p>
          </div>

          {formData.repeat_customer_discount.enabled && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">必要来店回数</Label>
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
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">回</span>
                </div>
                <p className="text-xs text-muted-foreground">{formData.repeat_customer_discount.visits}回目以降の来店から割引が適用されます。</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">割引額</Label>
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
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">円</span>
                </div>
                <p className="text-xs text-muted-foreground">予約時の合計金額から差し引かれます。</p>
              </div>
            </div>
          )}

          {/* 誕生日特典 */}
          <div className="space-y-1.5 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">誕生日特典を有効にする</Label>
              </div>
              <Switch
                checked={formData.birthday_benefit_enabled}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, birthday_benefit_enabled: checked }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">誕生日月に特別割引やプレゼントを提供します。顧客詳細に誕生日が登録されている場合に有効です。</p>
          </div>
        </div>
      </section>
    </div>
  )
}
