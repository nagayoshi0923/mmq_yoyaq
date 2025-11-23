import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Users, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface StaffSettings {
  id: string
  store_id: string
  default_main_gm_reward: number
  default_sub_gm_reward: number
  shift_deadline_days: number
  staff_rank_enabled: boolean
  training_period_days: number
}

export function StaffSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<StaffSettings>({
    id: '',
    store_id: '',
    default_main_gm_reward: 2000,
    default_sub_gm_reward: 1500,
    shift_deadline_days: 14,
    staff_rank_enabled: false,
    training_period_days: 90
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
      alert('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('staff_settings')
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
          default_main_gm_reward: 2000,
          default_sub_gm_reward: 1500,
          shift_deadline_days: 14,
          staff_rank_enabled: false,
          training_period_days: 90
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
          .from('staff_settings')
          .update({
            default_main_gm_reward: formData.default_main_gm_reward,
            default_sub_gm_reward: formData.default_sub_gm_reward,
            shift_deadline_days: formData.shift_deadline_days,
            staff_rank_enabled: formData.staff_rank_enabled,
            training_period_days: formData.training_period_days
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('staff_settings')
          .insert({
            store_id: formData.store_id,
            default_main_gm_reward: formData.default_main_gm_reward,
            default_sub_gm_reward: formData.default_sub_gm_reward,
            shift_deadline_days: formData.shift_deadline_days,
            staff_rank_enabled: formData.staff_rank_enabled,
            training_period_days: formData.training_period_days
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
      }

      alert('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-600" />
          <h1 className="text-lg">スタッフ設定</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>

      {/* GM報酬デフォルト値 */}
      <Card>
        <CardHeader>
          <CardTitle>GM報酬デフォルト値</CardTitle>
          <CardDescription>新しいシナリオを作成する際のデフォルト報酬額</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>メインGM報酬</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formData.default_main_gm_reward}
                  onChange={(e) => setFormData(prev => ({ ...prev, default_main_gm_reward: parseInt(e.target.value) || 0 }))}
                  min="0"
                  step="100"
                />
                <span className="text-xs text-muted-foreground">円</span>
              </div>
            </div>
            <div>
              <Label>サブGM報酬</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formData.default_sub_gm_reward}
                  onChange={(e) => setFormData(prev => ({ ...prev, default_sub_gm_reward: parseInt(e.target.value) || 0 }))}
                  min="0"
                  step="100"
                />
                <span className="text-xs text-muted-foreground">円</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* シフト提出期限 */}
      <Card>
        <CardHeader>
          <CardTitle>シフト提出期限</CardTitle>
          <CardDescription>スタッフがシフトを提出する期限を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">提出期限</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">公演日の</span>
              <Input
                type="number"
                value={formData.shift_deadline_days}
                onChange={(e) => setFormData(prev => ({ ...prev, shift_deadline_days: parseInt(e.target.value) || 0 }))}
                min="1"
                max="90"
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">日前まで</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-36">
            例: 14日前の場合、2週間前までにシフト提出が必要
          </p>
        </CardContent>
      </Card>

      {/* スタッフランク制度 */}
      <Card>
        <CardHeader>
          <CardTitle>スタッフランク制度</CardTitle>
          <CardDescription>スタッフのランク分けを有効にします</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>スタッフランク制度を有効にする</Label>
              <p className="text-xs text-muted-foreground mt-1">
                経験や実績に応じてスタッフをランク分け
              </p>
            </div>
            <Switch
              checked={formData.staff_rank_enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, staff_rank_enabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* 研修期間 */}
      <Card>
        <CardHeader>
          <CardTitle>研修期間</CardTitle>
          <CardDescription>新人スタッフの研修期間を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">研修期間</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={formData.training_period_days}
                onChange={(e) => setFormData(prev => ({ ...prev, training_period_days: parseInt(e.target.value) || 0 }))}
                min="0"
                max="365"
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">日間</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-36">
            入社から{formData.training_period_days}日間は研修期間として扱われます
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

