import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Save, UserPlus, Mail, User, Loader2, Coins, Clock, GraduationCap, BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { toast } from 'sonner'

interface StaffSettings {
  id: string
  store_id: string
  default_main_gm_reward: number
  default_sub_gm_reward: number
  shift_deadline_days: number
  staff_rank_enabled: boolean
  training_period_days: number
}

interface StaffSettingsProps {
  storeId?: string
}

export function StaffSettings({ storeId }: StaffSettingsProps) {
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

  // スタッフ招待
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' })
  const [isInviting, setIsInviting] = useState(false)

  const handleInvite = async () => {
    if (!inviteForm.name.trim()) { toast.error('名前を入力してください'); return }
    if (!inviteForm.email.trim()) { toast.error('メールアドレスを入力してください'); return }

    setIsInviting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('ログインが必要です'); return }

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', session.user.id)
        .single()

      const response = await supabase.functions.invoke('invite-staff', {
        body: {
          name: inviteForm.name.trim(),
          email: inviteForm.email.trim(),
          role: ['スタッフ'],
          organization_id: userData?.organization_id,
        },
      })

      if (response.error) throw response.error
      const result = response.data
      if (!result.success) {
        if (result.error?.includes('既に')) { toast.error('このメールアドレスは既に登録されています'); return }
        throw new Error(result.error || '招待に失敗しました')
      }

      toast.success(`${inviteForm.name} さんに招待メールを送信しました`)
      setInviteOpen(false)
      setInviteForm({ name: '', email: '' })
    } catch (error) {
      logger.error('Failed to invite staff:', error)
      toast.error('招待に失敗しました')
    } finally {
      setIsInviting(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行
  }, [])

  useEffect(() => {
    if (storeId && stores.length > 0 && storeId !== selectedStoreId) {
      setSelectedStoreId(storeId)
      fetchSettings(storeId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storeId変更時のみ実行
  }, [storeId, stores.length])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 組織対応済みの店舗取得
      const storesData = await storeApi.getAll()

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        const targetStoreId = storeId || storesData[0].id
        setSelectedStoreId(targetStoreId)
        await fetchSettings(targetStoreId)
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
        .from('staff_settings')
        .select('id, store_id, organization_id, default_main_gm_reward, default_sub_gm_reward, shift_deadline_days, staff_rank_enabled, training_period_days')
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
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('staff_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
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
        title="スタッフ設定"
        description="スタッフの権限と報酬設定"
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />スタッフを招待
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </PageHeader>

      {/* GM報酬デフォルト値 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Coins}
          label="GM報酬デフォルト値"
          description="新しいシナリオを作成する際のデフォルト報酬額。シナリオ編集のGM設定に反映される"
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>メインGM報酬</Label>
              <div className="flex items-center gap-2 mt-1.5">
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
              <div className="flex items-center gap-2 mt-1.5">
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
        </div>
      </section>

      {/* シフト提出期限 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Clock}
          label="シフト提出期限"
          description="公演日の何日前まで提出が必要か。シフト提出画面の期限判定に使用"
        />
        <div className="space-y-4">
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
          <p className="text-xs text-muted-foreground ml-36">
            例: 14日前の場合、2週間前までにシフト提出が必要
          </p>
        </div>
      </section>

      {/* スタッフランク制度 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={GraduationCap}
          label="スタッフランク制度"
          description="経験・実績によるランク分けを有効化"
        />
        <div className="space-y-4">
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
        </div>
      </section>

      {/* 研修期間 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={BookOpen}
          label="研修期間"
          description="入社から何日間を研修期間とするか"
        />
        <div className="space-y-4">
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
          <p className="text-xs text-muted-foreground ml-36">
            入社から{formData.training_period_days}日間は研修期間として扱われます
          </p>
        </div>
      </section>

      {/* スタッフ招待ダイアログ */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>スタッフを招待</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              招待メールを送信します。受信者はリンクからスタッフアカウントを作成できます。
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="invite-staff-name" className="text-sm font-medium">名前 <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-staff-name"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例: 山田太郎"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-staff-email" className="text-sm font-medium">メールアドレス <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-staff-email"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="例: staff@example.com"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviteOpen(false); setInviteForm({ name: '', email: '' }) }}>
              キャンセル
            </Button>
            <Button onClick={handleInvite} disabled={isInviting}>
              {isInviting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
              招待メールを送信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

