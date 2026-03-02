import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type UnmatchedEvent = {
  id: string
  date: string
  scenario: string
  venue: string
  count: number
}

type Scenario = {
  id: string
  title: string
}

export function ScenarioMatcher() {
  const { user } = useAuth()
  const { organizationId } = useOrganization()
  const [unmatchedEvents, setUnmatchedEvents] = useState<UnmatchedEvent[]>([])
  const [allScenarios, setAllScenarios] = useState<Scenario[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMatches, setSelectedMatches] = useState<Record<string, string>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({})
  const [popoverSearchTerms, setPopoverSearchTerms] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) {
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    } else {
      loadUnmatchedEvents()
      loadAllScenarios()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const normalizeScenarioName = (name: string): string => {
    let normalized = name.trim()
    // 引用符を削除
    normalized = normalized.replace(/^["「『]/, '').replace(/["」』]$/, '')
    // 絵文字を削除
    normalized = normalized.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    // 募・貸・貸切・GMテストなどの接頭辞を削除
    normalized = normalized.replace(/^(募・|貸・|📕貸・|📗貸・|"募・|"貸・|GMテスト・|"GMテスト・)/g, '')
    // 先頭の引用符を再度削除
    normalized = normalized.replace(/^["「『]/, '')
    return normalized.trim()
  }

  const loadUnmatchedEvents = async () => {
    setIsLoading(true)
    try {
      // スケジュールイベントを取得（組織フィルタ付き）
      let eventsQuery = supabase
        .from('schedule_events')
        .select('id, date, scenario, venue')
        .not('scenario', 'is', null)
      
      if (organizationId) {
        eventsQuery = eventsQuery.eq('organization_id', organizationId)
      }
      
      const { data: events, error: eventsError } = await eventsQuery.order('date', { ascending: false })
      
      if (eventsError) throw eventsError
      
      // シナリオマスターを取得（組織フィルタ付き）
      let scenariosQuery = supabase
        .from('organization_scenarios_with_master')
        .select('title')
      
      if (organizationId) {
        scenariosQuery = scenariosQuery.eq('organization_id', organizationId)
      }
      
      const { data: scenarios, error: scenariosError } = await scenariosQuery
      
      if (scenariosError) throw scenariosError
      
      const scenarioTitles = new Set(scenarios?.map(s => s.title) || [])
      
      // マッチしないイベントをグループ化
      const unmatchedMap = new Map<string, UnmatchedEvent>()
      
      events?.forEach(event => {
        if (!event.scenario) return
        
        const normalized = normalizeScenarioName(event.scenario)
        
        // テストやミーティングはスキップ
        const skipKeywords = ['MTG', 'マネージャーミーティング', '打ち合わせ', '面接', '歯医者', '清掃', 'TOOLS', '箱開け会', 'パッケージ会', '打診', '風呂清掃', '練習', 'スタート', 'キット', '可能日']
        if (skipKeywords.some(keyword => normalized.includes(keyword))) return
        if (!normalized) return
        
        // マッチしないシナリオを集計
        if (!scenarioTitles.has(normalized)) {
          const key = normalized
          if (unmatchedMap.has(key)) {
            const existing = unmatchedMap.get(key)!
            existing.count++
          } else {
            unmatchedMap.set(key, {
              id: event.id,
              date: event.date,
              scenario: event.scenario,
              venue: event.venue,
              count: 1
            })
          }
        }
      })
      
      const unmatched = Array.from(unmatchedMap.values())
        .sort((a, b) => b.count - a.count)
      
      setUnmatchedEvents(unmatched)
    } catch (error) {
      logger.error('エラー:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadAllScenarios = async () => {
    try {
      let query = supabase
        .from('organization_scenarios_with_master')
        .select('id, title')
      
      if (organizationId) {
        query = query.eq('organization_id', organizationId)
      }
      
      const { data, error } = await query.order('title')
      
      if (error) throw error
      setAllScenarios(data || [])
    } catch (error) {
      logger.error('シナリオ取得エラー:', error)
    }
  }

  const handleSelectMatch = (eventScenario: string, scenarioId: string) => {
    setSelectedMatches(prev => ({
      ...prev,
      [eventScenario]: scenarioId
    }))
  }

  const applyMatches = async () => {
    setIsLoading(true)
    let successCount = 0
    let failedCount = 0
    
    try {
      for (const [eventScenario, scenarioId] of Object.entries(selectedMatches)) {
        const scenario = allScenarios.find(s => s.id === scenarioId)
        if (!scenario) continue
        
        // このイベントシナリオ名を持つすべてのイベントを更新
        const { error } = await supabase
          .from('schedule_events')
          .update({ 
            scenario: scenario.title,
            scenario_master_id: scenario.id  // scenario_master_id を設定
          })
          .eq('scenario', eventScenario)
        
        if (error) {
          logger.error('更新エラー:', error)
          failedCount++
        } else {
          successCount++
        }
      }
      
      showToast.success(`完了しました`, `成功: ${successCount}件、失敗: ${failedCount}件`)
      
      // リロード
      setSelectedMatches({})
      loadUnmatchedEvents()
    } catch (error) {
      showToast.error('エラーが発生しました')
      logger.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredEvents = unmatchedEvents.filter(event => 
    event.scenario.toLowerCase().includes(searchTerm.toLowerCase()) ||
    normalizeScenarioName(event.scenario).toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <Card className="p-8">
            <p className="text-red-600">⚠️ このツールを使用するにはログインが必要です。</p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <Card className="p-8">
          <h1 className="text-lg mb-4">🔗 シナリオマッチングツール</h1>
          <p className="text-gray-600 mb-6">
            スケジュール上のシナリオ名と、登録済みシナリオをマッチングします。
          </p>
          
          <div className="mb-6">
            <Input
              placeholder="シナリオ名で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">読み込み中...</p>
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-gray-600">
                未マッチ: {filteredEvents.length}件
              </div>

              <div className="space-y-4 mb-6 max-h-[600px] overflow-y-auto">
                {filteredEvents.map((event) => {
                  const normalized = normalizeScenarioName(event.scenario)
                  return (
                    <Card key={event.scenario} className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div>
                          <div className="font-mono text-sm text-gray-500 mb-1">
                            元の名前: {event.scenario}
                          </div>
                          <div className="text-lg mb-1">
                            正規化後: {normalized}
                          </div>
                          <div className="text-sm text-gray-500">
                            出現回数: {event.count}件 | 最新: {event.date} {event.venue}
                          </div>
                        </div>
                        
                        <div>
                          <Popover 
                            open={openPopovers[event.scenario] || false} 
                            onOpenChange={(open) => setOpenPopovers(prev => ({ ...prev, [event.scenario]: open }))}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openPopovers[event.scenario] || false}
                                className="w-full justify-between"
                              >
                                {selectedMatches[event.scenario]
                                  ? allScenarios.find(s => s.id === selectedMatches[event.scenario])?.title
                                  : "マッチするシナリオを選択..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0" align="start">
                              <div className="flex flex-col">
                                <div className="border-b p-2">
                                  <Input
                                    placeholder="シナリオを検索..."
                                    value={popoverSearchTerms[event.scenario] || ''}
                                    onChange={(e) => setPopoverSearchTerms(prev => ({ ...prev, [event.scenario]: e.target.value }))}
                                    className="h-9"
                                  />
                                </div>
                                <div className="max-h-[300px] overflow-auto p-1">
                                  {allScenarios
                                    .filter(s => {
                                      const searchTerm = popoverSearchTerms[event.scenario] || ''
                                      return s.title.toLowerCase().includes(searchTerm.toLowerCase())
                                    })
                                    .map((scenario) => {
                                      const isSelected = selectedMatches[event.scenario] === scenario.id
                                      return (
                                        <div
                                          key={scenario.id}
                                          onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            logger.log('Clicked:', scenario.title, scenario.id)
                                            handleSelectMatch(event.scenario, scenario.id)
                                            setOpenPopovers(prev => ({ ...prev, [event.scenario]: false }))
                                            setPopoverSearchTerms(prev => ({ ...prev, [event.scenario]: '' }))
                                          }}
                                          className={cn(
                                            "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                            isSelected && "bg-accent"
                                          )}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              isSelected ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          {scenario.title}
                                        </div>
                                      )
                                    })}
                                  {allScenarios.filter(s => {
                                    const searchTerm = popoverSearchTerms[event.scenario] || ''
                                    return s.title.toLowerCase().includes(searchTerm.toLowerCase())
                                  }).length === 0 && (
                                    <div className="py-6 text-center text-sm text-gray-500">
                                      シナリオが見つかりません
                                    </div>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>

              {Object.keys(selectedMatches).length > 0 && (
                <div className="flex gap-4 items-center">
                  <Button 
                    onClick={applyMatches} 
                    disabled={isLoading}
                    size="lg"
                  >
                    {Object.keys(selectedMatches).length}件のマッチングを適用
                  </Button>
                  <Button 
                    onClick={() => setSelectedMatches({})} 
                    variant="outline"
                    disabled={isLoading}
                  >
                    クリア
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

