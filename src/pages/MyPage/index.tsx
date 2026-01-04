import { useState, useEffect, useRef } from 'react'
import { Calendar, Clock, MapPin, Users, Star, Trophy, Sparkles, ChevronRight, Heart, Camera, Settings, Bell, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { SettingsPage } from './pages/SettingsPage'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import type { Reservation, Store } from '@/types'

interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  scenario_id?: string
  key_visual_url?: string
}

const menuItems = [
  { id: 'reservations', label: '予約', icon: Calendar },
  { id: 'album', label: 'アルバム', icon: Camera },
  { id: 'wishlist', label: '遊びたい', icon: Heart },
  { id: 'settings', label: '設定', icon: Settings },
]

export default function MyPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<string>('reservations')
  
  // データ
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [scenarioImages, setScenarioImages] = useState<Record<string, string>>({})
  const [stores, setStores] = useState<Record<string, Store>>({})
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ participationCount: 0, points: 0 })
  
  // アバター画像
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const userName = user?.email?.split('@')[0] || 'ゲスト'
  
  // アバター画像選択ハンドラ
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }
  
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setAvatarUrl(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // 予約データ取得
  useEffect(() => {
    if (user?.email) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) {
        setReservations([])
        setLoading(false)
        return
      }

      // 予約を取得
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservations')
        .select('*')
        .eq('customer_id', customer.id)
        .order('requested_datetime', { ascending: false })

      if (reservationError) throw reservationError
      setReservations(reservationData || [])

      // 統計情報を計算
      const confirmedPast = (reservationData || []).filter(
        r => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
      )
      setStats({
        participationCount: confirmedPast.length,
        points: confirmedPast.length * 100
      })

      // シナリオの画像を取得
      if (reservationData && reservationData.length > 0) {
        const scenarioIds = reservationData
          .map(r => r.scenario_id)
          .filter((id): id is string => id !== null && id !== undefined)
        
        if (scenarioIds.length > 0) {
          const { data: scenarios, error: scenariosError } = await supabase
            .from('scenarios')
            .select('id, key_visual_url')
            .in('id', scenarioIds)
          
          if (!scenariosError && scenarios) {
            const imageMap: Record<string, string> = {}
            scenarios.forEach(s => {
              if (s.key_visual_url) {
                imageMap[s.id] = s.key_visual_url
              }
            })
            setScenarioImages(imageMap)
          }
        }

        // 店舗情報を取得
        const storeIds = new Set<string>()
        reservationData.forEach(r => {
          if (r.store_id) storeIds.add(r.store_id)
        })

        if (storeIds.size > 0) {
          const { data: storesData, error: storesError } = await supabase
            .from('stores')
            .select('id, name, address, color')
            .in('id', Array.from(storeIds))
          
          if (!storesError && storesData) {
            const storeMap: Record<string, Store> = {}
            storesData.forEach(store => {
              storeMap[store.id] = store as Store
            })
            setStores(storeMap)
          }
        }
      }

      // プレイ済みシナリオを取得
      const pastReservations = (reservationData || []).filter(
        r => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
      )
      
      const played: PlayedScenario[] = []
      for (const reservation of pastReservations.slice(0, 12)) {
        let keyVisualUrl = null
        if (reservation.scenario_id) {
          const existing = scenarioImages[reservation.scenario_id]
          if (existing) {
            keyVisualUrl = existing
          } else {
            const { data: scenarioData } = await supabase
              .from('scenarios')
              .select('key_visual_url')
              .eq('id', reservation.scenario_id)
              .maybeSingle()
            keyVisualUrl = scenarioData?.key_visual_url
          }
        }
        
        played.push({
          scenario: reservation.title?.replace(/【貸切希望】/g, '').replace(/（候補\d+件）/g, '').trim() || '',
          date: reservation.requested_datetime.split('T')[0],
          venue: stores[reservation.store_id || '']?.name || '店舗情報なし',
          scenario_id: reservation.scenario_id || undefined,
          key_visual_url: keyVisualUrl || undefined,
        })
      }
      setPlayedScenarios(played)

    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 日付フォーマット
  const formatDate = (dateString: string) => {
    const d = new Date(dateString)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`
  }

  const formatTime = (dateString: string) => {
    const timeMatch = dateString.match(/T(\d{2}):(\d{2})/)
    if (timeMatch) return `${timeMatch[1]}:${timeMatch[2]}`
    return ''
  }

  // 日数計算
  const getDaysUntil = (dateString: string) => {
    const eventDate = new Date(dateString)
    const now = new Date()
    const diffTime = eventDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  // 予約を分類
  const upcomingReservations = reservations.filter(
    r => new Date(r.requested_datetime) >= new Date() && r.status === 'confirmed'
  )
  const pastReservations = reservations.filter(
    r => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
  )

  // タブごとのカウント
  const getCounts = () => ({
    reservations: upcomingReservations.length,
    album: playedScenarios.length,
    wishlist: 0,
    settings: null
  })

  const counts = getCounts()

  return (
    <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
      {/* プロフィールヘッダー */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {/* アバター（クリックで画像変更） */}
            <div className="relative group">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={handleAvatarClick}
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg overflow-hidden transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                style={{ 
                  background: avatarUrl ? undefined : `linear-gradient(to bottom right, ${THEME.gradientFrom}, ${THEME.gradientTo})`
                }}
              >
                {avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt="プロフィール画像" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl">🎭</span>
                )}
              </button>
              {/* 編集アイコン */}
              <div 
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center shadow-md cursor-pointer"
                style={{ backgroundColor: THEME.primary }}
                onClick={handleAvatarClick}
              >
                <Pencil className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            
            {/* ユーザー情報 */}
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">
                {userName} さん
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Trophy className="w-4 h-4" style={{ color: THEME.primary }} />
                  <span>{stats.participationCount}回参加</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Star className="w-4 h-4 text-amber-500" />
                  <span>{stats.points} ポイント</span>
                </div>
              </div>
            </div>

            {/* 通知ボタン */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-gray-600" />
              {upcomingReservations.length > 0 && (
                <span 
                  className="absolute -top-1 -right-1 w-5 h-5 text-white text-xs rounded-full flex items-center justify-center"
                  style={{ backgroundColor: THEME.primary }}
                >
                  {upcomingReservations.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              const count = counts[item.id as keyof typeof counts]
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-all relative ${
                    isActive 
                      ? '' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  style={isActive ? { color: THEME.primary } : undefined}
                >
                  <Icon className="w-5 h-5" />
                  <span className="hidden sm:inline">{item.label}</span>
                  {count !== null && count > 0 && (
                    <span 
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isActive ? 'text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                      style={isActive ? { backgroundColor: THEME.primary } : undefined}
                    >
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full" 
                      style={{ backgroundColor: THEME.primary }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {loading && activeTab !== 'settings' ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : (
          <>
            {activeTab === 'reservations' && (
              <div className="space-y-6">
                {/* 次の予約（ハイライト） */}
                {upcomingReservations.length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-1 h-6 rounded-full" style={{ backgroundColor: THEME.primary }}></span>
                      次の予約
                    </h2>
                    
                    {/* メインカード */}
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow duration-300">
                      <div className="relative h-48 md:h-56">
                        {upcomingReservations[0].scenario_id && scenarioImages[upcomingReservations[0].scenario_id] ? (
                          <OptimizedImage
                            src={scenarioImages[upcomingReservations[0].scenario_id]}
                            alt={upcomingReservations[0].title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                            <span className="text-6xl opacity-30">🎭</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        
                        {/* カウントダウン */}
                        <div className="absolute top-4 left-4">
                          <div 
                            className="text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
                            style={{ backgroundColor: THEME.primary }}
                          >
                            🎮 あと{getDaysUntil(upcomingReservations[0].requested_datetime)}日！
                          </div>
                        </div>

                        {/* タイトル */}
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                            {upcomingReservations[0].title?.replace(/【貸切希望】/g, '【貸切】').replace(/（候補\d+件）/g, '')}
                          </h3>
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" style={{ color: THEME.primary }} />
                            {formatDate(upcomingReservations[0].requested_datetime)}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" style={{ color: THEME.primary }} />
                            {formatTime(upcomingReservations[0].requested_datetime)}〜
                          </div>
                          {upcomingReservations[0].store_id && stores[upcomingReservations[0].store_id] && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-4 h-4" style={{ color: THEME.primary }} />
                              {stores[upcomingReservations[0].store_id].name}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" style={{ color: THEME.primary }} />
                            {upcomingReservations[0].participant_count}名
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                          <div className="text-xl font-bold text-gray-900">
                            ¥{upcomingReservations[0].final_price?.toLocaleString() || 0}
                          </div>
                          <Button 
                            className="text-white rounded-full px-6"
                            style={{ backgroundColor: THEME.primary }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.primaryHover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.primary}
                          >
                            詳細を見る
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* その他の予約 */}
                {upcomingReservations.length > 1 && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-1 h-6 bg-gray-300 rounded-full"></span>
                      その他の予約
                    </h2>
                    
                    <div className="space-y-3">
                      {upcomingReservations.slice(1).map((reservation) => (
                        <div
                          key={reservation.id}
                          className="bg-white rounded-xl shadow-sm p-4 flex gap-4 hover:shadow-md transition-shadow duration-300 cursor-pointer"
                        >
                          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                            {reservation.scenario_id && scenarioImages[reservation.scenario_id] ? (
                              <OptimizedImage
                                src={scenarioImages[reservation.scenario_id]}
                                alt={reservation.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎭</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 truncate">
                              {reservation.title?.replace(/【貸切希望】/g, '【貸切】').replace(/（候補\d+件）/g, '')}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">{formatDate(reservation.requested_datetime)}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {reservation.store_id && stores[reservation.store_id] && (
                                <Badge variant="secondary" className="text-xs">
                                  {stores[reservation.store_id].name}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {reservation.participant_count}名
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {upcomingReservations.length === 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2">予約がありません</h3>
                    <p className="text-gray-500 text-sm mb-6">
                      新しい公演を探して予約しましょう
                    </p>
                    <Button 
                      className="text-white rounded-full px-8"
                      style={{ backgroundColor: THEME.primary }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.primaryHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.primary}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      公演を探す
                    </Button>
                  </div>
                )}

                {/* 参加履歴へのリンク */}
                {pastReservations.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                    <Button 
                      variant="outline" 
                      className="rounded-full hover:text-white"
                      style={{ borderColor: THEME.primary, color: THEME.primary }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.primary; e.currentTarget.style.color = 'white' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = THEME.primary }}
                    >
                      過去の参加履歴を見る（{pastReservations.length}件）
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'album' && (
              <div className="space-y-6">
                {/* 踏破率 */}
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-gray-900">プレイ済みシナリオ</h2>
                    <span className="text-2xl font-bold" style={{ color: THEME.primary }}>{playedScenarios.length}作品</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    これまでに参加したマーダーミステリーの記録です
                  </p>
                </div>

                {/* シナリオグリッド */}
                {playedScenarios.length > 0 ? (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-1 h-6 rounded-full" style={{ backgroundColor: THEME.primary }}></span>
                      プレイ済みシナリオ
                    </h2>
                    
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {playedScenarios.map((scenario, index) => (
                        <div
                          key={index}
                          className="aspect-[3/4] rounded-xl overflow-hidden relative group cursor-pointer transition-all duration-300 bg-white shadow-sm hover:shadow-lg hover:-translate-y-1"
                        >
                          {scenario.key_visual_url ? (
                            <OptimizedImage
                              src={scenario.key_visual_url}
                              alt={scenario.scenario}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                              <span className="text-3xl opacity-30">🎭</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs text-white font-medium truncate">{scenario.scenario}</p>
                          </div>
                          <div className="absolute top-2 right-2">
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                              style={{ backgroundColor: THEME.primary }}
                            >
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2">まだプレイ履歴がありません</h3>
                    <p className="text-gray-500 text-sm">
                      公演に参加すると、ここに記録されます
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'wishlist' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: THEME.primaryLight }}
                  >
                    <Heart className="w-8 h-8" style={{ color: THEME.primary }} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">遊びたいリスト</h3>
                  <p className="text-gray-500 text-sm mb-6">
                    気になるシナリオをお気に入りに追加して<br />
                    公演情報をチェックしましょう
                  </p>
                  <Button 
                    className="text-white rounded-full px-8"
                    style={{ backgroundColor: THEME.primary }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.primaryHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.primary}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    シナリオを探す
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <SettingsPage />
            )}
          </>
        )}
      </div>

      {/* フローティングアクションボタン */}
      <div className="fixed bottom-6 right-6 z-20">
        <Button 
          className="w-14 h-14 rounded-full text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
          size="icon"
          style={{ backgroundColor: THEME.primary }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.primaryHover}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.primary}
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      </div>
    </div>
  )
}
