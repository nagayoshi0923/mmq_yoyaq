import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, Plus, Trash2, Users, Lock } from 'lucide-react'
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
  // 通常公演用
  cancellation_policy: string
  cancellation_deadline_hours: number
  cancellation_fees: CancellationFee[]
  // 貸切公演用
  private_cancellation_policy: string
  private_cancellation_deadline_hours: number
  private_cancellation_fees: CancellationFee[]
  // 共通
  auto_refund_enabled: boolean
  refund_processing_days: number
}

interface CancellationSettingsProps {
  storeId: string
}

type SettingType = 'regular' | 'private'

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

export function CancellationSettings({ storeId }: CancellationSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingType>('regular')
  const [formData, setFormData] = useState<CancellationSettings>({
    id: '',
    store_id: storeId,
    // 通常公演
    cancellation_policy: '',
    cancellation_deadline_hours: 24,
    cancellation_fees: [
      { hours_before: 168, fee_percentage: 0, description: '1週間前まで無料' },
      { hours_before: 72, fee_percentage: 30, description: '3日前まで30%' },
      { hours_before: 24, fee_percentage: 50, description: '前日まで50%' },
      { hours_before: 0, fee_percentage: 100, description: '当日100%' }
    ],
    // 貸切公演
    private_cancellation_policy: '',
    private_cancellation_deadline_hours: 48,
    private_cancellation_fees: [
      { hours_before: 336, fee_percentage: 0, description: '2週間前まで無料' },
      { hours_before: 168, fee_percentage: 30, description: '1週間前まで30%' },
      { hours_before: 72, fee_percentage: 50, description: '3日前まで50%' },
      { hours_before: 0, fee_percentage: 100, description: '当日100%' }
    ],
    auto_refund_enabled: false,
    refund_processing_days: 7
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
            setFormData({
              id: '', // 全店舗モードなのでidは空
              store_id: '',
              cancellation_policy: data.cancellation_policy || '',
              cancellation_deadline_hours: data.cancellation_deadline_hours || 24,
              cancellation_fees: data.cancellation_fees || [
                { hours_before: 168, fee_percentage: 0, description: '1週間前まで無料' },
                { hours_before: 72, fee_percentage: 30, description: '3日前まで30%' },
                { hours_before: 24, fee_percentage: 50, description: '前日まで50%' },
                { hours_before: 0, fee_percentage: 100, description: '当日100%' }
              ],
              private_cancellation_policy: data.private_cancellation_policy || '',
              private_cancellation_deadline_hours: data.private_cancellation_deadline_hours || 48,
              private_cancellation_fees: data.private_cancellation_fees || [
                { hours_before: 336, fee_percentage: 0, description: '2週間前まで無料' },
                { hours_before: 168, fee_percentage: 30, description: '1週間前まで30%' },
                { hours_before: 72, fee_percentage: 50, description: '3日前まで50%' },
                { hours_before: 0, fee_percentage: 100, description: '当日100%' }
              ],
              auto_refund_enabled: data.auto_refund_enabled || false,
              refund_processing_days: data.refund_processing_days || 7
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
        setFormData({
          id: data.id,
          store_id: data.store_id,
          cancellation_policy: data.cancellation_policy || '',
          cancellation_deadline_hours: data.cancellation_deadline_hours || 24,
          cancellation_fees: data.cancellation_fees || [
            { hours_before: 168, fee_percentage: 0, description: '1週間前まで無料' },
            { hours_before: 72, fee_percentage: 30, description: '3日前まで30%' },
            { hours_before: 24, fee_percentage: 50, description: '前日まで50%' },
            { hours_before: 0, fee_percentage: 100, description: '当日100%' }
          ],
          private_cancellation_policy: data.private_cancellation_policy || '',
          private_cancellation_deadline_hours: data.private_cancellation_deadline_hours || 48,
          private_cancellation_fees: data.private_cancellation_fees || [
            { hours_before: 336, fee_percentage: 0, description: '2週間前まで無料' },
            { hours_before: 168, fee_percentage: 30, description: '1週間前まで30%' },
            { hours_before: 72, fee_percentage: 50, description: '3日前まで50%' },
            { hours_before: 0, fee_percentage: 100, description: '当日100%' }
          ],
          auto_refund_enabled: data.auto_refund_enabled || false,
          refund_processing_days: data.refund_processing_days || 7
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
        cancellation_deadline_hours: formData.cancellation_deadline_hours,
        cancellation_fees: sortedFees,
        private_cancellation_policy: formData.private_cancellation_policy,
        private_cancellation_deadline_hours: formData.private_cancellation_deadline_hours,
        private_cancellation_fees: sortedPrivateFees
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

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="キャンセル設定"
        description="通常公演・貸切公演それぞれのキャンセルポリシー"
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

      {/* タブ切り替え */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('regular')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'private'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Lock className="h-4 w-4" />
          貸切公演
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
              <div>
                <Label htmlFor="cancellation_policy">キャンセルポリシー文章</Label>
                <Textarea
                  id="cancellation_policy"
                  value={formData.cancellation_policy}
                  onChange={(e) => setFormData(prev => ({ ...prev, cancellation_policy: e.target.value }))}
                  placeholder="例: ご予約のキャンセルはお早めにご連絡ください。キャンセル料はキャンセル時期により異なります。"
                  rows={3}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  予約確認メールやサイトに表示されます
                </p>
              </div>

              <div>
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
              <div>
                <Label htmlFor="private_cancellation_policy">キャンセルポリシー文章</Label>
                <Textarea
                  id="private_cancellation_policy"
                  value={formData.private_cancellation_policy}
                  onChange={(e) => setFormData(prev => ({ ...prev, private_cancellation_policy: e.target.value }))}
                  placeholder="例: 貸切公演のキャンセルは、通常公演より早い期限が適用されます。キャンセル料は以下の通りです。"
                  rows={3}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  貸切予約確認メールに表示されます
                </p>
              </div>

              <div>
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

      {/* 共通ガイド */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">設定ガイド</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <ul className="text-xs text-gray-700 space-y-1">
              <li>• <strong>時間</strong>: 公演開始からの逆算で設定します（例: 168時間 = 7日）</li>
              <li>• <strong>料金率</strong>: 予約金額に対するパーセンテージです</li>
              <li>• <strong>0%</strong>: キャンセル料なし（全額返金）</li>
              <li>• <strong>100%</strong>: 全額キャンセル料（返金なし）</li>
              <li>• 設定は時間順に自動ソートされます</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
