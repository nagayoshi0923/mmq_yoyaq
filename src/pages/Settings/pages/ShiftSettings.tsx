import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save, Calendar, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface ShiftSettingsData {
  id: string
  shift_submission_start_day: number
  shift_submission_end_day: number
  shift_submission_target_months_ahead: number
  shift_edit_deadline_days_before: number
}

export function ShiftSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Omit<ShiftSettingsData, 'id'>>({
    shift_submission_start_day: 1,
    shift_submission_end_day: 15,
    shift_submission_target_months_ahead: 1,
    shift_edit_deadline_days_before: 7,
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織情報の取得に失敗しました')
        return
      }

      const { data, error } = await supabase
        .from('global_settings')
        .select('id, shift_submission_start_day, shift_submission_end_day, shift_submission_target_months_ahead, shift_edit_deadline_days_before')
        .eq('organization_id', orgId)
        .single()

      if (error) {
        logger.error('シフト設定の取得に失敗:', error)
        showToast.error('設定の読み込みに失敗しました')
        return
      }

      if (data) {
        setSettingsId(data.id)
        setFormData({
          shift_submission_start_day: data.shift_submission_start_day ?? 1,
          shift_submission_end_day: data.shift_submission_end_day ?? 15,
          shift_submission_target_months_ahead: data.shift_submission_target_months_ahead ?? 1,
          shift_edit_deadline_days_before: data.shift_edit_deadline_days_before ?? 7,
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settingsId) return
    try {
      setSaving(true)
      const { error } = await supabase
        .from('global_settings')
        .update({
          shift_submission_start_day: formData.shift_submission_start_day,
          shift_submission_end_day: formData.shift_submission_end_day,
          shift_submission_target_months_ahead: formData.shift_submission_target_months_ahead,
          shift_edit_deadline_days_before: formData.shift_edit_deadline_days_before,
        })
        .eq('id', settingsId)

      if (error) throw error
      showToast.success('設定を保存しました')
    } catch (error) {
      logger.error('設定保存エラー:', error)
      showToast.error('設定の保存に失敗しました')
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
        title="シフト設定"
        description="シフト提出期間・編集期限の設定"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* シフト提出期間 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Calendar}
          label="シフト提出期間"
          description="毎月いつからいつまでシフトを提出できるか、何ヶ月先を対象とするかを設定します。スタッフのシフト提出画面に反映されます。"
        />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">提出開始日</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">毎月</span>
              <Input
                id="shift_submission_start_day"
                type="number"
                min="1"
                max="31"
                value={formData.shift_submission_start_day}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  shift_submission_start_day: parseInt(e.target.value) || 1
                }))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">日から</span>
            </div>
            <p className="text-xs text-muted-foreground">この日からスタッフがシフト提出できるようになります。</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">提出締切日</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">毎月</span>
              <Input
                id="shift_submission_end_day"
                type="number"
                min="1"
                max="31"
                value={formData.shift_submission_end_day}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  shift_submission_end_day: parseInt(e.target.value) || 15
                }))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">日まで</span>
            </div>
            <p className="text-xs text-muted-foreground">この日を過ぎると締切警告がスタッフ画面に表示されます。</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">対象月</Label>
            <div className="flex items-center gap-2">
              <Input
                id="shift_submission_target_months_ahead"
                type="number"
                min="0"
                max="3"
                value={formData.shift_submission_target_months_ahead}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  shift_submission_target_months_ahead: parseInt(e.target.value) || 1
                }))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">ヶ月先</span>
            </div>
            <p className="text-xs text-muted-foreground">提出するシフトの対象月です。「1」なら翌月分を提出します。</p>
          </div>
        </div>
      </section>

      {/* 編集締切 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Clock}
          label="編集締切"
          description="対象月の何日前まで変更を受け付けるかを設定します。この日以降はスタッフによるシフト変更ができなくなります。"
        />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">変更可能な期限</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">対象月の</span>
              <Input
                id="shift_edit_deadline_days_before"
                type="number"
                min="0"
                max="31"
                value={formData.shift_edit_deadline_days_before}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  shift_edit_deadline_days_before: parseInt(e.target.value) || 7
                }))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">日前まで編集可</span>
            </div>
            <p className="text-xs text-muted-foreground">この日を過ぎると、スタッフはシフト内容を変更できなくなります。</p>
          </div>
        </div>
      </section>
    </div>
  )
}
