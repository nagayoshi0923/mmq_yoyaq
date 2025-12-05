import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Save, Calendar, Bell, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface GlobalSettings {
  id: string
  shift_submission_start_day: number
  shift_submission_end_day: number
  shift_submission_target_months_ahead: number
  system_name: string
  maintenance_mode: boolean
  maintenance_message: string | null
  enable_email_notifications: boolean
  enable_discord_notifications: boolean
}

/**
 * 全体設定ページ
 * 店舗に依存しない、システム全体の設定を管理
 */
export function GeneralSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [formData, setFormData] = useState({
    shift_submission_start_day: 1,
    shift_submission_end_day: 15,
    shift_submission_target_months_ahead: 1,
    system_name: 'MMQ 予約管理システム',
    maintenance_mode: false,
    maintenance_message: '',
    enable_email_notifications: true,
    enable_discord_notifications: false
  })

  // 設定を取得
  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .single()

      if (error) {
        logger.error('全体設定の取得に失敗:', error)
        showToast.error('設定の読み込みに失敗しました')
        return
      }

      if (data) {
        setSettings(data)
        setFormData({
          shift_submission_start_day: data.shift_submission_start_day,
          shift_submission_end_day: data.shift_submission_end_day,
          shift_submission_target_months_ahead: data.shift_submission_target_months_ahead,
          system_name: data.system_name,
          maintenance_mode: data.maintenance_mode,
          maintenance_message: data.maintenance_message || '',
          enable_email_notifications: data.enable_email_notifications,
          enable_discord_notifications: data.enable_discord_notifications
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return

    try {
      setSaving(true)

      const { error } = await supabase
        .from('global_settings')
        .update({
          shift_submission_start_day: formData.shift_submission_start_day,
          shift_submission_end_day: formData.shift_submission_end_day,
          shift_submission_target_months_ahead: formData.shift_submission_target_months_ahead,
          system_name: formData.system_name,
          maintenance_mode: formData.maintenance_mode,
          maintenance_message: formData.maintenance_message || null,
          enable_email_notifications: formData.enable_email_notifications,
          enable_discord_notifications: formData.enable_discord_notifications
        })
        .eq('id', settings.id)

      if (error) {
        logger.error('設定保存エラー:', error)
        showToast.error('設定の保存に失敗しました')
        return
      }

      showToast.success('設定を保存しました')

      // 設定を再取得
      await fetchSettings()
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
        title="全体設定"
        description="システム全体の基本設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* シフト提出期間設定 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <CardTitle>シフト提出期間設定</CardTitle>
          </div>
          <CardDescription>スタッフがシフトを提出できる期間を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <p className="text-xs text-muted-foreground">シフト提出を開始できる日</p>
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
              <p className="text-xs text-muted-foreground">シフト提出の締切日</p>
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
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-900 mb-2">設定例</p>
            <p className="text-xs text-blue-700">
              開始日: {formData.shift_submission_start_day}日、
              締切日: {formData.shift_submission_end_day}日、
              対象: {formData.shift_submission_target_months_ahead}ヶ月先
              <br />
              → 毎月{formData.shift_submission_start_day}日〜{formData.shift_submission_end_day}日の間に、
              {formData.shift_submission_target_months_ahead}ヶ月後のシフトを提出できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* システム設定 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <CardTitle>システム設定</CardTitle>
          </div>
          <CardDescription>システム全体の基本設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system_name">システム名</Label>
            <Input
              id="system_name"
              value={formData.system_name}
              onChange={(e) => setFormData(prev => ({ ...prev, system_name: e.target.value }))}
              placeholder="MMQ 予約管理システム"
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="maintenance_mode">メンテナンスモード</Label>
              <p className="text-xs text-muted-foreground">
                有効にすると、管理者以外はシステムにアクセスできなくなります
              </p>
            </div>
            <Switch
              id="maintenance_mode"
              checked={formData.maintenance_mode}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, maintenance_mode: checked }))}
            />
          </div>

          {formData.maintenance_mode && (
            <div className="space-y-2">
              <Label htmlFor="maintenance_message">メンテナンスメッセージ</Label>
              <Input
                id="maintenance_message"
                value={formData.maintenance_message}
                onChange={(e) => setFormData(prev => ({ ...prev, maintenance_message: e.target.value }))}
                placeholder="現在メンテナンス中です。しばらくお待ちください。"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 通知設定 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            <CardTitle>全体通知設定</CardTitle>
          </div>
          <CardDescription>システム全体の通知機能の有効/無効を設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="enable_email_notifications">メール通知</Label>
              <p className="text-xs text-muted-foreground">
                予約確認、リマインダーなどのメール通知を有効化
              </p>
            </div>
            <Switch
              id="enable_email_notifications"
              checked={formData.enable_email_notifications}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enable_email_notifications: checked }))}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="enable_discord_notifications">Discord通知</Label>
              <p className="text-xs text-muted-foreground">
                予約やシフト変更のDiscord通知を有効化
              </p>
            </div>
            <Switch
              id="enable_discord_notifications"
              checked={formData.enable_discord_notifications}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enable_discord_notifications: checked }))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

