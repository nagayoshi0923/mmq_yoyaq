import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save, Calendar } from 'lucide-react'
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
    <div className="space-y-6">
      <PageHeader
        title="シフト設定"
        description="シフト提出期間・編集期限の設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <CardTitle>シフト提出期間設定</CardTitle>
          </div>
          <CardDescription>スタッフがシフトを提出できる期間を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shift_submission_start_day">提出開始日</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">毎月</span>
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
                <span className="text-xs text-muted-foreground">日から</span>
              </div>
              <p className="text-xs text-muted-foreground">この日からシフト提出が可能になります</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shift_submission_end_day">提出締切日</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">毎月</span>
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
                <span className="text-xs text-muted-foreground">日まで</span>
              </div>
              <p className="text-xs text-muted-foreground">この日を過ぎると締切警告が表示されます</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shift_submission_target_months_ahead">対象月</Label>
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
                <span className="text-xs text-muted-foreground">ヶ月先</span>
              </div>
              <p className="text-xs text-muted-foreground">提出するシフトの対象月</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shift_edit_deadline_days_before">編集締切</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">対象月の</span>
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
                <span className="text-xs text-muted-foreground">日前まで編集可</span>
              </div>
              <p className="text-xs text-muted-foreground">この日以降はシフトの変更ができなくなります</p>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-900 mb-2">設定例</p>
            <p className="text-xs text-blue-700">
              提出期間: {formData.shift_submission_start_day}日〜{formData.shift_submission_end_day}日、
              対象: {formData.shift_submission_target_months_ahead}ヶ月先、
              編集締切: 対象月の{formData.shift_edit_deadline_days_before}日前まで
              <br />
              → 毎月{formData.shift_submission_start_day}日〜{formData.shift_submission_end_day}日の間に、
              {formData.shift_submission_target_months_ahead}ヶ月後のシフトを提出してください
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
