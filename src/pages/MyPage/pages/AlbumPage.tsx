import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Images, Calendar, MapPin, Star, EyeOff, Users, Clock, User } from 'lucide-react'
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
  author?: string
}

interface LikedScenario {
  id: string
  scenario_id: string
  created_at: string
  scenario: {
    id: string
    title: string
    description: string
    author: string
    duration: number
    player_count_min: number
    player_count_max: number
    difficulty: number
    genre: string[]
    rating: number
    play_count: number
    key_visual_url?: string
  }
}

export function AlbumPage() {
  const { user } = useAuth()
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])
  const [likedScenariosList, setLikedScenariosList] = useState<LikedScenario[]>([])
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

      // いいねしたシナリオの詳細情報を取得
      const { data: likesData, error: likesError } = await supabase
        .from('scenario_likes')
        .select('id, scenario_id, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })

      if (!likesError && likesData && likesData.length > 0) {
        const scenarioIds = likesData.map(like => like.scenario_id)
        const { data: scenariosData, error: scenariosError } = await supabase
          .from('scenarios')
          .select('id, title, description, author, duration, player_count_min, player_count_max, difficulty, genre, rating, play_count, key_visual_url')
          .in('id', scenarioIds)

        if (!scenariosError && scenariosData) {
          const combined = likesData.map(like => {
            const scenario = scenariosData.find(s => s.id === like.scenario_id)
            return {
              id: like.id,
              scenario_id: like.scenario_id,
              created_at: like.created_at,
              scenario: scenario || {
                id: like.scenario_id,
                title: '不明',
                description: '',
                author: '',
                duration: 0,
                player_count_min: 0,
                player_count_max: 0,
                difficulty: 0,
                genre: [],
                rating: 0,
                play_count: 0,
              }
            }
          })
          setLikedScenariosList(combined)
        }
      } else {
        setLikedScenariosList([])
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

          // シナリオの画像と作者を取得
          let keyVisualUrl = null
          let author = null
          if (reservation.scenario_id) {
            const { data: scenarioData } = await supabase
              .from('scenarios')
              .select('key_visual_url, author')
              .eq('id', reservation.scenario_id)
              .maybeSingle()
            keyVisualUrl = scenarioData?.key_visual_url
            author = scenarioData?.author
          }

          if (!eventError && event) {
            scenarios.push({
              scenario: event.scenario,
              date: event.date,
              venue: event.venue,
              gms: event.gms || [],
              scenario_id: reservation.scenario_id || undefined,
              key_visual_url: keyVisualUrl,
              author: author || undefined,
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
              author: author || undefined,
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

  const cleanTitle = (title: string) => {
    // タイトルから日付部分を削除
    // 「 - 2025年11月6日(木)」のような形式を削除
    return title.replace(/\s*-\s*\d{4}年\d{1,2}月\d{1,2}日\([月火水木金土日]\)/g, '').trim()
  }

  const getDifficultyLabel = (difficulty: number) => {
    switch (difficulty) {
      case 1:
        return '初級'
      case 2:
        return '中級'
      case 3:
        return '上級'
      case 4:
        return '最上級'
      case 5:
        return '超上級'
      default:
        return '不明'
    }
  }

  const handleRemoveLike = async (likeId: string) => {
    if (!customerId) return

    try {
      const { error } = await supabase
        .from('scenario_likes')
        .delete()
        .eq('id', likeId)

      if (error) throw error

      // ローカルステートを更新
      setLikedScenariosList((prev) => prev.filter((item) => item.id !== likeId))
      const removed = likedScenariosList.find(item => item.id === likeId)
      if (removed) {
        setLikedScenarios(prev => {
          const newSet = new Set(prev)
          newSet.delete(removed.scenario_id)
          return newSet
        })
      }
    } catch (error) {
      logger.error('削除エラー:', error)
      alert('削除に失敗しました')
    }
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
      <Card className="shadow-none border">
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground text-sm">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="shadow-none border">
          <CardContent className="pt-4 sm:pt-6 text-center">
            <div className="text-lg text-primary">{playedScenarios.length}</div>
            <div className="text-xs text-muted-foreground mt-1">総プレイ回数</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border">
          <CardContent className="pt-4 sm:pt-6 text-center">
            <div className="text-lg text-primary">{scenarioGroups.length}</div>
            <div className="text-xs text-muted-foreground mt-1">プレイしたシナリオ</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border">
          <CardContent className="pt-4 sm:pt-6 text-center">
            <div className="text-lg text-primary">{likedScenariosList.length}</div>
            <div className="text-xs text-muted-foreground mt-1">いいねしたシナリオ</div>
          </CardContent>
        </Card>
      </div>

      {/* シナリオリスト */}
      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
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
                      <div className="flex items-start gap-3 sm:gap-4">
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
                          {/* タイトルとアクション */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex-1 min-w-0 pr-2">
                              <h3 className="text-base break-words">{cleanTitle(group.scenario)}</h3>
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
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
                          
                          {/* プレイ履歴 */}
                          <div className="space-y-1">
                            {group.plays.map((play, playIdx) => (
                              <div
                                key={playIdx}
                                className="bg-muted/30 px-2.5 py-1.5 rounded flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs"
                              >
                                {/* 日付 */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-foreground whitespace-nowrap">{formatDate(play.date)}</span>
                                </div>
                                
                                {/* 店舗 */}
                                <div className="flex items-center gap-1 min-w-0">
                                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-foreground truncate">{play.venue}</span>
                                </div>
                                
                                {/* 作者 */}
                                {play.author && (
                                  <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    <span className="whitespace-nowrap">{play.author}</span>
                                  </div>
                                )}
                                
                                {/* GM */}
                                {play.gms.length > 0 && (
                                  <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground">
                                    <span className="whitespace-nowrap">GM:</span>
                                    {play.gms.map((gm, gmIdx) => (
                                      <Badge key={gmIdx} variant="outline" className="text-xs whitespace-nowrap px-1 py-0">
                                        {gm}
                                      </Badge>
                                    ))}
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

      {/* いいねしたシナリオ */}
      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
            いいねしたシナリオ ({likedScenariosList.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {likedScenariosList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              いいねしたシナリオがありません
            </div>
          ) : (
            <div className="space-y-4">
              {likedScenariosList.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-3 sm:p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3 sm:gap-4 mb-3">
                    {/* シナリオ画像 */}
                    <div className="flex-shrink-0 w-12 sm:w-16 h-16 sm:h-20 bg-gray-200 rounded overflow-hidden">
                      {item.scenario.key_visual_url ? (
                        <OptimizedImage
                          src={item.scenario.key_visual_url}
                          alt={item.scenario.title}
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
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base mb-1 truncate">{item.scenario.title}</h3>
                          <p className="text-xs text-muted-foreground mb-2">
                            作者: {item.scenario.author}
                          </p>
                          {item.scenario.description && (
                            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                              {item.scenario.description}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveLike(item.id)}
                          className="hover:bg-red-50 h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0"
                          title="リストから削除"
                        >
                          <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm mb-3">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                          <span>
                            {item.scenario.player_count_min}〜{item.scenario.player_count_max}人
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                          <span>{item.scenario.duration}分</span>
                        </div>
                        {item.scenario.rating > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" />
                            <span>{item.scenario.rating.toFixed(1)}</span>
                          </div>
                        )}
                        <Badge variant="secondary" className="text-xs">{getDifficultyLabel(item.scenario.difficulty)}</Badge>
                      </div>

                      {item.scenario.genre && item.scenario.genre.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {item.scenario.genre.map((g, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {g}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        追加日: {formatDate(item.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 非表示にしたシナリオ */}
      {hiddenScenarios.size > 0 && (
        <Card className="shadow-none border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              非表示のシナリオ ({hiddenScenarios.size})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scenarioGroups
                .filter(group => hiddenScenarios.has(group.scenario))
                .map((group, idx) => {
                  const scenarioId = group.plays[0]?.scenario_id
                  const isLiked = scenarioId ? likedScenarios.has(scenarioId) : false

                  return (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg opacity-60">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm truncate">{group.scenario}</span>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {group.count}回プレイ
                        </Badge>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
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
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleHide(group.scenario)}
                          className="text-xs sm:text-sm flex-shrink-0"
                        >
                          表示する
                        </Button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
