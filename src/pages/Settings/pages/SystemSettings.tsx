import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Save, Shield, Globe, DollarSign } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface SystemSettings {
  id: string
  store_id: string
  timezone: string
  language: string
  currency: string
  date_format: string
  decimal_places: number
}

const timezones = [
  { value: 'Asia/Tokyo', label: '日本（東京）' },
  { value: 'Asia/Seoul', label: '韓国（ソウル）' },
  { value: 'Asia/Shanghai', label: '中国（上海）' },
  { value: 'America/New_York', label: 'アメリカ（ニューヨーク）' },
  { value: 'Europe/London', label: 'イギリス（ロンドン）' }
]

const languages = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' }
]

const currencies = [
  { value: 'JPY', label: '日本円（¥）' },
  { value: 'USD', label: '米ドル（$）' },
  { value: 'EUR', label: 'ユーロ（€）' },
  { value: 'KRW', label: '韓国ウォン（₩）' },
  { value: 'CNY', label: '中国元（¥）' }
]

const dateFormats = [
  { value: 'YYYY/MM/DD', label: '2025/10/21' },
  { value: 'YYYY-MM-DD', label: '2025-10-21' },
  { value: 'DD/MM/YYYY', label: '21/10/2025' },
  { value: 'MM/DD/YYYY', label: '10/21/2025' }
]

interface SystemSettingsProps {
  storeId?: string
}

export function SystemSettings({ storeId }: SystemSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<SystemSettings>({
    id: '',
    store_id: '',
    timezone: 'Asia/Tokyo',
    language: 'ja',
    currency: 'JPY',
    date_format: 'YYYY/MM/DD',
    decimal_places: 0
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 組織全体設定（global_settings）
  const [globalSettingsId, setGlobalSettingsId] = useState<string | null>(null)
  const [globalFormData, setGlobalFormData] = useState({
    system_name: 'MMQ 予約管理システム',
    maintenance_mode: false,
    maintenance_message: '',
  })

  useEffect(() => {
    fetchData()
    fetchGlobalSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 組織対応済みの店舗取得
      const storesData = await storeApi.getAll()

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        setSelectedStoreId(storesData[0].id)
        await fetchSettings(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('id, store_id, timezone, language, currency, date_format, decimal_places')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData(data)
      } else {
        setFormData({
          id: '',
          store_id: storeId,
          timezone: 'Asia/Tokyo',
          language: 'ja',
          currency: 'JPY',
          date_format: 'YYYY/MM/DD',
          decimal_places: 0
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    }
  }

  const fetchGlobalSettings = async () => {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return
      const { data, error } = await supabase
        .from('global_settings')
        .select('id, system_name, maintenance_mode, maintenance_message')
        .eq('organization_id', orgId)
        .single()
      if (error) { logger.error('システム名設定の取得に失敗:', error); return }
      if (data) {
        setGlobalSettingsId(data.id)
        setGlobalFormData({
          system_name: data.system_name ?? 'MMQ 予約管理システム',
          maintenance_mode: data.maintenance_mode ?? false,
          maintenance_message: data.maintenance_message ?? '',
        })
      }
    } catch (error) {
      logger.error('グローバル設定取得エラー:', error)
    }
  }

  const handleStoreChange = async (storeId: string) => {
    setSelectedStoreId(storeId)
    await fetchSettings(storeId)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('system_settings')
          .update({
            timezone: formData.timezone,
            language: formData.language,
            currency: formData.currency,
            date_format: formData.date_format,
            decimal_places: formData.decimal_places
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('system_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            timezone: formData.timezone,
            language: formData.language,
            currency: formData.currency,
            date_format: formData.date_format,
            decimal_places: formData.decimal_places
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
      }

      // グローバル設定（system_name・maintenance_mode）も保存
      if (globalSettingsId) {
        const { error: globalError } = await supabase
          .from('global_settings')
          .update({
            system_name: globalFormData.system_name,
            maintenance_mode: globalFormData.maintenance_mode,
            maintenance_message: globalFormData.maintenance_message || null,
          })
          .eq('id', globalSettingsId)
        if (globalError) logger.error('グローバル設定の保存エラー:', globalError)
      }

      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="システム設定"
        description="システム全体の動作に関わる基本設定"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 基本設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Shield}
          label="基本設定"
          description="システム名とメンテナンスモードを設定します（組織全体に適用）"
        />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>システム名</Label>
            <Input
              value={globalFormData.system_name}
              onChange={(e) => setGlobalFormData(prev => ({ ...prev, system_name: e.target.value }))}
              placeholder="MMQ 予約管理システム"
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label>メンテナンスモード</Label>
              <p className="text-xs text-muted-foreground mt-1">有効にすると、管理者以外はシステムにアクセスできなくなります</p>
            </div>
            <Switch
              checked={globalFormData.maintenance_mode}
              onCheckedChange={(checked) => setGlobalFormData(prev => ({ ...prev, maintenance_mode: checked }))}
            />
          </div>
          {globalFormData.maintenance_mode && (
            <div className="space-y-2">
              <Label>メンテナンスメッセージ</Label>
              <Input
                value={globalFormData.maintenance_message}
                onChange={(e) => setGlobalFormData(prev => ({ ...prev, maintenance_message: e.target.value }))}
                placeholder="現在メンテナンス中です。しばらくお待ちください。"
              />
            </div>
          )}
        </div>
      </section>

      {/* 地域設定 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Globe}
          label="地域設定"
          description="タイムゾーンと表示言語を設定します（将来実装予定）"
        />
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            現在、タイムゾーン・言語の設定変更はシステムに反映されません。将来のバージョンで対応予定です。
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>タイムゾーン</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>表示言語</Label>
              <Select
                value={formData.language}
                onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(lang => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      {/* 通貨・表示形式 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={DollarSign}
          label="通貨・表示形式"
          description="金額や日付の表示形式を設定します（将来実装予定）"
        />
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            現在、通貨・日付形式・小数点桁数の設定変更はシステムに反映されません。将来のバージョンで対応予定です。
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>通貨単位</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map(curr => (
                    <SelectItem key={curr.value} value={curr.value}>
                      {curr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>日付フォーマット</Label>
              <Select
                value={formData.date_format}
                onValueChange={(value) => setFormData(prev => ({ ...prev, date_format: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateFormats.map(format => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>小数点以下桁数</Label>
            <Select
              value={formData.decimal_places.toString()}
              onValueChange={(value) => setFormData(prev => ({ ...prev, decimal_places: parseInt(value) }))}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0桁（整数のみ）</SelectItem>
                <SelectItem value="1">1桁</SelectItem>
                <SelectItem value="2">2桁</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              金額や統計の小数点以下の表示桁数
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
