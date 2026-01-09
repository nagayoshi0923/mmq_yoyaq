import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, MapPin, Users, Star, Trophy, Sparkles, ChevronRight, Heart, Camera, Settings, Bell, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { SettingsPage } from './pages/SettingsPage'
import { WantToPlayPage } from './pages/LikedScenariosPage'
import type { Reservation, Store } from '@/types'

interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  scenario_id?: string
  scenario_slug?: string
  organization_slug?: string
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
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<string>('reservations')
  
  // データ
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<Record<string, { date: string; start_time: string; is_private_booking?: boolean }>>({})
  const [scenarioImages, setScenarioImages] = useState<Record<string, string>>({})
  const [scenarioSlugs, setScenarioSlugs] = useState<Record<string, string>>({})
  const [orgSlugs, setOrgSlugs] = useState<Record<string, string>>({})
  const [stores, setStores] = useState<Record<string, Store>>({})
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ participationCount: 0, points: 0 })
  const [customerInfo, setCustomerInfo] = useState<{ name?: string; nickname?: string } | null>(null)
  
  // アバター画像
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 表示名：ニックネーム > 名前 > メール > ゲスト
  const displayName = customerInfo?.nickname || customerInfo?.name || user?.email?.split('@')[0] || 'ゲスト'
  
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
        .select('id, name, nickname')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) {
        setReservations([])
        setCustomerInfo(null)
        setLoading(false)
        return
      }
      
      // 顧客情報をセット
      setCustomerInfo({ name: customer.name, nickname: customer.nickname })

      // 予約を取得
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservations')
        .select('*')
        .eq('customer_id', customer.id)
        .order('requested_datetime', { ascending: false })

      if (reservationError) throw reservationError
      setReservations(reservationData || [])

      // 関連するスケジュールイベントを取得（正しい公演日時を取得するため）
      const eventIds = reservationData
        ?.map(r => r.schedule_event_id)
        .filter((id): id is string => id !== null && id !== undefined) || []
      
      if (eventIds.length > 0) {
        const { data: eventsData } = await supabase
          .from('schedule_events')
          .select('id, date, start_time, is_private_booking')
          .in('id', eventIds)
        
        if (eventsData) {
          const eventMap: Record<string, { date: string; start_time: string; is_private_booking?: boolean }> = {}
          eventsData.forEach(e => {
            eventMap[e.id] = { date: e.date, start_time: e.start_time, is_private_booking: e.is_private_booking }
          })
          setScheduleEvents(eventMap)
        }
      }

      // 統計情報を計算
      const confirmedPast = (reservationData || []).filter(
        r => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
      )
      setStats({
        participationCount: confirmedPast.length,
        points: confirmedPast.length * 100
      })

      // シナリオの画像と組織情報を取得
      if (reservationData && reservationData.length > 0) {
        // 組織slugを取得
        const orgIds = [...new Set(reservationData.map(r => r.organization_id).filter(Boolean))]
        let orgSlugMap: Record<string, string> = {}
        if (orgIds.length > 0) {
          const { data: orgs } = await supabase
            .from('organizations')
            .select('id, slug')
            .in('id', orgIds)
          
          if (orgs) {
            orgs.forEach(o => {
              if (o.slug) orgSlugMap[o.id] = o.slug
            })
            setOrgSlugs(orgSlugMap)
          }
        }

        const scenarioIds = reservationData
          .map(r => r.scenario_id)
          .filter((id): id is string => id !== null && id !== undefined)
        
        if (scenarioIds.length > 0) {
          const { data: scenarios, error: scenariosError } = await supabase
            .from('scenarios')
            .select('id, key_visual_url, slug')
            .in('id', scenarioIds)
          
          if (!scenariosError && scenarios) {
            const imageMap: Record<string, string> = {}
            const slugMap: Record<string, string> = {}
            scenarios.forEach(s => {
              if (s.key_visual_url) {
                imageMap[s.id] = s.key_visual_url
              }
              if (s.slug) {
                slugMap[s.id] = s.slug
              }
            })
            setScenarioImages(imageMap)
            setScenarioSlugs(slugMap)
          }
        }

        // 店舗情報を取得
        const storeIds = new Set<string>()
        reservationData.forEach(r => {
          if (r.store_id) storeIds.add(r.store_id)
        })

        let storesData: { id: string; name: string; address?: string; color?: string }[] = []
        if (storeIds.size > 0) {
          const { data, error: storesError } = await supabase
            .from('stores')
            .select('id, name, address, color')
            .in('id', Array.from(storeIds))
          
          if (!storesError && data) {
            storesData = data
            const storeMap: Record<string, Store> = {}
            data.forEach(store => {
              storeMap[store.id] = store as Store
            })
            setStores(storeMap)
          }
        }

        // プレイ済みシナリオを取得
        const pastReservations = reservationData.filter(
          r => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
        )
        
        // 追加のシナリオ情報を取得
        const pastScenarioIds = pastReservations
          .map(r => r.scenario_id)
          .filter((id): id is string => id !== null && id !== undefined)
        
        let additionalScenarioData: Record<string, { key_visual_url?: string, slug?: string }> = {}
        if (pastScenarioIds.length > 0) {
          const { data: pastScenarios } = await supabase
            .from('scenarios')
            .select('id, key_visual_url, slug')
            .in('id', pastScenarioIds)
          
          if (pastScenarios) {
            pastScenarios.forEach(s => {
              additionalScenarioData[s.id] = { key_visual_url: s.key_visual_url, slug: s.slug }
            })
          }
        }
        
        const played: PlayedScenario[] = pastReservations.slice(0, 12).map(reservation => {
          const scenarioInfo = reservation.scenario_id ? additionalScenarioData[reservation.scenario_id] : null
          return {
            scenario: reservation.title?.replace(/【貸切希望】/g, '').replace(/（候補\d+件）/g, '').trim() || '',
            date: reservation.requested_datetime.split('T')[0],
            venue: storesData.find(s => s.id === reservation.store_id)?.name || '店舗情報なし',
            scenario_id: reservation.scenario_id || undefined,
            scenario_slug: scenarioInfo?.slug || undefined,
            organization_slug: reservation.organization_id ? orgSlugMap[reservation.organization_id] : undefined,
            key_visual_url: scenarioInfo?.key_visual_url || undefined,
          }
        })
        setPlayedScenarios(played)
      }

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

  // タイトルから日付や不要な文字を除去してシナリオ名のみ抽出
  const cleanTitle = (title?: string) => {
    if (!title) return ''
    return title
      .replace(/【貸切希望】/g, '【貸切】')
      .replace(/（候補\d+件）/g, '')
      // 様々な日付パターンを除去（ハイフン各種 + 日付）
      .replace(/\s*[-－ー–]\s*\d{4}年\d{1,2}月\d{1,2}日[（(][日月火水木金土][)）]/g, '')
      .replace(/\s*[-－ー–]\s*\d{4}\/\d{1,2}\/\d{1,2}.*$/g, '')
      // 末尾の日付のみ
      .replace(/\s*\d{4}年\d{1,2}月\d{1,2}日[（(][日月火水木金土][)）]$/g, '')
      .trim()
  }

  // 予約から正しい公演日時を取得（スケジュールイベント優先）
  const getPerformanceDateTime = (reservation: Reservation) => {
    // スケジュールイベントがあればその日時を使用
    if (reservation.schedule_event_id && scheduleEvents[reservation.schedule_event_id]) {
      const event = scheduleEvents[reservation.schedule_event_id]
      return {
        date: event.date,
        time: event.start_time
      }
    }
    // なければ requested_datetime から抽出
    const dateMatch = reservation.requested_datetime.match(/^(\d{4}-\d{2}-\d{2})/)
    const timeMatch = reservation.requested_datetime.match(/T(\d{2}:\d{2})/)
    return {
      date: dateMatch ? dateMatch[1] : reservation.requested_datetime.split('T')[0],
      time: timeMatch ? timeMatch[1] : ''
    }
  }

  // 公演日をフォーマット
  const formatPerformanceDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`
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
                {displayName} さん
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
              <div className="space-y-4">
                {/* 予約一覧 */}
                {upcomingReservations.length > 0 ? (
                  <>
                    {upcomingReservations.map((reservation, idx) => {
                      const perf = getPerformanceDateTime(reservation)
                      const daysUntil = getDaysUntil(perf.date)
                      const store = reservation.store_id ? stores[reservation.store_id] : null
                      const imageUrl = reservation.scenario_id ? scenarioImages[reservation.scenario_id] : null
                      
                      // 貸切公演かどうか
                      const eventId = reservation.schedule_event_id
                      const isPrivate = eventId ? scheduleEvents[eventId]?.is_private_booking : false
                      
                      // 日付を短くフォーマット（1/11(日)）
                      const shortDate = (() => {
                        const d = new Date(perf.date)
                        const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                        return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`
                      })()
                      
                      return (
                        <div 
                          key={reservation.id}
                          className="bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                          style={{ borderRadius: 0 }}
                          onClick={() => navigate(`/mypage/reservation/${reservation.id}`)}
                        >
                          {/* カウントダウンバー（最初の予約のみ） */}
                          {idx === 0 && daysUntil >= 0 && (
                            <div 
                              className="px-3 py-1.5 text-white text-sm font-bold flex items-center gap-2"
                              style={{ backgroundColor: THEME.primary }}
                            >
                              <Sparkles className="w-4 h-4" />
                              あと{daysUntil}日
                            </div>
                          )}
                          
                          {/* メインコンテンツ */}
                          <div className="p-3 flex gap-3">
                            {/* 画像 */}
                            <div className="w-16 h-24 flex-shrink-0 bg-gray-900 relative overflow-hidden" style={{ borderRadius: 0 }}>
                              {imageUrl ? (
                                <>
                                  <div 
                                    className="absolute inset-0 scale-110"
                                    style={{
                                      backgroundImage: `url(${imageUrl})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                      filter: 'blur(8px) brightness(0.6)',
                                    }}
                                  />
                                  <img
                                    src={imageUrl}
                                    alt={reservation.title}
                                    className="relative w-full h-full object-contain"
                                    loading="lazy"
                                  />
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-xl opacity-40">🎭</span>
                                </div>
                              )}
                            </div>
                            
                            {/* 情報 */}
                            <div className="flex-1 min-w-0">
                              {/* タイトル */}
                              <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">
                                {cleanTitle(reservation.title)}
                              </h3>
                              
                              {/* 公演日時 */}
                              <p className="text-sm font-bold mt-1" style={{ color: THEME.primary }}>
                                {shortDate} {perf.time ? perf.time.slice(0, 5) : ''}
                              </p>
                              
                              {/* 会場・住所 */}
                              {store && (
                                <div className="mt-1 text-xs text-gray-600">
                                  <p className="font-medium">{store.name}</p>
                                  {store.address && (
                                    <p className="text-gray-500 mt-0.5">{store.address}</p>
                                  )}
                                </div>
                              )}
                              
                              {/* 予約番号・人数・料金 */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-gray-500">
                                <span className="font-mono">{reservation.reservation_number}</span>
                                <span>•</span>
                                <span>{reservation.participant_count}名</span>
                                <span>•</span>
                                {isPrivate ? (
                                  // 貸切公演：合計金額を表示
                                  <span className="font-bold text-gray-700">
                                    ¥{(reservation.final_price || 0).toLocaleString()}
                                  </span>
                                ) : (
                                  // 通常公演：1人あたりと合計を表示
                                  <span className="font-bold text-gray-700">
                                    ¥{(reservation.unit_price || 0).toLocaleString()}/人
                                    <span className="font-normal text-gray-500 ml-1">
                                      (計¥{(reservation.final_price || 0).toLocaleString()})
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* 矢印 */}
                            <div className="flex items-center">
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div className="bg-white border border-gray-200 p-8 text-center" style={{ borderRadius: 0 }}>
                    <div 
                      className="w-14 h-14 flex items-center justify-center mx-auto mb-3"
                      style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
                    >
                      <Calendar className="w-7 h-7" style={{ color: THEME.primary }} />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">予約がありません</h3>
                    <p className="text-gray-500 text-sm mb-4">公演を探して予約しましょう</p>
                    <Button 
                      className="text-white px-6"
                      style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
                      onClick={() => navigate('/scenario')}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      公演を探す
                    </Button>
                  </div>
                )}

                {/* 参加履歴へのリンク */}
                {pastReservations.length > 0 && (
                  <div 
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200"
                    style={{ borderRadius: 0 }}
                    onClick={() => setActiveTab('album')}
                  >
                    <span className="text-sm text-gray-600">過去の参加履歴を見る</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: THEME.primary }}>{pastReservations.length}件</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'album' && (
              <div className="space-y-6">
                {/* 踏破率 - シャープデザイン */}
                <div className="bg-white shadow-sm p-6 border border-gray-200" style={{ borderRadius: 0 }}>
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
                          className="aspect-[3/4] overflow-hidden relative group cursor-pointer transition-all duration-300 bg-gray-900 shadow-sm hover:shadow-lg hover:scale-[1.02] border border-gray-200 hover:border-gray-300"
                          style={{ borderRadius: 0 }}
                          onClick={() => {
                            if (scenario.scenario_id) {
                              const scenarioSlug = scenario.scenario_slug || scenario.scenario_id
                              if (scenario.organization_slug) {
                                navigate(`/${scenario.organization_slug}/scenario/${scenarioSlug}`)
                              } else {
                                navigate(`/scenario/${scenarioSlug}`)
                              }
                            }
                          }}
                        >
                          {scenario.key_visual_url ? (
                            <>
                              {/* 背景：ぼかした画像で余白を埋める */}
                              <div 
                                className="absolute inset-0 scale-110"
                                style={{
                                  backgroundImage: `url(${scenario.key_visual_url})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  filter: 'blur(10px) brightness(0.7)',
                                }}
                              />
                              {/* メイン画像：全体を表示 */}
                              <img
                                src={scenario.key_visual_url}
                                alt={scenario.scenario}
                                className="relative w-full h-full object-contain"
                                loading="lazy"
                              />
                            </>
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
                              className="w-6 h-6 flex items-center justify-center shadow-lg"
                              style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
                            >
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white shadow-sm p-8 text-center border border-gray-200" style={{ borderRadius: 0 }}>
                    <div 
                      className="w-16 h-16 flex items-center justify-center mx-auto mb-4"
                      style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
                    >
                      <Camera className="w-8 h-8" style={{ color: THEME.primary }} />
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
              <WantToPlayPage />
            )}

            {activeTab === 'settings' && (
              <SettingsPage />
            )}
          </>
        )}
      </div>

      {/* フローティングアクションボタン - シャープデザイン */}
      <div className="fixed bottom-6 right-6 z-20">
        <Button 
          className="w-14 h-14 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
          size="icon"
          style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.primaryHover}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.primary}
          onClick={() => navigate('/booking')}
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      </div>
    </div>
  )
}
