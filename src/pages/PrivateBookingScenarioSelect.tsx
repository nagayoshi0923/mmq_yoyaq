import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { ArrowLeft } from 'lucide-react'
import { scenarioApi } from '@/lib/api'

interface Scenario {
  id: string
  title: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  key_visual_url?: string
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
      console.error('シナリオの読み込みエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleProceed = () => {
    if (!selectedScenarioId) {
      alert('シナリオを選択してください')
      return
    }
    
    // シナリオ詳細ページの貸切リクエストタブへ遷移
    window.location.hash = `customer-booking/scenario/${selectedScenarioId}?tab=private&date=${preselectedDate}&store=${preselectedStore}&slot=${preselectedSlot}`
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
              <h3 className="font-semibold text-sm">選択された日時</h3>
              <div className="text-sm text-muted-foreground">
                <p>日付: {preselectedDate}</p>
                <p>時間帯: {slotLabels[preselectedSlot] || preselectedSlot}</p>
              </div>
            </div>

            {/* シナリオ選択 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">シナリオを選択してください</label>
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
            {selectedScenarioId && (
              <div className="bg-muted/30 p-4 rounded-lg space-y-2">
                {(() => {
                  const scenario = scenarios.find(s => s.id === selectedScenarioId)
                  if (!scenario) return null
                  
                  return (
                    <>
                      <h3 className="font-semibold">{scenario.title}</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>作者: {scenario.author}</div>
                        <div>所要時間: {scenario.duration}分</div>
                        <div>人数: {scenario.player_count_min}-{scenario.player_count_max}名</div>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

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

