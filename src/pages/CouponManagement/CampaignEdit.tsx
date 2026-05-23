/**
 * クーポンキャンペーン詳細設定ページ
 * @purpose 多項目のクーポン設定を1ページにまとめる（モーダルだと収まらないため）
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import type { CouponCampaign } from '@/types'
import type { CampaignFormData } from '@/lib/api/couponApi'

interface CampaignEditProps {
  campaign: CouponCampaign | null  // null = 新規作成
  onSave: (data: CampaignFormData) => Promise<void>
  onCancel: () => void
}

const WEEKDAYS = [
  { value: 0, label: '日' },
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
]

const TIME_SLOTS = ['朝公演', '昼公演', '夜公演']

const defaultFormData: CampaignFormData = {
  name: '',
  description: '',
  discount_type: 'fixed',
  discount_amount: 500,
  max_uses_per_customer: 1,
  target_type: 'all',
  target_ids: null,
  trigger_type: 'manual',
  valid_from: null,
  valid_until: null,
  coupon_expiry_days: null,
  usage_valid_from: null,
  usage_valid_until: null,
  max_total_grants: null,
  max_grants_per_customer: null,
  coupon_code: null,
  notify_on_grant: false,
  min_order_amount: null,
  combinable: true,
  allowed_weekdays: null,
  allowed_time_slots: null,
  display_name: null,
  display_image_url: null,
  customer_terms: null,
  internal_memo: null,
  is_active: true,
}

export function CampaignEdit({ campaign, onSave, onCancel }: CampaignEditProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [usageMode, setUsageMode] = useState<'relative' | 'absolute'>('relative')
  const [formData, setFormData] = useState<CampaignFormData>(defaultFormData)

  useEffect(() => {
    if (campaign) {
      const hasAbsolute = !!(campaign.usage_valid_from || campaign.usage_valid_until)
      setUsageMode(hasAbsolute ? 'absolute' : 'relative')
      setFormData({
        name: campaign.name,
        description: campaign.description || '',
        discount_type: campaign.discount_type,
        discount_amount: campaign.discount_amount,
        max_uses_per_customer: campaign.max_uses_per_customer,
        target_type: campaign.target_type,
        target_ids: campaign.target_ids || null,
        trigger_type: campaign.trigger_type,
        valid_from: campaign.valid_from ? campaign.valid_from.slice(0, 10) : null,
        valid_until: campaign.valid_until ? campaign.valid_until.slice(0, 10) : null,
        coupon_expiry_days: campaign.coupon_expiry_days || null,
        usage_valid_from: campaign.usage_valid_from ? campaign.usage_valid_from.slice(0, 10) : null,
        usage_valid_until: campaign.usage_valid_until ? campaign.usage_valid_until.slice(0, 10) : null,
        max_total_grants: campaign.max_total_grants || null,
        max_grants_per_customer: campaign.max_grants_per_customer || null,
        coupon_code: campaign.coupon_code || null,
        notify_on_grant: campaign.notify_on_grant ?? false,
        min_order_amount: campaign.min_order_amount || null,
        combinable: campaign.combinable ?? true,
        allowed_weekdays: campaign.allowed_weekdays || null,
        allowed_time_slots: campaign.allowed_time_slots || null,
        display_name: campaign.display_name || null,
        display_image_url: campaign.display_image_url || null,
        customer_terms: campaign.customer_terms || null,
        internal_memo: campaign.internal_memo || null,
        is_active: campaign.is_active,
      })
    } else {
      setUsageMode('relative')
      setFormData(defaultFormData)
    }
  }, [campaign])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const submitData: CampaignFormData = {
        ...formData,
        valid_from: formData.valid_from ? `${formData.valid_from}T00:00:00+09:00` : null,
        valid_until: formData.valid_until ? `${formData.valid_until}T23:59:59+09:00` : null,
        // 排他: 使用期間のモードに応じて片方をクリア
        coupon_expiry_days: usageMode === 'relative' ? formData.coupon_expiry_days : null,
        usage_valid_from: usageMode === 'absolute' && formData.usage_valid_from
          ? `${formData.usage_valid_from}T00:00:00+09:00` : null,
        usage_valid_until: usageMode === 'absolute' && formData.usage_valid_until
          ? `${formData.usage_valid_until}T23:59:59+09:00` : null,
      }
      await onSave(submitData)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleWeekday = (value: number) => {
    setFormData(prev => {
      const cur = prev.allowed_weekdays || []
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value].sort()
      return { ...prev, allowed_weekdays: next.length > 0 ? next : null }
    })
  }

  const toggleTimeSlot = (slot: string) => {
    setFormData(prev => {
      const cur = prev.allowed_time_slots || []
      const next = cur.includes(slot) ? cur.filter(v => v !== slot) : [...cur, slot]
      return { ...prev, allowed_time_slots: next.length > 0 ? next : null }
    })
  }

  const isEdit = !!campaign

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl mx-auto pb-12">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2 sticky top-0 z-10 bg-background py-3 -mx-3 px-3 border-b">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">
            {isEdit ? `編集: ${campaign?.name}` : '新規キャンペーン'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            キャンセル
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {isEdit ? '保存' : '作成'}
          </Button>
        </div>
      </div>

      {/* ① 基本 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">① 基本</CardTitle>
          <CardDescription>キャンペーンの名前と公開状態</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">キャンペーン名 *</Label>
            <Input id="name" required value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 新規登録キャンペーン" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">説明（顧客に表示されます）</Label>
            <Textarea id="description" rows={2} value={formData.description || ''}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="internal_memo">内部メモ（管理者のみ閲覧）</Label>
            <Textarea id="internal_memo" rows={2} value={formData.internal_memo || ''}
              onChange={(e) => setFormData(p => ({ ...p, internal_memo: e.target.value || null }))} />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="is_active">有効</Label>
            <Switch id="is_active" checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(p => ({ ...p, is_active: checked }))} />
          </div>
        </CardContent>
      </Card>

      {/* ② 割引 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">② 割引</CardTitle>
          <CardDescription>割引額・適用条件</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>割引タイプ</Label>
              <Select value={formData.discount_type}
                onValueChange={(v: 'fixed' | 'percentage') => setFormData(p => ({ ...p, discount_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">固定額</SelectItem>
                  <SelectItem value="percentage">割引率</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discount_amount">
                割引{formData.discount_type === 'fixed' ? '額（円）' : '率（%）'} *
              </Label>
              <Input id="discount_amount" type="number" min={1} required
                max={formData.discount_type === 'percentage' ? 100 : undefined}
                value={formData.discount_amount}
                onChange={(e) => setFormData(p => ({ ...p, discount_amount: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="min_order_amount">最低利用金額（円・任意）</Label>
            <Input id="min_order_amount" type="number" min={0}
              value={formData.min_order_amount ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, min_order_amount: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="制限なし" />
            <p className="text-[11px] text-muted-foreground">
              例: 3000 を設定すると、3000円以上の予約のみで使えるクーポンに
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ③ 配布 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">③ 配布</CardTitle>
          <CardDescription>誰に・いつ・どうやって配布するか</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valid_from">配布開始日</Label>
              <Input id="valid_from" type="date" value={formData.valid_from || ''}
                onChange={(e) => setFormData(p => ({ ...p, valid_from: e.target.value || null }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valid_until">配布終了日</Label>
              <Input id="valid_until" type="date" value={formData.valid_until || ''}
                onChange={(e) => setFormData(p => ({ ...p, valid_until: e.target.value || null }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>付与方法</Label>
            <Select value={formData.trigger_type}
              onValueChange={(v: 'manual' | 'registration') => setFormData(p => ({ ...p, trigger_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手動付与</SelectItem>
                <SelectItem value="registration">新規登録時自動付与</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="max_total_grants">配布数上限（全体）</Label>
              <Input id="max_total_grants" type="number" min={1}
                value={formData.max_total_grants ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, max_total_grants: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="無制限" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_grants_per_customer">1人あたり配布数上限</Label>
              <Input id="max_grants_per_customer" type="number" min={1}
                value={formData.max_grants_per_customer ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, max_grants_per_customer: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="無制限" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon_code">クーポンコード（任意）</Label>
            <Input id="coupon_code" value={formData.coupon_code ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, coupon_code: e.target.value || null }))}
              placeholder="例: WELCOME2026" />
            <p className="text-[11px] text-muted-foreground">
              設定すると、顧客がコード入力で取得できるようになります（管理者付与もあわせて可能）
            </p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <Label htmlFor="notify_on_grant">付与時にメール通知</Label>
              <p className="text-[11px] text-muted-foreground">配布した直後に顧客へ案内メールを送信</p>
            </div>
            <Switch id="notify_on_grant" checked={formData.notify_on_grant ?? false}
              onCheckedChange={(checked) => setFormData(p => ({ ...p, notify_on_grant: checked }))} />
          </div>
        </CardContent>
      </Card>

      {/* ④ 使用 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">④ 使用</CardTitle>
          <CardDescription>配布後、顧客が使える期間や条件</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 使用期間 */}
          <div>
            <Label className="mb-1.5 block">使用期間</Label>
            <div className="flex items-center gap-4 text-sm mb-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="usage_mode" checked={usageMode === 'relative'}
                  onChange={() => setUsageMode('relative')} />
                配布から N 日間
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="usage_mode" checked={usageMode === 'absolute'}
                  onChange={() => setUsageMode('absolute')} />
                絶対日付で指定
              </label>
            </div>
            {usageMode === 'relative' && (
              <Input type="number" min={1}
                value={formData.coupon_expiry_days ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, coupon_expiry_days: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="無制限（日数）" />
            )}
            {usageMode === 'absolute' && (
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={formData.usage_valid_from || ''}
                  onChange={(e) => setFormData(p => ({ ...p, usage_valid_from: e.target.value || null }))} />
                <Input type="date" value={formData.usage_valid_until || ''}
                  onChange={(e) => setFormData(p => ({ ...p, usage_valid_until: e.target.value || null }))} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max_uses">1人あたり使用回数上限 *</Label>
            <Input id="max_uses" type="number" min={1} required
              value={formData.max_uses_per_customer}
              onChange={(e) => setFormData(p => ({ ...p, max_uses_per_customer: parseInt(e.target.value) || 1 }))} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <Label htmlFor="combinable">他のクーポンと併用可</Label>
              <p className="text-[11px] text-muted-foreground">OFF にすると、このクーポン使用時は他のクーポン適用不可</p>
            </div>
            <Switch id="combinable" checked={formData.combinable ?? true}
              onCheckedChange={(checked) => setFormData(p => ({ ...p, combinable: checked }))} />
          </div>

          {/* 曜日 */}
          <div>
            <Label className="mb-1.5 block">使用可能曜日（未選択=全曜日）</Label>
            <div className="flex gap-2 flex-wrap">
              {WEEKDAYS.map(w => {
                const sel = (formData.allowed_weekdays || []).includes(w.value)
                return (
                  <button key={w.value} type="button"
                    onClick={() => toggleWeekday(w.value)}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${sel ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}>
                    {w.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 時間帯 */}
          <div>
            <Label className="mb-1.5 block">使用可能時間帯（未選択=全時間帯）</Label>
            <div className="flex gap-2 flex-wrap">
              {TIME_SLOTS.map(slot => {
                const sel = (formData.allowed_time_slots || []).includes(slot)
                return (
                  <button key={slot} type="button"
                    onClick={() => toggleTimeSlot(slot)}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${sel ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}>
                    {slot}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ⑤ 対象 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">⑤ 対象</CardTitle>
          <CardDescription>どの予約に対して使えるか</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>対象範囲</Label>
            <Select value={formData.target_type}
              onValueChange={(v: 'all' | 'specific_scenarios' | 'specific_organization') =>
                setFormData(p => ({ ...p, target_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全予約対象</SelectItem>
                <SelectItem value="specific_organization">特定組織のみ</SelectItem>
                <SelectItem value="specific_scenarios">特定シナリオのみ</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              特定対象を指定する場合、対象 ID 一覧は今後の UI 拡張で編集できる予定
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ⑥ 表示 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">⑥ 顧客向け表示</CardTitle>
          <CardDescription>顧客が見える名称・画像・利用条件文</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="display_name">顧客向け表示名（任意）</Label>
            <Input id="display_name" value={formData.display_name ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, display_name: e.target.value || null }))}
              placeholder="未設定なら「キャンペーン名」が使われます" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display_image_url">クーポン画像URL（任意）</Label>
            <Input id="display_image_url" type="url" value={formData.display_image_url ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, display_image_url: e.target.value || null }))}
              placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer_terms">利用条件文（顧客向け、任意）</Label>
            <Textarea id="customer_terms" rows={3} value={formData.customer_terms ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, customer_terms: e.target.value || null }))}
              placeholder="例: 他のクーポンとは併用できません。" />
          </div>
        </CardContent>
      </Card>

    </form>
  )
}
