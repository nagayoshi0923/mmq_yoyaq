import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Images, Calendar, MapPin, Star, EyeOff, Users, Clock, User, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface ScenarioOption {
  id: string
  title: string
}

interface StoreOption {
  id: string
  name: string
}

interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  gms: string[]
  scenario_id?: string
  key_visual_url?: string
  author?: string
  is_manual?: boolean  // 手動登録かどうか
  manual_id?: string   // manual_play_historyのID
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
  const { organizationId } = useOrganization()
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])
  const [likedScenariosList, setLikedScenariosList] = useState<LikedScenario[]>([])
  const [hiddenScenarios, setHiddenScenarios] = useState<Set<string>>(new Set())
  const [likedScenarios, setLikedScenarios] = useState<Set<string>>(new Set())
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  // 手動登録用ステート
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newScenarioId, setNewScenarioId] = useState('')
  const [newPlayedAt, setNewPlayedAt] = useState('')
  const [newStoreId, setNewStoreId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // 選択肢用データ
  const [scenarioOptions, setScenarioOptions] = useState<ScenarioOption[]>([])
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      fetchPlayedScenarios()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user変更時のみ実行
  }, [user])

  // シナリオと店舗の選択肢を取得
  // 顧客は全組織のシナリオ/店舗を利用可能
  // シナリオはscenario_mastersテーブルから取得（承認済みのみ）
  useEffect(() => {
    const fetchOptions = async () => {
      setOptionsLoading(true)
      try {
        // シナリオマスタを取得（承認済みのみ）
        const { data: scenarios, error: scenarioError } = await supabase
          .from('scenario_masters')
          .select('id, title')
          .eq('master_status', 'approved')
          .order('title')
        
        if (scenarioError) throw scenarioError
        setScenarioOptions(scenarios || [])

        // 店舗を取得（RLSで許可された店舗）
        const { data: stores, error: storeError } = await supabase
          .from('stores')
          .select('id, name')
          .order('name')
        
        if (storeError) throw storeError
        setStoreOptions(stores || [])
      } catch (error) {
        logger.error('オプション取得エラー:', error)
      } finally {
        setOptionsLoading(false)
      }
    }

    fetchOptions()
  }, [])

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

      // 手動登録履歴を取得
      const { data: manualHistory } = await supabase
        .from('manual_play_history')
        .select('id, scenario_title, played_at, venue, scenario_id, scenarios(key_visual_url, author)')
        .eq('customer_id', customer.id)
        .order('played_at', { ascending: false })
      
      if (manualHistory) {
        manualHistory.forEach((item: any) => {
          scenarios.push({
            scenario: item.scenario_title,
            date: item.played_at,
            venue: item.venue || '',
            gms: [],
            scenario_id: item.scenario_id || undefined,
            key_visual_url: item.scenarios?.key_visual_url || undefined,
            author: item.scenarios?.author || undefined,
            is_manual: true,
            manual_id: item.id,
          })
        })
      }
      
      // 日付でソート（新しい順）
      scenarios.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setPlayedScenarios(scenarios)
    } catch (error) {
      logger.error('プレイ済みシナリオ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 手動登録を追加
  const handleAddManualHistory = async () => {
    if (!customerId || !newScenarioId || !newPlayedAt) {
      showToast.error('シナリオと日付は必須です')
      return
    }

    setIsSubmitting(true)
    try {
      // 選択されたシナリオのタイトルを取得
      const selectedScenario = scenarioOptions.find(s => s.id === newScenarioId)
      const scenarioTitle = selectedScenario?.title || ''
      
      // 選択された店舗の名前を取得
      const selectedStore = storeOptions.find(s => s.id === newStoreId)
      const storeName = selectedStore?.name || null

      // NOTE: scenario_idはscenariosテーブル参照だが、scenario_mastersからの選択なのでnullにする
      // タイトルは保持されるので、表示には問題なし
      const { error } = await supabase
        .from('manual_play_history')
        .insert({
          customer_id: customerId,
          scenario_title: scenarioTitle,
          scenario_id: null,
          played_at: newPlayedAt,
          venue: storeName,
        })

      if (error) throw error

      showToast.success('プレイ履歴を追加しました')
      setIsAddDialogOpen(false)
      setNewScenarioId('')
      setNewPlayedAt('')
      setNewStoreId('')
      fetchPlayedScenarios()
    } catch (error) {
      logger.error('手動履歴追加エラー:', error)
      showToast.error('追加に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 手動登録を削除
  const handleDeleteManualHistory = async (manualId: string) => {
    if (!confirm('この履歴を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('manual_play_history')
        .delete()
        .eq('id', manualId)

      if (error) throw error

      showToast.success('削除しました')
      fetchPlayedScenarios()
    } catch (error) {
      logger.error('手動履歴削除エラー:', error)
      showToast.error('削除に失敗しました')
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
      showToast.error('削除に失敗しました')
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
            organization_id: organizationId,
          })

        if (error) throw error
        setLikedScenarios(prev => new Set(prev).add(scenarioId))
      }
    } catch (error) {
      logger.error('いいね切り替えエラー:', error)
      showToast.error('操作に失敗しました')
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Images className="h-4 w-4 sm:h-5 sm:w-5" />
            アルバム
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">過去の体験を追加</span>
                <span className="sm:hidden">追加</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>過去の体験を追加</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>シナリオ *</Label>
                  <Select
                    value={newScenarioId}
                    onValueChange={setNewScenarioId}
                    disabled={optionsLoading || scenarioOptions.length === 0}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder={optionsLoading ? '読み込み中...' : scenarioOptions.length === 0 ? 'シナリオがありません' : 'シナリオを選択'} />
                    </SelectTrigger>
                    <SelectContent>
                      {scenarioOptions.length === 0 ? (
                        <div className="py-2 px-3 text-sm text-muted-foreground">シナリオがありません</div>
                      ) : (
                        scenarioOptions.map((scenario) => (
                          <SelectItem key={scenario.id} value={scenario.id} className="text-sm">
                            {scenario.title}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>プレイした日付 *</Label>
                  <SingleDatePopover
                    date={newPlayedAt}
                    onDateChange={(date) => setNewPlayedAt(date || '')}
                    placeholder="日付を選択"
                  />
                </div>
                <div className="space-y-2">
                  <Label>店舗（任意）</Label>
                  <Select
                    value={newStoreId}
                    onValueChange={setNewStoreId}
                    disabled={optionsLoading || storeOptions.length === 0}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder={optionsLoading ? '読み込み中...' : storeOptions.length === 0 ? '店舗がありません' : '店舗を選択'} />
                    </SelectTrigger>
                    <SelectContent>
                      {storeOptions.length === 0 ? (
                        <div className="py-2 px-3 text-sm text-muted-foreground">店舗がありません</div>
                      ) : (
                        storeOptions.map((store) => (
                          <SelectItem key={store.id} value={store.id} className="text-sm">
                            {store.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleAddManualHistory} 
                  disabled={isSubmitting || !newScenarioId || !newPlayedAt}
                  className="w-full"
                >
                  {isSubmitting ? '追加中...' : '追加'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {scenarioGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>プレイ履歴がありません</p>
              <p className="mt-2 text-xs">「過去の体験を追加」から手動で登録できます</p>
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
                                {play.venue && (
                                  <div className="flex items-center gap-1 min-w-0">
                                    <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-foreground truncate">{play.venue}</span>
                                  </div>
                                )}
                                
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
                                
                                {/* 手動登録バッジと削除ボタン */}
                                {play.is_manual && (
                                  <div className="flex items-center gap-1 ml-auto">
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                                      手動登録
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 hover:bg-red-50"
                                      onClick={() => play.manual_id && handleDeleteManualHistory(play.manual_id)}
                                      title="削除"
                                    >
                                      <Trash2 className="h-3 w-3 text-red-400" />
                                    </Button>
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
                            {item.scenario.player_count_min === item.scenario.player_count_max
                              ? `${item.scenario.player_count_max}人`
                              : `${item.scenario.player_count_min}〜${item.scenario.player_count_max}人`}
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
