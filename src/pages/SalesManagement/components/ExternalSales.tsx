import { logger } from '@/utils/logger'
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Edit2, Trash2, ShoppingBag, Store, Calendar } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { format } from '@/lib/dateFns'
import { ja } from 'date-fns/locale'

// 外部売上の種類
type ExternalSaleType = 'booth' | 'other_store'

// 外部売上データの型
interface ExternalSale {
  id: string
  type: ExternalSaleType
  date: string
  scenario_id?: string
  scenario_title?: string
  store_name?: string  // 他店の場合の店舗名
  amount: number       // 売上金額
  license_cost: number // ライセンス料
  notes?: string
  created_at: string
}

// フォームデータの型
interface ExternalSaleFormData {
  type: ExternalSaleType
  date: string
  scenario_id: string
  store_name: string
  amount: number
  license_cost: number
  notes: string
}

// シナリオデータの型（他店ライセンス料を含む）
interface ScenarioWithLicense {
  id: string
  title: string
  franchise_license_amount?: number
  franchise_gm_test_license_amount?: number
  organization_id?: string
}

export const ExternalSales: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [sales, setSales] = useState<ExternalSale[]>([])
  const [scenarios, setScenarios] = useState<ScenarioWithLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ExternalSaleFormData>({
    type: 'booth',
    date: format(new Date(), 'yyyy-MM-dd'),
    scenario_id: '',
    store_name: '',
    amount: 0,
    license_cost: 0,
    notes: ''
  })

  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1

  // シナリオデータを取得
  useEffect(() => {
    const fetchScenarios = async () => {
      const { data, error } = await supabase
        .from('scenarios')
        .select('id, title, franchise_license_amount, franchise_gm_test_license_amount, organization_id')
        .order('title')
      
      if (!error && data) {
        setScenarios(data)
      }
    }
    fetchScenarios()
  }, [])

  // 外部売上データを取得
  useEffect(() => {
    const fetchSales = async () => {
      setLoading(true)
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-31`

      const { data, error } = await supabase
        .from('external_sales')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })

      if (error) {
        // テーブルがない場合はエラーを表示しない
        if (error.code !== '42P01') {
          logger.error('外部売上データ取得エラー:', error)
        }
        setSales([])
      } else {
        setSales(data || [])
      }
      setLoading(false)
    }
    fetchSales()
  }, [selectedYear, selectedMonth])

  // シナリオ選択時に他店ライセンス料を自動設定
  const handleScenarioChange = (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId)
    setFormData(prev => ({
      ...prev,
      scenario_id: scenarioId,
      license_cost: scenario?.franchise_license_amount || 0
    }))
  }

  // フォームリセット
  const resetForm = () => {
    setFormData({
      type: 'booth',
      date: format(new Date(), 'yyyy-MM-dd'),
      scenario_id: '',
      store_name: '',
      amount: 0,
      license_cost: 0,
      notes: ''
    })
    setEditingId(null)
  }

  // 新規追加ダイアログを開く
  const handleOpenAdd = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  // 編集ダイアログを開く
  const handleOpenEdit = (sale: ExternalSale) => {
    setFormData({
      type: sale.type,
      date: sale.date,
      scenario_id: sale.scenario_id || '',
      store_name: sale.store_name || '',
      amount: sale.amount,
      license_cost: sale.license_cost,
      notes: sale.notes || ''
    })
    setEditingId(sale.id)
    setIsDialogOpen(true)
  }

  // 保存処理
  const handleSave = async () => {
    try {
      const scenario = scenarios.find(s => s.id === formData.scenario_id)
      // organization_idはシナリオから取得、なければ最初のシナリオから取得
      const organizationId = scenario?.organization_id || scenarios[0]?.organization_id
      const saveData = {
        type: formData.type,
        date: formData.date,
        scenario_id: formData.scenario_id || null,
        scenario_title: scenario?.title || null,
        store_name: formData.type === 'other_store' ? formData.store_name : null,
        amount: formData.amount,
        license_cost: formData.license_cost,
        notes: formData.notes || null,
        organization_id: organizationId
      }

      if (editingId) {
        const { error } = await supabase
          .from('external_sales')
          .update(saveData)
          .eq('id', editingId)
        
        if (error) throw error
        showToast.success('更新しました')
      } else {
        const { error } = await supabase
          .from('external_sales')
          .insert([saveData])
        
        if (error) throw error
        showToast.success('登録しました')
      }

      setIsDialogOpen(false)
      resetForm()
      
      // データ再取得
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-31`
      const { data } = await supabase
        .from('external_sales')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })
      setSales(data || [])
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    }
  }

  // 削除処理
  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return

    try {
      const { error } = await supabase
        .from('external_sales')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      
      setSales(prev => prev.filter(s => s.id !== id))
      showToast.success('削除しました')
    } catch (error) {
      logger.error('削除エラー:', error)
      showToast.error('削除に失敗しました')
    }
  }

  // 集計
  const boothSales = sales.filter(s => s.type === 'booth')
  const otherStoreSales = sales.filter(s => s.type === 'other_store')
  const totalBoothAmount = boothSales.reduce((sum, s) => sum + s.amount, 0)
  const totalOtherStoreAmount = otherStoreSales.reduce((sum, s) => sum + s.amount, 0)
  const totalLicenseCost = sales.reduce((sum, s) => sum + s.license_cost, 0)

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">外部売上管理</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">BOOTH売上・他店公演を管理</p>
        </div>
        <div className="flex items-center gap-4">
          <MonthSwitcher value={currentDate} onChange={setCurrentDate} />
          <Button onClick={handleOpenAdd} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            新規登録
          </Button>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-orange-500" />
              BOOTH売上
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalBoothAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{boothSales.length}件</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Store className="h-4 w-4 text-blue-500" />
              他店公演売上
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalOtherStoreAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{otherStoreSales.length}件</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-500" />
              ライセンス料合計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">-¥{totalLicenseCost.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">支払い予定</p>
          </CardContent>
        </Card>
      </div>

      {/* データテーブル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">登録一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              データがありません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付</TableHead>
                  <TableHead>種類</TableHead>
                  <TableHead>シナリオ</TableHead>
                  <TableHead>店舗名</TableHead>
                  <TableHead className="text-right">売上</TableHead>
                  <TableHead className="text-right">ライセンス料</TableHead>
                  <TableHead>メモ</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map(sale => (
                  <TableRow key={sale.id}>
                    <TableCell>{format(new Date(sale.date), 'M/d(E)', { locale: ja })}</TableCell>
                    <TableCell>
                      <Badge variant={sale.type === 'booth' ? 'default' : 'secondary'}>
                        {sale.type === 'booth' ? 'BOOTH' : '他店公演'}
                      </Badge>
                    </TableCell>
                    <TableCell>{sale.scenario_title || '-'}</TableCell>
                    <TableCell>{sale.store_name || '-'}</TableCell>
                    <TableCell className="text-right">¥{sale.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {sale.license_cost > 0 ? `-¥${sale.license_cost.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="max-w-32 truncate">{sale.notes || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(sale)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(sale.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 登録・編集ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '外部売上を編集' : '外部売上を登録'}</DialogTitle>
            <DialogDescription>
              BOOTH売上や他店での公演を登録します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 種類 */}
            <div className="space-y-2">
              <Label>種類</Label>
              <Select
                value={formData.type}
                onValueChange={(value: ExternalSaleType) => setFormData(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booth">BOOTH売上</SelectItem>
                  <SelectItem value="other_store">他店公演</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 日付 */}
            <div className="space-y-2">
              <Label>日付</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>

            {/* シナリオ選択 */}
            <div className="space-y-2">
              <Label>シナリオ {formData.type === 'other_store' && <span className="text-red-500">*</span>}</Label>
              <Select
                value={formData.scenario_id || '_none'}
                onValueChange={(value) => handleScenarioChange(value === '_none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="シナリオを選択" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="_none">未選択</SelectItem>
                  {scenarios.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                      {s.franchise_license_amount ? ` (他店: ¥${s.franchise_license_amount.toLocaleString()})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.type === 'other_store' && formData.scenario_id && (
                <p className="text-xs text-muted-foreground">
                  ※ 他店ライセンス料が自動適用されます
                </p>
              )}
            </div>

            {/* 他店の場合：店舗名 */}
            {formData.type === 'other_store' && (
              <div className="space-y-2">
                <Label>開催店舗名</Label>
                <Input
                  value={formData.store_name}
                  onChange={e => setFormData(prev => ({ ...prev, store_name: e.target.value }))}
                  placeholder="例: ○○カフェ新宿店"
                />
              </div>
            )}

            {/* 売上金額 */}
            <div className="space-y-2">
              <Label>売上金額</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                <Input
                  type="number"
                  value={formData.amount || ''}
                  onChange={e => setFormData(prev => ({ ...prev, amount: parseInt(e.target.value) || 0 }))}
                  className="pl-8"
                  min={0}
                />
              </div>
            </div>

            {/* ライセンス料 */}
            <div className="space-y-2">
              <Label>ライセンス料</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                <Input
                  type="number"
                  value={formData.license_cost || ''}
                  onChange={e => setFormData(prev => ({ ...prev, license_cost: parseInt(e.target.value) || 0 }))}
                  className="pl-8"
                  min={0}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                作者に支払うライセンス料
              </p>
            </div>

            {/* メモ */}
            <div className="space-y-2">
              <Label>メモ（任意）</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="補足情報など"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave}>
              {editingId ? '更新' : '登録'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

