import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Images, Calendar, MapPin, Star, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  gms: string[]
  scenario_id?: string
  key_visual_url?: string
}

export function AlbumPage() {
  const { user } = useAuth()
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])
  const [hiddenScenarios, setHiddenScenarios] = useState<Set<string>>(new Set())
  const [likedScenarios, setLikedScenarios] = useState<Set<string>>(new Set())
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      fetchPlayedScenarios()
    }
  }, [user])

  const fetchPlayedScenarios = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, name')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) {
        logger.log('顧客情報が見つかりません:', user.email)
        setPlayedScenarios([])
        setLoading(false)
        return
      }

      logger.log('取得した顧客情報:', customer)
      setCustomerId(customer.id)

      // いいね済みシナリオを取得
      const { data: likes } = await supabase
        .from('scenario_likes')
        .select('scenario_id')
        .eq('customer_id', customer.id)

      if (likes) {
        setLikedScenarios(new Set(likes.map(l => l.scenario_id)))
      }

      // 予約を取得
      const { data: reservations, error: reservationsError } = await supabase
        .from('reservations')
        .select('requested_datetime, title, scenario_id')
        .eq('customer_id', customer.id)
        .eq('status', 'confirmed')
        .lte('requested_datetime', new Date().toISOString())
        .order('requested_datetime', { ascending: false })

      if (reservationsError) throw reservationsError
      
      logger.log('取得した予約データ:', reservations)

      // 予約から日時とタイトルを取得し、スケジュールイベントと照合
      const scenarios: PlayedScenario[] = []
      
      if (reservations) {
        for (const reservation of reservations) {
          const reservationDate = new Date(reservation.requested_datetime)
          const dateStr = reservationDate.toISOString().split('T')[0]
          
          // スケジュールイベントを検索
          const { data: event, error: eventError } = await supabase
            .from('schedule_events')
            .select('scenario, date, venue, gms')
            .eq('date', dateStr)
            .eq('scenario', reservation.title)
            .maybeSingle()

          // シナリオの画像を取得
          let keyVisualUrl = null
          if (reservation.scenario_id) {
            const { data: scenarioData } = await supabase
              .from('scenarios')
              .select('key_visual_url')
              .eq('id', reservation.scenario_id)
              .maybeSingle()
            keyVisualUrl = scenarioData?.key_visual_url
          }

          if (!eventError && event) {
            scenarios.push({
              scenario: event.scenario,
              date: event.date,
              venue: event.venue,
              gms: event.gms || [],
              scenario_id: reservation.scenario_id || undefined,
              key_visual_url: keyVisualUrl,
            })
          } else {
            // イベントが見つからない場合でも予約情報から追加
            scenarios.push({
              scenario: reservation.title,
              date: dateStr,
              venue: '店舗不明',
              gms: [],
              scenario_id: reservation.scenario_id || undefined,
              key_visual_url: keyVisualUrl,
            })
          }
        }
      }

      setPlayedScenarios(scenarios)
    } catch (error) {
      logger.error('プレイ済みシナリオ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  const handleToggleLike = async (scenarioId: string | undefined) => {
    if (!scenarioId || !customerId) return

    try {
      if (likedScenarios.has(scenarioId)) {
        // いいね解除
        const { error } = await supabase
          .from('scenario_likes')
          .delete()
          .eq('customer_id', customerId)
          .eq('scenario_id', scenarioId)

        if (error) throw error
        setLikedScenarios(prev => {
          const newSet = new Set(prev)
          newSet.delete(scenarioId)
          return newSet
        })
      } else {
        // いいね追加
        const { error } = await supabase
          .from('scenario_likes')
          .insert({
            customer_id: customerId,
            scenario_id: scenarioId,
          })

        if (error) throw error
        setLikedScenarios(prev => new Set(prev).add(scenarioId))
      }
    } catch (error) {
      logger.error('いいね切り替えエラー:', error)
      alert('操作に失敗しました')
    }
  }

  const handleToggleHide = (scenarioName: string) => {
    setHiddenScenarios(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scenarioName)) {
        newSet.delete(scenarioName)
      } else {
        newSet.add(scenarioName)
      }
      return newSet
    })
  }

  // シナリオごとにグループ化
  const scenarioGroups = playedScenarios.reduce((acc, item) => {
    const existing = acc.find((g) => g.scenario === item.scenario)
    if (existing) {
      existing.plays.push(item)
      existing.count++
    } else {
      acc.push({
        scenario: item.scenario,
        count: 1,
        plays: [item],
      })
    }
    return acc
  }, [] as Array<{ scenario: string; count: number; plays: PlayedScenario[] }>)

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground text-sm">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 統計 */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card>
          <CardContent className="pt-4 sm:pt-6 text-center">
            <div className="text-base sm:text-lg font-bold text-primary">{playedScenarios.length}</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">総プレイ回数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 sm:pt-6 text-center">
            <div className="text-base sm:text-lg font-bold text-primary">{scenarioGroups.length}</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">プレイしたシナリオ</div>
          </CardContent>
        </Card>
      </div>

      {/* シナリオリスト */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <Images className="h-4 w-4 sm:h-5 sm:w-5" />
            アルバム
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scenarioGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              プレイ履歴がありません
            </div>
          ) : (
            <div className="space-y-4">
              {scenarioGroups
                .filter(group => !hiddenScenarios.has(group.scenario))
                .map((group, idx) => {
                  const scenarioId = group.plays[0]?.scenario_id
                  const isLiked = scenarioId ? likedScenarios.has(scenarioId) : false

                  return (
                    <div key={idx} className="border rounded-lg p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start gap-3 sm:gap-4 mb-3">
                        {/* シナリオ画像 */}
                        <div className="flex-shrink-0 w-12 sm:w-16 h-16 sm:h-20 bg-gray-200 rounded overflow-hidden">
                          {group.plays[0]?.key_visual_url ? (
                            <OptimizedImage
                              src={group.plays[0].key_visual_url}
                              alt={group.scenario}
                              className="w-full h-full object-cover"
                              responsive={true}
                              srcSetSizes={[48, 64, 128]}
                              breakpoints={{ mobile: 48, tablet: 64, desktop: 128 }}
                              useWebP={true}
                              quality={85}
                              fallback={
                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                  No Image
                                </div>
                              }
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                              No Image
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <h3 className="font-bold text-sm sm:text-base md:text-lg truncate">{group.scenario}</h3>
                              <Badge variant="secondary" className="text-xs sm:text-sm flex-shrink-0">
                                {group.count}回プレイ
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleLike(scenarioId)}
                                className="hover:bg-yellow-50 h-8 w-8 sm:h-9 sm:w-9"
                                title={isLiked ? '遊びたいリストから削除' : '遊びたいリストに追加'}
                              >
                                <Star className={`h-4 w-4 sm:h-5 sm:w-5 ${isLiked ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleHide(group.scenario)}
                                className="hover:bg-gray-50 h-8 w-8 sm:h-9 sm:w-9"
                                title="非表示にする"
                              >
                                <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {group.plays.map((play, playIdx) => (
                              <div
                                key={playIdx}
                                className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground bg-muted/30 p-2 rounded"
                              >
                                <div className="flex items-center gap-1 sm:gap-2">
                                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                  <span>{formatDate(play.date)}</span>
                                </div>
                                <div className="flex items-center gap-1 sm:gap-2">
                                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                  <span className="truncate">{play.venue}</span>
                                </div>
                                {play.gms.length > 0 && (
                                  <div className="flex items-center gap-1 sm:gap-2">
                                    <span className="text-xs">GM:</span>
                                    <div className="flex gap-1 flex-wrap">
                                      {play.gms.map((gm, gmIdx) => (
                                        <Badge key={gmIdx} variant="outline" className="text-xs">
                                          {gm}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 非表示にしたシナリオ */}
      {hiddenScenarios.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
              <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              非表示のシナリオ ({hiddenScenarios.size})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from(hiddenScenarios).map((scenarioName, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg opacity-60">
                  <span className="font-medium text-sm truncate">{scenarioName}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleHide(scenarioName)}
                    className="text-xs sm:text-sm flex-shrink-0 ml-2"
                  >
                    表示する
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
