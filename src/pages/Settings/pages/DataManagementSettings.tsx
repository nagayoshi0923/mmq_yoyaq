import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save, Database, Download, Loader2, Users, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { saveAs } from 'file-saver'

interface DataManagementData {
  id: string
  store_id: string
  export_format: 'excel' | 'csv' | 'json'
}

interface DataManagementSettingsProps { storeId?: string }

// CSV 文字列を生成
function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
}

// Excel（XLSX）を生成して保存
async function saveAsExcel(sheetName: string, headers: string[], rows: string[][], fileName: string) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  ws.addRow(headers)
  rows.forEach(r => ws.addRow(r))
  ws.getRow(1).font = { bold: true }
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName)
}

function downloadBlob(content: string, mimeType: string, fileName: string) {
  const blob = new Blob(['﻿' + content], { type: mimeType + ';charset=utf-8;' })
  saveAs(blob, fileName)
}

export function DataManagementSettings({ storeId }: DataManagementSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [formData, setFormData] = useState<DataManagementData>({
    id: '', store_id: '', export_format: 'excel'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // エクスポート用
  const [exportDateFrom, setExportDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [exportDateTo, setExportDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [exportingReservations, setExportingReservations] = useState(false)
  const [exportingStaff, setExportingStaff] = useState(false)

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
        .select('id, store_id, export_format')
        .eq('store_id', storeId).maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      if (data) {
        setFormData({ id: data.id, store_id: data.store_id, export_format: data.export_format ?? 'excel' })
      } else {
        setFormData({ id: '', store_id: storeId, export_format: 'excel' })
      }
    } catch (error) { logger.error('設定取得エラー:', error) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase.from('data_management_settings')
          .update({ export_format: formData.export_format })
          .eq('id', formData.id)
        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase.from('data_management_settings')
          .insert({ store_id: formData.store_id, organization_id: store?.organization_id, export_format: formData.export_format })
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

  const handleExportReservations = async () => {
    setExportingReservations(true)
    try {
      const orgId = await getCurrentOrganizationId()
      const { data, error } = await supabase
        .from('reservations')
        .select('reservation_number, status, actual_datetime, duration, participant_count, final_price, payment_status, payment_method, customer_id, store_id, scenarios(title), stores(short_name, name), customers(name, email, phone_number)')
        .eq('organization_id', orgId!)
        .gte('actual_datetime', exportDateFrom + 'T00:00:00')
        .lte('actual_datetime', exportDateTo + 'T23:59:59')
        .order('actual_datetime', { ascending: false })

      if (error) throw error

      const headers = ['予約番号', 'ステータス', '日時', '公演時間(分)', '参加者数', '金額', '支払状態', '支払方法', '店舗', 'シナリオ', '顧客名', '顧客メール', '顧客電話']
      const rows = (data ?? []).map((r: any) => [
        r.reservation_number ?? '',
        r.status ?? '',
        r.actual_datetime ? new Date(r.actual_datetime).toLocaleString('ja-JP') : '',
        String(r.duration ?? ''),
        String(r.participant_count ?? ''),
        String(r.final_price ?? ''),
        r.payment_status ?? '',
        r.payment_method ?? '',
        (r.stores as any)?.short_name || (r.stores as any)?.name || '',
        (r.scenarios as any)?.title || '',
        (r.customers as any)?.name || '',
        (r.customers as any)?.email || '',
        (r.customers as any)?.phone_number || '',
      ])

      const fileName = `予約データ_${exportDateFrom}_${exportDateTo}`
      if (formData.export_format === 'excel') {
        await saveAsExcel('予約データ', headers, rows, `${fileName}.xlsx`)
      } else if (formData.export_format === 'json') {
        downloadBlob(JSON.stringify(data, null, 2), 'application/json', `${fileName}.json`)
      } else {
        downloadBlob(toCSV(headers, rows), 'text/csv', `${fileName}.csv`)
      }
      showToast.success(`${rows.length}件の予約データをエクスポートしました`)
    } catch (error) {
      logger.error('エクスポートエラー:', error)
      showToast.error('エクスポートに失敗しました')
    } finally { setExportingReservations(false) }
  }

  const handleExportStaff = async () => {
    setExportingStaff(true)
    try {
      const orgId = await getCurrentOrganizationId()
      const { data, error } = await supabase
        .from('staff')
        .select('name, line_name, email, phone, status, role, created_at, stores(short_name)')
        .eq('organization_id', orgId!)
        .order('name')

      if (error) throw error

      const headers = ['名前', 'LINE名', 'メール', '電話', 'ステータス', 'ロール', '登録日']
      const rows = (data ?? []).map((s: any) => [
        s.name ?? '',
        s.line_name ?? '',
        s.email ?? '',
        s.phone ?? '',
        s.status ?? '',
        Array.isArray(s.role) ? s.role.join(', ') : (s.role ?? ''),
        s.created_at ? new Date(s.created_at).toLocaleDateString('ja-JP') : '',
      ])

      const fileName = `スタッフデータ_${new Date().toISOString().split('T')[0]}`
      if (formData.export_format === 'excel') {
        await saveAsExcel('スタッフ', headers, rows, `${fileName}.xlsx`)
      } else if (formData.export_format === 'json') {
        downloadBlob(JSON.stringify(data, null, 2), 'application/json', `${fileName}.json`)
      } else {
        downloadBlob(toCSV(headers, rows), 'text/csv', `${fileName}.csv`)
      }
      showToast.success(`${rows.length}件のスタッフデータをエクスポートしました`)
    } catch (error) {
      logger.error('エクスポートエラー:', error)
      showToast.error('エクスポートに失敗しました')
    } finally { setExportingStaff(false) }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader title="データ管理" description="データのエクスポートと出力形式の設定">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* エクスポート形式 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Database}
          label="エクスポート設定"
          description="データをエクスポートする際のデフォルト形式を選択します。"
        />
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">出力形式</Label>
          <Select
            value={formData.export_format}
            onValueChange={(v: 'excel' | 'csv' | 'json') => setFormData(prev => ({ ...prev, export_format: v }))}
          >
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
      </section>

      {/* 予約データエクスポート */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={CalendarDays}
          label="予約データのエクスポート"
          description="指定した期間の予約データを出力します。予約番号・日時・参加者数・金額・顧客情報が含まれます。"
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">開始日</Label>
              <Input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">終了日</Label>
              <Input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} />
            </div>
          </div>
          <Button variant="outline" onClick={handleExportReservations} disabled={exportingReservations}>
            {exportingReservations
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Download className="w-4 h-4 mr-2" />}
            予約データをダウンロード
          </Button>
        </div>
      </section>

      {/* スタッフデータエクスポート */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Users}
          label="スタッフデータのエクスポート"
          description="スタッフ一覧（名前・LINE名・メール・電話・ステータス）を出力します。"
        />
        <Button variant="outline" onClick={handleExportStaff} disabled={exportingStaff}>
          {exportingStaff
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Download className="w-4 h-4 mr-2" />}
          スタッフデータをダウンロード
        </Button>
      </section>
    </div>
  )
}
