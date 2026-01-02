import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save, Calculator, Users, GraduationCap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface SalarySettingsData {
  id: string
  organization_id: string
  gm_base_pay: number
  gm_hourly_rate: number
  gm_test_base_pay: number
  gm_test_hourly_rate: number
  reception_fixed_pay: number
}

/**
 * 給与設定ページ
 * GM給与の計算式を設定
 * @page SalarySettings
 * @path /settings (タブ: salary)
 * @purpose GM給与計算の基本給・時給を設定
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
    reception_fixed_pay: 2000
  })

  // 設定を取得
  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      
      // 現在の組織IDを取得
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        logger.error('組織IDが取得できませんでした')
        showToast.error('組織情報の取得に失敗しました')
        return
      }
      setOrganizationId(orgId)
      
      const { data, error } = await supabase
        .from('global_settings')
        .select('id, organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay')
        .eq('organization_id', orgId)
        .single()

      if (error) {
        logger.error('給与設定の取得に失敗:', error)
        showToast.error('設定の読み込みに失敗しました')
        return
      }

      if (data) {
        setSettings(data)
        setFormData({
          gm_base_pay: data.gm_base_pay ?? 2000,
          gm_hourly_rate: data.gm_hourly_rate ?? 1300,
          gm_test_base_pay: data.gm_test_base_pay ?? 0,
          gm_test_hourly_rate: data.gm_test_hourly_rate ?? 1300,
          reception_fixed_pay: data.reception_fixed_pay ?? 2000
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return

    try {
      setSaving(true)

      const { error } = await supabase
        .from('global_settings')
        .update({
          gm_base_pay: formData.gm_base_pay,
          gm_hourly_rate: formData.gm_hourly_rate,
          gm_test_base_pay: formData.gm_test_base_pay,
          gm_test_hourly_rate: formData.gm_test_hourly_rate,
          reception_fixed_pay: formData.reception_fixed_pay
        })
        .eq('id', settings.id)

      if (error) {
        logger.error('設定保存エラー:', error)
        showToast.error('設定の保存に失敗しました')
        return
      }

      showToast.success('設定を保存しました')

      // 設定を再取得
      await fetchSettings()
    } catch (error) {
      logger.error('設定保存エラー:', error)
      showToast.error('設定の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 計算例を表示
  const calculateExample = (hours: number, isGmTest: boolean) => {
    if (isGmTest) {
      return formData.gm_test_base_pay + formData.gm_test_hourly_rate * hours
    }
    return formData.gm_base_pay + formData.gm_hourly_rate * hours
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="給与設定"
        description="GM給与の計算式を設定します"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 通常公演のGM給与 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <CardTitle>通常公演のGM給与</CardTitle>
          </div>
          <CardDescription>
            計算式: 基本給 + 時給 × 公演時間
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* GMテストの給与 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-orange-600" />
            <CardTitle>GMテストの給与</CardTitle>
          </div>
          <CardDescription>
            計算式: 基本給 + 時給 × 公演時間（通常は基本給なし）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* 受付の固定給与 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-green-600" />
            <CardTitle>受付の固定給与</CardTitle>
          </div>
          <CardDescription>
            受付担当は公演時間に関係なく固定給与
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="reception_fixed_pay">固定給与</Label>
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

      {/* 計算式まとめ */}
      <Card>
        <CardHeader>
          <CardTitle>現在の計算式まとめ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
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

