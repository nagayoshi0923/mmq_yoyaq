import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { FileText, Save, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface SalesReportSettings {
  id: string
  store_id: string
  closing_day: number
  author_report_day: number
  report_emails: string[]
  report_format: 'pdf' | 'excel' | 'both'
  auto_send_enabled: boolean
}

export function SalesReportSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<SalesReportSettings>({
    id: '',
    store_id: '',
    closing_day: 25,
    author_report_day: 28,
    report_emails: [],
    report_format: 'pdf',
    auto_send_enabled: true
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newEmail, setNewEmail] = useState('')

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
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('sales_report_settings')
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
          closing_day: 25,
          author_report_day: 28,
          report_emails: [],
          report_format: 'pdf',
          auto_send_enabled: true
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

  const addEmail = () => {
    if (!newEmail) {
      showToast.warning('メールアドレスを入力してください')
      return
    }
    
    // 簡易的なメールバリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      showToast.warning('有効なメールアドレスを入力してください')
      return
    }

    if (formData.report_emails.includes(newEmail)) {
      showToast.warning('このメールアドレスは既に追加されています')
      return
    }

    setFormData(prev => ({
      ...prev,
      report_emails: [...prev.report_emails, newEmail]
    }))
    setNewEmail('')
  }

  const removeEmail = (email: string) => {
    setFormData(prev => ({
      ...prev,
      report_emails: prev.report_emails.filter(e => e !== email)
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('sales_report_settings')
          .update({
            closing_day: formData.closing_day,
            author_report_day: formData.author_report_day,
            report_emails: formData.report_emails,
            report_format: formData.report_format,
            auto_send_enabled: formData.auto_send_enabled
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('sales_report_settings')
          .insert({
            store_id: formData.store_id,
            closing_day: formData.closing_day,
            author_report_day: formData.author_report_day,
            report_emails: formData.report_emails,
            report_format: formData.report_format,
            auto_send_enabled: formData.auto_send_enabled
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
        title="売上・レポート設定"
        description="売上集計と表示設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 締日設定 */}
      <Card>
        <CardHeader>
          <CardTitle>売上締日</CardTitle>
          <CardDescription>毎月の売上を締める日を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">締日</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">毎月</span>
              <Input
                type="number"
                value={formData.closing_day}
                onChange={(e) => setFormData(prev => ({ ...prev, closing_day: parseInt(e.target.value) || 1 }))}
                min="1"
                max="31"
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">日</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-36">
            例: 25日の場合、毎月1日〜25日の売上を集計
          </p>
        </CardContent>
      </Card>

      {/* 作者レポート送信日 */}
      <Card>
        <CardHeader>
          <CardTitle>作者レポート送信日</CardTitle>
          <CardDescription>作者への公演実績レポートを送信する日を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">送信日</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">毎月</span>
              <Input
                type="number"
                value={formData.author_report_day}
                onChange={(e) => setFormData(prev => ({ ...prev, author_report_day: parseInt(e.target.value) || 1 }))}
                min="1"
                max="31"
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">日</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-36">
            例: 28日の場合、毎月28日に前月分のレポートを送信
          </p>
        </CardContent>
      </Card>

      {/* レポート送信先 */}
      <Card>
        <CardHeader>
          <CardTitle>レポート送信先メールアドレス</CardTitle>
          <CardDescription>レポートを送信するメールアドレスを管理します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="example@email.com"
              onKeyPress={(e) => e.key === 'Enter' && addEmail()}
            />
            <Button onClick={addEmail} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.report_emails.length > 0 && (
            <div className="space-y-2">
              {formData.report_emails.map((email, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <span className="">{email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEmail(email)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* レポート形式と自動送信 */}
      <Card>
        <CardHeader>
          <CardTitle>レポート形式と送信設定</CardTitle>
          <CardDescription>レポートのファイル形式と自動送信を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="w-32">レポート形式</Label>
            <Select 
              value={formData.report_format} 
              onValueChange={(value: 'pdf' | 'excel' | 'both') => 
                setFormData(prev => ({ ...prev, report_format: value }))
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDFのみ</SelectItem>
                <SelectItem value="excel">Excelのみ</SelectItem>
                <SelectItem value="both">PDF + Excel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <Label>自動送信</Label>
              <p className="text-xs text-muted-foreground mt-1">
                設定した日に自動的にレポートを送信
              </p>
            </div>
            <Switch
              checked={formData.auto_send_enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, auto_send_enabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

