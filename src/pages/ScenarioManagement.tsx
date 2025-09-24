import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { scenarioApi } from '@/lib/api'
import type { Scenario } from '@/types'
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Trash2, 
  Clock, 
  Users,
  Star,
  DollarSign,
  Play,
  Filter,
  Search,
  ArrowLeft,
  RefreshCw
} from 'lucide-react'

// モックデータ（後でAPIから取得）
const mockScenarios = [
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
    license_amount: 50000,
    participation_fee: 3500,
    genre: ['ホラー', 'ミステリー']
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
    license_amount: 60000,
    participation_fee: 4000,
    genre: ['クラシック', 'ミステリー']
  }
]

export function ScenarioManagement() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadScenarios()
  }, [])

  async function loadScenarios() {
    try {
      setLoading(true)
      setError('')
      const data = await scenarioApi.getAll()
      setScenarios(data)
    } catch (err: any) {
      console.error('Error loading scenarios:', err)
      setError('シナリオデータの読み込みに失敗しました: ' + err.message)
      // エラー時はモックデータを使用
      setScenarios(mockScenarios)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteScenario(scenario: Scenario) {
    if (!confirm(`「${scenario.title}」を削除してもよろしいですか？\n\nこの操作は取り消せません。`)) {
      return
    }

    try {
      await scenarioApi.delete(scenario.id)
      // 削除成功後、リストから除去
      setScenarios(prev => prev.filter(s => s.id !== scenario.id))
    } catch (err: any) {
      console.error('Error deleting scenario:', err)
      alert('シナリオの削除に失敗しました: ' + err.message)
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

  const filteredScenarios = scenarios.filter(scenario => {
    const matchesSearch = 
      scenario.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scenario.author.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = 
      statusFilter === 'all' || scenario.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

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
  const totalLicenseAmount = scenarios.reduce((sum, s) => sum + (s.license_amount || 0), 0)
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
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              新規シナリオ
            </Button>
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
          <div className="flex gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="シナリオ名、作者で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="all">全て</option>
                <option value="available">利用可能</option>
                <option value="maintenance">メンテナンス</option>
                <option value="retired">引退</option>
              </select>
            </div>
          </div>

          {/* シナリオ一覧 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredScenarios.map((scenario) => (
              <Card key={scenario.id} className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                        {scenario.title}
                      </CardTitle>
                      <CardDescription className="text-muted-foreground">
                        {scenario.author}
                      </CardDescription>
                    </div>
                    <Badge className={
                      scenario.status === 'available' ? 'bg-green-100 text-green-800' :
                      scenario.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }>
                      {scenario.status === 'available' ? '利用可能' :
                      scenario.status === 'maintenance' ? 'メンテナンス中' : '引退済み'}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {scenario.description || '説明がありません。'}
                  </p>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">所要時間</p>
                      <p className="text-lg font-bold flex items-center gap-1">
                        <Clock className="h-4 w-4" /> {scenario.duration}分
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">プレイヤー数</p>
                      <p className="text-lg font-bold flex items-center gap-1">
                        <Users className="h-4 w-4" /> {scenario.player_count_min}-{scenario.player_count_max}名
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">難易度</p>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-4 w-4 ${i < (scenario.difficulty || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} 
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">評価</p>
                      <p className="text-lg font-bold flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" /> {scenario.rating || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">ライセンス料</p>
                      <p className="text-lg font-bold">¥{scenario.license_amount?.toLocaleString() || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">参加費</p>
                      <p className="text-lg font-bold">¥{scenario.participation_fee?.toLocaleString() || 0}</p>
                    </div>
                  </div>

                  {scenario.genre && scenario.genre.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-sm font-medium text-muted-foreground mb-1">ジャンル</p>
                      <div className="flex flex-wrap gap-2">
                        {scenario.genre.map((g, i) => (
                          <Badge key={i} variant="secondary">{g}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Edit className="h-4 w-4 mr-2" />
                      編集
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleDeleteScenario(scenario)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      削除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 検索結果が空の場合 */}
          {filteredScenarios.length === 0 && (
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
      </div>
    </div>
  )
}