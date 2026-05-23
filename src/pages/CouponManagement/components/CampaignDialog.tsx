import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import type { CouponCampaign } from '@/types'
import type { CampaignFormData } from '@/lib/api/couponApi'

interface CampaignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign?: CouponCampaign | null
  onSubmit: (data: CampaignFormData) => Promise<void>
}

export function CampaignDialog({
  open,
  onOpenChange,
  campaign,
  onSubmit
}: CampaignDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [usageMode, setUsageMode] = useState<'relative' | 'absolute'>('relative')
  const [formData, setFormData] = useState<CampaignFormData>({
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
    is_active: true
  })

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
        is_active: campaign.is_active
      })
    } else {
      setUsageMode('relative')
      setFormData({
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
        is_active: true
      })
    }
  }, [campaign, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      // 排他: 選択されてない側はクリア
      const submitData: CampaignFormData = {
        ...formData,
        valid_from: formData.valid_from ? `${formData.valid_from}T00:00:00+09:00` : null,
        valid_until: formData.valid_until ? `${formData.valid_until}T23:59:59+09:00` : null,
        coupon_expiry_days: usageMode === 'relative' ? formData.coupon_expiry_days : null,
        usage_valid_from: usageMode === 'absolute' && formData.usage_valid_from
          ? `${formData.usage_valid_from}T00:00:00+09:00` : null,
        usage_valid_until: usageMode === 'absolute' && formData.usage_valid_until
          ? `${formData.usage_valid_until}T23:59:59+09:00` : null,
      }
      await onSubmit(submitData)
      onOpenChange(false)
    } catch (error) {
      console.error('キャンペーン保存エラー:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isEdit = !!campaign

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'キャンペーン編集' : '新規キャンペーン作成'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'キャンペーン情報を編集します' : '新しいクーポンキャンペーンを作成します'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">キャンペーン名 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例: 新規登録キャンペーン"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="キャンペーンの説明（顧客に表示されます）"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="discount_type">割引タイプ</Label>
              <Select
                value={formData.discount_type}
                onValueChange={(value: 'fixed' | 'percentage') => 
                  setFormData(prev => ({ ...prev, discount_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">固定額</SelectItem>
                  <SelectItem value="percentage">割引率</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount_amount">
                割引{formData.discount_type === 'fixed' ? '額（円）' : '率（%）'} *
              </Label>
              <Input
                id="discount_amount"
                type="number"
                min={1}
                max={formData.discount_type === 'percentage' ? 100 : undefined}
                value={formData.discount_amount}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  discount_amount: parseInt(e.target.value) || 0 
                }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_uses">使用回数上限 *</Label>
            <Input
              id="max_uses"
              type="number"
              min={1}
              value={formData.max_uses_per_customer}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                max_uses_per_customer: parseInt(e.target.value) || 1
              }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger_type">付与方法</Label>
            <Select
              value={formData.trigger_type}
              onValueChange={(value: 'registration' | 'manual') => 
                setFormData(prev => ({ ...prev, trigger_type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手動付与</SelectItem>
                <SelectItem value="registration">新規登録時自動付与</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_type">対象範囲</Label>
            <Select
              value={formData.target_type}
              onValueChange={(value: 'all' | 'specific_scenarios' | 'specific_organization') => 
                setFormData(prev => ({ ...prev, target_type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全予約対象</SelectItem>
                <SelectItem value="specific_organization">特定組織のみ</SelectItem>
                <SelectItem value="specific_scenarios">特定シナリオのみ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 配布期間 */}
          <div className="rounded-lg border bg-slate-50/70 p-3 space-y-3">
            <div>
              <p className="text-sm font-semibold">配布期間</p>
              <p className="text-xs text-muted-foreground">この期間中に対象の顧客へクーポンを配布できます</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valid_from">配布開始日</Label>
                <Input
                  id="valid_from"
                  type="date"
                  value={formData.valid_from || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    valid_from: e.target.value || null
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valid_until">配布終了日</Label>
                <Input
                  id="valid_until"
                  type="date"
                  value={formData.valid_until || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    valid_until: e.target.value || null
                  }))}
                />
              </div>
            </div>
          </div>

          {/* 使用期間 */}
          <div className="rounded-lg border bg-slate-50/70 p-3 space-y-3">
            <div>
              <p className="text-sm font-semibold">使用期間</p>
              <p className="text-xs text-muted-foreground">配布後、顧客がクーポンを使える期間を指定します</p>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="usage_mode"
                  value="relative"
                  checked={usageMode === 'relative'}
                  onChange={() => setUsageMode('relative')}
                />
                配布から N 日間
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="usage_mode"
                  value="absolute"
                  checked={usageMode === 'absolute'}
                  onChange={() => setUsageMode('absolute')}
                />
                絶対日付で指定
              </label>
            </div>

            {usageMode === 'relative' && (
              <div className="space-y-2">
                <Label htmlFor="expiry_days">有効日数（付与から）</Label>
                <Input
                  id="expiry_days"
                  type="number"
                  min={1}
                  value={formData.coupon_expiry_days || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    coupon_expiry_days: e.target.value ? parseInt(e.target.value) : null
                  }))}
                  placeholder="無制限"
                />
                <p className="text-[11px] text-muted-foreground">
                  例: 30 を設定すると、配布日から30日後までクーポン使用可能
                </p>
              </div>
            )}

            {usageMode === 'absolute' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="usage_valid_from">使用開始日</Label>
                  <Input
                    id="usage_valid_from"
                    type="date"
                    value={formData.usage_valid_from || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      usage_valid_from: e.target.value || null
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="usage_valid_until">使用終了日</Label>
                  <Input
                    id="usage_valid_until"
                    type="date"
                    value={formData.usage_valid_until || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      usage_valid_until: e.target.value || null
                    }))}
                  />
                </div>
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  ※ 配布日に関わらず、この期間中のみクーポンが使えます
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="is_active">有効</Label>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ 
                ...prev, 
                is_active: checked 
              }))}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? '更新' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
