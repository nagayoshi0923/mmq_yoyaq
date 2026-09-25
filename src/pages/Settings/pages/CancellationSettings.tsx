import { SETTING_DEFAULTS } from '../../../../supabase/functions/_shared/setting-defaults'
import { PageHeader } from "@/components/layout/PageHeader"
import type { Dispatch, SetStateAction } from 'react'
import { useOperatingSettings } from '@/hooks/useOperatingSettings'
import { SETTING_DEFINITIONS } from '../../../../supabase/functions/_shared/setting-definitions'
import { SETTING_SCOPE_LABELS, type SettingScope, type SettingValue } from '../../../../supabase/functions/_shared/settings-inheritance'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Sparkles, ExternalLink } from 'lucide-react'
import { showToast } from '@/utils/toast'
import {
  DEFAULT_OPEN_CANCELLATION_FEES,
  DEFAULT_PRIVATE_CANCELLATION_FEES,
  DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
  DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
} from '@/constants/cancellationPolicyDefaults'
import { OtherPoliciesSection } from './cancellationSettings/OtherPoliciesSection'
import { OpenPolicySection } from './cancellationSettings/OpenPolicySection'
import { PrivatePolicySection } from './cancellationSettings/PrivatePolicySection'
import type { CancellationFeeBasis } from '@/types'
import { toJstYmd } from '@/utils/jstDate'
import { buildPublicCancellationPolicyPath } from '@/lib/publicBookingPath'
import { CancellationPolicyView } from '@/components/patterns/cancellation/CancellationPolicyView'
import type { PublicCancellationPolicy } from '@/lib/publicCancellationPolicy'
import { useOrganization } from '@/hooks/useOrganization'

export interface CancellationFee {
  hours_before: number
  fee_percentage: number
  description: string
}

export interface PolicyItem {
  id: string
  content: string
}

// 店舗都合キャンセル理由
interface OrganizerCancelReason {
  id: string
  content: string
}

// 中止判定ルール
interface CancellationJudgmentRule {
  id: string
  timing: string  // "前日23:59" など
  condition: string  // "定員の過半数に満たない場合" など
  result: string  // "中止" "延長" など
}

export interface CancellationSettings {
  id: string
  store_id: string
  // 通常公演用
  cancellation_policy: string
  cancellation_policy_items: PolicyItem[]
  cancellation_deadline_hours: number
  cancellation_fees: CancellationFee[]
  cancellation_fee_basis: CancellationFeeBasis
  // 貸切公演用
  private_cancellation_policy: string
  private_cancellation_policy_items: PolicyItem[]
  private_cancellation_deadline_hours: number
  private_cancellation_fees: CancellationFee[]
  private_cancellation_fee_basis: CancellationFeeBasis
  // 店舗都合キャンセル
  organizer_cancel_reasons: OrganizerCancelReason[]
  organizer_cancel_refund_note: string  // "参加料金は全額返金いたします"
  // 中止判定タイミング
  cancellation_judgment_rules: CancellationJudgmentRule[]
  cancellation_notice_note: string  // 中止時の連絡方法
  // 予約変更（通常公演）
  reservation_change_deadline_hours: number  // 変更可能期限（時間前）
  reservation_change_note: string  // 予約変更に関する補足
  // 予約変更（貸切公演）
  private_reservation_change_deadline_hours: number  // 貸切の変更可能期限（時間前）
  private_reservation_change_note: string  // 貸切の予約変更に関する補足
  // 返金方法
  refund_method_note: string  // 返金方法の説明
  // 共通
  auto_refund_enabled: boolean
  refund_processing_days: number
  // 最終更新日
  policy_updated_at: string
}

interface CancellationSettingsProps {
  storeId?: string
  scope?: SettingScope
  targetId?: string
}

// デフォルトのポリシー項目
const DEFAULT_POLICY_ITEMS: PolicyItem[] = [
  { id: '1', content: 'キャンセルの際は必ず事前にご連絡ください' },
  { id: '2', content: 'キャンセル料は下記の計算基準と料率に基づき算出されます' },
  { id: '3', content: '無断キャンセルの場合は100%のキャンセル料が発生します' }
]

const DEFAULT_PRIVATE_POLICY_ITEMS: PolicyItem[] = [
  { id: '1', content: '貸切予約には下記の貸切公演ポリシーが適用されます' },
  { id: '2', content: 'キャンセル料は下記の計算基準と料率に基づき算出されます' },
  { id: '3', content: '日程変更は空き状況により可能な場合があります' }
]

// 店舗都合キャンセル理由のデフォルト
const DEFAULT_ORGANIZER_CANCEL_REASONS: OrganizerCancelReason[] = [
  { id: '1', content: '最少催行人数に満たない場合' },
  { id: '2', content: '自然災害、感染症の流行など不可抗力の場合' },
  { id: '3', content: '店舗の都合によるやむを得ない事情がある場合' }
]

// 中止判定ルールのデフォルト
const DEFAULT_JUDGMENT_RULES: CancellationJudgmentRule[] = [
  { id: '1', timing: '前日 23:59', condition: '定員の過半数に満たない場合', result: '中止' },
  { id: '2', timing: '前日 23:59', condition: '過半数以上だが最低開催人数に満たない場合', result: '公演ごとの開催判断期限まで募集を延長' },
  { id: '3', timing: '前日 23:59', condition: '最低開催人数に達した場合', result: '開催確定' },
  { id: '4', timing: '公演ごとの開催判断期限（延長された場合）', condition: '最低開催人数に満たない場合', result: '中止' }
]

const generateId = () => Math.random().toString(36).substring(2, 9)

function createDefaultCancellationSettings(storeId: string): CancellationSettings {
  return {
    id: '',
    store_id: storeId,
    cancellation_policy: '',
    cancellation_policy_items: DEFAULT_POLICY_ITEMS.map(item => ({ ...item })),
    cancellation_deadline_hours: DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
    cancellation_fees: DEFAULT_OPEN_CANCELLATION_FEES.map(fee => ({ ...fee })),
    cancellation_fee_basis: 'participant_total',
    private_cancellation_policy: '',
    private_cancellation_policy_items: DEFAULT_PRIVATE_POLICY_ITEMS.map(item => ({ ...item })),
    private_cancellation_deadline_hours: DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
    private_cancellation_fees: DEFAULT_PRIVATE_CANCELLATION_FEES.map(fee => ({ ...fee })),
    private_cancellation_fee_basis: 'performance_total',
    organizer_cancel_reasons: DEFAULT_ORGANIZER_CANCEL_REASONS.map(reason => ({ ...reason })),
    organizer_cancel_refund_note: '参加料金は全額返金いたします。',
    cancellation_judgment_rules: DEFAULT_JUDGMENT_RULES.map(rule => ({ ...rule })),
    cancellation_notice_note: '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
    reservation_change_deadline_hours: 24,
    reservation_change_note: '参加人数の変更は、マイページに表示された変更期限まで行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。',
    private_reservation_change_deadline_hours: 168,
    private_reservation_change_note: '貸切予約の変更は、表示された変更期限まで可能です。日程変更は空き状況によります。',
    refund_method_note: '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
    auto_refund_enabled: false,
    refund_processing_days: 7,
    policy_updated_at: toJstYmd(new Date()),
  }
}

export function CancellationSettings({ storeId = '', scope = 'store', targetId }: CancellationSettingsProps) {
  const { organization } = useOrganization()
  const state = useOperatingSettings(scope, targetId ?? storeId)
  const { loading, saving } = state
  const defaults = { ...createDefaultCancellationSettings(storeId), ...SETTING_DEFAULTS } as CancellationSettings
  const keys = Object.keys(SETTING_DEFINITIONS).filter(key => SETTING_DEFINITIONS[key].group === 'cancellation')
  const formData = { ...defaults, ...Object.fromEntries(keys.map(key => [key,
    state.resolve(key, defaults[key as keyof CancellationSettings] as SettingValue).value,
  ])) } as CancellationSettings
  const setFormData: Dispatch<SetStateAction<CancellationSettings>> = action => {
    const next = typeof action === 'function' ? action(formData) : action
    for (const key of keys) {
      const value = next[key as keyof CancellationSettings]
      if (JSON.stringify(value) !== JSON.stringify(formData[key as keyof CancellationSettings])) {
        state.set(key, value as SettingValue)
      }
    }
  }
  const handleSave = () => void state.save()
  // 標準テンプレートを適用
  const applyStandardTemplate = () => {
    setFormData(prev => ({
      ...prev,
      // 通常公演
      cancellation_policy_items: DEFAULT_POLICY_ITEMS,
      cancellation_deadline_hours: DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
      cancellation_fees: [...DEFAULT_OPEN_CANCELLATION_FEES],
      cancellation_fee_basis: 'participant_total',
      // 貸切公演
      private_cancellation_policy_items: DEFAULT_PRIVATE_POLICY_ITEMS,
      private_cancellation_deadline_hours: DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
      private_cancellation_fees: [...DEFAULT_PRIVATE_CANCELLATION_FEES],
      private_cancellation_fee_basis: 'performance_total',
      // 店舗都合キャンセル
      organizer_cancel_reasons: DEFAULT_ORGANIZER_CANCEL_REASONS,
      organizer_cancel_refund_note: '参加料金は全額返金いたします。',
      // 中止判定
      cancellation_judgment_rules: DEFAULT_JUDGMENT_RULES,
      cancellation_notice_note: '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
      // 予約変更
      reservation_change_deadline_hours: 24,
      reservation_change_note: '参加人数の変更は、マイページに表示された変更期限まで行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。',
      private_reservation_change_deadline_hours: 168,
      private_reservation_change_note: '貸切予約の変更は、表示された変更期限まで可能です。日程変更は空き状況によります。',
      // 返金
      refund_method_note: '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。'
    }))
    showToast.success('標準テンプレートを適用しました')
  }

  // 通常公演用のキャンセル料操作
  const addCancellationFee = () => {
    setFormData(prev => ({
      ...prev,
      cancellation_fees: [
        ...prev.cancellation_fees,
        { hours_before: 0, fee_percentage: 100, description: '' }
      ]
    }))
  }

  const removeCancellationFee = (index: number) => {
    setFormData(prev => ({
      ...prev,
      cancellation_fees: prev.cancellation_fees.filter((_, i) => i !== index)
    }))
  }

  const updateCancellationFee = (index: number, field: keyof CancellationFee, value: string | number) => {
    const newFees = [...formData.cancellation_fees]
    newFees[index] = { ...newFees[index], [field]: value }
    setFormData(prev => ({ ...prev, cancellation_fees: newFees }))
  }

  // 貸切公演用のキャンセル料操作
  const addPrivateCancellationFee = () => {
    setFormData(prev => ({
      ...prev,
      private_cancellation_fees: [
        ...prev.private_cancellation_fees,
        { hours_before: 0, fee_percentage: 100, description: '' }
      ]
    }))
  }

  const removePrivateCancellationFee = (index: number) => {
    setFormData(prev => ({
      ...prev,
      private_cancellation_fees: prev.private_cancellation_fees.filter((_, i) => i !== index)
    }))
  }

  const updatePrivateCancellationFee = (index: number, field: keyof CancellationFee, value: string | number) => {
    const newFees = [...formData.private_cancellation_fees]
    newFees[index] = { ...newFees[index], [field]: value }
    setFormData(prev => ({ ...prev, private_cancellation_fees: newFees }))
  }

  // 通常公演ポリシー項目の操作
  const addPolicyItem = () => {
    setFormData(prev => ({
      ...prev,
      cancellation_policy_items: [
        ...prev.cancellation_policy_items,
        { id: generateId(), content: '' }
      ]
    }))
  }

  const removePolicyItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      cancellation_policy_items: prev.cancellation_policy_items.filter(item => item.id !== id)
    }))
  }

  const updatePolicyItem = (id: string, content: string) => {
    setFormData(prev => ({
      ...prev,
      cancellation_policy_items: prev.cancellation_policy_items.map(item =>
        item.id === id ? { ...item, content } : item
      )
    }))
  }

  const movePolicyItemUp = (index: number) => {
    if (index === 0) return
    setFormData(prev => {
      const items = [...prev.cancellation_policy_items]
      ;[items[index - 1], items[index]] = [items[index], items[index - 1]]
      return { ...prev, cancellation_policy_items: items }
    })
  }

  const movePolicyItemDown = (index: number) => {
    if (index === formData.cancellation_policy_items.length - 1) return
    setFormData(prev => {
      const items = [...prev.cancellation_policy_items]
      ;[items[index], items[index + 1]] = [items[index + 1], items[index]]
      return { ...prev, cancellation_policy_items: items }
    })
  }

  // 貸切公演ポリシー項目の操作
  const addPrivatePolicyItem = () => {
    setFormData(prev => ({
      ...prev,
      private_cancellation_policy_items: [
        ...prev.private_cancellation_policy_items,
        { id: generateId(), content: '' }
      ]
    }))
  }

  const removePrivatePolicyItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      private_cancellation_policy_items: prev.private_cancellation_policy_items.filter(item => item.id !== id)
    }))
  }

  const updatePrivatePolicyItem = (id: string, content: string) => {
    setFormData(prev => ({
      ...prev,
      private_cancellation_policy_items: prev.private_cancellation_policy_items.map(item =>
        item.id === id ? { ...item, content } : item
      )
    }))
  }

  const movePrivatePolicyItemUp = (index: number) => {
    if (index === 0) return
    setFormData(prev => {
      const items = [...prev.private_cancellation_policy_items]
      ;[items[index - 1], items[index]] = [items[index], items[index - 1]]
      return { ...prev, private_cancellation_policy_items: items }
    })
  }

  const movePrivatePolicyItemDown = (index: number) => {
    if (index === formData.private_cancellation_policy_items.length - 1) return
    setFormData(prev => {
      const items = [...prev.private_cancellation_policy_items]
      ;[items[index], items[index + 1]] = [items[index + 1], items[index]]
      return { ...prev, private_cancellation_policy_items: items }
    })
  }

  const organizationSlug = organization?.slug || null
  const previewPolicy: PublicCancellationPolicy = {
    organization_id: 'admin-preview',
    organization_slug: organizationSlug || '',
    organization_name: '管理画面プレビュー',
    store_id: storeId || 'all-stores-preview',
    store_name: storeId ? '選択中の店舗' : '全店舗へ適用する共通内容',
    store_short_name: storeId ? '選択中の店舗' : '全店舗',
    is_configured: true,
    cancellation_policy: formData.cancellation_policy || null,
    cancellation_policy_items: formData.cancellation_policy_items,
    cancellation_deadline_hours: formData.cancellation_deadline_hours,
    cancellation_fees: formData.cancellation_fees,
    cancellation_fee_basis: formData.cancellation_fee_basis,
    private_cancellation_policy: formData.private_cancellation_policy || null,
    private_cancellation_policy_items: formData.private_cancellation_policy_items,
    private_cancellation_deadline_hours: formData.private_cancellation_deadline_hours,
    private_cancellation_fees: formData.private_cancellation_fees,
    private_cancellation_fee_basis: formData.private_cancellation_fee_basis,
    organizer_cancel_reasons: formData.organizer_cancel_reasons,
    organizer_cancel_refund_note: formData.organizer_cancel_refund_note,
    cancellation_judgment_rules: formData.cancellation_judgment_rules,
    cancellation_notice_note: formData.cancellation_notice_note,
    reservation_change_deadline_hours: formData.reservation_change_deadline_hours,
    reservation_change_note: formData.reservation_change_note,
    private_reservation_change_deadline_hours: formData.private_reservation_change_deadline_hours,
    private_reservation_change_note: formData.private_reservation_change_note,
    refund_method_note: formData.refund_method_note,
    policy_updated_at: formData.policy_updated_at,
    source: 'rpc',
  }

  if (scope !== 'organization' && !(targetId ?? storeId)) return <p>設定する対象を選択してください。</p>
  if (state.error && !state.data) return <div role="alert"><p>{state.error}</p><Button onClick={() => void state.reload()}>再読み込み</Button></div>
  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <PageHeader
        title="キャンセル設定"
        description="通常公演・貸切公演それぞれのキャンセルポリシーを設定します"
      >
        <div className="flex items-center gap-2">
          <a
            href={buildPublicCancellationPolicyPath(organizationSlug, storeId || null)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            ポリシーページを確認
          </a>
          <Button size="sm" onClick={handleSave} disabled={saving || !state.data?.can_edit || !state.dirty}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </PageHeader>

      <a className="underline" href="?tab=cancellation-billing">キャンセル料・振込先・freee入金確認を開く</a>

      {/* テンプレート適用バナー */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-full">
              <Sparkles className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900 text-sm">標準テンプレートを使う</h3>
              <p className="text-xs text-gray-600">
                一般的なキャンセルポリシーを一括で設定できます。後から編集も可能です。
              </p>
            </div>
          </div>
          <Button
            onClick={applyStandardTemplate}
            disabled={saving || !state.data?.can_edit}
            variant="outline"
            size="sm"
            className="border-purple-300 text-purple-700 hover:bg-purple-100"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            テンプレートを適用
          </Button>
        </div>
      </div>

      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <section className="rounded-xl border p-4 space-y-3">
        <p className="text-sm">{scope === 'organization' ? '組織共通の規定です。個別指定のない項目に適用します。' : '共通の規定を引き継ぎ、変更した項目だけこの対象で個別指定します。'}</p>
        <p className="text-sm text-muted-foreground">予約済みのお客様のキャンセル料・受付期限は、予約時の条件を維持します。</p>
        <details><summary className="cursor-pointer">項目ごとの設定元を確認・変更</summary>
          <div className="grid gap-4 mt-4">{keys.map(key => {
            const resolved = state.resolve(key, defaults[key as keyof CancellationSettings] as SettingValue)
            const inherited = state.inherited(key, defaults[key as keyof CancellationSettings] as SettingValue)
            return <div key={key} className="space-y-1"><p className="text-sm">{SETTING_DEFINITIONS[key].label}：{SETTING_SCOPE_LABELS[resolved.source]}</p>
              {scope !== 'organization' && <Select value={resolved.source === scope ? 'custom' : 'common'} disabled={saving || !state.data?.can_edit}
                onValueChange={value => state.set(key, value === 'common' ? null : resolved.value)}>
                <SelectTrigger aria-label={`${SETTING_DEFINITIONS[key].label}の設定元`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="common">共通設定を使う（{SETTING_SCOPE_LABELS[inherited.source]}）</SelectItem>
                <SelectItem value="custom">この{SETTING_SCOPE_LABELS[scope]}で指定</SelectItem></SelectContent>
              </Select>}
            </div>
          })}</div>
        </details>
      </section>

      <fieldset disabled={saving || !state.data?.can_edit} className="space-y-6">
      {/* 通常公演のキャンセルポリシー */}
      <OpenPolicySection
        formData={formData}
        setFormData={setFormData}
        addPolicyItem={addPolicyItem}
        removePolicyItem={removePolicyItem}
        updatePolicyItem={updatePolicyItem}
        movePolicyItemUp={movePolicyItemUp}
        movePolicyItemDown={movePolicyItemDown}
        addCancellationFee={addCancellationFee}
        removeCancellationFee={removeCancellationFee}
        updateCancellationFee={updateCancellationFee}
      />

      {/* 貸切公演のキャンセルポリシー */}
      <PrivatePolicySection
        formData={formData}
        setFormData={setFormData}
        addPrivatePolicyItem={addPrivatePolicyItem}
        removePrivatePolicyItem={removePrivatePolicyItem}
        updatePrivatePolicyItem={updatePrivatePolicyItem}
        movePrivatePolicyItemUp={movePrivatePolicyItemUp}
        movePrivatePolicyItemDown={movePrivatePolicyItemDown}
        addPrivateCancellationFee={addPrivateCancellationFee}
        removePrivateCancellationFee={removePrivateCancellationFee}
        updatePrivateCancellationFee={updatePrivateCancellationFee}
      />

      {/* その他のポリシー */}
      <OtherPoliciesSection formData={formData} setFormData={setFormData} generateId={generateId} />
      </fieldset>

      <section className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <h2>顧客向け表示プレビュー</h2>
          <p className="ts-muted">
            保存後、公開ページではこの料金基準・受付期限・最終更新日を店舗別に表示します。
          </p>
        </div>
        <CancellationPolicyView policy={previewPolicy} />
      </section>
    </div>
  )
}
