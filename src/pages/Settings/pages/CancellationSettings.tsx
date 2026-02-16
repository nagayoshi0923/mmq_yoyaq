import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface CancellationFee {
  hours_before: number
  fee_percentage: number
  description: string
}

interface CancellationSettings {
  id: string
  store_id: string
  cancellation_policy: string
  cancellation_deadline_hours: number
  cancellation_fees: CancellationFee[]
  auto_refund_enabled: boolean
  refund_processing_days: number
}

interface CancellationSettingsProps {
  storeId: string
}

export function CancellationSettings({ storeId }: CancellationSettingsProps) {
  const [formData, setFormData] = useState<CancellationSettings>({
    id: '',
    store_id: storeId,
    cancellation_policy: '',
    cancellation_deadline_hours: 24,
    cancellation_fees: [
      { hours_before: 168, fee_percentage: 0, description: '1週間前まで無料' },
      { hours_before: 72, fee_percentage: 30, description: '3日前まで30%' },
      { hours_before: 24, fee_percentage: 50, description: '前日まで50%' },
      { hours_before: 0, fee_percentage: 100, description: '当日100%' }
    ],
    auto_refund_enabled: false,
    refund_processing_days: 7
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storeId変更時のみ実行
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
      // 全店舗選択時は設定を取得しない
      if (!storeId) {
        setFormData({
          id: '',
          store_id: '',
          cancellation_policy: '',
          cancellation_deadline_hours: 24,
          cancellation_fees: [
            { hours_before: 168, fee_percentage: 0, description: '1週間前まで無料' },
            { hours_before: 72, fee_percentage: 30, description: '3日前まで30%' },
            { hours_before: 24, fee_percentage: 50, description: '前日まで50%' },
            { hours_before: 0, fee_percentage: 100, description: '当日100%' }
          ],
          auto_refund_enabled: false,
          refund_processing_days: 7
        })
        return
      }

      const { data, error } = await supabase
        .from('reservation_settings')
        .select('id, store_id, cancellation_policy, cancellation_deadline_hours, cancellation_fees')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData({
          ...data,
          auto_refund_enabled: false,
          refund_processing_days: 7
        })
      } else {
        setFormData({
          id: '',
          store_id: storeId,
          cancellation_policy: '',
          cancellation_deadline_hours: 24,
          cancellation_fees: [
            { hours_before: 168, fee_percentage: 0, description: '1週間前まで無料' },
            { hours_before: 72, fee_percentage: 30, description: '3日前まで30%' },
            { hours_before: 24, fee_percentage: 50, description: '前日まで50%' },
            { hours_before: 0, fee_percentage: 100, description: '当日100%' }
          ],
          auto_refund_enabled: false,
          refund_processing_days: 7
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    }
  }


  const handleSave = async () => {
    setSaving(true)
    try {
      // cancellation_feesを時間順（降順）にソート
      const sortedFees = [...formData.cancellation_fees].sort((a, b) => b.hours_before - a.hours_before)

      // 全店舗選択時は全店舗に一括適用
      if (!storeId) {
        // 全店舗を取得
        const allStores = await storeApi.getAll()
        
        if (allStores.length === 0) {
          showToast.warning('店舗が登録されていません')
          return
        }

        let successCount = 0
        let errorCount = 0

        for (const store of allStores) {
          try {
            // 既存設定があるか確認
            const { data: existing } = await supabase
              .from('reservation_settings')
              .select('id')
              .eq('store_id', store.id)
              .maybeSingle()

            if (existing) {
              // 更新
              const { error } = await supabase
                .from('reservation_settings')
                .update({
                  cancellation_policy: formData.cancellation_policy,
                  cancellation_deadline_hours: formData.cancellation_deadline_hours,
                  cancellation_fees: sortedFees
                })
                .eq('id', existing.id)

              if (error) throw error
            } else {
              // 新規作成
              const { error } = await supabase
                .from('reservation_settings')
                .insert({
                  store_id: store.id,
                  organization_id: store.organization_id,
                  cancellation_policy: formData.cancellation_policy,
                  cancellation_deadline_hours: formData.cancellation_deadline_hours,
                  cancellation_fees: sortedFees
                })

              if (error) throw error
            }
            successCount++
          } catch (err) {
            logger.error(`店舗 ${store.name} の設定保存エラー:`, err)
            errorCount++
          }
        }

        if (errorCount === 0) {
          showToast.success(`全${successCount}店舗に設定を適用しました`)
        } else {
          showToast.warning(`${successCount}店舗に適用、${errorCount}店舗でエラー`)
        }
        return
      }

      // 特定店舗選択時
      if (formData.id) {
        const { error } = await supabase
          .from('reservation_settings')
          .update({
            cancellation_policy: formData.cancellation_policy,
            cancellation_deadline_hours: formData.cancellation_deadline_hours,
            cancellation_fees: sortedFees
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        // storeからorganization_idを取得
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
            cancellation_policy: formData.cancellation_policy,
            cancellation_deadline_hours: formData.cancellation_deadline_hours,
            cancellation_fees: sortedFees
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

  // キャンセル料金をプレビュー表示
  const getPreviewText = () => {
    const sorted = [...formData.cancellation_fees].sort((a, b) => b.hours_before - a.hours_before)
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

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="キャンセル設定"
        description="キャンセルポリシーと手数料設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {!storeId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>全店舗選択中:</strong> 保存すると、全店舗にこの設定が一括適用されます。
          </p>
        </div>
      )}


      {/* キャンセルポリシー */}
      <Card>
        <CardHeader>
          <CardTitle>キャンセルポリシー</CardTitle>
          <CardDescription>キャンセルに関する規約を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="cancellation_policy">キャンセルポリシー文章</Label>
            <Textarea
              id="cancellation_policy"
              value={formData.cancellation_policy}
              onChange={(e) => setFormData(prev => ({ ...prev, cancellation_policy: e.target.value }))}
              placeholder="例: ご予約のキャンセルはお早めにご連絡ください。キャンセル料はキャンセル時期により異なります。"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              この文章は予約確認メールやサイトに表示されます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* キャンセル受付期限 */}
      <Card>
        <CardHeader>
          <CardTitle>キャンセル受付期限</CardTitle>
          <CardDescription>この時間以降はキャンセル不可</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="cancellation_deadline_hours">キャンセル受付期限（時間前）</Label>
            <Input
              id="cancellation_deadline_hours"
              type="number"
              value={formData.cancellation_deadline_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, cancellation_deadline_hours: parseInt(e.target.value) || 0 }))}
              min="0"
              max="720"
            />
            <p className="text-xs text-muted-foreground mt-1">
              公演開始の{formData.cancellation_deadline_hours}時間前までキャンセル受付
            </p>
          </div>
        </CardContent>
      </Card>

      {/* キャンセル料金設定 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>キャンセル料金</CardTitle>
              <CardDescription>キャンセルするタイミングに応じて料金を設定します</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCancellationFee}
              className="text-blue-600 border-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 mr-1" />
              追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {formData.cancellation_fees.map((fee, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-3">
                    <Label className="text-sm">何時間前</Label>
                    <div className="mt-1">
                      <Input
                        type="number"
                        value={fee.hours_before}
                        onChange={(e) => updateCancellationFee(index, 'hours_before', parseInt(e.target.value) || 0)}
                        min="0"
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {Math.floor(fee.hours_before / 24)}日{fee.hours_before % 24 > 0 ? `${fee.hours_before % 24}時間` : ''}前
                      </p>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-sm">キャンセル料率</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        value={fee.fee_percentage}
                        onChange={(e) => updateCancellationFee(index, 'fee_percentage', parseInt(e.target.value) || 0)}
                        min="0"
                        max="100"
                        className="text-sm"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="col-span-5">
                    <Label className="text-sm">説明</Label>
                    <div className="mt-1">
                      <Input
                        type="text"
                        value={fee.description}
                        onChange={(e) => updateCancellationFee(index, 'description', e.target.value)}
                        placeholder="例: 1週間前まで無料"
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end items-start pt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCancellationFee(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={formData.cancellation_fees.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* プレビュー */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm mb-2">プレビュー</h4>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap">
              {getPreviewText()}
            </pre>
          </div>
          
          {/* ガイド */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 mb-2">💡 設定のポイント</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• 時間は公演開始からの逆算で設定します</li>
              <li>• 料金率は予約金額に対するパーセンテージです</li>
              <li>• 例: 168時間前（1週間前）= 7日 × 24時間</li>
              <li>• 0%に設定するとキャンセル料は発生しません</li>
              <li>• 100%に設定すると全額キャンセル料が発生します</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
