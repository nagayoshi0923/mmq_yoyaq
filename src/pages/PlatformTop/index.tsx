/**
 * MMQ プラットフォームトップページ
 * @path /
 * @purpose 顧客向けトップページ - シャープデザイン
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDateJST } from '@/utils/dateUtils'
import { Search, ChevronRight, ChevronDown, ChevronUp, Sparkles, Building2, Calendar, Filter, Flame, FileText, X, Gift, RefreshCw } from 'lucide-react'
import { Footer } from '@/components/layout/Footer'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { ScenarioCard, type ScenarioCardData } from '@/pages/PublicBookingTop/components/ScenarioCard'
import { HowToUseGuide } from '@/pages/PublicBookingTop/components/HowToUseGuide'

// シナリオカード用の型（直近公演情報を含む）- ScenarioCardDataを拡張
interface ScenarioWithEvents extends ScenarioCardData {
  organization_id: string
  organization_slug: string
  organization_name: string
  next_events: Array<{
    date: string
    time: string
    store_name: string
    store_short_name: string
    store_color?: string
    available_seats: number
    current_participants?: number
    is_confirmed?: boolean
    region?: string
  }>
}

interface Organization {
  id: string
  slug: string
  display_name: string
  logo_url?: string
}

interface StoreWithOrg {
  id: string
  name: string
  short_name: string
  region?: string
  address?: string
  organization_id: string
  organization_slug?: string
  organization_name?: string
}

// ブログ記事
interface BlogPostSummary {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  cover_image_url?: string | null
  published_at: string
  organization_name?: string
}

// 地域リスト
const REGIONS = [
  { value: 'all', label: '全国' },
  { value: '東京都', label: '東京都' },
  { value: '神奈川県', label: '神奈川県' },
  { value: '埼玉県', label: '埼玉県' },
  { value: '千葉県', label: '千葉県' },
  { value: '大阪府', label: '大阪府' },
  { value: '愛知県', label: '愛知県' },
  { value: '福岡県', label: '福岡県' },
]

/** MMQトップ「2週間より後の公演を見る」の展開状態（ブラウザリロード時のみ復元。SPAで戻ったときは閉じる） */
const PLATFORM_TOP_AFTER14_EXPANDED_KEY = 'platform-top-lineup-after14-expanded'

function isBrowserReloadNavigation(): boolean {
  if (typeof performance === 'undefined') return false
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return nav?.type === 'reload'
}

/** リロード直後も一覧を消さない（stale-while-revalidate） */
const PLATFORM_TOP_DISPLAY_SNAPSHOT_KEY = 'platform-top-display-v1'
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface PlatformTopDisplaySnapshot {
  v: 1
  savedAt: number
  scenariosWithEvents: ScenarioWithEvents[]
  organizations: Organization[]
  stores: StoreWithOrg[]
  blogPosts: BlogPostSummary[]
}

function readPlatformTopDisplaySnapshot(): PlatformTopDisplaySnapshot | null {
  try {
    const raw = sessionStorage.getItem(PLATFORM_TOP_DISPLAY_SNAPSHOT_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<PlatformTopDisplaySnapshot>
    if (o.v !== 1 || !Array.isArray(o.scenariosWithEvents)) return null
    if (typeof o.savedAt !== 'number' || Date.now() - o.savedAt > SNAPSHOT_MAX_AGE_MS) return null
    return {
      v: 1,
      savedAt: o.savedAt,
      scenariosWithEvents: o.scenariosWithEvents as ScenarioWithEvents[],
      organizations: Array.isArray(o.organizations) ? (o.organizations as Organization[]) : [],
      stores: Array.isArray(o.stores) ? (o.stores as StoreWithOrg[]) : [],
      blogPosts: Array.isArray(o.blogPosts) ? (o.blogPosts as BlogPostSummary[]) : [],
    }
  } catch {
    return null
  }
}

function writePlatformTopDisplaySnapshot(payload: Omit<PlatformTopDisplaySnapshot, 'v' | 'savedAt'>): void {
  try {
    const snap: PlatformTopDisplaySnapshot = {
      v: 1,
      savedAt: Date.now(),
      ...payload,
    }
    sessionStorage.setItem(PLATFORM_TOP_DISPLAY_SNAPSHOT_KEY, JSON.stringify(snap))
  } catch {
    /* 容量超過等は無視 */
  }
}

export function PlatformTop() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { favorites, toggleFavorite } = useFavorites()
  const { isPlayed } = usePlayedScenarios()

  const [boot] = useState<{ snap: PlatformTopDisplaySnapshot | null }>(() => ({
    snap: readPlatformTopDisplaySnapshot(),
  }))
  const displaySnapshotOnMount = boot.snap

  const [scenariosWithEvents, setScenariosWithEvents] = useState<ScenarioWithEvents[]>(
    () => displaySnapshotOnMount?.scenariosWithEvents ?? []
  )
  const [organizations, setOrganizations] = useState<Organization[]>(
    () => displaySnapshotOnMount?.organizations ?? []
  )
  const [stores, setStores] = useState<StoreWithOrg[]>(() => displaySnapshotOnMount?.stores ?? [])
  const [loading, setLoading] = useState(() => displaySnapshotOnMount == null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState('all')
  const [isExpanded, setIsExpanded] = useState(() => {
    if (!isBrowserReloadNavigation()) return false
    try {
      return sessionStorage.getItem(PLATFORM_TOP_AFTER14_EXPANDED_KEY) === '1'
    } catch {
      return false
    }
  })
  const [blogPosts, setBlogPosts] = useState<BlogPostSummary[]>(
    () => displaySnapshotOnMount?.blogPosts ?? []
  )
  const [showCouponPopup, setShowCouponPopup] = useState(false)
  const [isGuideOpen, setIsGuideOpen] = useState(false)

  // クーポンポップアップ表示判定（非ログインユーザー & 非表示設定なし）
  useEffect(() => {
    if (user) return // ログイン済みなら表示しない
    const dismissed = localStorage.getItem('mmq_coupon_popup_dismissed')
    if (!dismissed) {
      // 少し遅延させて表示
      const timer = setTimeout(() => setShowCouponPopup(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [user])

  const handleDismissCouponPopup = (permanently: boolean) => {
    if (permanently) {
      localStorage.setItem('mmq_coupon_popup_dismissed', 'true')
    }
    setShowCouponPopup(false)
  }

  const toggleAfter14Expanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev
      try {
        sessionStorage.setItem(PLATFORM_TOP_AFTER14_EXPANDED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  // リロード直前に展開状態を確実に書き込み（スクロール復元と高さの整合用）
  useEffect(() => {
    const flush = () => {
      try {
        sessionStorage.setItem(PLATFORM_TOP_AFTER14_EXPANDED_KEY, isExpanded ? '1' : '0')
      } catch {
        /* ignore */
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [isExpanded])

  // スクロール位置の保存と復元
  useReportRouteScrollRestoration('platform-top', {
    isLoading: loading,
    isFetching: isRefreshing,
  })

  const fetchData = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    try {
      if (silent) setIsRefreshing(true)
      else setLoading(true)

      const today = formatDateJST(new Date())

      // 🚀 パフォーマンス最適化: 5つのクエリを並列実行
      const [orgResult, storeResult, masterResult, eventResult, reservationResult] = await Promise.all([
        // 組織一覧
        supabase
          .from('organizations')
          .select('id, slug, name, logo_url')
          .eq('is_active', true)
          .order('name'),
        // 店舗一覧（臨時会場とオフィスを除く）
        supabase
          .from('stores')
          .select('id, name, short_name, region, address, organization_id')
          .eq('status', 'active')
          .or('is_temporary.is.null,is_temporary.eq.false')
          .neq('ownership_type', 'office')
          .order('region', { ascending: true })
          .order('name', { ascending: true }),
        // 承認済みマスタのID
        supabase
          .from('scenario_masters')
          .select('id')
          .eq('master_status', 'approved'),
        // 今日以降のイベント（オープン公演のみ、上限200件に削減）
        supabase
          .from('schedule_events')
          .select(`
            id, date, start_time, current_participants, organization_id,
            scenario_masters:scenario_master_id!inner (id, title, key_visual_url, player_count_min, player_count_max, official_duration, author),
            stores:store_id (id, name, short_name, color, region)
          `)
          .gte('date', today)
          .in('category', ['open', 'offsite'])
          .eq('is_cancelled', false)
          .eq('is_reservation_enabled', true)
          .order('date', { ascending: true })
          .limit(200),
        // 今日以降の予約（参加者数計算用）
        supabase
          .from('reservations')
          .select('schedule_event_id, participant_count, status')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .in('status', ['confirmed', 'pending', 'checked_in'])
      ])

      const { data: orgData, error: orgError } = orgResult
      const { data: storeData, error: storeError } = storeResult
      const { data: approvedMasters, error: masterError } = masterResult
      const { data: eventData, error: eventError } = eventResult
      const { data: reservations } = reservationResult

      if (orgError) logger.error('組織取得エラー:', orgError)
      if (storeError) logger.error('店舗取得エラー:', storeError)
      if (masterError) logger.error('マスタ取得エラー:', masterError)

      const orgMap: Record<string, { slug: string, name: string }> = {}
      if (orgData) {
        orgData.forEach(o => {
          orgMap[o.id] = { slug: o.slug, name: o.name }
        })
        setOrganizations(orgData.map(o => ({ 
          id: o.id,
          slug: o.slug,
          display_name: o.name,
          logo_url: o.logo_url || undefined
        })))
      }

      if (storeData) {
        const storesWithOrg = storeData
          .filter(s => s.organization_id && orgMap[s.organization_id])
          .map(s => ({
            ...s,
            organization_slug: orgMap[s.organization_id!]?.slug,
            organization_name: orgMap[s.organization_id!]?.name
          }))
        setStores(storesWithOrg)
      }

      const approvedMasterIds = new Set(approvedMasters?.map(m => m.id) || [])

      // 予約から参加者数を集計
      const participantsMap: Record<string, number> = {}
      if (reservations) {
        reservations.forEach(r => {
          const eventId = r.schedule_event_id
          if (eventId) {
            participantsMap[eventId] = (participantsMap[eventId] || 0) + (r.participant_count || 1)
          }
        })
      }

      if (eventData) {
        // シナリオごとにイベントを集約
        const scenarioMap: Record<string, ScenarioWithEvents> = {}
        
        eventData.forEach(e => {
          // scenario_masters は !inner JOIN なのでオブジェクトとして返される（配列ではない）
          const scenarioData = e.scenario_masters as unknown as { 
            id: string; title: string; 
            key_visual_url?: string | null; genre?: string[];
            author?: string; player_count_min: number; player_count_max: number;
            official_duration: number
          } | null
          const scenario = scenarioData ? {
            ...scenarioData,
            duration: scenarioData.official_duration,
            status: 'available' as const,
            organization_id: e.organization_id || ''
          } : null
          const store = e.stores as unknown as { id: string; name: string; short_name?: string; color?: string; region?: string } | null
          
          // 基本チェック
          if (!scenario || !store) return
          if (!e.organization_id || !orgMap[e.organization_id]) return

          // 今日の公演で開始時間を過ぎたものは除外
          const nowForFilter = new Date()
          const nowJSTForFilter = new Date(nowForFilter.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
          const todayJSTStr = formatDateJST(nowForFilter)
          if (e.date === todayJSTStr && e.start_time) {
            const [h, m] = e.start_time.split(':').map(Number)
            if (h < nowJSTForFilter.getHours() || (h === nowJSTForFilter.getHours() && m <= nowJSTForFilter.getMinutes())) {
              return
            }
          }
          
          // 🔐 マスタ未登録または未承認のシナリオを除外
          // scenario.id は scenario_master_id と同じ（JOINした結果）
          if (!approvedMasterIds.has(scenario.id)) {
            return
          }
          
          const org = orgMap[e.organization_id || '']
          if (!org) return
          
          const scenarioKey = scenario.id
          
          if (!scenarioMap[scenarioKey]) {
            scenarioMap[scenarioKey] = {
              scenario_id: scenario.id,
              scenario_title: scenario.title,
              scenario_slug: scenario.id, // scenario_masters には slug がないため id を使用
              key_visual_url: scenario.key_visual_url,
              author: scenario.author || '',
              player_count_min: scenario.player_count_min,
              player_count_max: scenario.player_count_max,
              duration: scenario.duration,
              organization_id: scenario.organization_id,
              organization_slug: org.slug,
              organization_name: org.name,
              next_events: []
            }
          }
          
          // 最大10件まで追加
          if (scenarioMap[scenarioKey].next_events.length < 10) {
            // 予約テーブルから計算した参加者数を使用（なければDBの値、それもなければ0）
            const currentParticipants = participantsMap[e.id] ?? e.current_participants ?? 0
            const remainingSlots = scenario.player_count_max - currentParticipants
            const isConfirmed = currentParticipants >= scenario.player_count_min && remainingSlots > 0
            scenarioMap[scenarioKey].next_events.push({
              date: e.date,
              time: e.start_time || '',
              store_name: store.name,
              store_short_name: store.short_name || store.name,
              store_color: store.color,
              available_seats: remainingSlots,
              current_participants: currentParticipants,
              is_confirmed: isConfirmed,
              region: store.region
            })
          }
        })
        
        // 配列に変換してソート（直近公演日順）
        const scenarioList = Object.values(scenarioMap)
          .sort((a, b) => {
            // 直近公演があるものを優先
            if (a.next_events.length > 0 && b.next_events.length === 0) return -1
            if (a.next_events.length === 0 && b.next_events.length > 0) return 1
            // 両方に公演がある場合は直近公演日順
            if (a.next_events.length > 0 && b.next_events.length > 0) {
              return a.next_events[0].date.localeCompare(b.next_events[0].date)
            }
            // 同じならタイトル順
            return a.scenario_title.localeCompare(b.scenario_title)
          })
        
        setScenariosWithEvents(scenarioList)
      }

      // ブログ記事を取得（最新3件）
      const { data: blogData } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, cover_image_url, published_at, organization_id')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(3)

      if (blogData) {
        const postsWithOrg = blogData.map(post => ({
          ...post,
          organization_name: orgMap[post.organization_id]?.name || ''
        }))
        setBlogPosts(postsWithOrg)
      }

    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      if (silent) setIsRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData(displaySnapshotOnMount != null ? { silent: true } : undefined)
    // 初回のみ。表示は boot 時点のスナップショットと同期
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount のみ
  }, [])

  // 取得完了後にスナップショット保存（リロード時のチラつき防止用）
  useEffect(() => {
    if (loading || isRefreshing) return
    const empty =
      scenariosWithEvents.length === 0 &&
      organizations.length === 0 &&
      stores.length === 0 &&
      blogPosts.length === 0
    if (empty) return
    writePlatformTopDisplaySnapshot({
      scenariosWithEvents,
      organizations,
      stores,
      blogPosts,
    })
  }, [
    loading,
    isRefreshing,
    scenariosWithEvents,
    organizations,
    stores,
    blogPosts,
  ])

  // 地域フィルター適用
  const filteredScenarios = useMemo(() => {
    if (selectedRegion === 'all') return scenariosWithEvents
    
    return scenariosWithEvents.filter(s => 
      s.next_events.some(e => e.region === selectedRegion)
    ).map(s => ({
      ...s,
      // フィルターに一致するイベントのみ表示
      next_events: s.next_events.filter(e => e.region === selectedRegion)
    }))
  }, [scenariosWithEvents, selectedRegion])

  // 残りわずかの公演（残り1-2枠の公演、全イベントを対象）
  const nearlyConfirmed = useMemo(() => {
    const result: ScenarioWithEvents[] = []
    const addedScenarioIds = new Set<string>()
    
    filteredScenarios.forEach(scenario => {
      const nearlyFullEvent = scenario.next_events.find(event => {
        const available = event.available_seats
        return available > 0 && available <= 2
      })
      
      if (nearlyFullEvent && !addedScenarioIds.has(scenario.scenario_id)) {
        addedScenarioIds.add(scenario.scenario_id)
        const reorderedEvents = [
          nearlyFullEvent,
          ...scenario.next_events.filter(e => e !== nearlyFullEvent)
        ]
        result.push({
          ...scenario,
          next_events: reorderedEvents
        })
      }
    })
    
    result.sort((a, b) => {
      const aAvailable = a.next_events?.[0]?.available_seats || 999
      const bAvailable = b.next_events?.[0]?.available_seats || 999
      return aAvailable - bAvailable
    })
    
    return result
  }, [filteredScenarios])

  // 2週間以内とそれ以降を分離（当日を含む14日分: 今日〜今日+13日目まで）
  const { withinTwoWeeks, afterTwoWeeks } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const twoWeeksEndExclusive = new Date(today)
    twoWeeksEndExclusive.setDate(twoWeeksEndExclusive.getDate() + 14)
    
    const within: ScenarioWithEvents[] = []
    const after: ScenarioWithEvents[] = []
    
    filteredScenarios.forEach(scenario => {
      const nextEventDate = scenario.next_events?.[0]?.date
      if (nextEventDate) {
        const eventDate = new Date(nextEventDate + 'T00:00:00')
        if (eventDate < twoWeeksEndExclusive) {
          within.push(scenario)
        } else {
          after.push(scenario)
        }
      }
    })
    
    return { withinTwoWeeks: within, afterTwoWeeks: after }
  }, [filteredScenarios])

  // 店舗を地域ごとにグルーピング
  const storesByRegion = useMemo(() => {
    const grouped: Record<string, StoreWithOrg[]> = {}
    stores.forEach(store => {
      const region = store.region || 'その他'
      if (!grouped[region]) {
        grouped[region] = []
      }
      grouped[region].push(store)
    })
    // 地域名でソート（「その他」は最後）
    const sortedRegions = Object.keys(grouped).sort((a, b) => {
      if (a === 'その他') return 1
      if (b === 'その他') return -1
      return a.localeCompare(b, 'ja')
    })
    return { grouped, sortedRegions }
  }, [stores])

  const handleFavoriteClick = (e: React.MouseEvent, scenarioId: string) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }

  const handleScenarioClick = (slugOrId: string, eventDate?: string, eventTime?: string) => {
    saveScrollPositionForCurrentUrl()
    // 日付・時間パラメータがあれば追加
    const params = new URLSearchParams()
    if (eventDate) params.set('date', eventDate)
    if (eventTime) params.set('time', eventTime)
    const query = params.toString() ? `?${params.toString()}` : ''
    // シナリオ共通トップページに遷移
    navigate(`/scenario/${slugOrId}${query}`)
  }

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: THEME.background }}>
      <Header />

      {/* ヒーローセクション - シャープデザイン */}
      <section 
        className="relative w-full overflow-hidden"
        style={{ backgroundColor: THEME.primary }}
      >
        {/* アクセント装飾 */}
        <div 
          className="absolute top-0 right-0 w-96 h-96 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-2 h-14 md:h-24"
          style={{ backgroundColor: THEME.accent }}
        />
        
        <div className="max-w-7xl mx-auto px-4 py-7 sm:py-10 md:py-20 relative">
          <div className="text-center text-white">
            <h1 className="text-[1.625rem] leading-snug sm:text-3xl md:text-5xl font-bold mb-3 md:mb-4 tracking-tight">
              {/* md 未満は自動折り返しで「な／ら」のように分断されやすいので、語の切れ目で固定改行 */}
              <span className="md:hidden">
                マーダーミステリー
                <br />
                予約するなら
                <br />
                MMQ
              </span>
              <span className="hidden md:inline">マーダーミステリー予約するなら MMQ</span>
            </h1>
            <p className="text-[0.9375rem] sm:text-lg md:text-xl opacity-90 mb-5 md:mb-8 max-w-2xl mx-auto leading-relaxed">
              <span className="md:hidden">
                全国の店舗から、
                <br />
                あなたにぴったりの物語を見つけよう
              </span>
              <span className="hidden md:inline">
                全国の店舗から、あなたにぴったりの物語を見つけよう
              </span>
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Button
                size="lg"
                className="bg-white hover:bg-gray-100 px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg font-semibold shadow-lg hover:scale-[1.02] transition-transform"
                style={{ color: THEME.primary, borderRadius: 0 }}
                onClick={() => {
                  saveScrollPositionForCurrentUrl()
                  navigate('/scenario')
                }}
              >
                <Search className="w-5 h-5 mr-2" />
                シナリオを探す
              </Button>
              {user ? (
                <Button
                  size="lg"
                  variant="ghost"
                  className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white px-8 h-14 text-lg"
                  style={{ borderRadius: 0 }}
                  onClick={() => navigate('/mypage')}
                >
                  マイページ
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="ghost"
                  className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white px-8 h-14 text-lg"
                  style={{ borderRadius: 0 }}
                  onClick={() => navigate('/login')}
                >
                  ログイン / 新規登録
                </Button>
              )}
            </div>

            {/* 使い方リンク */}
            <div className="mt-4">
              <button
                onClick={() => setIsGuideOpen(true)}
                className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
              >
                <span className="w-5 h-5 rounded-full border border-white/40 flex items-center justify-center text-xs font-bold">?</span>
                使い方
              </button>
            </div>

            {/* 新規登録キャンペーンバナー（コンパクト版）- 未ログインユーザーのみ表示 */}
            {!user && (
              <div 
                className="mt-5 md:mt-8 cursor-pointer group"
                onClick={() => navigate('/signup')}
              >
                <div 
                  className="flex items-center justify-center gap-3 mx-auto max-w-md px-4 py-3 rounded-full transition-all group-hover:scale-[1.02]"
                  style={{ 
                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                    boxShadow: '0 4px 16px rgba(255, 165, 0, 0.3)'
                  }}
                >
                  <Gift className="w-5 h-5 text-white" />
                  <span className="text-white font-bold text-sm">
                    4月3日まで｜新規登録で2,000円分クーポン
                  </span>
                  <ChevronRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 残りわずか作品 */}
      {!loading && nearlyConfirmed.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pt-8 md:pt-12">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Flame className="w-6 h-6 text-orange-500" />
              残りわずか
              <span 
                className="w-12 h-1 ml-2"
                style={{ backgroundColor: '#f97316' }}
              />
              <span className="text-sm font-normal text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                お早めに！
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {nearlyConfirmed.map((scenario) => (
              <ScenarioCard
                key={`nearly-${scenario.scenario_id}`}
                scenario={scenario}
                onClick={(slugOrId) => {
                  // 残りわずかのイベント日付・時間を渡す（next_eventsの先頭が残りわずかのイベント）
                  const nearlyFullEvent = scenario.next_events?.[0]
                  handleScenarioClick(slugOrId, nearlyFullEvent?.date, nearlyFullEvent?.time)
                }}
                isFavorite={favorites.has(scenario.scenario_id)}
                isPlayed={isPlayed(scenario.scenario_id)}
                onToggleFavorite={user ? (scenarioId, e) => handleFavoriteClick(e, scenarioId) : undefined}
                organizationName={scenario.organization_name}
              />
            ))}
          </div>
        </section>
      )}

      {/* ラインナップ（公演予定付き） */}
      <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar className="w-6 h-6" style={{ color: THEME.primary }} />
            公演ラインナップ
            {/* アクセントライン */}
            <span 
              className="w-12 h-1 ml-2"
              style={{ backgroundColor: THEME.accent }}
            />
          </h2>
          
          {/* 地域フィルター */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-32" style={{ borderRadius: 0 }}>
                <SelectValue placeholder="地域" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              style={{ borderRadius: 0 }}
              disabled={loading || isRefreshing}
              onClick={() => {
                saveScrollPositionForCurrentUrl()
                void fetchData({ silent: true })
              }}
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
              更新
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div 
              className="animate-spin h-8 w-8 border-4 border-t-transparent"
              style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
            />
          </div>
        ) : filteredScenarios.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            該当する公演がありません
          </div>
        ) : (
          <>
            {/* 2週間以内の公演 */}
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-3">
                2週間以内の公演（{withinTwoWeeks.length}件）
              </p>
              {withinTwoWeeks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {withinTwoWeeks.map((scenario, idx) => (
                    <ScenarioCard
                      key={scenario.scenario_id}
                      scenario={scenario}
                      onClick={handleScenarioClick}
                      isFavorite={favorites.has(scenario.scenario_id)}
                      isPlayed={isPlayed(scenario.scenario_id)}
                      onToggleFavorite={user ? (scenarioId, e) => handleFavoriteClick(e, scenarioId) : undefined}
                      organizationName={scenario.organization_name}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground bg-gray-50 rounded-lg">
                  <p>2週間以内の公演予定はありません</p>
                </div>
              )}
            </div>

            {/* 2週間より後の公演（折りたたみ） */}
            {afterTwoWeeks.length > 0 && (
              <div className="mt-6">
                <Button
                  variant="outline"
                  onClick={toggleAfter14Expanded}
                  className="w-full gap-2"
                  style={{ borderRadius: 0 }}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      閉じる
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      2週間より後の公演を見る（{afterTwoWeeks.length}件）
                    </>
                  )}
                </Button>
                
                {isExpanded && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {afterTwoWeeks.map((scenario) => (
                      <ScenarioCard
                        key={scenario.scenario_id}
                        scenario={scenario}
                        onClick={handleScenarioClick}
                        isFavorite={favorites.has(scenario.scenario_id)}
                        isPlayed={isPlayed(scenario.scenario_id)}
                        onToggleFavorite={user ? (scenarioId, e) => handleFavoriteClick(e, scenarioId) : undefined}
                        organizationName={scenario.organization_name}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* すべてのシナリオを見るボタン */}
        {filteredScenarios.length > 0 && (
          <div className="text-center mt-8">
            <Button
              variant="outline"
              className="inline-flex items-center gap-2 px-6 py-3 font-medium hover:scale-[1.02] transition-transform"
              style={{ 
                borderColor: THEME.primary,
                color: THEME.primary,
                borderRadius: 0,
                borderWidth: 2,
              }}
              onClick={() => {
                saveScrollPositionForCurrentUrl()
                navigate('/scenario')
              }}
            >
              すべてのシナリオを見る
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

      </section>

      {/* 参加店舗（地域別） */}
      {stores.length > 0 && (
        <section className="bg-white py-8 md:py-12">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Building2 className="w-6 h-6" style={{ color: THEME.primary }} />
              参加店舗
              <span 
                className="w-12 h-1 ml-2"
                style={{ backgroundColor: THEME.accent }}
              />
              <span className="text-sm font-normal text-gray-500 ml-2">
                {stores.length}店舗
              </span>
            </h2>
            
            <div className="space-y-6">
              {storesByRegion.sortedRegions.map(region => (
                <div key={region}>
                  <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                    <span 
                      className="w-1 h-4"
                      style={{ backgroundColor: THEME.primary }}
                    />
                    {region}
                    <span className="text-gray-400 font-normal">
                      （{storesByRegion.grouped[region].length}店舗）
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {storesByRegion.grouped[region].map(store => (
                      <div
                        key={store.id}
                        className="bg-gray-50 p-3 border border-gray-100 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
                        style={{ borderRadius: 0 }}
                        onClick={() => store.organization_slug && navigate(`/${store.organization_slug}`)}
                      >
                        <div className="flex items-start gap-3">
                          <div 
                            className="w-10 h-10 flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
                          >
                            <Building2 className="w-5 h-5" style={{ color: THEME.primary }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 text-sm hover:underline">
                              {store.name}
                            </h4>
                            <p className="text-xs text-gray-500">
                              {store.organization_name}
                            </p>
                            {store.address && (
                              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                                {store.address}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ブログ・お知らせ */}
      {blogPosts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <FileText className="w-6 h-6" style={{ color: THEME.primary }} />
            お知らせ
            <span 
              className="w-12 h-1 ml-2"
              style={{ backgroundColor: THEME.primary }}
            />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {blogPosts.map(post => (
              <article
                key={post.id}
                className="bg-white border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                style={{ borderRadius: 0 }}
                onClick={() => navigate(`/blog/${post.slug}`)}
              >
                {post.cover_image_url && (
                  <div className="aspect-[16/9] bg-gray-100 overflow-hidden">
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                    <Calendar className="w-3 h-3" />
                    {new Date(post.published_at).toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                    {post.organization_name && (
                      <>
                        <span>•</span>
                        <span>{post.organization_name}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 line-clamp-2 mb-2">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div 
          className="relative overflow-hidden p-8 md:p-12 text-center text-white"
          style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
        >
          {/* アクセント装飾 */}
          <div 
            className="absolute top-0 right-0 w-64 h-full"
            style={{ 
              background: `linear-gradient(90deg, transparent 0%, ${THEME.accent}30 100%)`,
            }}
          />
          <div 
            className="absolute bottom-0 left-0 w-32 h-1"
            style={{ backgroundColor: THEME.accent }}
          />
          
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              今すぐシナリオを探そう
            </h2>
            <p className="opacity-90 mb-6 max-w-lg mx-auto">
              様々な店舗のマーダーミステリーを検索。<br />
              あなたにぴったりの物語を見つけましょう。
            </p>
            <Button
              size="lg"
              className="bg-white hover:bg-gray-100 px-8 hover:scale-[1.02] transition-transform"
              style={{ color: THEME.primary, borderRadius: 0 }}
              onClick={() => navigate('/scenario')}
            >
              シナリオを探す
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* フッター */}
      <Footer />

      {/* 使い方ガイドポップアップ */}
      <HowToUseGuide
        organizationName={null}
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* クーポンキャンペーンポップアップ */}
      {showCouponPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-300">
          <div 
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
          >
            {/* ヘッダー */}
            <div 
              className="px-6 py-5 text-center"
              style={{ 
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)'
              }}
            >
              <button
                onClick={() => handleDismissCouponPopup(false)}
                className="absolute top-3 right-3 p-1 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-bold text-white mb-3">
                🎉 4月3日までに登録の方限定
              </div>
              <h3 className="text-white font-bold text-xl mb-1">
                新規登録キャンペーン
              </h3>
            </div>
            
            {/* コンテンツ */}
            <div className="px-6 py-6 text-center">
              <div className="mb-4">
                <p className="text-gray-600 text-sm mb-2">今なら登録するだけで</p>
                <p className="font-black text-4xl" style={{ color: THEME.primary }}>
                  2,000<span className="text-xl">円分</span>
                </p>
                <p className="text-gray-500 text-sm mt-1">500円OFFクーポン × 4枚</p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-5 text-left">
                <p className="text-xs text-gray-600 space-y-1">
                  <span className="block">✓ MMQで予約した公演にご利用いただけます</span>
                  <span className="block">✓ 1回のご予約につき1枚使用可能</span>
                  <span className="block">✓ クーポン有効期限：10月末まで</span>
                  <span className="block">✓ 他のクーポンとの併用不可</span>
                </p>
              </div>
              
              <Button
                className="w-full py-6 text-lg font-bold hover:scale-[1.02] transition-transform"
                style={{ 
                  backgroundColor: THEME.primary,
                  borderRadius: '8px'
                }}
                onClick={() => {
                  handleDismissCouponPopup(false)
                  navigate('/signup')
                }}
              >
                無料で登録してクーポンをもらう
              </Button>
            </div>
            
            {/* フッター */}
            <div className="px-6 pb-4 text-center">
              <button
                onClick={() => handleDismissCouponPopup(true)}
                className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
              >
                今後このお知らせを表示しない
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
