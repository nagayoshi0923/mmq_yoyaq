import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, ChevronDown, ChevronRight, Mail, Building2, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import {
  TEMPLATE_CONFIGS,
  type TemplateConfig,
  BASE_VARIABLES,
  VARIABLE_DESCRIPTIONS,
  getDefaultReservationTemplate,
  getDefaultCancellationTemplate,
  getDefaultReminderTemplate,
  getDefaultBookingChangeTemplate,
  getDefaultPrivateRequestTemplate,
  getDefaultPrivateConfirmTemplate,
  getDefaultPrivateRejectionTemplate,
  getDefaultWaitlistNotifyTemplate,
  getDefaultWaitlistRegistrationTemplate,
  getDefaultPerformanceCancellationTemplate,
  getDefaultPerformanceConfirmationTemplate,
  getDefaultEventCancellationTemplate,
  getDefaultPerformanceExtensionTemplate,
  getDefaultStoreCancellationTemplate,
} from '@/lib/templateRegistry'
import { VariableHintChips } from '@/components/settings/VariableHintChips'

const EMAIL_SETTINGS_SELECT_FIELDS =
  'id, store_id, from_email, from_name, company_name, company_phone, company_email, company_address, reminder_enabled, reminder_schedule, reminder_time, reminder_send_time, reservation_confirmation_template, cancellation_template, reminder_template, booking_change_template, private_request_template, private_confirm_template, private_rejection_template, waitlist_notify_template, waitlist_registration_template, performance_cancellation_template, performance_confirmation_template, event_cancellation_template, performance_extension_template, store_cancellation_template, private_rejection_reason' as const

// ========== 型定義 ==========

interface EmailTemplates {
  reservation_confirmation_template: string
  cancellation_template: string
  reminder_template: string
  booking_change_template: string
  private_request_template: string
  private_confirm_template: string
  private_rejection_template: string
  waitlist_notify_template: string
  waitlist_registration_template: string
  performance_cancellation_template: string
  performance_confirmation_template: string
  event_cancellation_template: string
  performance_extension_template: string
  store_cancellation_template: string
}

interface EmailSettings extends EmailTemplates {
  id: string
  store_id: string
  from_email: string
  from_name: string
  company_name: string
  company_phone: string
  company_email: string
  company_address: string
  reminder_enabled: boolean
  reminder_schedule: Array<{
    days_before: number
    time: string
    enabled: boolean
    template?: string
  }>
  reminder_time: string
  reminder_send_time: 'morning' | 'afternoon' | 'evening'
  /** 貸切却下メールの既定理由（{rejection_reason} に差し込まれる文） */
  private_rejection_reason: string
}

interface EmailSettingsProps {
  storeId?: string
}

// ========== アコーディオンアイテム ==========

interface AccordionItemProps {
  config: TemplateConfig
  value: string
  onChange: (value: string) => void
  onReset: () => void
  isOpen: boolean
  onToggle: () => void
  storeId?: string | null
}

function AccordionItem({ config, value, onChange, onReset, isOpen, onToggle, storeId }: AccordionItemProps) {
  const categoryColors = {
    reservation: 'bg-green-500',
    private: 'bg-blue-500',
    other: 'bg-yellow-500'
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 ${categoryColors[config.category]} rounded-full`}></span>
          <div>
            <div className="font-medium text-sm">{config.title}</div>
            <div className="text-xs text-muted-foreground">{config.description}</div>
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      
      {isOpen && (
        <div className="p-4 border-t border-gray-200 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                基本変数（全メール共通）:
                <span className="ml-2 font-normal text-[11px]">（下線付きはクリックで設定画面を開きます）</span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReset}
                className="text-xs"
              >
                デフォルトに戻す
              </Button>
            </div>
            <VariableHintChips variables={BASE_VARIABLES} storeId={storeId} />
            {config.additionalVariables && config.additionalVariables.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground mt-3">追加変数（このメール専用）:</p>
                <VariableHintChips variables={config.additionalVariables} accent="additional" storeId={storeId} />
              </>
            )}
          </div>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            placeholder="メールテンプレートを編集"
          />
        </div>
      )}
    </div>
  )
}

// ========== メインコンポーネント ==========

export function EmailSettings({ storeId }: EmailSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<EmailSettings>({
    id: '',
    store_id: '',
    from_email: '',
    from_name: '',
    company_name: '',
    company_phone: '',
    company_email: '',
    company_address: '',
    reservation_confirmation_template: '',
    cancellation_template: '',
    reminder_template: '',
    booking_change_template: '',
    private_request_template: '',
    private_confirm_template: '',
    private_rejection_template: '',
    waitlist_notify_template: '',
    waitlist_registration_template: '',
    performance_cancellation_template: '',
    performance_confirmation_template: '',
    event_cancellation_template: '',
    performance_extension_template: '',
    store_cancellation_template: '',
    reminder_enabled: true,
    reminder_schedule: [
      { days_before: 7, time: '10:00', enabled: true },
      { days_before: 1, time: '10:00', enabled: true }
    ],
    reminder_time: '10:00',
    reminder_send_time: 'morning',
    private_rejection_reason: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行
  }, [])

  const toggleAccordion = useCallback((key: string) => {
    setOpenAccordions(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
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
        .from('email_settings')
        .select(EMAIL_SETTINGS_SELECT_FIELDS)
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        // 会社情報（デフォルト値の生成に使用）
        const companyName = data.company_name || ''
        const companyPhone = data.company_phone || ''
        const companyEmail = data.company_email || ''
        
        setFormData({
          ...data,
          reminder_schedule: data.reminder_schedule || [],
          // 空のテンプレートはデフォルト値を設定
          reservation_confirmation_template: data.reservation_confirmation_template || getDefaultReservationTemplate(companyName, companyPhone, companyEmail),
          cancellation_template: data.cancellation_template || getDefaultCancellationTemplate(companyName, companyPhone, companyEmail),
          reminder_template: data.reminder_template || getDefaultReminderTemplate(companyName, companyPhone, companyEmail),
          booking_change_template: data.booking_change_template || getDefaultBookingChangeTemplate(companyName, companyPhone, companyEmail),
          private_request_template: data.private_request_template || getDefaultPrivateRequestTemplate(companyName, companyPhone, companyEmail),
          private_confirm_template: data.private_confirm_template || getDefaultPrivateConfirmTemplate(companyName, companyPhone, companyEmail),
          private_rejection_template: data.private_rejection_template || getDefaultPrivateRejectionTemplate(companyName, companyPhone, companyEmail),
          waitlist_notify_template: data.waitlist_notify_template || getDefaultWaitlistNotifyTemplate(companyName, companyPhone, companyEmail),
          waitlist_registration_template: data.waitlist_registration_template || getDefaultWaitlistRegistrationTemplate(companyName, companyPhone, companyEmail),
          performance_cancellation_template: data.performance_cancellation_template || getDefaultPerformanceCancellationTemplate(companyName, companyPhone, companyEmail),
          performance_confirmation_template: data.performance_confirmation_template || getDefaultPerformanceConfirmationTemplate(companyName, companyPhone, companyEmail),
          event_cancellation_template: data.event_cancellation_template || getDefaultEventCancellationTemplate(companyName, companyPhone, companyEmail),
          performance_extension_template: data.performance_extension_template || getDefaultPerformanceExtensionTemplate(companyName, companyPhone, companyEmail),
          store_cancellation_template: data.store_cancellation_template || getDefaultStoreCancellationTemplate(companyName, companyPhone, companyEmail),
          private_rejection_reason: data.private_rejection_reason || ''
        } as EmailSettings)
      } else {
        // 新規作成時はデフォルト値を設定
        const defaults = {
          id: '',
          store_id: storeId,
          from_email: '',
          from_name: '',
          company_name: '',
          company_phone: '',
          company_email: '',
          company_address: '',
          reservation_confirmation_template: getDefaultReservationTemplate(),
          cancellation_template: getDefaultCancellationTemplate(),
          reminder_template: getDefaultReminderTemplate(),
          booking_change_template: getDefaultBookingChangeTemplate(),
          private_request_template: getDefaultPrivateRequestTemplate(),
          private_confirm_template: getDefaultPrivateConfirmTemplate(),
          private_rejection_template: getDefaultPrivateRejectionTemplate(),
          waitlist_notify_template: getDefaultWaitlistNotifyTemplate(),
          waitlist_registration_template: getDefaultWaitlistRegistrationTemplate(),
          performance_cancellation_template: getDefaultPerformanceCancellationTemplate(),
          performance_confirmation_template: getDefaultPerformanceConfirmationTemplate(),
          event_cancellation_template: getDefaultEventCancellationTemplate(),
          performance_extension_template: getDefaultPerformanceExtensionTemplate(),
          store_cancellation_template: getDefaultStoreCancellationTemplate(),
          reminder_enabled: false,
          reminder_schedule: [],
          reminder_time: '10:00',
          reminder_send_time: 'morning' as const,
          private_rejection_reason: ''
        }
        setFormData(defaults)
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
    const savePayload = {
      // 返信先は会社メールアドレスを使用（未設定の場合はデフォルト）
      from_email: formData.company_email || formData.from_email,
      from_name: formData.company_name || formData.from_name || '予約システム',
      company_name: formData.company_name,
      company_phone: formData.company_phone,
      company_email: formData.company_email,
      company_address: formData.company_address,
      reservation_confirmation_template: formData.reservation_confirmation_template,
      cancellation_template: formData.cancellation_template,
      reminder_template: formData.reminder_template,
      booking_change_template: formData.booking_change_template,
      private_request_template: formData.private_request_template,
      private_confirm_template: formData.private_confirm_template,
      private_rejection_template: formData.private_rejection_template,
      waitlist_notify_template: formData.waitlist_notify_template,
      waitlist_registration_template: formData.waitlist_registration_template,
      performance_cancellation_template: formData.performance_cancellation_template,
      performance_confirmation_template: formData.performance_confirmation_template,
      event_cancellation_template: formData.event_cancellation_template,
      performance_extension_template: formData.performance_extension_template,
      store_cancellation_template: formData.store_cancellation_template,
      reminder_enabled: formData.reminder_enabled,
      reminder_schedule: formData.reminder_schedule,
      reminder_time: formData.reminder_time,
      reminder_send_time: formData.reminder_send_time,
      private_rejection_reason: formData.private_rejection_reason
    }

    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('email_settings')
          .update(savePayload)
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('email_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            ...savePayload
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

  const updateTemplate = useCallback((key: keyof EmailTemplates, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetTemplate = useCallback((config: TemplateConfig) => {
    const defaultValue = config.getDefault(
      formData.company_name,
      formData.company_phone,
      formData.company_email
    )
    setFormData(prev => ({ ...prev, [config.key]: defaultValue }))
  }, [formData.company_name, formData.company_phone, formData.company_email])

  // リマインドスケジュール管理関数
  const addReminderSchedule = () => {
    setFormData(prev => ({
      ...prev,
      reminder_schedule: [
        ...prev.reminder_schedule,
        { days_before: 1, time: '10:00', enabled: true }
      ]
    }))
  }

  const removeReminderSchedule = (index: number) => {
    setFormData(prev => ({
      ...prev,
      reminder_schedule: prev.reminder_schedule.filter((_, i) => i !== index)
    }))
  }

  const updateReminderSchedule = (index: number, field: 'days_before' | 'time' | 'enabled' | 'template', value: any) => {
    setFormData(prev => ({
      ...prev,
      reminder_schedule: prev.reminder_schedule.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  const reservationTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'reservation')
  const privateTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'private')
  const otherTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'other')

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="メール設定"
        description="メールテンプレートと送信設定"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 送信者情報 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={Building2} label="送信者情報" description="メールの署名・返信先に使用される情報" />
        <div className="grid grid-cols-3 gap-4">
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
            <Label htmlFor="company_email">メールアドレス *</Label>
            <Input
              id="company_email"
              type="email"
              value={formData.company_email}
              onChange={(e) => setFormData(prev => ({ ...prev, company_email: e.target.value }))}
              placeholder="info@example.com"
            />
            <p className="text-xs text-muted-foreground mt-1">署名表示 / 返信先</p>
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
        <p className="text-xs text-muted-foreground mt-3">
          返信先: 上記メールアドレス
        </p>
      </section>

      {/* リマインダー設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={Bell} label="リマインダー設定" description="公演前に送信される自動リマインドメールの設定" />
        <div className="space-y-6">
          {/* リマインド有効/無効 */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="reminder_enabled">リマインドメールを送信する</Label>
              <p className="text-xs text-muted-foreground">予約者にリマインドメールを送信します</p>
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
              {/* リマインドスケジュール */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>リマインド送信スケジュール</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addReminderSchedule}
                    className="text-blue-600 border-blue-600 hover:bg-blue-50"
                  >
                    + 追加
                  </Button>
                </div>

                <div className="space-y-4">
                  {formData.reminder_schedule.map((schedule, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                      {/* 基本設定 */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={schedule.enabled}
                            onChange={(e) => updateReminderSchedule(index, 'enabled', e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </div>

                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-sm">送信タイミング</Label>
                            <select
                              value={schedule.days_before}
                              onChange={(e) => updateReminderSchedule(index, 'days_before', parseInt(e.target.value))}
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            >
                              <option value={1}>1日前</option>
                              <option value={2}>2日前</option>
                              <option value={3}>3日前</option>
                              <option value={7}>1週間前</option>
                              <option value={14}>2週間前</option>
                              <option value={30}>1ヶ月前</option>
                            </select>
                          </div>

                          <div>
                            <Label className="text-sm">送信時刻</Label>
                            <Input
                              type="time"
                              value={schedule.time}
                              onChange={(e) => updateReminderSchedule(index, 'time', e.target.value)}
                              className="text-sm"
                            />
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeReminderSchedule(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={formData.reminder_schedule.length <= 1}
                        >
                          ×
                        </Button>
                      </div>

                      {/* テンプレート編集 */}
                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm">メールテンプレート</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const defaultTemplate = getDefaultReminderTemplate(
                                formData.company_name,
                                formData.company_phone,
                                formData.company_email,
                                schedule.days_before
                              )
                              updateReminderSchedule(index, 'template', defaultTemplate)
                            }}
                            className="text-xs"
                          >
                            デフォルトに戻す
                          </Button>
                        </div>

                        <Textarea
                          value={schedule.template || getDefaultReminderTemplate(
                            formData.company_name,
                            formData.company_phone,
                            formData.company_email,
                            schedule.days_before
                          )}
                          onChange={(e) => updateReminderSchedule(index, 'template', e.target.value)}
                          rows={8}
                          placeholder="メールテンプレートを編集"
                          className="text-sm font-mono"
                          disabled={!schedule.enabled}
                        />

                        <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                          <p className="font-medium mb-1">使用可能な変数:</p>
                          {['customer_name', 'scenario_title', 'date', 'time', 'venue', 'venue_address', 'participants', 'total_price'].map(v => (
                            <span key={v} className="inline-block mr-3">
                              <code className="bg-gray-100 px-1 rounded">{`{${v}}`}</code>
                              <span className="text-gray-500 ml-1">{VARIABLE_DESCRIPTIONS[v]}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  複数のリマインドを設定できます。例：1週間前と前日の両方に送信
                </p>
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
        </div>
      </section>

      {/* メールテンプレート一覧 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={Mail} label="メールテンプレート一覧" description="各イベントで自動送信されるメールの本文テンプレート" />

        {/* 予約関連メール */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <h4 className="text-sm font-medium text-gray-700">予約関連メール</h4>
            <span className="text-xs text-muted-foreground">予約・キャンセル・リマインドに関するメールテンプレート</span>
          </div>
          <div className="space-y-3">
            {reservationTemplates.map(config => (
              <AccordionItem
                key={config.key}
                config={config}
                value={formData[config.key]}
                onChange={(value) => updateTemplate(config.key, value)}
                onReset={() => resetTemplate(config)}
                isOpen={openAccordions.has(config.key)}
                onToggle={() => toggleAccordion(config.key)}
                storeId={formData.store_id}
              />
            ))}
          </div>
        </div>

        {/* 貸切予約関連メール */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <h4 className="text-sm font-medium text-gray-700">貸切予約関連メール</h4>
            <span className="text-xs text-muted-foreground">貸切予約のリクエスト・承認・却下に関するメールテンプレート</span>
          </div>
          <div className="space-y-3">
            {privateTemplates.map(config => (
              <AccordionItem
                key={config.key}
                config={config}
                value={formData[config.key]}
                onChange={(value) => updateTemplate(config.key, value)}
                onReset={() => resetTemplate(config)}
                isOpen={openAccordions.has(config.key)}
                onToggle={() => toggleAccordion(config.key)}
                storeId={formData.store_id}
              />
            ))}
            <div className="rounded-lg border border-gray-200 p-4 space-y-2">
              <Label htmlFor="private-rejection-reason" className="text-sm font-medium">貸切却下メールの既定理由</Label>
              <p className="text-xs text-muted-foreground">
                却下ダイアログを開いたとき、却下メール本文の <code className="bg-gray-100 px-1 rounded">{'{rejection_reason}'}</code> に最初から入る文です（却下のたびに本文側で上書きもできます）。
              </p>
              <Textarea
                id="private-rejection-reason"
                value={formData.private_rejection_reason}
                onChange={(e) => setFormData(prev => ({ ...prev, private_rejection_reason: e.target.value }))}
                rows={3}
                className="text-sm"
                placeholder="例: ご希望の日程では貸切での受付が難しい状況です。"
              />
            </div>
          </div>
        </div>

        {/* その他のメール */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
            <h4 className="text-sm font-medium text-gray-700">その他のメール</h4>
            <span className="text-xs text-muted-foreground">キャンセル待ち通知などのメールテンプレート</span>
          </div>
          <div className="space-y-3">
            {otherTemplates.map(config => (
              <AccordionItem
                key={config.key}
                config={config}
                value={formData[config.key]}
                onChange={(value) => updateTemplate(config.key, value)}
                onReset={() => resetTemplate(config)}
                isOpen={openAccordions.has(config.key)}
                onToggle={() => toggleAccordion(config.key)}
                storeId={formData.store_id}
              />
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}
