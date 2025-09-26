import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { scenarioApi } from '@/lib/api'
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
  RefreshCw
} from 'lucide-react'

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
    license_amount: 50000,
    participation_fee: 3500,
    genre: ['ホラー', 'ミステリー'],
    available_gms: [],
    play_count: 0,
    required_props: [],
    production_cost: 0,
    gm_fee: 2000,
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
    license_amount: 60000,
    participation_fee: 4000,
    genre: ['クラシック', 'ミステリー'],
    available_gms: [],
    play_count: 0,
    required_props: [],
    production_cost: 0,
    gm_fee: 2500,
    has_pre_reading: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
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

          {/* シナリオ一覧 - スプレッドシート形式 */}
          <div className="space-y-1">
            {/* ヘッダー行 */}
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center h-[50px] bg-muted/30">
                  <div className="flex-shrink-0 w-48 px-3 py-2 border-r font-medium text-sm">基本情報</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">所要時間・人数</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">難易度・評価</div>
                  <div className="flex-shrink-0 w-40 px-3 py-2 border-r font-medium text-sm">料金</div>
                  <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">ジャンル・ステータス</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 font-medium text-sm text-center">アクション</div>
                </div>
              </CardContent>
            </Card>

            {/* シナリオデータ行 */}
            <div className="space-y-1">
              {filteredScenarios.map((scenario) => (
                <Card key={scenario.id}>
                  <CardContent className="p-0">
                    <div className="flex items-center min-h-[60px]">
                      {/* 基本情報 */}
                      <div className="flex-shrink-0 w-48 px-3 py-2 border-r">
                        <div className="space-y-1">
                          <p className="font-medium text-sm truncate" title={scenario.title}>
                            {scenario.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate" title={scenario.author}>
                            {scenario.author}
                          </p>
                        </div>
                      </div>

                      {/* 所要時間・人数 */}
                      <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
                        <div className="space-y-1">
                          <p className="text-sm flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {scenario.duration}分
                          </p>
                          <p className="text-sm flex items-center gap-1">
                            <Users className="h-3 w-3" /> {scenario.player_count_min}-{scenario.player_count_max}名
                          </p>
                        </div>
                      </div>

                      {/* 難易度・評価 */}
                      <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={`h-3 w-3 ${i < (scenario.difficulty || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} 
                              />
                            ))}
                          </div>
                          <p className="text-sm flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> {scenario.rating || 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* 料金 */}
                      <div className="flex-shrink-0 w-40 px-3 py-2 border-r">
                        <div className="space-y-1">
                          <p className="text-sm">
                            ライセンス: ¥{scenario.license_amount?.toLocaleString() || 0}
                          </p>
                          <p className="text-sm">
                            参加費: ¥{scenario.participation_fee?.toLocaleString() || 0}
                          </p>
                        </div>
                      </div>

                      {/* ジャンル・ステータス */}
                      <div className="flex-1 px-3 py-2 border-r min-w-0">
                        <div className="space-y-2">
                          {/* ステータス */}
                          <div className="flex items-center gap-2">
                            <Badge className={
                              scenario.status === 'available' ? 'bg-green-100 text-green-800 px-1 py-0.5' :
                              scenario.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800 px-1 py-0.5' :
                              'bg-red-100 text-red-800 px-1 py-0.5'
                            }>
                              {scenario.status === 'available' ? '利用可能' :
                              scenario.status === 'maintenance' ? 'メンテナンス中' : '引退済み'}
                            </Badge>
                          </div>
                          
                          {/* ジャンル */}
                          {scenario.genre && scenario.genre.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {scenario.genre.slice(0, 2).map((g, i) => (
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
                      </div>

                      {/* アクション */}
                      <div className="flex-shrink-0 w-32 px-3 py-2">
                        <div className="flex gap-1 justify-center">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0"
                            title="編集"
                          >
                            <Edit className="h-4 w-4" />
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