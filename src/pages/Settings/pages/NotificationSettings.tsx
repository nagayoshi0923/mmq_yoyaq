import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Bell, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface NotificationSettings {
  id: string
  store_id: string
  new_reservation_email: boolean
  new_reservation_discord: boolean
  cancellation_email: boolean
  cancellation_discord: boolean
  shift_reminder_days: number
  performance_reminder_days: number
  sales_report_notification: boolean
  discord_webhook_url: string
}

export function NotificationSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<NotificationSettings>({
    id: '',
    store_id: '',
    new_reservation_email: true,
    new_reservation_discord: false,
    cancellation_email: true,
    cancellation_discord: false,
    shift_reminder_days: 7,
    performance_reminder_days: 1,
    sales_report_notification: true,
    discord_webhook_url: ''
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
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('notification_settings')
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
          new_reservation_email: true,
          new_reservation_discord: false,
          cancellation_email: true,
          cancellation_discord: false,
          shift_reminder_days: 7,
          performance_reminder_days: 1,
          sales_report_notification: true,
          discord_webhook_url: ''
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
          .from('notification_settings')
          .update({
            new_reservation_email: formData.new_reservation_email,
            new_reservation_discord: formData.new_reservation_discord,
            cancellation_email: formData.cancellation_email,
            cancellation_discord: formData.cancellation_discord,
            shift_reminder_days: formData.shift_reminder_days,
            performance_reminder_days: formData.performance_reminder_days,
            sales_report_notification: formData.sales_report_notification,
            discord_webhook_url: formData.discord_webhook_url
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('notification_settings')
          .insert({
            store_id: formData.store_id,
            new_reservation_email: formData.new_reservation_email,
            new_reservation_discord: formData.new_reservation_discord,
            cancellation_email: formData.cancellation_email,
            cancellation_discord: formData.cancellation_discord,
            shift_reminder_days: formData.shift_reminder_days,
            performance_reminder_days: formData.performance_reminder_days,
            sales_report_notification: formData.sales_report_notification,
            discord_webhook_url: formData.discord_webhook_url
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
        title="通知設定"
        description="各種通知の設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 予約関連通知 */}
      <Card>
        <CardHeader>
          <CardTitle>予約関連通知</CardTitle>
          <CardDescription>新規予約とキャンセルの通知設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>新規予約メール通知</Label>
              <p className="text-xs text-muted-foreground mt-1">
                新しい予約が入った時にメールで通知
              </p>
            </div>
            <Switch
              checked={formData.new_reservation_email}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, new_reservation_email: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>新規予約Discord通知</Label>
              <p className="text-xs text-muted-foreground mt-1">
                新しい予約が入った時にDiscordで通知
              </p>
            </div>
            <Switch
              checked={formData.new_reservation_discord}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, new_reservation_discord: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <Label>キャンセルメール通知</Label>
              <p className="text-xs text-muted-foreground mt-1">
                予約がキャンセルされた時にメールで通知
              </p>
            </div>
            <Switch
              checked={formData.cancellation_email}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, cancellation_email: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>キャンセルDiscord通知</Label>
              <p className="text-xs text-muted-foreground mt-1">
                予約がキャンセルされた時にDiscordで通知
              </p>
            </div>
            <Switch
              checked={formData.cancellation_discord}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, cancellation_discord: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* リマインダー通知 */}
      <Card>
        <CardHeader>
          <CardTitle>リマインダー通知</CardTitle>
          <CardDescription>事前リマインドの通知設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>シフト提出リマインド（日前）</Label>
              <Input
                type="number"
                value={formData.shift_reminder_days}
                onChange={(e) => setFormData(prev => ({ ...prev, shift_reminder_days: parseInt(e.target.value) || 0 }))}
                min="1"
                max="30"
              />
              <p className="text-xs text-muted-foreground mt-1">
                シフト期限の{formData.shift_reminder_days}日前にリマインド送信
              </p>
            </div>
            <div>
              <Label>公演前日リマインド（日前）</Label>
              <Input
                type="number"
                value={formData.performance_reminder_days}
                onChange={(e) => setFormData(prev => ({ ...prev, performance_reminder_days: parseInt(e.target.value) || 0 }))}
                min="0"
                max="7"
              />
              <p className="text-xs text-muted-foreground mt-1">
                公演の{formData.performance_reminder_days}日前に参加者へリマインド送信
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* その他の通知 */}
      <Card>
        <CardHeader>
          <CardTitle>その他の通知</CardTitle>
          <CardDescription>売上レポートなどの通知設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>売上レポート通知</Label>
              <p className="text-xs text-muted-foreground mt-1">
                月次売上レポート作成時に通知
              </p>
            </div>
            <Switch
              checked={formData.sales_report_notification}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, sales_report_notification: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Discord Webhook */}
      <Card>
        <CardHeader>
          <CardTitle>Discord Webhook URL</CardTitle>
          <CardDescription>Discord通知を送信するためのWebhook URLを設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="discord_webhook">Webhook URL</Label>
            <Input
              id="discord_webhook"
              type="url"
              value={formData.discord_webhook_url}
              onChange={(e) => setFormData(prev => ({ ...prev, discord_webhook_url: e.target.value }))}
              placeholder="https://discord.com/api/webhooks/..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Discord通知を有効にする場合は、Webhook URLを設定してください
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

