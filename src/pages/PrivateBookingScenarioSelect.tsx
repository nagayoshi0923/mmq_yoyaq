import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Header } from '@/components/layout/Header'
import { ArrowLeft } from 'lucide-react'
import { scenarioApi } from '@/lib/api'
import { logger } from '@/utils/logger'

interface Scenario {
  id: string
  title: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  key_visual_url?: string
  synopsis?: string
  genre?: string[]
}

export function PrivateBookingScenarioSelect() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  
  // URLパラメータから日付、店舗、時間帯を取得
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const preselectedDate = urlParams.get('date') || ''
  const preselectedStore = urlParams.get('store') || ''
  const preselectedSlot = urlParams.get('slot') || ''
  
  const slotLabels: { [key: string]: string } = {
    morning: '午前',
    afternoon: '午後',
    evening: '夜間'
  }

  useEffect(() => {
    loadScenarios()
  }, [])

  const loadScenarios = async () => {
    try {
      setLoading(true)
      const data = await scenarioApi.getAll()
      setScenarios(data)
    } catch (error) {
      logger.error('シナリオの読み込みエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleProceed = () => {
    if (!selectedScenarioId) {
      alert('シナリオを選択してください')
      return
    }
    
    // 貸切リクエスト確認ページへ遷移
    window.location.hash = `#private-booking-request?scenario=${selectedScenarioId}&date=${preselectedDate}&store=${preselectedStore}&slot=${preselectedSlot}`
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 戻るボタン */}
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </button>

        <Card>
          <CardHeader>
            <CardTitle>貸切リクエスト - シナリオを選択</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 選択された日時情報 */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h3 className="text-sm">選択された日時</h3>
              <div className="text-sm text-muted-foreground">
                <p>日付: {preselectedDate}</p>
                <p>時間帯: {slotLabels[preselectedSlot] || preselectedSlot}</p>
              </div>
            </div>

            {/* シナリオ選択 */}
            <div className="space-y-2">
              <label className="text-sm">シナリオを選択してください</label>
              <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
                <SelectTrigger>
                  <SelectValue placeholder="シナリオを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {loading ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      読み込み中...
                    </div>
                  ) : scenarios.length === 0 ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      シナリオがありません
                    </div>
                  ) : (
                    scenarios.map((scenario) => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.title} - {scenario.author} ({scenario.duration}分)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 選択されたシナリオの詳細 */}
            {selectedScenarioId && (() => {
              const scenario = scenarios.find(s => s.id === selectedScenarioId)
              if (!scenario) return null
              
              return (
                <div className="border rounded-lg overflow-hidden bg-card">
                  {/* キービジュアル */}
                  {scenario.key_visual_url && (
                    <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
                      <OptimizedImage
                        src={scenario.key_visual_url}
                        alt={scenario.title}
                        className="w-full h-full object-cover"
                        responsive={true}
                        srcSetSizes={[400, 800, 1200]}
                        breakpoints={{ mobile: 400, tablet: 600, desktop: 800 }}
                        useWebP={true}
                        quality={85}
                      />
                    </div>
                  )}
                  
                  {/* シナリオ情報 */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="text-lg mb-1">{scenario.title}</h3>
                      <p className="text-sm text-muted-foreground">作者: {scenario.author}</p>
                    </div>
                    
                    {/* あらすじ */}
                    {scenario.synopsis && (
                      <div>
                        <h4 className="text-sm mb-1">あらすじ</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {scenario.synopsis}
                        </p>
                      </div>
                    )}
                    
                    {/* 基本情報 */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div>
                        <div className="text-xs text-muted-foreground">所要時間</div>
                        <div className="text-sm">{(scenario.duration / 60).toFixed(1)}時間</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">推奨人数</div>
                        <div className="text-sm">{scenario.player_count_min}〜{scenario.player_count_max}名</div>
                      </div>
                    </div>
                    
                    {/* ジャンル */}
                    {scenario.genre && scenario.genre.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-2">
                        {scenario.genre.map((g, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 text-xs bg-muted rounded-md"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 確認ボタン */}
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleProceed}
              disabled={!selectedScenarioId || loading}
            >
              貸切リクエストを続ける
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

