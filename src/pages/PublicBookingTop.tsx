import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Search, Calendar, Clock, Users, MapPin } from 'lucide-react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import type { PublicScenarioEvent } from '@/types'

interface ScenarioCard {
  scenario_id: string
  scenario_title: string
  key_visual_url?: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  genre: string[]
  next_event_date?: string
  next_event_time?: string
  store_name?: string
  store_color?: string
  available_seats?: number
  status: 'available' | 'few_seats' | 'sold_out' | 'private_booking'
  is_new?: boolean
}

interface PublicBookingTopProps {
  onScenarioSelect?: (scenarioId: string) => void
}

export function PublicBookingTop({ onScenarioSelect }: PublicBookingTopProps) {
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadScenarios()
  }, [])

  const loadScenarios = async () => {
    try {
      setIsLoading(true)
      
      // シナリオと公演データを取得
      const scenariosData = await scenarioApi.getAll()
      const storesData = await storeApi.getAll()
      
      console.log('シナリオ数:', scenariosData.length)
      console.log('店舗数:', storesData.length)
      
      // 現在の月から3ヶ月先までの公演を取得
      const currentDate = new Date()
      const allEvents: any[] = []
      
      for (let i = 0; i < 3; i++) {
        const targetDate = new Date(currentDate)
        targetDate.setMonth(currentDate.getMonth() + i)
        
        const year = targetDate.getFullYear()
        const month = targetDate.getMonth() + 1
        
        const events = await scheduleApi.getByMonth(year, month)
        allEvents.push(...events)
      }
      
      console.log('取得した公演数:', allEvents.length)
      
      // 予約可能な公演のみフィルタリング（is_reservation_enabledがない場合はcategoryで判定）
      const publicEvents = allEvents.filter((event: any) => {
        const isEnabled = event.is_reservation_enabled !== false // undefinedの場合はtrue扱い
        const isNotCancelled = !event.is_cancelled
        const isOpen = event.category === 'open'
        return isEnabled && isNotCancelled && isOpen
      })
      
      console.log('予約可能な公演数:', publicEvents.length)
      
      // シナリオごとにグループ化
      const scenarioMap = new Map<string, ScenarioCard>()
      
      scenariosData.forEach((scenario: any) => {
        // ステータスがavailableでないシナリオはスキップ
        if (scenario.status !== 'available') return
        
        // このシナリオの公演を探す（scenario_idまたはタイトルで照合）
        const scenarioEvents = publicEvents.filter((event: any) => {
          // scenario_idで照合（リレーション）
          if (event.scenario_id === scenario.id) return true
          // scenariosオブジェクトのIDで照合
          if (event.scenarios?.id === scenario.id) return true
          // タイトルで照合（フォールバック）
          if (event.scenario === scenario.title) return true
          return false
        })
        
        console.log(`シナリオ「${scenario.title}」の公演数:`, scenarioEvents.length)
        
        // 新着判定（リリース日から30日以内）
        const isNew = scenario.release_date ? 
          (new Date().getTime() - new Date(scenario.release_date).getTime()) / (1000 * 60 * 60 * 24) <= 30 : 
          false
        
        // 公演がある場合
        if (scenarioEvents.length > 0) {
          // 最も近い公演を取得
          const nextEvent = scenarioEvents.sort((a: any, b: any) => {
            const dateCompare = a.date.localeCompare(b.date)
            if (dateCompare !== 0) return dateCompare
            return a.start_time.localeCompare(b.start_time)
          })[0]
          
          const store = storesData.find((s: any) => s.id === nextEvent.venue || s.short_name === nextEvent.venue)
          
          scenarioMap.set(scenario.id, {
            scenario_id: scenario.id,
            scenario_title: scenario.title,
            key_visual_url: scenario.key_visual_url,
            author: scenario.author,
            duration: scenario.duration,
            player_count_min: scenario.player_count_min,
            player_count_max: scenario.player_count_max,
            genre: scenario.genre || [],
            next_event_date: nextEvent.date,
            next_event_time: nextEvent.start_time,
            store_name: store?.name || nextEvent.venue,
            store_color: store?.color,
            available_seats: (nextEvent.max_participants || 8) - (nextEvent.current_participants || 0),
            status: getAvailabilityStatus(nextEvent.max_participants || 8, nextEvent.current_participants || 0),
            is_new: isNew
          })
        } else {
          // 公演がない場合でも、全タイトル用にシナリオ情報を追加
          scenarioMap.set(scenario.id, {
            scenario_id: scenario.id,
            scenario_title: scenario.title,
            key_visual_url: scenario.key_visual_url,
            author: scenario.author,
            duration: scenario.duration,
            player_count_min: scenario.player_count_min,
            player_count_max: scenario.player_count_max,
            genre: scenario.genre || [],
            status: 'private_booking', // 公演予定なしは「貸切受付中」
            is_new: isNew
          })
        }
      })
      
      const scenarioList = Array.from(scenarioMap.values())
      console.log('最終的なシナリオ数:', scenarioList.length)
      
      setScenarios(scenarioList)
      
      // デバッグ: データがない場合の警告
      if (scenarioList.length === 0) {
        console.warn('⚠️ 表示可能なシナリオがありません')
        console.warn('原因の可能性:')
        console.warn('1. シナリオデータが登録されていない')
        console.warn('2. 予約可能な公演（category=open）が登録されていない')
        console.warn('3. is_reservation_enabledがfalseになっている')
        console.warn('4. シナリオと公演の紐付けが正しくない')
      }
    } catch (error) {
      console.error('データの読み込みエラー:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getAvailabilityStatus = (max: number, current: number): 'available' | 'few_seats' | 'sold_out' => {
    const available = max - current
    if (available === 0) return 'sold_out'
    if (available <= 2) return 'few_seats'
    return 'available'
  }

  // 検索フィルター
  const getFilteredScenarios = () => {
    if (!searchTerm) return scenarios
    
    return scenarios.filter(s =>
      s.scenario_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.genre.some(g => g.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }

  // 新着公演（リリース日から30日以内）
  const getNewScenarios = () => {
    const filtered = getFilteredScenarios()
    return filtered.filter(s => s.is_new)
  }

  // 直近公演（7日以内）
  const getUpcomingScenarios = () => {
    const filtered = getFilteredScenarios()
    const weekLater = new Date()
    weekLater.setDate(weekLater.getDate() + 7)
    return filtered.filter(s => {
      if (!s.next_event_date) return false
      const eventDate = new Date(s.next_event_date)
      return eventDate <= weekLater
    })
  }

  // 全タイトル
  const getAllScenarios = () => {
    return getFilteredScenarios()
  }

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const handleCardClick = (scenarioId: string) => {
    if (onScenarioSelect) {
      onScenarioSelect(scenarioId)
    } else {
      console.log('シナリオ詳細へ:', scenarioId)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sold_out':
        return <Badge variant="outline" className="bg-gray-500 text-white border-0 text-xs px-1.5 py-0 rounded-sm">完売</Badge>
      case 'few_seats':
        return <Badge variant="outline" className="bg-orange-500 text-white border-0 text-xs px-1.5 py-0 rounded-sm">残りわずか</Badge>
      case 'private_booking':
        return <Badge variant="outline" className="bg-purple-600 text-white border-0 text-xs px-1.5 py-0 rounded-sm">貸切受付中</Badge>
      default:
        return <Badge variant="outline" className="bg-green-600 text-white border-0 text-xs px-1.5 py-0 rounded-sm">発売中</Badge>
    }
  }

  // シナリオカードコンポーネント
  const ScenarioCard = ({ scenario, onClick }: { scenario: ScenarioCard; onClick: (id: string) => void }) => (
    <Card
      className="cursor-pointer hover:shadow-xl transition-all duration-300 overflow-hidden group flex flex-col"
      onClick={() => onClick(scenario.scenario_id)}
    >
      <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
        {scenario.key_visual_url ? (
          <img
            src={scenario.key_visual_url}
            alt={scenario.scenario_title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <div className="text-center p-4">
              <p className="font-bold text-lg">{scenario.scenario_title}</p>
            </div>
          </div>
        )}
        {/* NEW バッジ */}
        {scenario.is_new && (
          <div className="absolute top-1.5 left-1.5">
            <Badge className="bg-red-600 text-white border-0 font-bold text-xs px-1.5 py-0 rounded-sm">NEW</Badge>
          </div>
        )}
      </div>
      
      <CardContent className="p-1 flex-1 flex flex-col">
        <div className="text-xs text-muted-foreground">{scenario.author}</div>
        <h3 className="font-bold text-sm line-clamp-2 mb-0.5">
          {scenario.scenario_title}
        </h3>
        
        {/* アイコン情報 */}
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground mb-1">
          <div className="flex items-center gap-0.5">
            <Users className="w-3 h-3" />
            <span>{scenario.player_count_min}〜{scenario.player_count_max}人</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            <span>{(scenario.duration / 60).toFixed(1)}h</span>
          </div>
        </div>
        
        {scenario.store_name && (
          <div className="flex items-center gap-0.5 text-xs mb-1">
            <MapPin className="w-3 h-3" />
            <span className="font-medium" style={{ color: scenario.store_color }}>
              {scenario.store_name}
            </span>
          </div>
        )}
        
        {scenario.next_event_date && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground mb-1">
            <Calendar className="w-3 h-3" />
            <span>次回: {formatDate(scenario.next_event_date)}</span>
          </div>
        )}
        
        {scenario.genre.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {scenario.genre.slice(0, 2).map((g, i) => (
              <Badge key={i} variant="outline" className="text-xs px-1.5 py-0 rounded-sm">
                {g}
              </Badge>
            ))}
          </div>
        )}
        
        {/* ステータスバッジ - カードの一番下 */}
        <div className="mt-auto pt-1">
          {getStatusBadge(scenario.status)}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* メインビジュアル */}
      <div className="relative bg-gradient-to-r from-purple-900 via-blue-900 to-teal-900 text-white py-12">
        <div className="container mx-auto max-w-7xl px-6 text-center">
          <h1 className="text-4xl font-bold mb-2">今日はどの事件を解く？</h1>
          <p className="text-lg opacity-90">真実を追い求めるあなたのためのマーダーミステリーポータルサイト</p>
        </div>
      </div>

      {/* 検索バー */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto max-w-7xl px-6 py-3">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              placeholder="シナリオ名、作者、ジャンルで検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 新着公演セクション */}
            {getNewScenarios().length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <span>新着公演</span>
                  <Badge className="bg-red-600 text-white border-0 text-xs px-2 py-0.5 rounded-sm">NEW</Badge>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {getNewScenarios().map((scenario) => (
                    <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleCardClick} />
                  ))}
                </div>
              </section>
            )}

            {/* 直近公演セクション */}
            {getUpcomingScenarios().length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">直近公演</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {getUpcomingScenarios().map((scenario) => (
                    <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleCardClick} />
                  ))}
                </div>
              </section>
            )}

            {/* 全タイトルセクション */}
            {getAllScenarios().length > 0 ? (
              <section>
                <h2 className="text-2xl font-bold mb-4">全タイトル</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {getAllScenarios().map((scenario) => (
                    <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleCardClick} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">シナリオが見つかりませんでした</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
