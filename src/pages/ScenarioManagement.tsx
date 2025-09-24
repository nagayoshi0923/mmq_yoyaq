import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { scenarioApi } from '@/lib/api'
import { getCategoryColors } from '@/lib/utils'
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
  Search
} from 'lucide-react'

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
      const data = await scenarioApi.getAll()
      setScenarios(data)
    } catch (error: any) {
      setError('シナリオデータの読み込みに失敗しました: ' + error.message)
      console.error('Error loading scenarios:', error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'available':
        return <Badge className="bg-green-100 text-green-800">利用可能</Badge>
      case 'maintenance':
        return <Badge className="bg-yellow-100 text-yellow-800">メンテナンス</Badge>
      case 'retired':
        return <Badge className="bg-red-100 text-red-800">引退</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>
    }
  }

  function getDifficultyStars(difficulty: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        className={`h-4 w-4 ${i < difficulty ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
      />
    ))
  }

  // フィルタリング
  const filteredScenarios = scenarios.filter(scenario => {
    const matchesSearch = scenario.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         scenario.author.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || scenario.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1>シナリオ管理</h1>
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              新規シナリオ
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <h1>シナリオ管理</h1>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-800">
                <Trash2 className="h-5 w-5" />
                <p>{error}</p>
              </div>
              <Button 
                onClick={loadScenarios} 
                className="mt-4"
                variant="outline"
              >
                再読み込み
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1>シナリオ管理</h1>
            <p className="text-muted-foreground">
              全{scenarios.length}本のシナリオ管理
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            新規シナリオ
          </Button>
        </div>

        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{scenarios.length}</p>
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
                  <p className="text-2xl font-bold">
                    {scenarios.filter(s => s.status === 'available').length}
                  </p>
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
                  <p className="text-2xl font-bold">
                    ¥{scenarios.reduce((sum, s) => sum + s.license_amount, 0).toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold">
                    {Math.round(scenarios.reduce((sum, s) => sum + (s.player_count_min + s.player_count_max) / 2, 0) / scenarios.length) || 0}
                  </p>
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
              placeholder="シナリオ名・作者で検索..."
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
              <option value="all">全ステータス</option>
              <option value="available">利用可能</option>
              <option value="maintenance">メンテナンス</option>
              <option value="retired">引退</option>
            </select>
          </div>
        </div>

        {/* シナリオ一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScenarios.map((scenario) => (
            <Card key={scenario.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="line-clamp-2">{scenario.title}</CardTitle>
                    <CardDescription>作者: {scenario.author}</CardDescription>
                  </div>
                  {getStatusBadge(scenario.status)}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* 基本情報 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">所要時間</p>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{scenario.duration}分</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">プレイヤー数</p>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{scenario.player_count_min}-{scenario.player_count_max}名</span>
                    </div>
                  </div>
                </div>

                {/* 難易度 */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">難易度</p>
                  <div className="flex items-center gap-1">
                    {getDifficultyStars(scenario.difficulty)}
                    <span className="ml-2 text-sm">({scenario.difficulty}/5)</span>
                  </div>
                </div>

                {/* ジャンル */}
                {scenario.genre && scenario.genre.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ジャンル</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {scenario.genre.map((g, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {g}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 料金情報 */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ライセンス料</p>
                    <p className="font-bold">¥{scenario.license_amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">参加費</p>
                    <p className="font-bold">¥{scenario.participation_fee.toLocaleString()}</p>
                  </div>
                </div>

                {/* 実績 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">公演回数</p>
                    <p className="font-bold">{scenario.play_count}回</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">評価</p>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <span className="font-bold">{scenario.rating || 0}</span>
                    </div>
                  </div>
                </div>

                {/* 説明 */}
                {scenario.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">説明</p>
                    <p className="text-sm line-clamp-2">{scenario.description}</p>
                  </div>
                )}

                {/* アクションボタン */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Edit className="h-4 w-4 mr-2" />
                    編集
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
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
  )
}
