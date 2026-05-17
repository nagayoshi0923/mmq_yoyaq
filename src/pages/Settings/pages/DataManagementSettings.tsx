import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save, Database, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface DataManagementData {
  id: string
  store_id: string
  backup_frequency: 'daily' | 'weekly' | 'monthly'
  data_retention_years: number
  auto_archive_enabled: boolean
  export_format: 'excel' | 'csv' | 'json'
}

interface DataManagementSettingsProps { storeId?: string }

export function DataManagementSettings({ storeId }: DataManagementSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [formData, setFormData] = useState<DataManagementData>({
    id: '', store_id: '', backup_frequency: 'daily',
    data_retention_years: 5, auto_archive_enabled: true, export_format: 'excel'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const storesData = await storeApi.getAll()
      if (storesData && storesData.length > 0) {
        setStores(storesData)
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
        .select('id, store_id, organization_id, backup_frequency, data_retention_years, auto_archive_enabled, export_format, updated_at')
        .eq('store_id', storeId).maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      if (data) {
        setFormData(data)
      } else {
        setFormData({ id: '', store_id: storeId, backup_frequency: 'daily',
          data_retention_years: 5, auto_archive_enabled: true, export_format: 'excel' })
      }
    } catch (error) { logger.error('設定取得エラー:', error) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase.from('data_management_settings')
          .update({ backup_frequency: formData.backup_frequency, data_retention_years: formData.data_retention_years,
            auto_archive_enabled: formData.auto_archive_enabled, export_format: formData.export_format })
          .eq('id', formData.id)
        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase.from('data_management_settings')
          .insert({ store_id: formData.store_id, organization_id: store?.organization_id,
            backup_frequency: formData.backup_frequency, data_retention_years: formData.data_retention_years,
            auto_archive_enabled: formData.auto_archive_enabled, export_format: formData.export_format })
          .select().single()
        if (error) throw error
        if (data) setFormData(prev => ({ ...prev, id: data.id }))
      }
      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader title="データ管理" description="バックアップ・アーカイブ・エクスポートの設定">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 未実装の注記 */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">このページの設定は現在アプリに反映されません</p>
          <p className="text-xs text-amber-700 mt-1">
            バックアップ・アーカイブ機能は将来実装予定です。設定値はデータベースに保存されますが、実際のバックアップ動作には影響しません。
          </p>
        </div>
      </div>

      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Database}
          label="バックアップ・データ管理"
          description="データのバックアップ頻度・保持期間・アーカイブの設定。現在は将来機能の設定値として保存されます。"
        />
        <div className="space-y-5 opacity-75">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">バックアップ頻度</Label>
            <Select value={formData.backup_frequency}
              onValueChange={(v: 'daily' | 'weekly' | 'monthly') => setFormData(prev => ({ ...prev, backup_frequency: v }))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">毎日</SelectItem>
                <SelectItem value="weekly">毎週</SelectItem>
                <SelectItem value="monthly">毎月</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">データ保持期間</Label>
            <Select value={formData.data_retention_years.toString()}
              onValueChange={(v) => setFormData(prev => ({ ...prev, data_retention_years: parseInt(v) }))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1,3,5,7,10].map(y => <SelectItem key={y} value={y.toString()}>{y}年</SelectItem>)}
                <SelectItem value="999">無期限</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">自動アーカイブ</Label>
              <p className="text-xs text-muted-foreground">保持期間を超えたデータを自動的にアーカイブする</p>
            </div>
            <Switch
              checked={formData.auto_archive_enabled}
              onCheckedChange={(v) => setFormData(prev => ({ ...prev, auto_archive_enabled: v }))}
            />
          </div>

          <div className="space-y-1.5 pt-1 border-t">
            <Label className="text-sm font-medium">デフォルトエクスポート形式</Label>
            <Select value={formData.export_format}
              onValueChange={(v: 'excel' | 'csv' | 'json') => setFormData(prev => ({ ...prev, export_format: v }))}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel（.xlsx）</SelectItem>
                <SelectItem value="csv">CSV（.csv）</SelectItem>
                <SelectItem value="json">JSON（.json）</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  )
}
