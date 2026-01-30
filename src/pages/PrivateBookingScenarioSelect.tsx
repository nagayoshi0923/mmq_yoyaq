import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Header } from '@/components/layout/Header'
import { ArrowLeft, Search } from 'lucide-react'
import { scenarioApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { BookingNotice } from './ScenarioDetailPage/components/BookingNotice'

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
  participation_fee?: number
}

interface PrivateBookingScenarioSelectProps {
  organizationSlug?: string
}

export function PrivateBookingScenarioSelect({ organizationSlug }: PrivateBookingScenarioSelectProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedParticipantCount, setSelectedParticipantCount] = useState<number | null>(null)

  // シナリオをフィルタリング（タイトル・作者で検索）
  const filteredScenarios = useMemo(() => {
    if (!searchTerm) return scenarios
    const term = searchTerm.toLowerCase()
    return scenarios.filter(s => 
      s.title.toLowerCase().includes(term) ||
      s.author.toLowerCase().includes(term)
    )
  }, [scenarios, searchTerm])
  
  // URLパラメータから日付、店舗、時間帯を取得（パスベース）
  const urlParams = new URLSearchParams(window.location.search)
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
      showToast.warning('シナリオを選択してください')
      return
    }
    
    // 貸切リクエスト確認ページへ遷移（組織slugがあれば予約サイト形式）
    const basePath = organizationSlug ? `/${organizationSlug}` : ''
    window.location.href = `${basePath}/private-booking-request?scenario=${selectedScenarioId}&date=${preselectedDate}&store=${preselectedStore}&slot=${preselectedSlot}`
  }

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 戻るボタン */}
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-6 transition-colors"
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
              <div className="text-xs text-muted-foreground">
                <p>日付: {preselectedDate}</p>
                <p>時間帯: {slotLabels[preselectedSlot] || preselectedSlot}</p>
              </div>
            </div>

            {/* シナリオ検索・選択 */}
            <div className="space-y-3">
              <label className="text-sm">シナリオを選択してください</label>
              
              {/* 検索ボックス */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="タイトルまたは作者で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* シナリオ選択 */}
              <Select value={selectedScenarioId} onValueChange={(id) => {
                setSelectedScenarioId(id)
                // 選択時に人数をリセット
                setSelectedParticipantCount(null)
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="シナリオを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {loading ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      読み込み中...
                    </div>
                  ) : filteredScenarios.length === 0 ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      {searchTerm ? '該当するシナリオがありません' : 'シナリオがありません'}
                    </div>
                  ) : (
                    filteredScenarios.map((scenario) => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.title} - {scenario.author} ({scenario.duration}分)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {filteredScenarios.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {searchTerm ? `${filteredScenarios.length}件のシナリオが見つかりました` : `全${scenarios.length}件`}
                </p>
              )}
            </div>

            {/* 選択されたシナリオの詳細 */}
            {selectedScenarioId && (() => {
              const scenario = scenarios.find(s => s.id === selectedScenarioId)
              if (!scenario) return null
              
              const participationFee = scenario.participation_fee || 0
              const isVariablePlayerCount = scenario.player_count_min !== scenario.player_count_max
              // 可変人数の場合は選択された人数、固定の場合は最大人数を使用
              const participantCount = selectedParticipantCount || scenario.player_count_max
              const totalPrice = participationFee * participantCount
              
              return (
                <>
                  <div className="border rounded-lg overflow-hidden bg-card">
                    <div className="flex gap-4 p-4">
                      {/* キービジュアル（左側・コンパクト） */}
                      {scenario.key_visual_url && (
                        <div className="flex-shrink-0 w-24 h-32 bg-gradient-to-br from-gray-200 to-gray-300 rounded overflow-hidden">
                          <OptimizedImage
                            src={scenario.key_visual_url}
                            alt={scenario.title}
                            className="w-full h-full object-cover"
                            responsive={false}
                            useWebP={true}
                            quality={80}
                          />
                        </div>
                      )}
                      
                      {/* シナリオ情報（右側） */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <h3 className="text-base font-medium mb-0.5">{scenario.title}</h3>
                          <p className="text-xs text-muted-foreground">作者: {scenario.author}</p>
                        </div>
                        
                        {/* 基本情報 */}
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">所要時間: </span>
                            <span>{scenario.duration}分</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">人数: </span>
                            <span>
                              {scenario.player_count_min === scenario.player_count_max
                                ? `${scenario.player_count_max}名`
                                : `${scenario.player_count_min}〜${scenario.player_count_max}名`}
                            </span>
                          </div>
                        </div>
                        
                        {/* ジャンル */}
                        {scenario.genre && scenario.genre.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {scenario.genre.map((g, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 text-xs bg-muted rounded"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* あらすじ（下部） */}
                    {scenario.synopsis && (
                      <div className="px-4 pb-4 pt-0">
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                          {scenario.synopsis}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 人数選択（可変人数シナリオの場合） */}
                  {isVariablePlayerCount && (
                    <div className="border rounded-lg p-4 space-y-2">
                      <h3 className="text-sm font-medium">参加人数を選択</h3>
                      <Select 
                        value={participantCount.toString()} 
                        onValueChange={(val) => setSelectedParticipantCount(parseInt(val))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="人数を選択..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: scenario.player_count_max - scenario.player_count_min + 1 },
                            (_, i) => scenario.player_count_min + i
                          ).map((count) => (
                            <SelectItem key={count} value={count.toString()}>
                              {count}名
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        このシナリオは{scenario.player_count_min}〜{scenario.player_count_max}名でプレイ可能です
                      </p>
                    </div>
                  )}

                  {/* 料金情報 */}
                  <div className="border rounded-lg bg-purple-50 p-4 space-y-2">
                    <h3 className="text-sm font-medium text-purple-800">料金（目安）</h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">参加費（1名）</span>
                        <span>¥{participationFee.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">貸切人数</span>
                        <span>{participantCount}名</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-purple-200">
                        <span className="font-medium">合計（目安）</span>
                        <span className="text-purple-600 font-bold">¥{totalPrice.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ※ 実際の料金は店舗との調整により変動する場合があります
                    </p>
                  </div>
                </>
              )
            })()}

            {/* 注意事項（DBから取得） */}
            <BookingNotice
              reservationDeadlineHours={0}
              hasPreReading={false}
              mode="private"
              storeId={preselectedStore || null}
            />

            {/* 確認ボタン */}
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleProceed}
              disabled={!selectedScenarioId || loading}
            >
              貸切リクエスト確認へ
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

