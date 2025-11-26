import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Settings as SettingsIcon, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

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

export function SystemSettings() {
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

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('*')
        .order('name')

      if (storesError) throw storesError

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        setSelectedStoreId(storesData[0].id)
        await fetchSettings(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      alert('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
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
        const { data, error } = await supabase
          .from('system_settings')
          .insert({
            store_id: formData.store_id,
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

      alert('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="システム設定"
        description="システムの詳細設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 地域設定 */}
      <Card>
        <CardHeader>
          <CardTitle>地域設定</CardTitle>
          <CardDescription>タイムゾーンと言語を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
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
            <div>
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
        </CardContent>
      </Card>

      {/* 通貨・表示形式 */}
      <Card>
        <CardHeader>
          <CardTitle>通貨・表示形式</CardTitle>
          <CardDescription>金額や日付の表示形式を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
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
            <div>
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

          <div>
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
            <p className="text-xs text-muted-foreground mt-1">
              金額や統計の小数点以下の表示桁数
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

