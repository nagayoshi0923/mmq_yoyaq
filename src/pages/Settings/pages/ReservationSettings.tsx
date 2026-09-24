import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { SectionTitle } from '@/components/settings/SectionTitle'
import { Save, CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface ReservationSettings {
  id: string
  store_id: string
  payment_method_label: string
  payment_method_description: string
}

interface ReservationSettingsProps {
  storeId?: string
}

export function ReservationSettings({ storeId }: ReservationSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<ReservationSettings>({
    id: '',
    store_id: '',
    payment_method_label: '現地決済',
    payment_method_description: 'ご来店時にお支払いください'
  })
  const [settingsLoadError, setSettingsLoadError] = useState(false)
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
        if (storeId && !storesData.some(s => s.id === storeId)) throw new Error('選択した店舗を確認できません')
        const initialStoreId = storeId || storesData[0].id
        setStores(storesData)
        setSelectedStoreId(initialStoreId)
        await fetchSettings(initialStoreId)
      }
    } catch (error) {
      setSettingsLoadError(true)
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('reservation_settings')
        .select('id, store_id, organization_id, payment_method_label, payment_method_description, updated_at')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData({
          id: data.id,
          store_id: data.store_id,
          payment_method_label: data.payment_method_label ?? '現地決済',
          payment_method_description: data.payment_method_description ?? 'ご来店時にお支払いください'
        })
      } else {
        setFormData({
          id: '',
          store_id: storeId,
          payment_method_label: '現地決済',
          payment_method_description: 'ご来店時にお支払いください'
        })
      }
    } catch (error) {
      setSettingsLoadError(true)
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
          .from('reservation_settings')
          .update({
            payment_method_label: formData.payment_method_label,
            payment_method_description: formData.payment_method_description
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('reservation_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            payment_method_label: formData.payment_method_label,
            payment_method_description: formData.payment_method_description
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData({
            id: data.id,
            store_id: data.store_id,
            payment_method_label: data.payment_method_label ?? '現地決済',
            payment_method_description: data.payment_method_description ?? 'ご来店時にお支払いください'
          })
        }
      }

      showToast.success('設定を保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (settingsLoadError) return <p role="alert">設定を取得できませんでした。ページを再読み込みしてください。</p>

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <PageHeader
        title="予約設定"
        description="予約時に表示する支払い方法の案内を店舗ごとに設定します"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 支払い方法の案内 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={CreditCard}
          label="支払い方法の案内"
          description="予約確認画面に表示する支払い方法の名称と説明文を設定します"
        />
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">支払い方法の名称</Label>
              <Input
                value={formData.payment_method_label}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_method_label: e.target.value }))}
                placeholder="現地決済"
              />
              <p className="text-xs text-muted-foreground">例: 現地決済、当日現金払い、カード決済可 など</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">支払い方法の説明文</Label>
              <Input
                value={formData.payment_method_description}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_method_description: e.target.value }))}
                placeholder="ご来店時にお支払いください"
              />
              <p className="text-xs text-muted-foreground">予約確認画面・確認メールに表示される補足説明です</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
