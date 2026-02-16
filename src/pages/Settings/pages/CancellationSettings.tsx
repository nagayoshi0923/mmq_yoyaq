import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, Plus, Trash2, Users, Lock, Building2, Settings2, Clock, Info, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface CancellationFee {
  hours_before: number
  fee_percentage: number
  description: string
}

interface PolicyItem {
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

interface CancellationSettings {
  id: string
  store_id: string
  // 通常公演用
  cancellation_policy: string
  cancellation_policy_items: PolicyItem[]
  cancellation_deadline_hours: number
  cancellation_fees: CancellationFee[]
  // 貸切公演用
  private_cancellation_policy: string
  private_cancellation_policy_items: PolicyItem[]
  private_cancellation_deadline_hours: number
  private_cancellation_fees: CancellationFee[]
  // 店舗都合キャンセル
  organizer_cancel_reasons: OrganizerCancelReason[]
  organizer_cancel_refund_note: string  // "参加料金は全額返金いたします"
  // 中止判定タイミング
  cancellation_judgment_rules: CancellationJudgmentRule[]
  cancellation_notice_note: string  // 中止時の連絡方法
  // 予約変更
  reservation_change_deadline_hours: number  // 変更可能期限（時間前）
  reservation_change_note: string  // 予約変更に関する補足
  // 返金方法
  refund_method_note: string  // 返金方法の説明
  // 共通
  auto_refund_enabled: boolean
  refund_processing_days: number
  // 最終更新日
  policy_updated_at: string
}

interface CancellationSettingsProps {
  storeId: string
}

type SettingType = 'regular' | 'private' | 'organizer' | 'other'

// キャンセル料金コンポーネント
interface CancellationFeesEditorProps {
  fees: CancellationFee[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof CancellationFee, value: string | number) => void
}

function CancellationFeesEditor({ fees, onAdd, onRemove, onUpdate }: CancellationFeesEditorProps) {
  // キャンセル料金をプレビュー表示
  const getPreviewText = () => {
    const sorted = [...fees].sort((a, b) => b.hours_before - a.hours_before)
    return sorted.map(fee => {
      const days = Math.floor(fee.hours_before / 24)
      const hours = fee.hours_before % 24
      let timeText = ''
      
      if (days > 0) {
        timeText = `${days}日`
        if (hours > 0) timeText += `${hours}時間`
      } else if (hours > 0) {
        timeText = `${hours}時間`
      } else {
        timeText = '当日'
      }
      
      return `${timeText}前: ${fee.fee_percentage}% ${fee.description ? `(${fee.description})` : ''}`
    }).join('\n')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-sm">キャンセル料金</h4>
          <p className="text-xs text-muted-foreground">キャンセルするタイミングに応じて料金を設定</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="text-blue-600 border-blue-600 hover:bg-blue-50"
        >
          <Plus className="h-4 w-4 mr-1" />
          追加
        </Button>
      </div>

      <div className="space-y-3">
        {fees.map((fee, index) => (
          <div key={index} className="border rounded-lg p-3">
            <div className="grid grid-cols-12 gap-3 items-start">
              <div className="col-span-3">
                <Label className="text-xs">何時間前</Label>
                <Input
                  type="number"
                  value={fee.hours_before}
                  onChange={(e) => onUpdate(index, 'hours_before', parseInt(e.target.value) || 0)}
                  min="0"
                  className="text-sm mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Math.floor(fee.hours_before / 24)}日{fee.hours_before % 24 > 0 ? `${fee.hours_before % 24}時間` : ''}前
                </p>
              </div>
              <div className="col-span-3">
                <Label className="text-xs">キャンセル料率</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    type="number"
                    value={fee.fee_percentage}
                    onChange={(e) => onUpdate(index, 'fee_percentage', parseInt(e.target.value) || 0)}
                    min="0"
                    max="100"
                    className="text-sm"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="col-span-5">
                <Label className="text-xs">説明</Label>
                <Input
                  type="text"
                  value={fee.description}
                  onChange={(e) => onUpdate(index, 'description', e.target.value)}
                  placeholder="例: 1週間前まで無料"
                  className="text-sm mt-1"
                />
              </div>
              <div className="col-span-1 flex justify-end items-start pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(index)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                  disabled={fees.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* プレビュー */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <h5 className="text-xs font-medium mb-1">プレビュー</h5>
        <pre className="text-xs text-gray-700 whitespace-pre-wrap">
          {getPreviewText()}
        </pre>
      </div>
    </div>
  )
}

// ポリシー項目エディタ
interface PolicyItemsEditorProps {
  items: PolicyItem[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, content: string) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
}

function PolicyItemsEditor({ items, onAdd, onRemove, onUpdate, onMoveUp, onMoveDown }: PolicyItemsEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-sm">ポリシー項目</h4>
          <p className="text-xs text-muted-foreground">予約確認やサイトに表示される注意事項</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="text-blue-600 border-blue-600 hover:bg-blue-50"
        >
          <Plus className="h-4 w-4 mr-1" />
          項目追加
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-start gap-2 p-2 border rounded-lg bg-white">
            <div className="flex flex-col gap-0.5 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                onClick={() => onMoveUp(index)}
                disabled={index === 0}
              >
                ▲
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                onClick={() => onMoveDown(index)}
                disabled={index === items.length - 1}
              >
                ▼
              </Button>
            </div>
            <div className="flex-1">
              <Input
                value={item.content}
                onChange={(e) => onUpdate(item.id, e.target.value)}
                placeholder="ポリシー内容を入力"
                className="text-sm"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item.id)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 w-9 p-0"
              disabled={items.length <= 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* プレビュー */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <h5 className="text-xs font-medium mb-2">表示プレビュー</h5>
        <ul className="text-xs text-gray-700 space-y-1">
          {items.map((item) => (
            <li key={item.id}>• {item.content || '（未入力）'}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// デフォルトのポリシー項目
const DEFAULT_POLICY_ITEMS: PolicyItem[] = [
  { id: '1', content: 'キャンセルの際は必ず事前にご連絡ください' },
  { id: '2', content: 'キャンセル料は予約時の参加費を基準に算出されます' },
  { id: '3', content: '無断キャンセルの場合は100%のキャンセル料が発生します' }
]

const DEFAULT_PRIVATE_POLICY_ITEMS: PolicyItem[] = [
  { id: '1', content: '貸切予約のキャンセルは通常公演より早い期限が適用されます' },
  { id: '2', content: 'キャンセル料は貸切料金を基準に算出されます' },
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
  { id: '2', timing: '前日 23:59', condition: '過半数以上だが満席でない場合', result: '公演4時間前まで募集を延長' },
  { id: '3', timing: '前日 23:59', condition: '満席の場合', result: '開催確定' },
  { id: '4', timing: '公演4時間前（延長された場合）', condition: '満席でない場合', result: '中止' }
]

const generateId = () => Math.random().toString(36).substring(2, 9)

export function CancellationSettings({ storeId }: CancellationSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingType>('regular')
  const [formData, setFormData] = useState<CancellationSettings>({
    id: '',
    store_id: storeId,
    // 通常公演
    cancellation_policy: '',
    cancellation_policy_items: DEFAULT_POLICY_ITEMS,
    cancellation_deadline_hours: 24,
    cancellation_fees: [
      { hours_before: 24, fee_percentage: 0, description: '24時間前まで無料' },
      { hours_before: 0, fee_percentage: 50, description: '24時間前〜当日50%' },
      { hours_before: -1, fee_percentage: 100, description: '公演開始後・無断キャンセル100%' }
    ],
    // 貸切公演
    private_cancellation_policy: '',
    private_cancellation_policy_items: DEFAULT_PRIVATE_POLICY_ITEMS,
    private_cancellation_deadline_hours: 48,
    private_cancellation_fees: [
      { hours_before: 336, fee_percentage: 0, description: '2週間前まで無料' },
      { hours_before: 168, fee_percentage: 30, description: '1週間前まで30%' },
      { hours_before: 72, fee_percentage: 50, description: '3日前まで50%' },
      { hours_before: 0, fee_percentage: 100, description: '当日100%' }
    ],
    // 店舗都合キャンセル
    organizer_cancel_reasons: DEFAULT_ORGANIZER_CANCEL_REASONS,
    organizer_cancel_refund_note: '参加料金は全額返金いたします。',
    // 中止判定タイミング
    cancellation_judgment_rules: DEFAULT_JUDGMENT_RULES,
    cancellation_notice_note: '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
    // 予約変更
    reservation_change_deadline_hours: 24,
    reservation_change_note: '参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。',
    // 返金方法
    refund_method_note: '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
    // 共通
    auto_refund_enabled: false,
    refund_processing_days: 7,
    policy_updated_at: new Date().toISOString().split('T')[0]
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  const fetchData = async () => {
    setLoading(true)
    try {
      await fetchSettings(storeId)
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      // 全店舗選択時は最初の店舗の設定を代表として表示
      if (!storeId) {
        const allStores = await storeApi.getAll()
        if (allStores.length > 0) {
          const firstStoreId = allStores[0].id
          const { data, error } = await supabase
            .from('reservation_settings')
            .select('*')
            .eq('store_id', firstStoreId)
            .maybeSingle()

          if (error && error.code !== 'PGRST116') throw error

          if (data) {
            // 既存のcancellation_policyテキストをpolicy_itemsに変換（マイグレーション対応）
            let policyItems = data.cancellation_policy_items
            if ((!policyItems || policyItems.length === 0) && data.cancellation_policy) {
              const lines = data.cancellation_policy.split('\n').filter((line: string) => line.trim())
              if (lines.length > 0) {
                policyItems = lines.map((line: string) => ({
                  id: generateId(),
                  content: line.replace(/^[・•\-\*]\s*/, '').trim()
                }))
              } else {
                policyItems = DEFAULT_POLICY_ITEMS
              }
            } else if (!policyItems || policyItems.length === 0) {
              policyItems = DEFAULT_POLICY_ITEMS
            }

            let privatePolicyItems = data.private_cancellation_policy_items
            if ((!privatePolicyItems || privatePolicyItems.length === 0) && data.private_cancellation_policy) {
              const lines = data.private_cancellation_policy.split('\n').filter((line: string) => line.trim())
              if (lines.length > 0) {
                privatePolicyItems = lines.map((line: string) => ({
                  id: generateId(),
                  content: line.replace(/^[・•\-\*]\s*/, '').trim()
                }))
              } else {
                privatePolicyItems = DEFAULT_PRIVATE_POLICY_ITEMS
              }
            } else if (!privatePolicyItems || privatePolicyItems.length === 0) {
              privatePolicyItems = DEFAULT_PRIVATE_POLICY_ITEMS
            }

            setFormData({
              id: '', // 全店舗モードなのでidは空
              store_id: '',
              cancellation_policy: data.cancellation_policy || '',
              cancellation_policy_items: policyItems,
              cancellation_deadline_hours: data.cancellation_deadline_hours || 24,
              cancellation_fees: data.cancellation_fees || [
                { hours_before: 24, fee_percentage: 0, description: '24時間前まで無料' },
                { hours_before: 0, fee_percentage: 50, description: '24時間前〜当日50%' },
                { hours_before: -1, fee_percentage: 100, description: '公演開始後・無断キャンセル100%' }
              ],
              private_cancellation_policy: data.private_cancellation_policy || '',
              private_cancellation_policy_items: privatePolicyItems,
              private_cancellation_deadline_hours: data.private_cancellation_deadline_hours || 48,
              private_cancellation_fees: data.private_cancellation_fees || [
                { hours_before: 336, fee_percentage: 0, description: '2週間前まで無料' },
                { hours_before: 168, fee_percentage: 30, description: '1週間前まで30%' },
                { hours_before: 72, fee_percentage: 50, description: '3日前まで50%' },
                { hours_before: 0, fee_percentage: 100, description: '当日100%' }
              ],
              // 新しいフィールド
              organizer_cancel_reasons: data.organizer_cancel_reasons || DEFAULT_ORGANIZER_CANCEL_REASONS,
              organizer_cancel_refund_note: data.organizer_cancel_refund_note || '参加料金は全額返金いたします。',
              cancellation_judgment_rules: data.cancellation_judgment_rules || DEFAULT_JUDGMENT_RULES,
              cancellation_notice_note: data.cancellation_notice_note || '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
              reservation_change_deadline_hours: data.reservation_change_deadline_hours || 24,
              reservation_change_note: data.reservation_change_note || '参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。',
              refund_method_note: data.refund_method_note || '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
              auto_refund_enabled: data.auto_refund_enabled || false,
              refund_processing_days: data.refund_processing_days || 7,
              policy_updated_at: data.policy_updated_at || new Date().toISOString().split('T')[0]
            })
            return
          }
        }
        // 店舗がないか設定がない場合はデフォルト
        setFormData(prev => ({
          ...prev,
          id: '',
          store_id: ''
        }))
        return
      }

      const { data, error } = await supabase
        .from('reservation_settings')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        // 既存のcancellation_policyテキストをpolicy_itemsに変換（マイグレーション対応）
        let policyItems = data.cancellation_policy_items
        if ((!policyItems || policyItems.length === 0) && data.cancellation_policy) {
          // 既存のテキストを行ごとに分割してpolicy_itemsに変換
          const lines = data.cancellation_policy.split('\n').filter((line: string) => line.trim())
          if (lines.length > 0) {
            policyItems = lines.map((line: string, index: number) => ({
              id: generateId(),
              content: line.replace(/^[・•\-\*]\s*/, '').trim() // 先頭の箇条書き記号を除去
            }))
          } else {
            policyItems = DEFAULT_POLICY_ITEMS
          }
        } else if (!policyItems || policyItems.length === 0) {
          policyItems = DEFAULT_POLICY_ITEMS
        }

        let privatePolicyItems = data.private_cancellation_policy_items
        if ((!privatePolicyItems || privatePolicyItems.length === 0) && data.private_cancellation_policy) {
          const lines = data.private_cancellation_policy.split('\n').filter((line: string) => line.trim())
          if (lines.length > 0) {
            privatePolicyItems = lines.map((line: string, index: number) => ({
              id: generateId(),
              content: line.replace(/^[・•\-\*]\s*/, '').trim()
            }))
          } else {
            privatePolicyItems = DEFAULT_PRIVATE_POLICY_ITEMS
          }
        } else if (!privatePolicyItems || privatePolicyItems.length === 0) {
          privatePolicyItems = DEFAULT_PRIVATE_POLICY_ITEMS
        }

        setFormData({
          id: data.id,
          store_id: data.store_id,
          cancellation_policy: data.cancellation_policy || '',
          cancellation_policy_items: policyItems,
          cancellation_deadline_hours: data.cancellation_deadline_hours || 24,
          cancellation_fees: data.cancellation_fees || [
            { hours_before: 24, fee_percentage: 0, description: '24時間前まで無料' },
            { hours_before: 0, fee_percentage: 50, description: '24時間前〜当日50%' },
            { hours_before: -1, fee_percentage: 100, description: '公演開始後・無断キャンセル100%' }
          ],
          private_cancellation_policy: data.private_cancellation_policy || '',
          private_cancellation_policy_items: privatePolicyItems,
          private_cancellation_deadline_hours: data.private_cancellation_deadline_hours || 48,
          private_cancellation_fees: data.private_cancellation_fees || [
            { hours_before: 336, fee_percentage: 0, description: '2週間前まで無料' },
            { hours_before: 168, fee_percentage: 30, description: '1週間前まで30%' },
            { hours_before: 72, fee_percentage: 50, description: '3日前まで50%' },
            { hours_before: 0, fee_percentage: 100, description: '当日100%' }
          ],
          // 新しいフィールド
          organizer_cancel_reasons: data.organizer_cancel_reasons || DEFAULT_ORGANIZER_CANCEL_REASONS,
          organizer_cancel_refund_note: data.organizer_cancel_refund_note || '参加料金は全額返金いたします。',
          cancellation_judgment_rules: data.cancellation_judgment_rules || DEFAULT_JUDGMENT_RULES,
          cancellation_notice_note: data.cancellation_notice_note || '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
          reservation_change_deadline_hours: data.reservation_change_deadline_hours || 24,
          reservation_change_note: data.reservation_change_note || '参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。',
          refund_method_note: data.refund_method_note || '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
          auto_refund_enabled: data.auto_refund_enabled || false,
          refund_processing_days: data.refund_processing_days || 7,
          policy_updated_at: data.policy_updated_at || new Date().toISOString().split('T')[0]
        })
      } else {
        setFormData(prev => ({
          ...prev,
          id: '',
          store_id: storeId
        }))
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const sortedFees = [...formData.cancellation_fees].sort((a, b) => b.hours_before - a.hours_before)
      const sortedPrivateFees = [...formData.private_cancellation_fees].sort((a, b) => b.hours_before - a.hours_before)

      const savePayload = {
        cancellation_policy: formData.cancellation_policy,
        cancellation_policy_items: formData.cancellation_policy_items,
        cancellation_deadline_hours: formData.cancellation_deadline_hours,
        cancellation_fees: sortedFees,
        private_cancellation_policy: formData.private_cancellation_policy,
        private_cancellation_policy_items: formData.private_cancellation_policy_items,
        private_cancellation_deadline_hours: formData.private_cancellation_deadline_hours,
        private_cancellation_fees: sortedPrivateFees,
        // 新しいフィールド
        organizer_cancel_reasons: formData.organizer_cancel_reasons,
        organizer_cancel_refund_note: formData.organizer_cancel_refund_note,
        cancellation_judgment_rules: formData.cancellation_judgment_rules,
        cancellation_notice_note: formData.cancellation_notice_note,
        reservation_change_deadline_hours: formData.reservation_change_deadline_hours,
        reservation_change_note: formData.reservation_change_note,
        refund_method_note: formData.refund_method_note,
        policy_updated_at: new Date().toISOString().split('T')[0]
      }

      // 全店舗選択時は全店舗に一括適用
      if (!storeId) {
        const allStores = await storeApi.getAll()
        logger.log('全店舗一括適用開始:', allStores.length, '店舗')
        
        if (allStores.length === 0) {
          showToast.warning('店舗が登録されていません')
          setSaving(false)
          return
        }

        let successCount = 0
        let errorCount = 0

        for (const store of allStores) {
          try {
            const { data: existing, error: selectError } = await supabase
              .from('reservation_settings')
              .select('id')
              .eq('store_id', store.id)
              .maybeSingle()

            if (selectError) {
              logger.error(`店舗 ${store.name} の設定取得エラー:`, selectError)
            }

            if (existing) {
              logger.log(`店舗 ${store.name}: 既存設定を更新`, existing.id)
              const { error } = await supabase
                .from('reservation_settings')
                .update(savePayload)
                .eq('id', existing.id)
              if (error) {
                logger.error(`店舗 ${store.name} の更新エラー:`, error)
                throw error
              }
            } else {
              logger.log(`店舗 ${store.name}: 新規設定を作成`)
              const { error } = await supabase
                .from('reservation_settings')
                .insert({
                  store_id: store.id,
                  organization_id: store.organization_id,
                  ...savePayload
                })
              if (error) {
                logger.error(`店舗 ${store.name} の作成エラー:`, error)
                throw error
              }
            }
            successCount++
          } catch (err) {
            logger.error(`店舗 ${store.name} の設定保存エラー:`, err)
            errorCount++
          }
        }

        logger.log('全店舗適用完了:', successCount, '成功,', errorCount, 'エラー')
        if (errorCount === 0) {
          showToast.success(`全${successCount}店舗に設定を適用しました`)
        } else {
          showToast.warning(`${successCount}店舗に適用、${errorCount}店舗でエラー`)
        }
        setSaving(false)
        return
      }

      // 特定店舗選択時
      if (formData.id) {
        const { error } = await supabase
          .from('reservation_settings')
          .update(savePayload)
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data: storeData } = await supabase
          .from('stores')
          .select('organization_id')
          .eq('id', formData.store_id)
          .single()
        
        const { data, error } = await supabase
          .from('reservation_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: storeData?.organization_id,
            ...savePayload
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
      }

      showToast.success('設定を保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
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

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="キャンセル設定"
        description="通常公演・貸切公演それぞれのキャンセルポリシー"
      >
        <div className="flex items-center gap-2">
          <a
            href="/cancel-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            ポリシーページを確認
          </a>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </PageHeader>

      {!storeId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>全店舗選択中:</strong> 保存すると、全店舗にこの設定が一括適用されます。
          </p>
        </div>
      )}

      {/* タブ切り替え */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('regular')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'regular'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Users className="h-4 w-4" />
          通常公演
        </button>
        <button
          onClick={() => setActiveTab('private')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'private'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Lock className="h-4 w-4" />
          貸切公演
        </button>
        <button
          onClick={() => setActiveTab('organizer')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'organizer'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Building2 className="h-4 w-4" />
          店舗都合
        </button>
        <button
          onClick={() => setActiveTab('other')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'other'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Settings2 className="h-4 w-4" />
          その他
        </button>
      </div>

      {/* 通常公演設定 */}
      {activeTab === 'regular' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                <div>
                  <CardTitle>通常公演のキャンセルポリシー</CardTitle>
                  <CardDescription>一般参加者向けのキャンセル規約</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* ポリシー項目 */}
              <PolicyItemsEditor
                items={formData.cancellation_policy_items}
                onAdd={addPolicyItem}
                onRemove={removePolicyItem}
                onUpdate={updatePolicyItem}
                onMoveUp={movePolicyItemUp}
                onMoveDown={movePolicyItemDown}
              />

              {/* 補足文章（任意） */}
              <div>
                <Label htmlFor="cancellation_policy">補足説明（任意）</Label>
                <Textarea
                  id="cancellation_policy"
                  value={formData.cancellation_policy}
                  onChange={(e) => setFormData(prev => ({ ...prev, cancellation_policy: e.target.value }))}
                  placeholder="上記項目以外の補足説明があれば入力"
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div className="border-t pt-4">
                <Label htmlFor="cancellation_deadline_hours">キャンセル受付期限</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="cancellation_deadline_hours"
                    type="number"
                    value={formData.cancellation_deadline_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, cancellation_deadline_hours: parseInt(e.target.value) || 0 }))}
                    min="0"
                    max="720"
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">時間前まで受付</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  公演開始の{formData.cancellation_deadline_hours}時間前（{Math.floor(formData.cancellation_deadline_hours / 24)}日{formData.cancellation_deadline_hours % 24}時間前）までキャンセル可能
                </p>
              </div>

              <CancellationFeesEditor
                fees={formData.cancellation_fees}
                onAdd={addCancellationFee}
                onRemove={removeCancellationFee}
                onUpdate={updateCancellationFee}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 貸切公演設定 */}
      {activeTab === 'private' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-600" />
                <div>
                  <CardTitle>貸切公演のキャンセルポリシー</CardTitle>
                  <CardDescription>貸切予約者向けのキャンセル規約（通常より厳しめの設定が一般的）</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* ポリシー項目 */}
              <PolicyItemsEditor
                items={formData.private_cancellation_policy_items}
                onAdd={addPrivatePolicyItem}
                onRemove={removePrivatePolicyItem}
                onUpdate={updatePrivatePolicyItem}
                onMoveUp={movePrivatePolicyItemUp}
                onMoveDown={movePrivatePolicyItemDown}
              />

              {/* 補足文章（任意） */}
              <div>
                <Label htmlFor="private_cancellation_policy">補足説明（任意）</Label>
                <Textarea
                  id="private_cancellation_policy"
                  value={formData.private_cancellation_policy}
                  onChange={(e) => setFormData(prev => ({ ...prev, private_cancellation_policy: e.target.value }))}
                  placeholder="上記項目以外の補足説明があれば入力"
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div className="border-t pt-4">
                <Label htmlFor="private_cancellation_deadline_hours">キャンセル受付期限</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="private_cancellation_deadline_hours"
                    type="number"
                    value={formData.private_cancellation_deadline_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, private_cancellation_deadline_hours: parseInt(e.target.value) || 0 }))}
                    min="0"
                    max="720"
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">時間前まで受付</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  公演開始の{formData.private_cancellation_deadline_hours}時間前（{Math.floor(formData.private_cancellation_deadline_hours / 24)}日{formData.private_cancellation_deadline_hours % 24}時間前）までキャンセル可能
                </p>
              </div>

              <CancellationFeesEditor
                fees={formData.private_cancellation_fees}
                onAdd={addPrivateCancellationFee}
                onRemove={removePrivateCancellationFee}
                onUpdate={updatePrivateCancellationFee}
              />
            </CardContent>
          </Card>

          {/* 貸切用の注意事項 */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 mb-2">💡 貸切公演のポイント</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>• 貸切は会場を専有するため、通常より早い期限・高いキャンセル料が一般的です</li>
              <li>• GMや会場の手配があるため、2週間〜1ヶ月前からキャンセル料が発生することが多いです</li>
              <li>• 貸切キャンセル時は「貸切キャンセル確認メール」が送信されます</li>
            </ul>
          </div>
        </div>
      )}

      {/* 店舗都合キャンセル設定 */}
      {activeTab === 'organizer' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-amber-600" />
                <div>
                  <CardTitle>店舗都合によるキャンセル</CardTitle>
                  <CardDescription>店舗側の都合で公演が中止となる場合の説明</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* キャンセル理由 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>キャンセルとなる理由</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      organizer_cancel_reasons: [
                        ...prev.organizer_cancel_reasons,
                        { id: generateId(), content: '' }
                      ]
                    }))}
                    className="text-amber-600 border-amber-600 hover:bg-amber-50"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    追加
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.organizer_cancel_reasons.map((reason, index) => (
                    <div key={reason.id} className="flex items-center gap-2">
                      <Input
                        value={reason.content}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          organizer_cancel_reasons: prev.organizer_cancel_reasons.map(r =>
                            r.id === reason.id ? { ...r, content: e.target.value } : r
                          )
                        }))}
                        placeholder="キャンセル理由を入力"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          organizer_cancel_reasons: prev.organizer_cancel_reasons.filter(r => r.id !== reason.id)
                        }))}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 w-9 p-0"
                        disabled={formData.organizer_cancel_reasons.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 返金に関する説明 */}
              <div>
                <Label htmlFor="organizer_cancel_refund_note">返金に関する説明</Label>
                <Textarea
                  id="organizer_cancel_refund_note"
                  value={formData.organizer_cancel_refund_note}
                  onChange={(e) => setFormData(prev => ({ ...prev, organizer_cancel_refund_note: e.target.value }))}
                  placeholder="店舗都合の場合の返金について"
                  rows={2}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* 中止判定タイミング */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                <div>
                  <CardTitle>中止判定のタイミング</CardTitle>
                  <CardDescription>公演中止を判定するルール</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <Label>判定ルール</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    cancellation_judgment_rules: [
                      ...prev.cancellation_judgment_rules,
                      { id: generateId(), timing: '', condition: '', result: '' }
                    ]
                  }))}
                  className="text-amber-600 border-amber-600 hover:bg-amber-50"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  追加
                </Button>
              </div>
              <div className="space-y-3">
                {formData.cancellation_judgment_rules.map((rule, index) => (
                  <div key={rule.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">タイミング</Label>
                        <Input
                          value={rule.timing}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            cancellation_judgment_rules: prev.cancellation_judgment_rules.map(r =>
                              r.id === rule.id ? { ...r, timing: e.target.value } : r
                            )
                          }))}
                          placeholder="例: 前日 23:59"
                          className="mt-1"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          cancellation_judgment_rules: prev.cancellation_judgment_rules.filter(r => r.id !== rule.id)
                        }))}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 w-9 p-0 mt-5"
                        disabled={formData.cancellation_judgment_rules.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">条件</Label>
                        <Input
                          value={rule.condition}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            cancellation_judgment_rules: prev.cancellation_judgment_rules.map(r =>
                              r.id === rule.id ? { ...r, condition: e.target.value } : r
                            )
                          }))}
                          placeholder="例: 定員の過半数に満たない場合"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">結果</Label>
                        <Input
                          value={rule.result}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            cancellation_judgment_rules: prev.cancellation_judgment_rules.map(r =>
                              r.id === rule.id ? { ...r, result: e.target.value } : r
                            )
                          }))}
                          placeholder="例: 中止"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 中止時の連絡 */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                <div>
                  <CardTitle>中止時のご連絡</CardTitle>
                  <CardDescription>中止が決定した場合の連絡方法</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                id="cancellation_notice_note"
                value={formData.cancellation_notice_note}
                onChange={(e) => setFormData(prev => ({ ...prev, cancellation_notice_note: e.target.value }))}
                placeholder="中止時の連絡方法について"
                rows={3}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* その他の設定 */}
      {activeTab === 'other' && (
        <div className="space-y-6">
          {/* 予約変更 */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-purple-600" />
                <div>
                  <CardTitle>予約内容の変更</CardTitle>
                  <CardDescription>予約変更に関する規定</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="reservation_change_deadline_hours">変更可能期限</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="reservation_change_deadline_hours"
                    type="number"
                    value={formData.reservation_change_deadline_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, reservation_change_deadline_hours: parseInt(e.target.value) || 0 }))}
                    min="0"
                    max="720"
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">時間前まで変更可能</span>
                </div>
              </div>
              <div>
                <Label htmlFor="reservation_change_note">変更に関する説明</Label>
                <Textarea
                  id="reservation_change_note"
                  value={formData.reservation_change_note}
                  onChange={(e) => setFormData(prev => ({ ...prev, reservation_change_note: e.target.value }))}
                  placeholder="予約変更に関する説明"
                  rows={3}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* 返金方法 */}
          <Card>
            <CardHeader>
              <CardTitle>返金について</CardTitle>
              <CardDescription>返金方法の説明</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                id="refund_method_note"
                value={formData.refund_method_note}
                onChange={(e) => setFormData(prev => ({ ...prev, refund_method_note: e.target.value }))}
                placeholder="返金方法について"
                rows={3}
              />
            </CardContent>
          </Card>

          {/* 最終更新日 */}
          <Card>
            <CardHeader>
              <CardTitle>ポリシー情報</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="policy_updated_at">最終更新日</Label>
                <Input
                  id="policy_updated_at"
                  type="date"
                  value={formData.policy_updated_at}
                  onChange={(e) => setFormData(prev => ({ ...prev, policy_updated_at: e.target.value }))}
                  className="w-48 mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  キャンセルポリシーページに表示される更新日です
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
