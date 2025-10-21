import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Mail, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface EmailSettings {
  id: string
  store_id: string
  from_email: string
  from_name: string
  reservation_confirmation_template: string
  cancellation_template: string
  reminder_template: string
}

export function EmailSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<EmailSettings>({
    id: '',
    store_id: '',
    from_email: '',
    from_name: '',
    reservation_confirmation_template: '',
    cancellation_template: '',
    reminder_template: ''
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
        .from('email_settings')
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
          from_email: '',
          from_name: '',
          reservation_confirmation_template: getDefaultReservationTemplate(),
          cancellation_template: getDefaultCancellationTemplate(),
          reminder_template: getDefaultReminderTemplate()
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
    if (!formData.from_email || !formData.from_name) {
      alert('送信元メールアドレスと送信元名は必須です')
      return
    }

    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('email_settings')
          .update({
            from_email: formData.from_email,
            from_name: formData.from_name,
            reservation_confirmation_template: formData.reservation_confirmation_template,
            cancellation_template: formData.cancellation_template,
            reminder_template: formData.reminder_template
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('email_settings')
          .insert({
            store_id: formData.store_id,
            from_email: formData.from_email,
            from_name: formData.from_name,
            reservation_confirmation_template: formData.reservation_confirmation_template,
            cancellation_template: formData.cancellation_template,
            reminder_template: formData.reminder_template
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
          <Mail className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">メール設定</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>

      {/* 送信元情報 */}
      <Card>
        <CardHeader>
          <CardTitle>送信元情報</CardTitle>
          <CardDescription>メールの送信元アドレスと名前を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from_email">送信元メールアドレス *</Label>
              <Input
                id="from_email"
                type="email"
                value={formData.from_email}
                onChange={(e) => setFormData(prev => ({ ...prev, from_email: e.target.value }))}
                placeholder="noreply@example.com"
              />
            </div>
            <div>
              <Label htmlFor="from_name">送信元名 *</Label>
              <Input
                id="from_name"
                value={formData.from_name}
                onChange={(e) => setFormData(prev => ({ ...prev, from_name: e.target.value }))}
                placeholder="クイーンズワルツ"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 予約確認メールテンプレート */}
      <Card>
        <CardHeader>
          <CardTitle>予約確認メールテンプレート</CardTitle>
          <CardDescription>予約確定時に送信されるメールの内容</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.reservation_confirmation_template}
            onChange={(e) => setFormData(prev => ({ ...prev, reservation_confirmation_template: e.target.value }))}
            rows={8}
            placeholder="予約確認メールのテンプレート"
          />
          <p className="text-xs text-muted-foreground mt-2">
            使用可能な変数: {'{customer_name}'}, {'{scenario_title}'}, {'{date}'}, {'{time}'}, {'{participants}'}, {'{total_price}'}
          </p>
        </CardContent>
      </Card>

      {/* キャンセルメールテンプレート */}
      <Card>
        <CardHeader>
          <CardTitle>キャンセルメールテンプレート</CardTitle>
          <CardDescription>予約キャンセル時に送信されるメールの内容</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.cancellation_template}
            onChange={(e) => setFormData(prev => ({ ...prev, cancellation_template: e.target.value }))}
            rows={6}
            placeholder="キャンセルメールのテンプレート"
          />
          <p className="text-xs text-muted-foreground mt-2">
            使用可能な変数: {'{customer_name}'}, {'{scenario_title}'}, {'{date}'}, {'{cancellation_fee}'}
          </p>
        </CardContent>
      </Card>

      {/* リマインドメールテンプレート */}
      <Card>
        <CardHeader>
          <CardTitle>リマインドメールテンプレート</CardTitle>
          <CardDescription>公演前日に送信されるリマインドメールの内容</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.reminder_template}
            onChange={(e) => setFormData(prev => ({ ...prev, reminder_template: e.target.value }))}
            rows={6}
            placeholder="リマインドメールのテンプレート"
          />
          <p className="text-xs text-muted-foreground mt-2">
            使用可能な変数: {'{customer_name}'}, {'{scenario_title}'}, {'{date}'}, {'{time}'}, {'{venue}'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// デフォルトテンプレート
function getDefaultReservationTemplate() {
  return `{customer_name} 様

ご予約ありがとうございます。
以下の内容で予約を承りました。

■ 予約内容
シナリオ: {scenario_title}
日時: {date} {time}
参加人数: {participants}名
合計金額: ¥{total_price}

当日お会いできることを楽しみにしております。

クイーンズワルツ`
}

function getDefaultCancellationTemplate() {
  return `{customer_name} 様

予約のキャンセルを承りました。

■ キャンセル内容
シナリオ: {scenario_title}
日時: {date}
キャンセル料: ¥{cancellation_fee}

またのご利用をお待ちしております。

クイーンズワルツ`
}

function getDefaultReminderTemplate() {
  return `{customer_name} 様

明日の公演についてリマインドいたします。

■ 予約内容
シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}

お気をつけてお越しください。

クイーンズワルツ`
}

