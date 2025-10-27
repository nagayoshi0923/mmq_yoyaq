import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { supabase } from '@/lib/supabase'
import { Bell, Calendar, Clock, Save } from 'lucide-react'

interface NotificationSettingsData {
  shift_notification_enabled: boolean
  shift_notification_day: number
  shift_deadline_day: number
  shift_reminder_days: number
}

export function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettingsData>({
    shift_notification_enabled: true,
    shift_notification_day: 25,
    shift_deadline_day: 25,
    shift_reminder_days: 3
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 設定を読み込み
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .single()

      if (error) throw error

      if (data) {
        setSettings({
          shift_notification_enabled: data.shift_notification_enabled ?? true,
          shift_notification_day: data.shift_notification_day ?? 25,
          shift_deadline_day: data.shift_deadline_day ?? 25,
          shift_reminder_days: data.shift_reminder_days ?? 3
        })
      }
    } catch (error) {
      console.error('設定の読み込みエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('notification_settings')
        .upsert({
          shift_notification_enabled: settings.shift_notification_enabled,
          shift_notification_day: settings.shift_notification_day,
          shift_deadline_day: settings.shift_deadline_day,
          shift_reminder_days: settings.shift_reminder_days,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      alert('設定を保存しました')
    } catch (error) {
      console.error('設定の保存エラー:', error)
      alert('設定の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">シフト募集通知設定</h1>
        <p className="text-muted-foreground">
          Discord通知のタイミングと締切日を設定します
        </p>
      </div>

      {/* 通知有効/無効 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            通知の有効化
          </CardTitle>
          <CardDescription>
            シフト募集のDiscord通知を有効にするかどうか
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enabled"
              checked={settings.shift_notification_enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, shift_notification_enabled: checked as boolean })
              }
            />
            <Label
              htmlFor="enabled"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              シフト募集通知を有効にする
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* 募集通知日 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            募集通知日
          </CardTitle>
          <CardDescription>
            翌月のシフト募集通知を送信する日（毎月◯日）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="notification-day" className="min-w-[120px]">
              通知日
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">毎月</span>
              <Input
                id="notification-day"
                type="number"
                min="1"
                max="31"
                value={settings.shift_notification_day}
                onChange={(e) =>
                  setSettings({ ...settings, shift_notification_day: parseInt(e.target.value) || 25 })
                }
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">日</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            例: 25日に設定すると、毎月25日に翌月のシフト募集通知が送信されます
          </p>
        </CardContent>
      </Card>

      {/* 締切日 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            シフト提出締切日
          </CardTitle>
          <CardDescription>
            シフト提出の締切日（毎月◯日 23:59まで）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="deadline-day" className="min-w-[120px]">
              締切日
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">毎月</span>
              <Input
                id="deadline-day"
                type="number"
                min="1"
                max="31"
                value={settings.shift_deadline_day}
                onChange={(e) =>
                  setSettings({ ...settings, shift_deadline_day: parseInt(e.target.value) || 25 })
                }
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">日 23:59まで</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            例: 25日に設定すると、翌月のシフトは毎月25日 23:59が締切になります
          </p>
        </CardContent>
      </Card>

      {/* リマインダー */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            リマインダー
          </CardTitle>
          <CardDescription>
            締切◯日前に未提出者へリマインダーを送信
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="reminder-days" className="min-w-[120px]">
              リマインダー日数
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">締切</span>
              <Input
                id="reminder-days"
                type="number"
                min="1"
                max="10"
                value={settings.shift_reminder_days}
                onChange={(e) =>
                  setSettings({ ...settings, shift_reminder_days: parseInt(e.target.value) || 3 })
                }
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">日前</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            例: 3日に設定すると、締切3日前に未提出者へリマインダーが送信されます
          </p>
        </CardContent>
      </Card>

      {/* 通知先の説明 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            通知先
          </CardTitle>
          <CardDescription>
            シフト募集通知の送信先
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            シフト募集通知は、各スタッフの個別Discordチャンネルに自動送信されます。<br />
            スタッフ管理ページで各スタッフのDiscordチャンネルIDを設定してください。
          </p>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '設定を保存'}
        </Button>
      </div>
    </div>
  )
}

