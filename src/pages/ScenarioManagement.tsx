import { useState, useEffect, useLayoutEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { SortableTableHeader } from '@/components/ui/sortable-table-header'
import { ScenarioEditModal } from '@/components/modals/ScenarioEditModal'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { useSortableTable } from '@/hooks/useSortableTable'
import type { Scenario } from '@/types'
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Clock, 
  Users,
  Star,
  DollarSign,
  Play,
  Filter,
  Search,
  ArrowLeft,
  RefreshCw,
  Upload,
  Download,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// モックデータ（後でAPIから取得）
const mockScenarios: Scenario[] = [
  {
    id: '1',
    title: '人狼村の悲劇',
    author: '田中太郎',
    description: '閉ざされた村で起こる連続殺人事件。プレイヤーは村人となって真犯人を見つけ出さなければならない。',
    duration: 180,
    player_count_min: 4,
    player_count_max: 8,
    difficulty: 3,
    rating: 4.2,
    status: 'available',
    gm_costs: [{ role: 'main', reward: 2000, status: 'active' }],
    license_amount: 1500,
    gm_test_license_amount: 0,
    license_rewards: [],
    participation_costs: [{ time_slot: '通常', amount: 3500, type: 'fixed', status: 'active' }],
    participation_fee: 3500,
    genre: ['ホラー', 'ミステリー'],
    available_gms: [],
    play_count: 0,
    required_props: [],
    production_cost: 800,
    production_costs: [
      { item: '小道具', amount: 500 },
      { item: '印刷費', amount: 300 }
    ],
    has_pre_reading: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '2', 
    title: '密室の謎',
    author: '山田花子',
    description: '豪華客船の密室で発生した殺人事件。限られた容疑者の中から真犯人を見つけ出せ。',
    duration: 150,
    player_count_min: 5,
    player_count_max: 7,
    difficulty: 4,
    rating: 4.5,
    status: 'available',
    gm_costs: [{ role: 'main', reward: 2500, status: 'active' }],
    license_amount: 2000,
    gm_test_license_amount: 500,
    license_rewards: [],
    participation_costs: [{ time_slot: '通常', amount: 4000, type: 'fixed', status: 'active' }],
    participation_fee: 4000,
    genre: ['クラシック', 'ミステリー'],
    available_gms: [],
    play_count: 0,
    required_props: [],
    production_cost: 1200,
    production_costs: [
      { item: '特殊道具', amount: 1000 },
      { item: '資料印刷', amount: 200 }
    ],
    has_pre_reading: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
]

type ScenarioSortField = 'title' | 'author' | 'duration' | 'player_count_min' | 'difficulty' | 'participation_fee' | 'status' | 'available_gms'

export function ScenarioManagement() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('compact')
  const [isImporting, setIsImporting] = useState(false)
  
  // 削除確認ダイアログ用のstate
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioToDelete, setScenarioToDelete] = useState<Scenario | null>(null)
  
  // 並び替え機能
  const { sortState, handleSort, sortData } = useSortableTable<ScenarioSortField>({
    storageKey: 'scenario_sort_state',
    defaultField: 'title',
    defaultDirection: 'desc'
  })

  // スクロール位置の保存と復元
  useEffect(() => {
    // ブラウザのデフォルトスクロール復元を無効化
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        sessionStorage.setItem('scenarioScrollY', window.scrollY.toString())
        sessionStorage.setItem('scenarioScrollTime', Date.now().toString())
      }, 100)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // 初回レンダリング時のスクロール位置復元（早期）
  useLayoutEffect(() => {
    const savedY = sessionStorage.getItem('scenarioScrollY')
    const savedTime = sessionStorage.getItem('scenarioScrollTime')
    if (savedY && savedTime) {
      const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
      if (timeSinceScroll < 10000) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedY, 10))
        }, 100)
      }
    }
  }, [])

  // 初回データロード後のスクロール位置復元（初回のみ）
  useEffect(() => {
    if (!loading && !initialLoadComplete) {
      setInitialLoadComplete(true)
      const savedY = sessionStorage.getItem('scenarioScrollY')
      const savedTime = sessionStorage.getItem('scenarioScrollTime')
      if (savedY && savedTime) {
        const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
        if (timeSinceScroll < 10000) {
          setTimeout(() => {
            window.scrollTo(0, parseInt(savedY, 10))
          }, 200)
        }
      }
    }
  }, [loading, initialLoadComplete])

  useEffect(() => {
    loadScenarios()
  }, [])

  async function loadScenarios(preserveScroll = false) {
    try {
      // 初回ロードのみローディング表示
      if (!preserveScroll) {
        setLoading(true)
      }
      setError('')
      const data = await scenarioApi.getAll()
      
      // 各シナリオの担当GM情報をリレーションテーブルから取得
      const scenariosWithGMs = await Promise.all(
        data.map(async (scenario) => {
          try {
            const assignments = await assignmentApi.getScenarioAssignments(scenario.id)
            const assignedGMs = assignments.map(a => a.staff?.name).filter(Boolean)
            return {
              ...scenario,
              available_gms: assignedGMs // リレーションテーブルから取得した担当GM名を設定
            }
          } catch (error) {
            console.error(`Error loading assignments for scenario ${scenario.id}:`, error)
            return {
              ...scenario,
              available_gms: scenario.available_gms || [] // エラー時は既存の値を使用
            }
          }
        })
      )
      
      setScenarios(scenariosWithGMs)
    } catch (err: any) {
      console.error('Error loading scenarios:', err)
      setError('シナリオデータの読み込みに失敗しました: ' + err.message)
      // エラー時はモックデータを使用
      setScenarios(mockScenarios)
    } finally {
      if (!preserveScroll) {
        setLoading(false)
      }
    }
  }

  function handleEditScenario(scenario: Scenario) {
    setEditingScenario(scenario)
    setIsEditModalOpen(true)
  }

  function handleNewScenario() {
    setEditingScenario(null)
    setIsEditModalOpen(true)
  }

  async function handleSaveScenario(scenario: Scenario) {
    try {
      // データベースに送信する前にproduction_costsフィールドを除外
      const { production_costs, ...scenarioForDB } = scenario as any
      
      if (editingScenario) {
        // 編集
        await scenarioApi.update(scenario.id, scenarioForDB)
      } else {
        // 新規作成
        await scenarioApi.create(scenarioForDB)
      }
      
      // シナリオ保存後、担当GM情報を含めてリストを再読み込み（スクロール位置保持）
      await loadScenarios(true)
    } catch (err: any) {
      console.error('Error saving scenario:', err)
      alert('シナリオの保存に失敗しました: ' + err.message)
    }
  }

  function openDeleteDialog(scenario: Scenario) {
    setScenarioToDelete(scenario)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteScenario() {
    if (!scenarioToDelete) return

    try {
      await scenarioApi.delete(scenarioToDelete.id)
      // 削除成功後、リストから除去
      setScenarios(prev => prev.filter(s => s.id !== scenarioToDelete.id))
      setDeleteDialogOpen(false)
      setScenarioToDelete(null)
    } catch (err: any) {
      console.error('Error deleting scenario:', err)
      alert('シナリオの削除に失敗しました: ' + err.message)
    }
  }

  // CSVエクスポート
  function handleExportCSV() {
    const headers = [
      'タイトル',
      '作者',
      '所要時間（分）',
      '最小人数',
      '最大人数',
      '難易度',
      '参加費',
      'ライセンス料',
      'ステータス',
      '説明',
      'ジャンル'
    ]
    
    const rows = scenarios.map(s => [
      s.title,
      s.author,
      s.duration,
      s.player_count_min,
      s.player_count_max,
      s.difficulty || 3,
      s.participation_fee || 0,
      s.license_amount || 0,
      s.status,
      s.description || '',
      (s.genre || []).join('|')
    ])
    
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `scenarios_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // CSVインポート
  async function handleImportCSV(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsImporting(true)
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      // ヘッダー行をスキップ
      const dataLines = lines.slice(1)
      
      let successCount = 0
      let errorCount = 0
      
      for (const line of dataLines) {
        try {
          // CSV行をパース（ダブルクォートで囲まれた値に対応）
          const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(v => 
            v.replace(/^"|"$/g, '').trim()
          ) || []
          
          if (values.length < 9) continue // 最低限必要な列数
          
          const [title, author, duration, minPlayers, maxPlayers, difficulty, fee, license, status, description, genre] = values
          
          const scenarioData = {
            title: title,
            author: author,
            duration: parseInt(duration) || 180,
            player_count_min: parseInt(minPlayers) || 4,
            player_count_max: parseInt(maxPlayers) || 8,
            difficulty: parseInt(difficulty) || 3,
            participation_fee: parseInt(fee) || 0,
            participation_costs: [{ 
              time_slot: '通常', 
              amount: parseInt(fee) || 0, 
              type: 'fixed' as const,
              status: 'active' as const
            }],
            license_amount: parseInt(license) || 0,
            gm_test_license_amount: 0,
            license_rewards: [],
            gm_costs: [{ 
              role: 'main', 
              reward: 2000,
              status: 'active' as const
            }],
            status: (status as 'available' | 'maintenance' | 'retired') || 'available',
            description: description || '',
            genre: genre ? genre.split('|').filter(g => g) : [],
            production_cost: 0,
            available_gms: [],
            play_count: 0,
            required_props: [],
            has_pre_reading: false
          }
          
          await scenarioApi.create(scenarioData)
          successCount++
        } catch (err) {
          console.error('Error importing scenario:', err)
          errorCount++
        }
      }
      
      alert(`CSVインポート完了\n成功: ${successCount}件\n失敗: ${errorCount}件`)
      await loadScenarios()
    } catch (err: any) {
      console.error('CSV import error:', err)
      alert('CSVインポートに失敗しました: ' + err.message)
    } finally {
      setIsImporting(false)
      // ファイル入力をリセット
      event.target.value = ''
    }
  }



  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'scenarios') {
        // 他のページに切り替わった場合、AdminDashboardに戻る
        window.location.href = '/#' + hash
      } else if (!hash) {
        // ダッシュボードに戻る
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const filteredAndSortedScenarios = sortData(
    scenarios.filter(scenario => {
      const matchesSearch = 
        scenario.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scenario.author.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesStatus = 
        statusFilter === 'all' || scenario.status === statusFilter
      
      return matchesSearch && matchesStatus
    })
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="scenarios" />
        
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1>シナリオ管理</h1>
              <Button disabled>
                <Plus className="h-4 w-4 mr-2" />
                新規シナリオ
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mt-2"></div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="scenarios" />
        
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            <h1>シナリオ管理</h1>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <RefreshCw className="h-5 w-5" />
                  <p>{error}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  const totalScenarios = scenarios.length
  const availableScenarios = scenarios.filter(s => s.status === 'available').length
  const totalLicenseAmount = scenarios.reduce((sum, s) => {
    const licenseAmount = s.license_amount || 0
    return sum + licenseAmount
  }, 0)
  const avgPlayers = totalScenarios > 0 
    ? (scenarios.reduce((sum, s) => sum + ((s.player_count_min || 0) + (s.player_count_max || 0)) / 2, 0) / totalScenarios).toFixed(1)
    : '0'

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="scenarios" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                戻る
              </Button>
              <div>
                <h1>シナリオ管理</h1>
                <p className="text-muted-foreground">
                  全{scenarios.length}本のシナリオ管理
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {/* CSVエクスポートボタン */}
              <Button 
                variant="outline" 
                onClick={handleExportCSV}
                disabled={scenarios.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                CSVエクスポート
              </Button>
              
              {/* CSVインポートボタン */}
              <Button 
                variant="outline" 
                disabled={isImporting}
                onClick={() => document.getElementById('csv-import')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {isImporting ? 'インポート中...' : 'CSVインポート'}
              </Button>
              <input
                id="csv-import"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportCSV}
              />
              
              {/* 新規シナリオボタン */}
              <Button onClick={handleNewScenario}>
                <Plus className="h-4 w-4 mr-2" />
                新規シナリオ
              </Button>
            </div>
          </div>

          {/* 統計情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{totalScenarios}</p>
                    <p className="text-muted-foreground">総シナリオ数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{availableScenarios}</p>
                    <p className="text-muted-foreground">利用可能</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">¥{totalLicenseAmount.toLocaleString()}</p>
                    <p className="text-muted-foreground">総ライセンス料</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{avgPlayers}名</p>
                    <p className="text-muted-foreground">平均プレイヤー数</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 検索・フィルター */}
          <div className="flex justify-between items-center gap-4">
            <div className="flex gap-4 items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="シナリオ名、作者で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    <SelectItem value="available">利用可能</SelectItem>
                    <SelectItem value="maintenance">メンテナンス</SelectItem>
                    <SelectItem value="retired">引退</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* 表示切り替えボタン */}
            <div className="flex items-center gap-2">
              <Button
                variant={displayMode === 'compact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisplayMode('compact')}
              >
                基本情報
              </Button>
              <Button
                variant={displayMode === 'detailed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisplayMode('detailed')}
              >
                管理情報
              </Button>
            </div>
          </div>

          {/* シナリオ一覧 - スプレッドシート形式 */}
          <div className="space-y-1">
            {/* ヘッダー行 */}
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center h-[50px] bg-muted/30">
                  <SortableTableHeader
                    field="title"
                    currentField={sortState.field}
                    currentDirection={sortState.direction}
                    onSort={handleSort}
                    className="flex-shrink-0 w-40 px-3 py-2 border-r font-medium text-sm"
                  >
                    タイトル
                  </SortableTableHeader>
                  <SortableTableHeader
                    field="author"
                    currentField={sortState.field}
                    currentDirection={sortState.direction}
                    onSort={handleSort}
                    className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm"
                  >
                    作者
                  </SortableTableHeader>
                  <SortableTableHeader
                    field="duration"
                    currentField={sortState.field}
                    currentDirection={sortState.direction}
                    onSort={handleSort}
                    className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
                  >
                    所要時間
                  </SortableTableHeader>
                  <SortableTableHeader
                    field="player_count_min"
                    currentField={sortState.field}
                    currentDirection={sortState.direction}
                    onSort={handleSort}
                    className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
                  >
                    人数
                  </SortableTableHeader>
                {displayMode === 'compact' && (
                  <SortableTableHeader
                    field="available_gms"
                    currentField={sortState.field}
                    currentDirection={sortState.direction}
                    onSort={handleSort}
                    className="flex-shrink-0 w-96 px-3 py-2 border-r font-medium text-sm"
                  >
                    担当GM
                  </SortableTableHeader>
                )}
                  {displayMode === 'detailed' && (
                    <>
                      <SortableTableHeader
                        field="difficulty"
                        currentField={sortState.field}
                        currentDirection={sortState.direction}
                        onSort={handleSort}
                        className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
                      >
                        難易度
                      </SortableTableHeader>
                      <SortableTableHeader
                        field="participation_fee"
                        currentField={sortState.field}
                        currentDirection={sortState.direction}
                        onSort={handleSort}
                        className="flex-shrink-0 w-28 px-3 py-2 border-r font-medium text-sm"
                      >
                        ライセンス料
                      </SortableTableHeader>
                    </>
                  )}
                  <SortableTableHeader
                    field="participation_fee"
                    currentField={sortState.field}
                    currentDirection={sortState.direction}
                    onSort={handleSort}
                    className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
                  >
                    参加費
                  </SortableTableHeader>
                  <SortableTableHeader
                    field="status"
                    currentField={sortState.field}
                    currentDirection={sortState.direction}
                    onSort={handleSort}
                    className="flex-shrink-0 w-28 px-3 py-2 border-r font-medium text-sm"
                  >
                    ステータス
                  </SortableTableHeader>
                  {displayMode === 'detailed' && (
                    <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">ジャンル</div>
                  )}
                  <div className="flex-shrink-0 w-24 px-3 py-2 font-medium text-sm text-center">アクション</div>
                </div>
              </CardContent>
            </Card>

            {/* シナリオデータ行 */}
            <div className="space-y-1">
              {filteredAndSortedScenarios.map((scenario) => (
                <Card key={scenario.id}>
                  <CardContent className="p-0">
                    <div className="flex items-center min-h-[60px]">
                      {/* タイトル */}
                      <div className="flex-shrink-0 w-40 px-3 py-2 border-r">
                        <p className="font-medium text-sm truncate" title={scenario.title}>
                          {scenario.title}
                        </p>
                      </div>

                      {/* 作者 */}
                      <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
                        <p className="text-sm truncate" title={scenario.author}>
                          {scenario.author}
                        </p>
                      </div>

                      {/* 所要時間 */}
                      <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                        <p className="text-sm flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {(scenario.duration / 60) % 1 === 0 ? Math.floor(scenario.duration / 60) : (scenario.duration / 60).toFixed(1)}時間
                        </p>
                      </div>

                      {/* 人数 */}
                      <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                        <p className="text-sm flex items-center gap-1">
                          <Users className="h-3 w-3" /> 
                          {scenario.player_count_max && scenario.player_count_max !== scenario.player_count_min
                            ? `${scenario.player_count_min}-${scenario.player_count_max}名`
                            : `${scenario.player_count_min}名`
                          }
                        </p>
                      </div>

                      {/* 担当GM（基本情報時のみ） */}
                        {displayMode === 'compact' && (
                          <div className="flex-shrink-0 w-96 px-3 py-2 border-r">
                            <div className="text-sm">
                              {scenario.available_gms && scenario.available_gms.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {scenario.available_gms.slice(0, 6).map((gm: string, i: number) => (
                                    <Badge key={i} variant="outline" className="font-normal text-xs px-1 py-0.5">
                                      {gm}
                                    </Badge>
                                  ))}
                                  {scenario.available_gms.length > 6 && (
                                    <Badge variant="outline" className="font-normal text-xs px-1 py-0.5">
                                      +{scenario.available_gms.length - 6}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">未設定</span>
                              )}
                            </div>
                          </div>
                        )}

                      {/* 管理情報（詳細表示時のみ） */}
                      {displayMode === 'detailed' && (
                        <>
                          {/* 難易度 */}
                          <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star 
                                  key={i} 
                                  className={`h-3 w-3 ${i < (scenario.difficulty || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} 
                                />
                              ))}
                            </div>
                          </div>

                          {/* ライセンス料 */}
                          <div className="flex-shrink-0 w-28 px-3 py-2 border-r">
                            {(() => {
                              const normalLicense = scenario.license_amount || 0
                              const gmTestLicense = scenario.gm_test_license_amount || 0
                              
                              if (normalLicense === 0 && gmTestLicense === 0) {
                                return <p className="text-sm text-right text-muted-foreground">¥0</p>
                              }
                              
                              return (
                                <div className="text-xs space-y-0.5">
                                  <p className="text-right">
                                    通常: ¥{normalLicense.toLocaleString()}
                                  </p>
                                  <p className="text-right text-muted-foreground">
                                    GMテスト: ¥{gmTestLicense.toLocaleString()}
                                  </p>
                                </div>
                              )
                            })()}
                          </div>
                        </>
                      )}

                      {/* 参加費 */}
                      <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                        <p className="text-sm text-right">
                          ¥{scenario.participation_fee?.toLocaleString() || 0}
                        </p>
                      </div>

                      {/* ステータス */}
                      <div className="flex-shrink-0 w-28 px-3 py-2 border-r">
                        <Badge className={
                          scenario.status === 'available' ? 'bg-green-100 text-green-800 px-1 py-0.5' :
                          scenario.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800 px-1 py-0.5' :
                          'bg-red-100 text-red-800 px-1 py-0.5'
                        }>
                          {scenario.status === 'available' ? '利用可能' :
                          scenario.status === 'maintenance' ? 'メンテナンス中' : '引退済み'}
                        </Badge>
                      </div>

                      {/* ジャンル（詳細表示時のみ） */}
                      {displayMode === 'detailed' && (
                        <div className="flex-1 px-3 py-2 border-r min-w-0">
                          {scenario.genre && scenario.genre.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {scenario.genre.slice(0, 2).map((g: string, i: number) => (
                                <Badge key={i} variant="outline" className="font-normal text-xs px-1 py-0.5">
                                  {g}
                                </Badge>
                              ))}
                              {scenario.genre.length > 2 && (
                                <Badge variant="outline" className="font-normal text-xs px-1 py-0.5">
                                  +{scenario.genre.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* アクション */}
                      <div className="flex-shrink-0 w-24 px-3 py-2">
                        <div className="flex gap-1 justify-center">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0"
                            title="編集"
                            onClick={() => handleEditScenario(scenario)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="削除"
                            onClick={() => openDeleteDialog(scenario)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* 検索結果が空の場合 */}
          {filteredAndSortedScenarios.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter !== 'all' 
                    ? '検索条件に一致するシナリオが見つかりません' 
                    : 'シナリオが登録されていません'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 編集ダイアログ */}
        <ScenarioEditModal
          scenario={editingScenario}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveScenario}
        />

        {/* 削除確認ダイアログ */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                シナリオを削除
              </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                「<span className="font-semibold text-foreground">{scenarioToDelete?.title}</span>」を削除してもよろしいですか？
              </p>
              <p className="text-amber-600 font-medium">
                この操作は取り消せません。以下の処理が実行されます：
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 pl-2">
                <li>スタッフとの紐づけを削除</li>
                <li>公演キットデータを削除</li>
                <li>スケジュールのシナリオ欄を「未設定」に変更</li>
                <li>予約のシナリオ欄を「未設定」に変更</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                ※ スケジュールイベントと予約自体は削除されません
              </p>
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteScenario}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}