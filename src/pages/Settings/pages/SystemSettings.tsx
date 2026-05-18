import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface SystemSettingsProps {
  storeId?: string
}

export function SystemSettings({ storeId: _storeId }: SystemSettingsProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [globalSettingsId, setGlobalSettingsId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    system_name: 'MMQ 予約管理システム',
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return
      const { data, error } = await supabase
        .from('global_settings')
        .select('id, system_name')
        .eq('organization_id', orgId)
        .single()
      if (error) { logger.error('システム設定の取得に失敗:', error); return }
      if (data) {
        setGlobalSettingsId(data.id)
        setFormData({ system_name: data.system_name ?? 'MMQ 予約管理システム' })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!globalSettingsId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('global_settings')
        .update({ system_name: formData.system_name })
        .eq('id', globalSettingsId)
      if (error) throw error
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
      <PageHeader title="システム設定" description="システム名とメンテナンスモードの設定">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Shield}
          label="基本設定"
          description="管理画面全体で表示されるシステム名を設定します。"
        />
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">システム名</Label>
          <Input
            value={formData.system_name}
            onChange={(e) => setFormData(prev => ({ ...prev, system_name: e.target.value }))}
            placeholder="MMQ 予約管理システム"
          />
        </div>
      </section>
    </div>
  )
}
