import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MonthSwitcher } from '@/components/patterns/calendar/MonthSwitcher'
import { Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Transaction {
  id?: string
  date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  description: string
  store_id?: string
  scenario_id?: string
  created_at?: string
}

interface Store {
  id: string
  name: string
  short_name: string
  ownership_type?: 'corporate' | 'franchise' | 'office'
}

interface Scenario {
  id: string
  title: string
  author: string
}

interface MiscellaneousTransactionsProps {
  stores: Store[]
}

/**
 * 雑収支登録ページ
 * 公演に含まれない収入・支出を管理
 */
export const MiscellaneousTransactions: React.FC<MiscellaneousTransactionsProps> = ({ stores }) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
  })
  
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(false)
  
  // 新規追加フォームの状態
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    category: '',
    amount: 0,
    description: '',
    store_id: undefined,
    scenario_id: undefined
  })
  
  // 直営店とオフィスのみを表示
  const corporateStores = stores.filter(s => s.ownership_type !== 'franchise')
  
  // シナリオを読み込み
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const { data, error } = await supabase
          .from('scenarios')
          .select('id, title, author')
          .order('title', { ascending: true })
        
        if (error) throw error
        setScenarios(data || [])
      } catch (error) {
        console.error('シナリオ読み込みエラー:', error)
      }
    }
    
    loadScenarios()
  }, [])
  
  // 月の範囲を計算
  const getMonthRange = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const startDate = new Date(year, month, 1, 12, 0, 0, 0)
    const endDate = new Date(year, month + 1, 0, 12, 0, 0, 0)
    
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endYear = endDate.getFullYear()
    const endMonth = endDate.getMonth() + 1
    const endDay = endDate.getDate()
    const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    
    return { startStr, endStr }
  }
  
  // トランザクションを読み込み
  const loadTransactions = async () => {
    setLoading(true)
    try {
      const { startStr, endStr } = getMonthRange(currentMonth)
      
      const { data, error } = await supabase
        .from('miscellaneous_transactions')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: false })
      
      if (error) throw error
      setTransactions(data || [])
    } catch (error) {
      console.error('トランザクション読み込みエラー:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // 月が変わったら再読み込み
  useEffect(() => {
    loadTransactions()
  }, [currentMonth])
  
  // トランザクションを追加
  const handleAddTransaction = async () => {
    if (!newTransaction.category || !newTransaction.amount || newTransaction.amount <= 0) {
      alert('カテゴリと金額を入力してください')
      return
    }
    
    try {
      const { error } = await supabase
        .from('miscellaneous_transactions')
        .insert([{
          date: newTransaction.date,
          type: newTransaction.type,
          category: newTransaction.category,
          amount: newTransaction.amount,
          description: newTransaction.description,
          store_id: newTransaction.store_id || null,
          scenario_id: newTransaction.scenario_id || null
        }])
      
      if (error) throw error
      
      // フォームをリセット
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category: '',
        amount: 0,
        description: '',
        store_id: undefined,
        scenario_id: undefined
      })
      
      // リロード
      await loadTransactions()
    } catch (error) {
      console.error('トランザクション追加エラー:', error)
      alert('追加に失敗しました')
    }
  }
  
  // トランザクションを削除
  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('削除しますか？')) return
    
    try {
      const { error } = await supabase
        .from('miscellaneous_transactions')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      await loadTransactions()
    } catch (error) {
      console.error('トランザクション削除エラー:', error)
      alert('削除に失敗しました')
    }
  }
  
  // 合計を計算（シナリオ連携なしのみ）
  const totalIncome = transactions
    .filter(t => t.type === 'income' && !t.scenario_id)
    .reduce((sum, t) => sum + t.amount, 0)
  
  const totalExpense = transactions
    .filter(t => t.type === 'expense' && !t.scenario_id)
    .reduce((sum, t) => sum + t.amount, 0)
  
  const netAmount = totalIncome - totalExpense
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(amount)
  }
  
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg">雑収支管理</h2>
      </div>
      
      {/* 月切り替え */}
      <div className="flex justify-center">
        <MonthSwitcher
          value={currentMonth}
          onChange={setCurrentMonth}
          showToday={true}
          quickJump={true}
          enableKeyboard={true}
        />
      </div>
      
      {/* サマリー */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              収入合計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg text-green-900">
              {formatCurrency(totalIncome)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              支出合計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg text-red-900">
              {formatCurrency(totalExpense)}
            </div>
          </CardContent>
        </Card>
        
        <Card className={`bg-gradient-to-br border-2 ${netAmount >= 0 ? 'from-blue-50 to-blue-100 border-blue-300' : 'from-gray-50 to-gray-100 border-gray-300'}`}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-sm font-medium ${netAmount >= 0 ? 'text-blue-900' : 'text-gray-900'}`}>
              差額
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-lg font-bold ${netAmount >= 0 ? 'text-blue-900' : 'text-gray-900'}`}>
              {formatCurrency(netAmount)}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* 新規追加フォーム */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            新規登録
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>日付</Label>
                <Input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                />
              </div>
              
              <div>
                <Label>種別</Label>
                <Select 
                  value={newTransaction.type} 
                  onValueChange={(value: 'income' | 'expense') => setNewTransaction({ ...newTransaction, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">収入</SelectItem>
                    <SelectItem value="expense">支出</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>カテゴリ</Label>
                <Input
                  placeholder="例: 広告費、印刷費"
                  value={newTransaction.category}
                  onChange={(e) => setNewTransaction({ ...newTransaction, category: e.target.value })}
                />
              </div>
              
              <div>
                <Label>金額</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newTransaction.amount || ''}
                  onChange={(e) => setNewTransaction({ ...newTransaction, amount: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>シナリオ（任意）</Label>
                <Select 
                  value={newTransaction.scenario_id || 'none'} 
                  onValueChange={(value) => setNewTransaction({ ...newTransaction, scenario_id: value === 'none' ? undefined : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="シナリオなし" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">シナリオなし</SelectItem>
                    {scenarios.map(scenario => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>店舗（任意）</Label>
                <Select 
                  value={newTransaction.store_id || 'none'} 
                  onValueChange={(value) => setNewTransaction({ ...newTransaction, store_id: value === 'none' ? undefined : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="全社" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">全社</SelectItem>
                    {corporateStores.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>説明（任意）</Label>
                <Input
                  placeholder="メモ"
                  value={newTransaction.description}
                  onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                />
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <Button onClick={handleAddTransaction}>
              <Plus className="h-4 w-4 mr-2" />
              追加
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* トランザクションリスト */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月の収支一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">データがありません</div>
          ) : (
            <div className="space-y-2">
              {transactions.map(transaction => {
                const store = corporateStores.find(s => s.id === transaction.store_id)
                const scenario = scenarios.find(s => s.id === transaction.scenario_id)
                return (
                  <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1 grid grid-cols-7 gap-4 items-center">
                      <div className="text-sm text-muted-foreground">
                        {transaction.date}
                      </div>
                      <div>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          transaction.type === 'income' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {transaction.type === 'income' ? '収入' : '支出'}
                        </span>
                      </div>
                      <div className="">
                        {transaction.category}
                      </div>
                      <div className={`text-lg font-bold ${
                        transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(transaction.amount)}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {scenario ? scenario.title : '-'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {store ? store.short_name : '全社'}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {transaction.description || '-'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTransaction(transaction.id!)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

