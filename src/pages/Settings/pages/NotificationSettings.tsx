import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Save, Send, TestTube, Bell, MessageSquare, BookOpen, CalendarCheck, Webhook } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import type { Staff } from '@/types'

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

interface NotificationSettingsProps {
  storeId?: string
}

export function NotificationSettings({ storeId }: NotificationSettingsProps) {
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

  // 組織全体の通知設定（global_settings）
  const [globalSettingsId, setGlobalSettingsId] = useState<string | null>(null)
  const [globalFormData, setGlobalFormData] = useState({
    enable_email_notifications: true,
    enable_discord_notifications: false,
    pre_reading_notice_message: '【ご確認ください】\n\nこのシナリオには事前読み込みがございます。\n\n公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。\n\nご不明点がございましたら、店舗までお問い合わせください。',
    system_msg_group_created_title: '貸切リクエストグループを作成しました',
    system_msg_group_created_body: '招待リンクを共有して、参加メンバーを招待してください。',
    system_msg_group_created_note: '※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。',
    system_msg_booking_requested_title: '貸切リクエストを送信しました',
    system_msg_booking_requested_body: '店舗より日程確定のご連絡をいたしますので、しばらくお待ちください。',
    system_msg_schedule_confirmed_title: '日程が確定いたしました',
    system_msg_schedule_confirmed_body: 'ご予約ありがとうございます。当日のご来店をお待ちしております。',
    system_msg_booking_rejected_title: '日程リクエストが却下されました',
    system_msg_booking_rejected_body: '店舗の都合がつかず、ご希望の日程でのご予約をお受けすることができませんでした。お手数ですが、別の候補日を選択のうえ再度お申し込みください。',
    system_msg_booking_cancelled_title: 'ご予約がキャンセルされました',
    system_msg_booking_cancelled_body: '誠に申し訳ございませんが、やむを得ない事情によりご予約がキャンセルとなりました。',
  })

  // Discord通知テスト用
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [testingType, setTestingType] = useState<string | null>(null)
  
  // シナリオリスト（貸切予約通知テスト用）
  const [scenarioList, setScenarioList] = useState<{ id: string; title: string }[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')

  useEffect(() => {
    fetchData()
    fetchStaffList()
    fetchScenarioList()
    fetchGlobalSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行
  }, [])
  
  const fetchStaffList = async () => {
    try {
      const orgId = await getCurrentOrganizationId()
      let query = supabase
        .from('staff')
        .select('id, name, discord_channel_id')
        .eq('status', 'active')
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query.order('name')
      
      if (error) throw error
      setStaffList((data || []) as Staff[])
    } catch (error) {
      logger.error('スタッフリスト取得エラー:', error)
    }
  }
  
  const fetchScenarioList = async () => {
    try {
      const orgId = await getCurrentOrganizationId()
      let query = supabase
        .from('organization_scenarios_with_master')
        .select('id, title')
        .order('title')
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      setScenarioList(data || [])
    } catch (error) {
      logger.error('シナリオリスト取得エラー:', error)
    }
  }
  
  // シフト提出通知テスト
  const handleTestShiftSubmitted = async () => {
    if (!selectedStaffId) {
      showToast.error('スタッフを選択してください')
      return
    }
    
    setTestingType('shift-submitted')
    try {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      
      // テスト用のダミーシフトデータ
      const testShifts = [
        { date: `${year}-${String(month).padStart(2, '0')}-15`, morning: true, afternoon: false, evening: true, all_day: false },
        { date: `${year}-${String(month).padStart(2, '0')}-16`, morning: false, afternoon: false, evening: false, all_day: true },
        { date: `${year}-${String(month).padStart(2, '0')}-20`, morning: false, afternoon: true, evening: true, all_day: false },
      ]
      
      const response = await supabase.functions.invoke('notify-shift-submitted-discord', {
        body: {
          staff_id: selectedStaffId,
          year,
          month,
          shifts: testShifts
        }
      })
      
      logger.log('Edge Function response:', response)
      
      if (response.error) {
        // エラーの詳細を取得
        let errorDetail = 'Unknown error'
        try {
          // response.response はFetchのResponseオブジェクト
          const res = response.response as Response | undefined
          if (res) {
            const text = await res.clone().text()
            try {
              const json = JSON.parse(text)
              errorDetail = json.error || text
            } catch {
              errorDetail = text || response.error.message
            }
          } else {
            errorDetail = response.data?.error || response.error.message || 'Unknown error'
          }
        } catch (e) {
          errorDetail = response.error.message || 'Unknown error'
        }
        logger.error('Edge Function error detail:', errorDetail)
        throw new Error(errorDetail)
      }
      
      const data = response.data
      
      const staffName = staffList.find(s => s.id === selectedStaffId)?.name || 'スタッフ'
      showToast.success(`「${staffName}」のシフト提出通知をテスト送信しました`)
      logger.log('シフト提出通知テスト結果:', data)
    } catch (error) {
      logger.error('シフト提出通知テストエラー:', error)
      showToast.error('テスト送信に失敗しました', getSafeErrorMessage(error, '不明なエラー'))
    } finally {
      setTestingType(null)
    }
  }
  
  // 貸切予約通知テスト
  const handleTestPrivateBooking = async () => {
    if (!selectedScenarioId) {
      showToast.error('シナリオを選択してください')
      return
    }
    
    const selectedScenario = scenarioList.find(s => s.id === selectedScenarioId)
    
    setTestingType('private-booking')
    try {
      const response = await supabase.functions.invoke('notify-private-booking-discord', {
        body: {
          type: 'insert',
          table: 'private_booking_requests',
          record: {
            id: 'test-' + Date.now(),
            customer_name: 'テスト顧客',
            customer_email: 'test@example.com',
            customer_phone: '090-0000-0000',
            scenario_id: selectedScenarioId,
            scenario_title: selectedScenario?.title || 'テストシナリオ',
            participant_count: 4,
            candidate_datetimes: {
              candidates: [
                { order: 1, date: '2025-01-15', timeSlot: '夜', startTime: '19:00', endTime: '22:00' },
                { order: 2, date: '2025-01-16', timeSlot: '昼', startTime: '14:00', endTime: '17:00' }
              ]
            },
            created_at: new Date().toISOString()
          }
        }
      })
      
      logger.log('Edge Function response:', response)
      
      if (response.error) {
        let errorDetail = 'Unknown error'
        try {
          const res = response.response as Response | undefined
          if (res) {
            const text = await res.clone().text()
            try {
              const json = JSON.parse(text)
              errorDetail = json.error || text
            } catch {
              errorDetail = text || response.error.message
            }
          } else {
            errorDetail = response.data?.error || response.error.message || 'Unknown error'
          }
        } catch {
          errorDetail = response.error.message || 'Unknown error'
        }
        logger.error('Edge Function error detail:', errorDetail)
        throw new Error(errorDetail)
      }
      
      showToast.success('貸切予約通知をテスト送信しました')
      logger.log('貸切予約通知テスト結果:', response.data)
    } catch (error) {
      logger.error('貸切予約通知テストエラー:', error)
      showToast.error('テスト送信に失敗しました', getSafeErrorMessage(error, '不明なエラー'))
    } finally {
      setTestingType(null)
    }
  }
  
  // シフト募集通知テスト
  const handleTestShiftRequest = async () => {
    setTestingType('shift-request')
    try {
      const now = new Date()
      const nextMonth = now.getMonth() + 2
      const year = nextMonth > 12 ? now.getFullYear() + 1 : now.getFullYear()
      const month = nextMonth > 12 ? 1 : nextMonth
      
      const response = await supabase.functions.invoke('notify-shift-request-discord-simple', {
        body: { year, month }
      })
      
      logger.log('Edge Function response:', response)
      
      if (response.error) {
        let errorDetail = 'Unknown error'
        try {
          const res = response.response as Response | undefined
          if (res) {
            const text = await res.clone().text()
            try {
              const json = JSON.parse(text)
              errorDetail = json.error || text
            } catch {
              errorDetail = text || response.error.message
            }
          } else {
            errorDetail = response.data?.error || response.error.message || 'Unknown error'
          }
        } catch {
          errorDetail = response.error.message || 'Unknown error'
        }
        logger.error('Edge Function error detail:', errorDetail)
        throw new Error(errorDetail)
      }
      
      const result = response.data as { success: boolean; sent_to: number; success_count: number; failed_staff?: string[] }
      let message = `シフト募集通知を送信しました\n成功: ${result.success_count}/${result.sent_to}名`
      if (result.failed_staff?.length) {
        message += `\n失敗: ${result.failed_staff.join(', ')}`
      }
      showToast.success(message)
      logger.log('シフト募集通知テスト結果:', response.data)
    } catch (error) {
      logger.error('シフト募集通知テストエラー:', error)
      showToast.error('テスト送信に失敗しました', getSafeErrorMessage(error, '不明なエラー'))
    } finally {
      setTestingType(null)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      // 組織対応済みの店舗取得
      const storesData = await storeApi.getAll()

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
        .select('id, store_id, organization_id, new_reservation_email, new_reservation_discord, cancellation_email, cancellation_discord, shift_reminder_days, performance_reminder_days, sales_report_notification, discord_webhook_url, updated_at')
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

  async function fetchGlobalSettings() {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return

      const { data, error } = await supabase
        .from('global_settings')
        .select('id, enable_email_notifications, enable_discord_notifications, pre_reading_notice_message, system_msg_group_created_title, system_msg_group_created_body, system_msg_group_created_note, system_msg_booking_requested_title, system_msg_booking_requested_body, system_msg_schedule_confirmed_title, system_msg_schedule_confirmed_body, system_msg_booking_rejected_title, system_msg_booking_rejected_body, system_msg_booking_cancelled_title, system_msg_booking_cancelled_body')
        .eq('organization_id', orgId)
        .single()

      if (error) { logger.error('全体通知設定の取得に失敗:', error); return }
      if (data) {
        setGlobalSettingsId(data.id)
        setGlobalFormData({
          enable_email_notifications: data.enable_email_notifications ?? true,
          enable_discord_notifications: data.enable_discord_notifications ?? false,
          pre_reading_notice_message: data.pre_reading_notice_message || globalFormData.pre_reading_notice_message,
          system_msg_group_created_title: data.system_msg_group_created_title || globalFormData.system_msg_group_created_title,
          system_msg_group_created_body: data.system_msg_group_created_body || globalFormData.system_msg_group_created_body,
          system_msg_group_created_note: data.system_msg_group_created_note || globalFormData.system_msg_group_created_note,
          system_msg_booking_requested_title: data.system_msg_booking_requested_title || globalFormData.system_msg_booking_requested_title,
          system_msg_booking_requested_body: data.system_msg_booking_requested_body || globalFormData.system_msg_booking_requested_body,
          system_msg_schedule_confirmed_title: data.system_msg_schedule_confirmed_title || globalFormData.system_msg_schedule_confirmed_title,
          system_msg_schedule_confirmed_body: data.system_msg_schedule_confirmed_body || globalFormData.system_msg_schedule_confirmed_body,
          system_msg_booking_rejected_title: data.system_msg_booking_rejected_title || globalFormData.system_msg_booking_rejected_title,
          system_msg_booking_rejected_body: data.system_msg_booking_rejected_body || globalFormData.system_msg_booking_rejected_body,
          system_msg_booking_cancelled_title: data.system_msg_booking_cancelled_title || globalFormData.system_msg_booking_cancelled_title,
          system_msg_booking_cancelled_body: data.system_msg_booking_cancelled_body || globalFormData.system_msg_booking_cancelled_body,
        })
      }
    } catch (error) {
      logger.error('全体通知設定取得エラー:', error)
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
        // 店舗からorganization_idを取得
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('notification_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
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

      // 全体通知設定（global_settings）も保存
      if (globalSettingsId) {
        const { error: globalError } = await supabase
          .from('global_settings')
          .update({
            enable_email_notifications: globalFormData.enable_email_notifications,
            enable_discord_notifications: globalFormData.enable_discord_notifications,
            pre_reading_notice_message: globalFormData.pre_reading_notice_message || null,
            system_msg_group_created_title: globalFormData.system_msg_group_created_title || null,
            system_msg_group_created_body: globalFormData.system_msg_group_created_body || null,
            system_msg_group_created_note: globalFormData.system_msg_group_created_note || null,
            system_msg_booking_requested_title: globalFormData.system_msg_booking_requested_title || null,
            system_msg_booking_requested_body: globalFormData.system_msg_booking_requested_body || null,
            system_msg_schedule_confirmed_title: globalFormData.system_msg_schedule_confirmed_title || null,
            system_msg_schedule_confirmed_body: globalFormData.system_msg_schedule_confirmed_body || null,
            system_msg_booking_rejected_title: globalFormData.system_msg_booking_rejected_title || null,
            system_msg_booking_rejected_body: globalFormData.system_msg_booking_rejected_body || null,
            system_msg_booking_cancelled_title: globalFormData.system_msg_booking_cancelled_title || null,
            system_msg_booking_cancelled_body: globalFormData.system_msg_booking_cancelled_body || null,
          })
          .eq('id', globalSettingsId)

        if (globalError) {
          logger.error('全体通知設定の保存エラー:', globalError)
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
        title="通知設定"
        description="各種通知の設定"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 全体通知設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={Bell} label="全体通知設定" description="メール・Discord通知機能の全体的な有効/無効を設定します（組織全体に適用）" />
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label>メール通知</Label>
              <p className="text-xs text-muted-foreground mt-1">予約確認・リマインダーなどのメール通知を有効化</p>
            </div>
            <Switch
              checked={globalFormData.enable_email_notifications}
              onCheckedChange={(checked) => setGlobalFormData(prev => ({ ...prev, enable_email_notifications: checked }))}
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label>Discord通知</Label>
              <p className="text-xs text-muted-foreground mt-1">予約・シフト変更のDiscord通知を有効化</p>
            </div>
            <Switch
              checked={globalFormData.enable_discord_notifications}
              onCheckedChange={(checked) => setGlobalFormData(prev => ({ ...prev, enable_discord_notifications: checked }))}
            />
          </div>
        </div>
      </section>

      {/* システムアナウンス設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={MessageSquare} label="システムアナウンス設定" description="貸切グループのチャットに自動送信されるメッセージの文言を設定します（組織全体に適用）" />
        <div className="space-y-6">
          {[
            { key: 'group_created', label: 'グループ作成時', color: 'purple', hasNote: true },
            { key: 'booking_requested', label: '予約申込時', color: 'blue', hasNote: false },
            { key: 'schedule_confirmed', label: '日程確定時', color: 'green', hasNote: false },
            { key: 'booking_rejected', label: 'リクエスト却下時', color: 'red', hasNote: false },
            { key: 'booking_cancelled', label: '予約キャンセル時', color: 'gray', hasNote: false },
          ].map(({ key, label, color, hasNote }) => (
            <div key={key} className={`space-y-3 p-4 bg-${color}-50 rounded-lg`}>
              <h4 className={`font-medium text-${color}-800 text-sm`}>{label}</h4>
              <div className="space-y-2">
                <Label>タイトル</Label>
                <Input
                  value={(globalFormData as unknown as Record<string, string>)[`system_msg_${key}_title`]}
                  onChange={(e) => setGlobalFormData(prev => ({ ...prev, [`system_msg_${key}_title`]: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>本文</Label>
                {key === 'booking_rejected' || key === 'booking_cancelled' ? (
                  <Textarea
                    value={(globalFormData as unknown as Record<string, string>)[`system_msg_${key}_body`]}
                    onChange={(e) => setGlobalFormData(prev => ({ ...prev, [`system_msg_${key}_body`]: e.target.value }))}
                    rows={3}
                  />
                ) : (
                  <Input
                    value={(globalFormData as unknown as Record<string, string>)[`system_msg_${key}_body`]}
                    onChange={(e) => setGlobalFormData(prev => ({ ...prev, [`system_msg_${key}_body`]: e.target.value }))}
                  />
                )}
              </div>
              {hasNote && (
                <div className="space-y-2">
                  <Label>注記（任意）</Label>
                  <Input
                    value={globalFormData.system_msg_group_created_note}
                    onChange={(e) => setGlobalFormData(prev => ({ ...prev, system_msg_group_created_note: e.target.value }))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 事前読み込み通知設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={BookOpen} label="事前読み込み通知設定" description="事前読み込みシナリオの日程確定時にグループチャットに送信されるメッセージ（組織全体に適用）" />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>通知メッセージ</Label>
            <Textarea
              value={globalFormData.pre_reading_notice_message}
              onChange={(e) => setGlobalFormData(prev => ({ ...prev, pre_reading_notice_message: e.target.value }))}
              rows={6}
            />
          </div>
          <div className="bg-amber-50 p-3 rounded-lg">
            <p className="text-xs font-medium text-amber-800 mb-2">プレビュー</p>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{globalFormData.pre_reading_notice_message || '（未設定）'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 予約関連通知 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={CalendarCheck} label="予約関連通知" description="新規予約とキャンセルの通知設定" />
        <div className="space-y-4">
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
        </div>
      </section>

      {/* Discordチャンネル設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={Webhook} label="Discordチャンネル設定" description="Discord通知を送信するためのWebhook URLを設定します" />
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
      </section>

      {/* Discord通知テスト */}
      <section className="bg-white rounded-xl border border-purple-200 bg-purple-50/50 p-6">
        <SectionTitle icon={TestTube} label="Discord通知テスト" description="各種Discord通知をテスト送信して動作確認できます" />
        <div className="space-y-6">
          {/* シフト提出通知 */}
          <div className="p-4 bg-white rounded-lg border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-medium text-sm">シフト提出完了通知</h4>
                <p className="text-xs text-muted-foreground">スタッフがシフトを提出した時の通知</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="スタッフを選択" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>
                      <span className="flex items-center gap-2">
                        {staff.name}
                        {staff.discord_channel_id && (
                          <span className="text-[10px] px-1 py-0.5 bg-green-100 text-green-700 rounded">CH設定済</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestShiftSubmitted}
                disabled={testingType !== null || !selectedStaffId}
                className="border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                <Send className="h-4 w-4 mr-1" />
                {testingType === 'shift-submitted' ? '送信中...' : 'テスト送信'}
              </Button>
            </div>
          </div>

          {/* 貸切予約通知 */}
          <div className="p-4 bg-white rounded-lg border">
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-sm">貸切予約リクエスト通知</h4>
                <p className="text-xs text-muted-foreground">貸切予約が入った時の通知（シナリオ担当GMに送信）</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="シナリオを選択..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {scenarioList.map(scenario => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestPrivateBooking}
                  disabled={testingType !== null || !selectedScenarioId}
                  className="border-purple-300 text-purple-700 hover:bg-purple-100"
                >
                  <Send className="h-4 w-4 mr-1" />
                  {testingType === 'private-booking' ? '送信中...' : 'テスト送信'}
                </Button>
              </div>
            </div>
          </div>

          {/* シフト募集通知 */}
          <div className="p-4 bg-white rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm">シフト募集通知</h4>
                <p className="text-xs text-muted-foreground">全スタッフへのシフト提出依頼通知</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestShiftRequest}
                disabled={testingType !== null}
                className="border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                <Send className="h-4 w-4 mr-1" />
                {testingType === 'shift-request' ? '送信中...' : 'テスト送信'}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            ※ テスト通知は実際のDiscordチャンネルに送信されます。設定が正しいか確認できます。
          </p>
        </div>
      </section>
    </div>
  )
}

