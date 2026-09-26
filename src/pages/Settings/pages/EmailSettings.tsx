import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useCallback, type Dispatch, type SetStateAction } from 'react'
import { useOperatingSettings } from '@/hooks/useOperatingSettings'
import { SettingSourceControls } from '@/components/settings/SettingSourceControls'
import { SETTING_DEFINITIONS } from '../../../../supabase/functions/_shared/setting-definitions'
import type { SettingScope, SettingValue } from '../../../../supabase/functions/_shared/settings-inheritance'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, ChevronDown, ChevronRight, Mail, Building2, Bell } from 'lucide-react'
import { showToast } from '@/utils/toast'
import {
  TEMPLATE_CONFIGS,
  type TemplateConfig,
  BASE_VARIABLES,
  VARIABLE_DESCRIPTIONS,
  getDefaultReminderTemplate,
} from '@/lib/templateRegistry'
import { VariableHintChips } from '@/components/settings/VariableHintChips'

// ========== 型定義 ==========

interface EmailTemplates {
  reservation_confirmation_template: string
  cancellation_template: string
  private_reminder_template: string
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
  scope?: SettingScope
  targetId?: string
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

export function EmailSettings({ storeId = '', scope = 'store', targetId }: EmailSettingsProps) {
  const state = useOperatingSettings(scope, targetId ?? storeId)
  const { loading, saving } = state
  const keys = Object.keys(SETTING_DEFINITIONS).filter(key => SETTING_DEFINITIONS[key].group === 'email' && SETTING_DEFINITIONS[key].scopes.includes(scope))
  const defaults: Record<string, SettingValue> = { reminder_enabled: false, reminder_schedule: [] }
  const values = Object.fromEntries(keys.map(key => [key, state.resolve(key, defaults[key] ?? '').value]))
  const formData = { id: '', store_id: storeId, from_email: '', from_name: '', reminder_time: '09:00', reminder_send_time: 'morning',
    company_name: '', company_phone: '', company_email: '', company_address: '', ...values } as unknown as EmailSettings
  for (const config of TEMPLATE_CONFIGS) {
    if (!formData[config.key]) formData[config.key] = config.getDefault(formData.company_name, formData.company_phone, formData.company_email)
  }
  const setFormData: Dispatch<SetStateAction<EmailSettings>> = action => {
    const next = typeof action === 'function' ? action(formData) : action
    for (const key of keys) {
      const value = next[key as keyof EmailSettings]
      if (JSON.stringify(value) !== JSON.stringify(formData[key as keyof EmailSettings])) state.set(key, value as SettingValue)
    }
  }
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())
  const handleSave = () => void state.save()
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

  const updateTemplate = (key: keyof EmailTemplates, value: string) => state.set(key, value)

  const resetTemplate = (config: TemplateConfig) => {
    const defaultValue = config.getDefault(
      formData.company_name,
      formData.company_phone,
      formData.company_email
    )
    setFormData(prev => ({ ...prev, [config.key]: defaultValue }))
  }

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

  if (scope !== 'organization' && !(targetId ?? storeId)) return <p>設定する対象を選択してください。</p>
  if (state.error && !state.data) return <div role="alert"><p>{state.error}</p><Button onClick={() => void state.reload()}>再読み込み</Button></div>

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  const reservationTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'reservation')
  const privateTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'private')
  const otherTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'other')

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <PageHeader
        title="メール設定"
        description="メールテンプレートと送信設定"
      >
        <Button size="sm" onClick={handleSave} disabled={saving || !state.data?.can_edit || !state.dirty}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      <SettingSourceControls state={state} scope={scope} keys={keys} defaults={defaults} />
      <fieldset disabled={saving || !state.data?.can_edit} className="space-y-6">
      {/* 送信者情報 */}
      {['organization', 'store'].includes(scope) && <>
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

      </>}
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
            <span className="text-xs text-muted-foreground">貸切予約のリクエスト・承認・却下・リマインドに関するメールテンプレート</span>
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

      </fieldset>
    </div>
  )
}
