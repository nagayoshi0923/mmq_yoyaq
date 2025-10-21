import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Mail, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

// デフォルトテンプレート
function getDefaultReservationTemplate(companyName = 'クイーンズワルツ', companyPhone = '03-XXXX-XXXX', companyEmail = 'info@queens-waltz.jp') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''
  
  return `{customer_name} 様

この度は${companyName}をご予約いただき、誠にありがとうございます。
以下の内容で予約を承りました。

━━━━━━━━━━━━━━━━━━━━━━
■ ご予約内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ名: {scenario_title}
開催日時: {date} {time}開演
参加人数: {participants}名様
ご請求金額: ¥{total_price}

━━━━━━━━━━━━━━━━━━━━━━
■ 当日のご案内
━━━━━━━━━━━━━━━━━━━━━━

・開演15分前までに受付をお済ませください
・お飲み物は店内でご購入いただけます
・キャンセルは3日前までにご連絡ください

━━━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、お気軽にお問い合わせください。
当日お会いできることを、スタッフ一同楽しみにしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

function getDefaultCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '03-XXXX-XXXX', companyEmail = 'info@queens-waltz.jp') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''
  
  return `{customer_name} 様

ご予約のキャンセルを承りました。

━━━━━━━━━━━━━━━━━━━━━━
■ キャンセル内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ名: {scenario_title}
開催日時: {date}
キャンセル料: ¥{cancellation_fee}

━━━━━━━━━━━━━━━━━━━━━━

またのご利用を心よりお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

function getDefaultReminderTemplate(companyName = 'クイーンズワルツ', companyPhone = '03-XXXX-XXXX', companyEmail = 'info@queens-waltz.jp', daysBefore = 1) {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''
  const contactInfo = companyPhone ? `・当日連絡先: ${companyPhone}` : ''
  
  // 日数に応じたメッセージを生成
  let dayMessage = ''
  if (daysBefore === 1) {
    dayMessage = '明日の公演についてリマインドいたします。'
  } else if (daysBefore === 2) {
    dayMessage = '明後日の公演についてリマインドいたします。'
  } else if (daysBefore === 3) {
    dayMessage = '3日後の公演についてリマインドいたします。'
  } else if (daysBefore === 7) {
    dayMessage = '1週間後の公演についてリマインドいたします。'
  } else if (daysBefore === 14) {
    dayMessage = '2週間後の公演についてリマインドいたします。'
  } else {
    dayMessage = `${daysBefore}日後の公演についてリマインドいたします。`
  }
  
  return `{customer_name} 様

${dayMessage}

━━━━━━━━━━━━━━━━━━━━━━
■ ご予約内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ名: {scenario_title}
開催日時: {date} {time}開演
会場: {venue}

━━━━━━━━━━━━━━━━━━━━━━
■ 当日のお願い
━━━━━━━━━━━━━━━━━━━━━━

・開演15分前までにお越しください
・お時間に余裕を持ってご来店ください
${contactInfo}

━━━━━━━━━━━━━━━━━━━━━━

お気をつけてお越しください。
スタッフ一同、お待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

interface EmailSettings {
  id: string
  store_id: string
  from_email: string
  from_name: string
  company_name: string
  company_phone: string
  company_email: string
  company_address: string
  reservation_confirmation_template: string
  cancellation_template: string
  reminder_template: string
  reminder_enabled: boolean
  reminder_days_before: number
  reminder_time: string
  reminder_send_time: 'morning' | 'afternoon' | 'evening'
}

export function EmailSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<EmailSettings>({
    id: '',
    store_id: '',
    from_email: '',
    from_name: '',
    company_name: 'クイーンズワルツ',
    company_phone: '03-XXXX-XXXX',
    company_email: 'info@queens-waltz.jp',
    company_address: '',
    reservation_confirmation_template: '',
    cancellation_template: '',
    reminder_template: '',
    reminder_enabled: true,
    reminder_days_before: 1,
    reminder_time: '10:00',
    reminder_send_time: 'morning'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  // 会社情報が変更されたときにテンプレートを更新
  useEffect(() => {
    if (formData.company_name || formData.company_phone || formData.company_email) {
      setFormData(prev => ({
        ...prev,
        reservation_confirmation_template: getDefaultReservationTemplate(
          prev.company_name,
          prev.company_phone,
          prev.company_email
        ),
        cancellation_template: getDefaultCancellationTemplate(
          prev.company_name,
          prev.company_phone,
          prev.company_email
        ),
        reminder_template: getDefaultReminderTemplate(
          prev.company_name,
          prev.company_phone,
          prev.company_email,
          prev.reminder_days_before
        )
      }))
    }
  }, [formData.company_name, formData.company_phone, formData.company_email])

  // リマインド日数が変更されたときにテンプレートを更新
  useEffect(() => {
    if (formData.reminder_enabled && formData.company_name) {
      setFormData(prev => ({
        ...prev,
        reminder_template: getDefaultReminderTemplate(
          prev.company_name,
          prev.company_phone,
          prev.company_email,
          prev.reminder_days_before
        )
      }))
    }
  }, [formData.reminder_days_before])

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

      {/* 会社情報 */}
      <Card>
        <CardHeader>
          <CardTitle>会社情報</CardTitle>
          <CardDescription>メールテンプレートに表示される会社情報を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company_name">会社名 *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="クイーンズワルツ"
              />
            </div>
            <div>
              <Label htmlFor="company_phone">電話番号</Label>
              <Input
                id="company_phone"
                value={formData.company_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, company_phone: e.target.value }))}
                placeholder="03-XXXX-XXXX"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company_email">会社メールアドレス *</Label>
              <Input
                id="company_email"
                type="email"
                value={formData.company_email}
                onChange={(e) => setFormData(prev => ({ ...prev, company_email: e.target.value }))}
                placeholder="info@queens-waltz.jp"
              />
            </div>
            <div>
              <Label htmlFor="company_address">住所</Label>
              <Input
                id="company_address"
                value={formData.company_address}
                onChange={(e) => setFormData(prev => ({ ...prev, company_address: e.target.value }))}
                placeholder="東京都渋谷区..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* リマインドメール設定 */}
      <Card>
        <CardHeader>
          <CardTitle>リマインドメール設定</CardTitle>
          <CardDescription>公演前に送信されるリマインドメールの設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* リマインド有効/無効 */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="reminder_enabled">リマインドメールを送信する</Label>
              <p className="text-sm text-muted-foreground">予約者にリマインドメールを送信します</p>
            </div>
            <input
              id="reminder_enabled"
              type="checkbox"
              checked={formData.reminder_enabled}
              onChange={(e) => setFormData(prev => ({ ...prev, reminder_enabled: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>

          {formData.reminder_enabled && (
            <>
              {/* 送信タイミング */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="reminder_days_before">何日前に送信</Label>
                  <select
                    id="reminder_days_before"
                    value={formData.reminder_days_before}
                    onChange={(e) => setFormData(prev => ({ ...prev, reminder_days_before: parseInt(e.target.value) }))}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={1}>1日前</option>
                    <option value={2}>2日前</option>
                    <option value={3}>3日前</option>
                    <option value={7}>1週間前</option>
                    <option value={14}>2週間前</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="reminder_time">送信時刻</Label>
                  <Input
                    id="reminder_time"
                    type="time"
                    value={formData.reminder_time}
                    onChange={(e) => setFormData(prev => ({ ...prev, reminder_time: e.target.value }))}
                  />
                </div>
              </div>

              {/* 送信時間帯の選択 */}
              <div>
                <Label>送信時間帯の目安</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reminder_send_time"
                      value="morning"
                      checked={formData.reminder_send_time === 'morning'}
                      onChange={(e) => setFormData(prev => ({ ...prev, reminder_send_time: e.target.value as 'morning' | 'afternoon' | 'evening' }))}
                      className="mr-2"
                    />
                    朝（9:00-12:00）
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reminder_send_time"
                      value="afternoon"
                      checked={formData.reminder_send_time === 'afternoon'}
                      onChange={(e) => setFormData(prev => ({ ...prev, reminder_send_time: e.target.value as 'morning' | 'afternoon' | 'evening' }))}
                      className="mr-2"
                    />
                    午後（13:00-17:00）
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reminder_send_time"
                      value="evening"
                      checked={formData.reminder_send_time === 'evening'}
                      onChange={(e) => setFormData(prev => ({ ...prev, reminder_send_time: e.target.value as 'morning' | 'afternoon' | 'evening' }))}
                      className="mr-2"
                    />
                    夜（18:00-21:00）
                  </label>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* リマインドメールテンプレート */}
      <Card>
        <CardHeader>
          <CardTitle>リマインドメールテンプレート</CardTitle>
          <CardDescription>公演前に送信されるリマインドメールの内容</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.reminder_template}
            onChange={(e) => setFormData(prev => ({ ...prev, reminder_template: e.target.value }))}
            rows={6}
            placeholder="リマインドメールのテンプレート"
            disabled={!formData.reminder_enabled}
          />
          <p className="text-xs text-muted-foreground mt-2">
            使用可能な変数: {'{customer_name}'}, {'{scenario_title}'}, {'{date}'}, {'{time}'}, {'{venue}'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

