import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Calculator, Users, GraduationCap, Clock, Plus, Trash2, Coins } from 'lucide-react'

// 30分刻みの時間オプション（0.5時間〜8時間）
const DURATION_OPTIONS = [
  { value: 0.5, label: '30分' },
  { value: 1, label: '1時間' },
  { value: 1.5, label: '1時間30分' },
  { value: 2, label: '2時間' },
  { value: 2.5, label: '2時間30分' },
  { value: 3, label: '3時間' },
  { value: 3.5, label: '3時間30分' },
  { value: 4, label: '4時間' },
  { value: 4.5, label: '4時間30分' },
  { value: 5, label: '5時間' },
  { value: 5.5, label: '5時間30分' },
  { value: 6, label: '6時間' },
  { value: 6.5, label: '6時間30分' },
  { value: 7, label: '7時間' },
  { value: 7.5, label: '7時間30分' },
  { value: 8, label: '8時間' },
]
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface HourlyRate {
  hours: number  // 0.5 = 30分、1 = 1時間、1.5 = 1時間30分...
  amount: number
}

// 時間を表示用にフォーマット（0.5 → "30分", 1 → "1時間", 1.5 → "1時間30分"）
const formatDuration = (hours: number): string => {
  const h = Math.floor(hours)
  const m = (hours - h) * 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

interface SalarySettingsData {
  id: string
  organization_id: string
  gm_base_pay: number
  gm_hourly_rate: number
  gm_test_base_pay: number
  gm_test_hourly_rate: number
  reception_fixed_pay: number
  use_hourly_table: boolean
  hourly_rates: HourlyRate[]
  gm_test_hourly_rates: HourlyRate[]
}

/**
 * 報酬設定ページ
 * GM報酬の計算式を設定
 * @page SalarySettings
 * @path /settings (タブ: salary)
 * @purpose GM報酬計算の設定（計算式 or 時間別テーブル）
 * @access 管理者
 * @organization 組織ごとに設定
 */
export function SalarySettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SalarySettingsData | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    gm_base_pay: 2000,
    gm_hourly_rate: 1300,
    gm_test_base_pay: 0,
    gm_test_hourly_rate: 1300,
    reception_fixed_pay: 2000,
    use_hourly_table: false,
    hourly_rates: [
      { hours: 1, amount: 3300 },
      { hours: 1.5, amount: 3950 },
      { hours: 2, amount: 4600 },
      { hours: 2.5, amount: 5250 },
      { hours: 3, amount: 5900 },
      { hours: 3.5, amount: 6550 },
      { hours: 4, amount: 7200 },
    ] as HourlyRate[],
    gm_test_hourly_rates: [
      { hours: 1, amount: 1300 },
      { hours: 1.5, amount: 1950 },
      { hours: 2, amount: 2600 },
      { hours: 2.5, amount: 3250 },
      { hours: 3, amount: 3900 },
      { hours: 3.5, amount: 4550 },
      { hours: 4, amount: 5200 },
    ] as HourlyRate[]
  })

  // 設定を取得
  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        logger.error('組織IDが取得できませんでした')
        showToast.error('組織情報の取得に失敗しました')
        return
      }
      setOrganizationId(orgId)
      
      // まず基本カラムを取得（新カラムが存在しない場合も対応）
      const { data, error } = await supabase
        .from('global_settings')
        .select('id, organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay, use_hourly_table, hourly_rates, gm_test_hourly_rates, updated_at')
        .eq('organization_id', orgId)
        .single()

      if (error) {
        logger.error('報酬設定の取得に失敗:', error)
        showToast.error('設定の読み込みに失敗しました')
        return
      }

      if (data) {
        setSettings(data as SalarySettingsData)
        setFormData({
          gm_base_pay: data.gm_base_pay ?? 2000,
          gm_hourly_rate: data.gm_hourly_rate ?? 1300,
          gm_test_base_pay: data.gm_test_base_pay ?? 0,
          gm_test_hourly_rate: data.gm_test_hourly_rate ?? 1300,
          reception_fixed_pay: data.reception_fixed_pay ?? 2000,
          use_hourly_table: data.use_hourly_table ?? false,
          hourly_rates: (data.hourly_rates as HourlyRate[] | null) ?? [
            { hours: 1, amount: 3300 },
            { hours: 1.5, amount: 3950 },
            { hours: 2, amount: 4600 },
            { hours: 2.5, amount: 5250 },
            { hours: 3, amount: 5900 },
            { hours: 3.5, amount: 6550 },
            { hours: 4, amount: 7200 },
          ],
          gm_test_hourly_rates: (data.gm_test_hourly_rates as HourlyRate[] | null) ?? [
            { hours: 1, amount: 1300 },
            { hours: 1.5, amount: 1950 },
            { hours: 2, amount: 2600 },
            { hours: 2.5, amount: 3250 },
            { hours: 3, amount: 3900 },
            { hours: 3.5, amount: 4550 },
            { hours: 4, amount: 5200 },
          ]
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings || !organizationId) return

    try {
      setSaving(true)

      // 1. global_settingsを更新（現在の設定）
      const { error } = await supabase
        .from('global_settings')
        .update({
          gm_base_pay: formData.gm_base_pay,
          gm_hourly_rate: formData.gm_hourly_rate,
          gm_test_base_pay: formData.gm_test_base_pay,
          gm_test_hourly_rate: formData.gm_test_hourly_rate,
          reception_fixed_pay: formData.reception_fixed_pay,
          use_hourly_table: formData.use_hourly_table,
          hourly_rates: formData.hourly_rates,
          gm_test_hourly_rates: formData.gm_test_hourly_rates
        })
        .eq('id', settings.id)

      if (error) {
        logger.error('設定保存エラー:', error)
        showToast.error('設定の保存に失敗しました')
        return
      }

      // 2. 履歴テーブルにも保存（有効開始日は今日）
      const today = new Date().toISOString().split('T')[0]
      const { error: historyError } = await supabase
        .from('salary_settings_history')
        .upsert({
          organization_id: organizationId,
          effective_from: today,
          use_hourly_table: formData.use_hourly_table,
          gm_base_pay: formData.gm_base_pay,
          gm_hourly_rate: formData.gm_hourly_rate,
          gm_test_base_pay: formData.gm_test_base_pay,
          gm_test_hourly_rate: formData.gm_test_hourly_rate,
          reception_fixed_pay: formData.reception_fixed_pay,
          hourly_rates: formData.hourly_rates,
          gm_test_hourly_rates: formData.gm_test_hourly_rates
        }, {
          onConflict: 'organization_id,effective_from'
        })

      if (historyError) {
        // 履歴テーブルがまだ存在しない場合はスキップ（警告のみ）
        logger.warn('報酬設定履歴の保存に失敗（テーブルが未作成の可能性）:', historyError)
      }

      showToast.success('設定を保存しました')
      await fetchSettings()
    } catch (error) {
      logger.error('設定保存エラー:', error)
      showToast.error('設定の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 時間別報酬を追加（30分刻み）
  const addHourlyRate = (isGmTest: boolean) => {
    const key = isGmTest ? 'gm_test_hourly_rates' : 'hourly_rates'
    const rates = formData[key]
    const maxHours = rates.length > 0 ? Math.max(...rates.map(r => r.hours)) : 0.5
    const lastAmount = rates.length > 0 ? rates[rates.length - 1].amount : 0
    const hourlyRate = isGmTest ? formData.gm_test_hourly_rate : formData.gm_hourly_rate
    const increment = hourlyRate * 0.5  // 30分分の報酬増加
    
    setFormData(prev => ({
      ...prev,
      [key]: [...prev[key], { hours: maxHours + 0.5, amount: lastAmount + increment }]
    }))
  }

  // 時間別報酬を削除
  const removeHourlyRate = (isGmTest: boolean, index: number) => {
    const key = isGmTest ? 'gm_test_hourly_rates' : 'hourly_rates'
    setFormData(prev => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index)
    }))
  }

  // 時間別報酬を更新
  const updateHourlyRate = (isGmTest: boolean, index: number, field: 'hours' | 'amount', value: number) => {
    const key = isGmTest ? 'gm_test_hourly_rates' : 'hourly_rates'
    setFormData(prev => ({
      ...prev,
      [key]: prev[key].map((rate, i) => 
        i === index ? { ...rate, [field]: value } : rate
      )
    }))
  }

  // 計算例を表示（計算式モード）
  const calculateExample = (hours: number, isGmTest: boolean) => {
    if (isGmTest) {
      return formData.gm_test_base_pay + formData.gm_test_hourly_rate * hours
    }
    return formData.gm_base_pay + formData.gm_hourly_rate * hours
  }

  // 時間別テーブルから報酬を取得
  const getHourlyTableAmount = (hours: number, isGmTest: boolean): number | null => {
    const rates = isGmTest ? formData.gm_test_hourly_rates : formData.hourly_rates
    const rate = rates.find(r => r.hours === hours)
    return rate?.amount ?? null
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="報酬"
        description="GM報酬の計算方法を設定します"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 報酬計算方式の選択 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle>報酬計算方式</CardTitle>
          </div>
          <CardDescription>
            公演時間に応じた報酬の計算方法を選択します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">時間別テーブル方式を使用</p>
              <p className="text-sm text-muted-foreground">
                {formData.use_hourly_table 
                  ? '公演時間ごとに個別の報酬額を設定' 
                  : '計算式（基本給 + 時給 × 時間）で報酬を計算'}
              </p>
            </div>
            <Switch
              checked={formData.use_hourly_table}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, use_hourly_table: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* 通常公演のGM報酬 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <CardTitle>通常公演のGM報酬</CardTitle>
          </div>
          <CardDescription>
            {formData.use_hourly_table 
              ? '公演時間ごとの報酬額を設定' 
              : '計算式: 基本給 + 時給 × 公演時間'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.use_hourly_table ? (
            // 時間別テーブル方式
            <div className="space-y-4">
              <div className="grid gap-3">
                {formData.hourly_rates
                  .sort((a, b) => a.hours - b.hours)
                  .map((rate, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={String(rate.hours)}
                        onValueChange={(value) => updateHourlyRate(false, index, 'hours', parseFloat(value))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={rate.amount}
                        onChange={(e) => updateHourlyRate(false, index, 'amount', parseInt(e.target.value) || 0)}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">円</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeHourlyRate(false, index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addHourlyRate(false)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                時間を追加
              </Button>
            </div>
          ) : (
            // 計算式方式
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gm_base_pay">基本給</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="gm_base_pay"
                  type="number"
                  min="0"
                  step="100"
                  value={formData.gm_base_pay}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    gm_base_pay: parseInt(e.target.value) || 0 
                  }))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">円</span>
              </div>
              <p className="text-xs text-muted-foreground">公演ごとの固定報酬</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gm_hourly_rate">時給</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="gm_hourly_rate"
                  type="number"
                  min="0"
                  step="100"
                  value={formData.gm_hourly_rate}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    gm_hourly_rate: parseInt(e.target.value) || 0 
                  }))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">円/時間</span>
              </div>
              <p className="text-xs text-muted-foreground">公演時間に応じた報酬</p>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">計算例（通常公演）</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-blue-700">
              <div>2時間: <span className="font-bold">{calculateExample(2, false).toLocaleString()}円</span></div>
              <div>3時間: <span className="font-bold">{calculateExample(3, false).toLocaleString()}円</span></div>
              <div>4時間: <span className="font-bold">{calculateExample(4, false).toLocaleString()}円</span></div>
              <div>5時間: <span className="font-bold">{calculateExample(5, false).toLocaleString()}円</span></div>
            </div>
          </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* GMテストの報酬 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-orange-600" />
            <CardTitle>GMテストの報酬</CardTitle>
          </div>
          <CardDescription>
            {formData.use_hourly_table 
              ? '公演時間ごとの報酬額を設定（通常は通常公演より低め）' 
              : '計算式: 基本給 + 時給 × 公演時間（通常は基本給なし）'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.use_hourly_table ? (
            // 時間別テーブル方式
            <div className="space-y-4">
              <div className="grid gap-3">
                {formData.gm_test_hourly_rates
                  .sort((a, b) => a.hours - b.hours)
                  .map((rate, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={String(rate.hours)}
                        onValueChange={(value) => updateHourlyRate(true, index, 'hours', parseFloat(value))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={rate.amount}
                        onChange={(e) => updateHourlyRate(true, index, 'amount', parseInt(e.target.value) || 0)}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">円</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeHourlyRate(true, index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addHourlyRate(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                時間を追加
              </Button>
            </div>
          ) : (
            // 計算式方式
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gm_test_base_pay">基本給</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="gm_test_base_pay"
                  type="number"
                  min="0"
                  step="100"
                  value={formData.gm_test_base_pay}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    gm_test_base_pay: parseInt(e.target.value) || 0 
                  }))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">円</span>
              </div>
              <p className="text-xs text-muted-foreground">GMテストは通常0円</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gm_test_hourly_rate">時給</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="gm_test_hourly_rate"
                  type="number"
                  min="0"
                  step="100"
                  value={formData.gm_test_hourly_rate}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    gm_test_hourly_rate: parseInt(e.target.value) || 0 
                  }))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">円/時間</span>
              </div>
              <p className="text-xs text-muted-foreground">公演時間に応じた報酬</p>
            </div>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg">
            <p className="text-sm font-medium text-orange-900 mb-2">計算例（GMテスト）</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-orange-700">
              <div>2時間: <span className="font-bold">{calculateExample(2, true).toLocaleString()}円</span></div>
              <div>3時間: <span className="font-bold">{calculateExample(3, true).toLocaleString()}円</span></div>
              <div>4時間: <span className="font-bold">{calculateExample(4, true).toLocaleString()}円</span></div>
              <div>5時間: <span className="font-bold">{calculateExample(5, true).toLocaleString()}円</span></div>
            </div>
          </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 受付の固定報酬 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-green-600" />
            <CardTitle>受付の固定報酬</CardTitle>
          </div>
          <CardDescription>
            受付担当は公演時間に関係なく固定報酬
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="reception_fixed_pay">固定報酬</Label>
            <div className="flex items-center gap-2">
              <Input
                id="reception_fixed_pay"
                type="number"
                min="0"
                step="100"
                value={formData.reception_fixed_pay}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  reception_fixed_pay: parseInt(e.target.value) || 0 
                }))}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">円/公演</span>
            </div>
            <p className="text-xs text-muted-foreground">受付担当者の公演あたりの固定報酬</p>
          </div>
        </CardContent>
      </Card>

      {/* 現在の設定まとめ */}
      <Card>
        <CardHeader>
          <CardTitle>現在の報酬設定まとめ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {formData.use_hourly_table ? (
              <>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="font-medium text-blue-900 mb-2">通常公演（時間別テーブル）</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-blue-700">
                    {formData.hourly_rates
                      .sort((a, b) => a.hours - b.hours)
                      .map((rate, i) => (
                      <div key={i}>{formatDuration(rate.hours)}: <span className="font-bold">{rate.amount.toLocaleString()}円</span></div>
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <p className="font-medium text-orange-900 mb-2">GMテスト（時間別テーブル）</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-orange-700">
                    {formData.gm_test_hourly_rates
                      .sort((a, b) => a.hours - b.hours)
                      .map((rate, i) => (
                      <div key={i}>{formatDuration(rate.hours)}: <span className="font-bold">{rate.amount.toLocaleString()}円</span></div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <span className="font-medium text-blue-900 w-24">通常公演:</span>
              <span className="text-blue-700">
                {formData.gm_base_pay.toLocaleString()}円 + {formData.gm_hourly_rate.toLocaleString()}円 × 公演時間
              </span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
              <span className="font-medium text-orange-900 w-24">GMテスト:</span>
              <span className="text-orange-700">
                {formData.gm_test_base_pay.toLocaleString()}円 + {formData.gm_test_hourly_rate.toLocaleString()}円 × 公演時間
              </span>
            </div>
              </>
            )}
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <span className="font-medium text-green-900 w-24">受付:</span>
              <span className="text-green-700">
                固定 {formData.reception_fixed_pay.toLocaleString()}円
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
