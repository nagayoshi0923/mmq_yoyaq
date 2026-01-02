import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface DataManagementSettings {
  id: string
  store_id: string
  backup_frequency: 'daily' | 'weekly' | 'monthly'
  data_retention_years: number
  auto_archive_enabled: boolean
  export_format: 'excel' | 'csv' | 'json'
}

const backupFrequencies = [
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'monthly', label: '毎月' }
]

const exportFormats = [
  { value: 'excel', label: 'Excel（.xlsx）' },
  { value: 'csv', label: 'CSV（.csv）' },
  { value: 'json', label: 'JSON（.json）' }
]

interface DataManagementSettingsProps {
  storeId?: string
}

export function DataManagementSettings({ storeId }: DataManagementSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<DataManagementSettings>({
    id: '',
    store_id: '',
    backup_frequency: 'daily',
    data_retention_years: 5,
    auto_archive_enabled: true,
    export_format: 'excel'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
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
        .from('data_management_settings')
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
          backup_frequency: 'daily',
          data_retention_years: 5,
          auto_archive_enabled: true,
          export_format: 'excel'
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
          .from('data_management_settings')
          .update({
            backup_frequency: formData.backup_frequency,
            data_retention_years: formData.data_retention_years,
            auto_archive_enabled: formData.auto_archive_enabled,
            export_format: formData.export_format
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('data_management_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            backup_frequency: formData.backup_frequency,
            data_retention_years: formData.data_retention_years,
            auto_archive_enabled: formData.auto_archive_enabled,
            export_format: formData.export_format
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
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
    <div className="space-y-6">
      <PageHeader
        title="データ管理設定"
        description="バックアップとデータ保持設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* バックアップ設定 */}
      <Card>
        <CardHeader>
          <CardTitle>バックアップ設定</CardTitle>
          <CardDescription>データベースのバックアップ頻度を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">バックアップ頻度</Label>
            <Select 
              value={formData.backup_frequency} 
              onValueChange={(value: 'daily' | 'weekly' | 'monthly') => 
                setFormData(prev => ({ ...prev, backup_frequency: value }))
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {backupFrequencies.map(freq => (
                  <SelectItem key={freq.value} value={freq.value}>
                    {freq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-36">
            自動的にデータベースをバックアップします
          </p>
        </CardContent>
      </Card>

      {/* データ保持期間 */}
      <Card>
        <CardHeader>
          <CardTitle>データ保持期間</CardTitle>
          <CardDescription>過去データの保持期間を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">保持期間</Label>
            <Select 
              value={formData.data_retention_years.toString()} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, data_retention_years: parseInt(value) }))}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1年</SelectItem>
                <SelectItem value="3">3年</SelectItem>
                <SelectItem value="5">5年</SelectItem>
                <SelectItem value="7">7年</SelectItem>
                <SelectItem value="10">10年</SelectItem>
                <SelectItem value="999">無期限</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-36">
            {formData.data_retention_years === 999 
              ? 'すべてのデータを保持します' 
              : `${formData.data_retention_years}年以上前のデータは自動的に削除されます`}
          </p>
        </CardContent>
      </Card>

      {/* 自動アーカイブ */}
      <Card>
        <CardHeader>
          <CardTitle>自動アーカイブ</CardTitle>
          <CardDescription>古いデータを自動的にアーカイブします</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>自動アーカイブを有効にする</Label>
              <p className="text-xs text-muted-foreground mt-1">
                保持期間を過ぎたデータを自動的にアーカイブ（圧縮保存）
              </p>
            </div>
            <Switch
              checked={formData.auto_archive_enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, auto_archive_enabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* エクスポート形式 */}
      <Card>
        <CardHeader>
          <CardTitle>エクスポート形式</CardTitle>
          <CardDescription>データをエクスポートする際のデフォルト形式</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">エクスポート形式</Label>
            <Select 
              value={formData.export_format} 
              onValueChange={(value: 'excel' | 'csv' | 'json') => 
                setFormData(prev => ({ ...prev, export_format: value }))
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {exportFormats.map(format => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-36">
            売上データやシナリオデータをエクスポートする際のファイル形式
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

