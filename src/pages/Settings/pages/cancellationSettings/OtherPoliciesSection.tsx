import { SectionTitle } from '@/components/settings/SectionTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Users, Lock, Building2, Settings2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { CancellationSettings } from '../CancellationSettings'

interface OtherPoliciesSectionProps {
  formData: CancellationSettings
  setFormData: Dispatch<SetStateAction<CancellationSettings>>
  generateId: () => string
}

export function OtherPoliciesSection({ formData, setFormData, generateId }: OtherPoliciesSectionProps) {
  return (
    <section className="bg-white rounded-xl border p-6">
      <SectionTitle
        icon={Settings2}
        label="その他のポリシー"
        description="店舗都合によるキャンセル理由・中止判定ルール・予約変更・返金方法など、追加のキャンセルルールを設定します。"
      />
      <div className="space-y-8">
        {/* 店舗都合キャンセル */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-gray-800">店舗都合によるキャンセル</h4>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">キャンセルとなる理由</Label>
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
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                追加
              </Button>
            </div>
            <div className="space-y-2">
              {formData.organizer_cancel_reasons.map((reason) => (
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
            <p className="text-xs text-muted-foreground">キャンセルポリシーページの「店舗都合によるキャンセル」欄に表示されます</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">返金に関する説明</Label>
            <Textarea
              id="organizer_cancel_refund_note"
              value={formData.organizer_cancel_refund_note}
              onChange={(e) => setFormData(prev => ({ ...prev, organizer_cancel_refund_note: e.target.value }))}
              placeholder="店舗都合の場合の返金について"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">店舗都合キャンセル時の返金対応を参加者に伝えます</p>
          </div>
        </div>

        {/* 中止判定ルール */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-gray-800">中止判定のルール</h4>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">判定ルール一覧</Label>
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
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                追加
              </Button>
            </div>
            <div className="space-y-3">
              {formData.cancellation_judgment_rules.map((rule) => (
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
            <p className="text-xs text-muted-foreground">公演の中止判定タイミングと条件を設定します。キャンセルポリシーページに表示されます。</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">中止時のご連絡方法</Label>
            <Textarea
              id="cancellation_notice_note"
              value={formData.cancellation_notice_note}
              onChange={(e) => setFormData(prev => ({ ...prev, cancellation_notice_note: e.target.value }))}
              placeholder="中止時の連絡方法について"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">中止が決定した場合に参加者へどう連絡するかを記載します</p>
          </div>
        </div>

        {/* 予約変更 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-gray-800">予約変更</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 通常公演 */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">通常公演</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">変更可能期限</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="reservation_change_deadline_hours"
                    type="number"
                    value={formData.reservation_change_deadline_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, reservation_change_deadline_hours: parseInt(e.target.value) || 0 }))}
                    min="0"
                    max="720"
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">時間前</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  = {Math.floor(formData.reservation_change_deadline_hours / 24)}日{formData.reservation_change_deadline_hours % 24}時間前
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">説明</Label>
                <Textarea
                  id="reservation_change_note"
                  value={formData.reservation_change_note}
                  onChange={(e) => setFormData(prev => ({ ...prev, reservation_change_note: e.target.value }))}
                  placeholder="予約変更に関する説明"
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>

            {/* 貸切公演 */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">貸切公演</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">変更可能期限</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="private_reservation_change_deadline_hours"
                    type="number"
                    value={formData.private_reservation_change_deadline_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, private_reservation_change_deadline_hours: parseInt(e.target.value) || 0 }))}
                    min="0"
                    max="720"
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">時間前</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  = {Math.floor(formData.private_reservation_change_deadline_hours / 24)}日{formData.private_reservation_change_deadline_hours % 24}時間前
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">説明</Label>
                <Textarea
                  id="private_reservation_change_note"
                  value={formData.private_reservation_change_note}
                  onChange={(e) => setFormData(prev => ({ ...prev, private_reservation_change_note: e.target.value }))}
                  placeholder="貸切予約変更に関する説明"
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 返金方法 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-gray-800">返金・その他</h4>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">返金について</Label>
            <Textarea
              id="refund_method_note"
              value={formData.refund_method_note}
              onChange={(e) => setFormData(prev => ({ ...prev, refund_method_note: e.target.value }))}
              placeholder="返金方法について"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">キャンセル料が発生した場合の返金方法・手順をキャンセルポリシーページに表示します</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">ポリシー最終更新日</Label>
            <Input
              id="policy_updated_at"
              type="date"
              value={formData.policy_updated_at}
              onChange={(e) => setFormData(prev => ({ ...prev, policy_updated_at: e.target.value }))}
              className="w-48"
            />
            <p className="text-xs text-muted-foreground">キャンセルポリシーページに「最終更新日」として表示されます</p>
          </div>
        </div>
      </div>
    </section>
  )
}
