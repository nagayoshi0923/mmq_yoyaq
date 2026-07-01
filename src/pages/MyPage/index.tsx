import { useState, useRef, Suspense } from 'react'
import { useMyPageDataQuery, useMyPageAlbumOptionsQuery, useAddManualHistoryMutation, useDeleteManualHistoryMutation } from './hooks/useMyPageDataQuery'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Calendar, Trophy, Sparkles, Heart, Camera, Settings, Pencil, Ticket, EyeOff, Eye, UserPlus, MoreVertical, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AddPlayHistoryDialog } from './components/AddPlayHistoryDialog'
import { EditPlayHistoryDialog } from './components/EditPlayHistoryDialog'
import { ReservationsTab } from './components/ReservationsTab'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { showToast } from '@/utils/toast'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { lazyWithRetry } from '@/utils/lazyWithRetry'
import type { Reservation, Store } from '@/types'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { countManualPlayHistoryForCustomer, isManualPlayHistoryAtCap } from '@/lib/manualPlayHistoryLimit'
import { addPlayedOverride, removePlayedOverride } from '@/lib/playedOverrides'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { formatJstDateJa } from '@/utils/jstDate'

const SettingsPage = lazyWithRetry(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const WantToPlayPage = lazyWithRetry(() =>
  import('./pages/LikedScenariosPage').then((m) => ({ default: m.WantToPlayPage }))
)
const CouponsPage = lazyWithRetry(() =>
  import('./pages/CouponsPage').then((m) => ({ default: m.CouponsPage }))
)

interface ScenarioOption {
  id: string
  title: string
}

interface StoreOption {
  id: string
  name: string
}

export interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  scenario_id?: string
  scenario_slug?: string
  organization_slug?: string
  key_visual_url?: string
  is_manual?: boolean
  manual_id?: string
  reservation_id?: string
  rating?: number | null
}

/** アルバム行の一意キー（手動は manual_id、予約は reservation_id。旧形式と後方互換のため legacy キーも参照） */
function playedScenarioAlbumKey(s: PlayedScenario): string {
  if (s.reservation_id) return `res:${s.reservation_id}`
  if (s.is_manual && s.manual_id) return `manual:${s.manual_id}`
  return `legacy:${s.scenario}:${s.date ?? 'nodate'}:${s.venue ?? ''}`
}

/** 一覧に載せる行の重複除去用（同じシナリオを複数回プレイした場合はすべて残す） */
function playedScenarioListDedupeKey(p: PlayedScenario): string {
  if (p.is_manual && p.manual_id) return `manual:${p.manual_id}`
  if (p.reservation_id) return `res:${p.reservation_id}`
  if (p.scenario_id) {
    return `scenario:${p.scenario_id}:${p.date ?? 'nodate'}:${p.is_manual ? 'm' : 'r'}`
  }
  return `row:${p.scenario}:${p.date ?? ''}:${p.venue ?? ''}:${p.is_manual ? 'm' : 'r'}`
}

interface PrivateGroupSummary {
  id: string
  name: string | null
  invite_code: string
  status: string
  scenario_title: string | null
  scenario_image: string | null
  scenario_player_count_max: number | null
  member_count: number
  is_organizer: boolean
  created_at: string
  reservation_id?: string | null
  /** status が confirmed かつ紐づく予約があるとき、公演日時・店舗の1行 */
  confirmed_schedule_line?: string | null
  /** 参加中メンバー（表示名） */
  member_displays?: Array<{ name: string; is_organizer: boolean }>
  /** 登録済み候補日程の件数（主催者向け案内用） */
  candidate_dates_count: number
}

const menuItems = [
  { id: 'reservations', label: '予約', icon: Calendar },
  { id: 'coupons', label: 'クーポン', icon: Ticket },
  { id: 'album', label: 'アルバム', icon: Camera },
  { id: 'wishlist', label: '遊びたい', icon: Heart },
  { id: 'settings', label: '設定', icon: Settings },
]

export default function MyPage() {
  const { user } = useAuth()
  const { organizationId } = useOrganization()
  const navigate = useNavigate()
  // タブ・サブタブ状態をURLパラメータで管理（ブラウザバックでタブが戻る）
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'reservations'
  const reservationsSubTab = (searchParams.get('sub') ?? 'bookings') as 'bookings' | 'private' | 'cancelled'

  const setActiveTab = (tab: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('tab', tab)
    next.delete('sub')
    return next
  }, { replace: true })

  const setReservationsSubTab = (sub: 'bookings' | 'private' | 'cancelled') => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('sub', sub)
    return next
  }, { replace: true })
  
  // --- React Query ---
  const { data: myPageData, isLoading: loading } = useMyPageDataQuery(user?.id, user?.email)
  const reservations = myPageData?.reservations ?? []
  const scheduleEvents = myPageData?.scheduleEvents ?? {}
  const scenarioImages = myPageData?.scenarioImages ?? {}
  const scenarioSlugs = myPageData?.scenarioSlugs ?? {}
  const scenarioInfo = myPageData?.scenarioInfo ?? {}
  const orgSlugs = myPageData?.orgSlugs ?? {}
  const orgNames = myPageData?.orgNames ?? {}
  const stores = myPageData?.stores ?? {}
  const privateGroups = myPageData?.privateGroups ?? []
  const customerId = myPageData?.customerId ?? null
  const customerInfo = myPageData?.customerInfo ?? null

  // ratingsMap は optimistic update のためローカルステートに同期
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({})
  // playedScenarios は optimistic update（手動date変更等）のためローカルステートに同期
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])

  // myPageData.ratingsMap が変わったらローカルステートを更新
  const prevRatingsRef = useRef(myPageData?.ratingsMap)
  if (myPageData?.ratingsMap !== prevRatingsRef.current) {
    prevRatingsRef.current = myPageData?.ratingsMap
    if (myPageData?.ratingsMap) setRatingsMap(myPageData.ratingsMap)
  }
  const prevPlayedRef = useRef(myPageData?.playedScenarios)
  if (myPageData?.playedScenarios !== prevPlayedRef.current) {
    prevPlayedRef.current = myPageData?.playedScenarios
    if (myPageData?.playedScenarios) setPlayedScenarios(myPageData.playedScenarios)
  }
  // 体験済み解除（DB override）の scenario_master_id 集合。optimistic 反映のためローカルに同期
  const [playedOverrideIds, setPlayedOverrideIds] = useState<Set<string>>(new Set())
  const prevOverrideRef = useRef(myPageData?.playedOverrideIds)
  if (myPageData?.playedOverrideIds !== prevOverrideRef.current) {
    prevOverrideRef.current = myPageData?.playedOverrideIds
    if (myPageData?.playedOverrideIds) setPlayedOverrideIds(myPageData.playedOverrideIds)
  }

  // アバター画像はローカルステートで管理（アップロード後に即反映するため）
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const prevAvatarRef = useRef(myPageData?.avatarUrl)
  if (myPageData?.avatarUrl !== prevAvatarRef.current) {
    prevAvatarRef.current = myPageData?.avatarUrl
    if (myPageData?.avatarUrl && !avatarUrl) setAvatarUrl(myPageData.avatarUrl)
  }

  const stats = myPageData?.stats ?? { participationCount: 0, points: 0 }

  // Album options (遅延取得: albumタブを開いたときのみ)
  const albumOptionsFetchedRef = useRef(false)
  if (activeTab === 'album') albumOptionsFetchedRef.current = true
  const { data: albumOptionsData, isLoading: optionsLoading } = useMyPageAlbumOptionsQuery(albumOptionsFetchedRef.current)
  const scenarioOptions = albumOptionsData?.scenarioOptions ?? []
  const storeOptions = albumOptionsData?.storeOptions ?? []

  // Mutations
  const addManualHistoryMutation = useAddManualHistoryMutation(customerId, user?.id, user?.email)
  const deleteManualHistoryMutation = useDeleteManualHistoryMutation(customerId, user?.id, user?.email)

  // 手動登録用ステート
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newScenarioId, setNewScenarioId] = useState('')
  const [newPlayedAt, setNewPlayedAt] = useState('')
  const [newStoreId, setNewStoreId] = useState('')

  // アルバム編集ダイアログ用ステート
  const [editingScenario, setEditingScenario] = useState<PlayedScenario | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [showHiddenItems, setShowHiddenItems] = useState(false)
  const [editingDate, setEditingDate] = useState<string>('')
  const [isEditingDate, setIsEditingDate] = useState(false)

  const [albumSortOrder, setAlbumSortOrder] = useState<'date' | 'rating_desc' | 'rating_asc'>('date')

  // 削除したプレイ履歴（予約ベース用、localStorageで管理）
  const [deletedPlays, setDeletedPlays] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('deleted_played_scenarios')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  // 日付オーバーライド（予約ベース用、localStorageで管理）
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('played_scenarios_date_overrides')
    return saved ? JSON.parse(saved) : {}
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 表示名：ニックネーム > 名前 > メール > ゲスト
  const displayName = customerInfo?.nickname || customerInfo?.name || user?.email?.split('@')[0] || 'ゲスト'
  
  // アバター画像選択ハンドラ
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }
  
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.email) return

    try {
      // 🔒 ファイルタイプ検証（セキュリティ強化）
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        toast.error('画像ファイル（JPEG, PNG, GIF, WebP）のみアップロード可能です')
        return
      }

      // ファイルサイズチェック（2MB以下）
      if (file.size > 2 * 1024 * 1024) {
        toast.error('画像サイズは2MB以下にしてください')
        return
      }

      // 即座にプレビュー表示
      const reader = new FileReader()
      reader.onload = (event) => {
        setAvatarUrl(event.target?.result as string)
      }
      reader.readAsDataURL(file)

      // 🔒 MIMEタイプから拡張子を決定（偽装防止）
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
      }
      const fileExt = extMap[file.type] || 'jpg'
      const fileName = `${user.id}_${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('customer-avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        logger.error('アバターアップロードエラー:', uploadError)
        // Storageが設定されていない場合はローカルプレビューのみで続行
        return
      }

      // 公開URLを取得
      const { data: { publicUrl } } = supabase.storage
        .from('customer-avatars')
        .getPublicUrl(filePath)

      // customersテーブルを更新
      const { error: updateError } = await supabase
        .from('customers')
        .update({ avatar_url: publicUrl })
        .eq('email', user.email)

      if (updateError) {
        logger.error('アバターURL更新エラー:', updateError)
      } else {
        setAvatarUrl(publicUrl)
        logger.log('アバター画像を保存しました')
      }
    } catch (error) {
      logger.error('アバター処理エラー:', error)
    }
  }


  // 手動登録を追加
  const handleAddManualHistory = async () => {
    if (!customerId || !newScenarioId) { showToast.error('シナリオは必須です'); return }
    try {
      await addManualHistoryMutation.mutateAsync({ scenarioId: newScenarioId, scenarioOptions, playedAt: newPlayedAt, storeId: newStoreId, storeOptions })
      setIsAddDialogOpen(false)
      setNewScenarioId('')
      setNewPlayedAt('')
      setNewStoreId('')
    } catch { /* エラーはmutation内で処理済み */ }
  }

  // 手動登録を削除
  const handleDeleteManualHistory = async (manualId: string) => {
    try {
      await deleteManualHistoryMutation.mutateAsync(manualId)
      setPlayedScenarios(prev => prev.filter(p => p.manual_id !== manualId))
      setIsEditDialogOpen(false)
      setEditingScenario(null)
    } catch { /* エラーはmutation内で処理済み */ }
  }

  // おすすめ度を保存（upsert）
  const handleRatingChange = async (scenario: PlayedScenario, rating: number) => {
    if (!customerId || !scenario.scenario_id) return
    const prevRating = ratingsMap[scenario.scenario_id]
    // 同じ評価をクリックした場合は削除（トグル）
    const newRating = prevRating === rating ? null : rating

    // UI即時反映
    setRatingsMap(prev => {
      const next = { ...prev }
      if (newRating === null) {
        delete next[scenario.scenario_id!]
      } else {
        next[scenario.scenario_id!] = newRating
      }
      return next
    })
    setPlayedScenarios(prev => prev.map(p =>
      p.scenario_id === scenario.scenario_id ? { ...p, rating: newRating } : p
    ))

    try {
      if (newRating === null) {
        await supabase
          .from('scenario_ratings')
          .delete()
          .eq('customer_id', customerId)
          .eq('scenario_master_id', scenario.scenario_id)
      } else {
        await supabase
          .from('scenario_ratings')
          .upsert({
            customer_id: customerId,
            scenario_master_id: scenario.scenario_id,
            rating: newRating,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'customer_id,scenario_master_id' })
      }
    } catch (error) {
      logger.error('評価保存エラー:', error)
      showToast.error('評価の保存に失敗しました')
    }
  }

  // アルバムから非表示（予約ベースのプレイ履歴はローカルで非表示）
  const [hiddenPlays, setHiddenPlays] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('hidden_played_scenarios')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  // 非表示＝アルバムの表示整理だけ（体験済みのまま・予約サイト/詳細には影響しない。localStorage で端末ローカル管理）
  const handleHideFromAlbum = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    setHiddenPlays(prev => {
      const newSet = new Set(prev)
      newSet.add(key)
      localStorage.setItem('hidden_played_scenarios', JSON.stringify(Array.from(newSet)))
      return newSet
    })
    setIsEditDialogOpen(false)
    setEditingScenario(null)
    showToast.success('アルバムから非表示にしました')
  }

  // アルバムで再表示
  const handleShowInAlbum = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    setHiddenPlays(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      localStorage.setItem('hidden_played_scenarios', JSON.stringify(Array.from(newSet)))
      return newSet
    })
    setIsEditDialogOpen(false)
    setEditingScenario(null)
    showToast.success('アルバムに再表示しました')
  }

  // 未体験に戻す＝記録の訂正（実際はプレイしていない）。DB override を書き、予約サイト/詳細でも未体験になる。
  // 予約由来の登録顧客のみ（手動履歴は「削除」で消せるため対象外）。
  const handleMarkUnplayed = async (scenario: PlayedScenario) => {
    const smId = scenario.scenario_id
    if (!customerId || !smId) return
    setIsEditDialogOpen(false)
    setEditingScenario(null)
    setPlayedOverrideIds(prev => new Set(prev).add(smId)) // optimistic
    try {
      await addPlayedOverride(customerId, smId)
      showToast.success('未体験に戻しました（予約サイトにも反映されます）')
    } catch (error) {
      logger.error('未体験への変更エラー:', error)
      setPlayedOverrideIds(prev => { const next = new Set(prev); next.delete(smId); return next })
      showToast.error('未体験への変更に失敗しました')
    }
  }

  // 体験済みに戻す＝未体験の取り消し（override を削除）
  const handleMarkPlayed = async (scenario: PlayedScenario) => {
    const smId = scenario.scenario_id
    if (!customerId || !smId) return
    setIsEditDialogOpen(false)
    setEditingScenario(null)
    setPlayedOverrideIds(prev => { const next = new Set(prev); next.delete(smId); return next }) // optimistic
    try {
      await removePlayedOverride(customerId, smId)
      showToast.success('体験済みに戻しました')
    } catch (error) {
      logger.error('体験済みへの復帰エラー:', error)
      setPlayedOverrideIds(prev => new Set(prev).add(smId))
      showToast.error('体験済みへの復帰に失敗しました')
    }
  }

  // アイテムが「非表示」（アルバム整理・体験済みのまま）かどうか＝localStorage のみ
  const isScenarioHidden = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    const legacy = scenario.reservation_id || `${scenario.scenario}-${scenario.date}`
    return hiddenPlays.has(key) || hiddenPlays.has(legacy)
  }

  // アイテムが「未体験に戻された」（DB override）かどうか＝予約サイト/詳細でも未体験
  const isScenarioOverridden = (scenario: PlayedScenario) => {
    return scenario.scenario_id ? playedOverrideIds.has(scenario.scenario_id) : false
  }

  // 通常一覧に出さない（非表示 or 未体験 or 削除済み）か
  const isScenarioExcluded = (scenario: PlayedScenario) =>
    isScenarioHidden(scenario) || isScenarioOverridden(scenario) || isScenarioDeleted(scenario)

  // アルバムの並び替え比較（メイン一覧と非表示セクションで共通）
  const albumComparator = (a: PlayedScenario, b: PlayedScenario) => {
    if (albumSortOrder === 'rating_desc') return (b.rating ?? 0) - (a.rating ?? 0)
    if (albumSortOrder === 'rating_asc') { const ra = a.rating ?? 6; const rb = b.rating ?? 6; return ra - rb }
    // date order (default)
    if (a.is_manual && !a.date && !(b.is_manual && !b.date)) return -1
    if (b.is_manual && !b.date && !(a.is_manual && !a.date)) return 1
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  }

  // アルバムのカード描画（メイン一覧と非表示セクションで共通）
  const renderAlbumCard = (scenario: PlayedScenario) => {
    const isHidden = isScenarioHidden(scenario)
    const isDeleted = isScenarioDeleted(scenario)
    const isOverridden = isScenarioOverridden(scenario)
    return (
      <div
        key={playedScenarioAlbumKey(scenario)}
        className={`overflow-hidden bg-white shadow-sm hover:shadow-lg border border-gray-200 hover:border-gray-300 group relative ${isHidden || isDeleted || isOverridden ? 'opacity-50' : ''}`}
        style={{ borderRadius: 0 }}
      >
        {/* ステータスバッジ（未体験＞削除済み＞非表示 の優先） */}
        {(isOverridden || isHidden || isDeleted) && (
          <div className={`absolute top-2 left-2 z-10 text-white text-xs px-2 py-0.5 rounded ${isOverridden ? 'bg-amber-600/80' : isDeleted ? 'bg-red-600/80' : 'bg-gray-800/80'}`}>
            {isOverridden ? '未体験' : isDeleted ? '削除済み' : '非表示'}
          </div>
        )}
        {/* 画像部分 */}
        <div
          className="aspect-[4/3] relative bg-gray-100 cursor-pointer"
          onClick={() => {
            if (scenario.scenario_id) {
              const scenarioSlug = scenario.scenario_slug || scenario.scenario_id
              const url = scenario.organization_slug
                ? `/${scenario.organization_slug}/scenario/${scenarioSlug}`
                : `/scenario/${scenarioSlug}`
              navigate(url)
            }
          }}
        >
          {scenario.key_visual_url ? (
            <>
              <div
                className="absolute inset-0 scale-110"
                style={{
                  backgroundImage: `url(${scenario.key_visual_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(10px) brightness(0.7)',
                }}
              />
              <img
                src={scenario.key_visual_url}
                alt={scenario.scenario}
                className="relative w-full h-full object-contain"
                loading="lazy"
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <span className="text-4xl opacity-30">🎭</span>
            </div>
          )}
        </div>
        {/* タイトル・日付部分 */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1" title={scenario.scenario}>
                {scenario.scenario || '（タイトル不明）'}
              </p>
              <p className="text-xs text-gray-500">
                {scenario.date ? formatJstDateJa(scenario.date) : '日付不明'}
              </p>
              {scenario.venue && scenario.venue !== '店舗情報なし' && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{scenario.venue}</p>
              )}
            </div>
            {/* 編集ボタン */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
              onClick={(e) => {
                e.stopPropagation()
                handleOpenEditDialog(scenario)
              }}
              title="編集"
            >
              <MoreVertical className="h-4 w-4 text-gray-500" />
            </Button>
          </div>
          {/* おすすめ度（星評価） */}
          {scenario.scenario_id && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-xs text-gray-400">おすすめ度</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRatingChange(scenario, star)
                    }}
                    className="p-0.5 hover:scale-110 transition-transform"
                    title={`おすすめ度 ${star}`}
                  >
                    <Star
                      className="h-3.5 w-3.5"
                      fill={scenario.rating && scenario.rating >= star ? '#f59e0b' : 'none'}
                      stroke={scenario.rating && scenario.rating >= star ? '#f59e0b' : '#d1d5db'}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
  
  // アイテムが削除済みかどうか
  const isScenarioDeleted = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    const legacy = scenario.reservation_id || `${scenario.scenario}-${scenario.date}`
    return deletedPlays.has(key) || deletedPlays.has(legacy)
  }
  
  // 予約ベースのプレイ履歴を削除
  const handleDeleteReservationHistory = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    setDeletedPlays(prev => {
      const newSet = new Set(prev)
      newSet.add(key)
      localStorage.setItem('deleted_played_scenarios', JSON.stringify(Array.from(newSet)))
      return newSet
    })
    // 非表示からも削除（重複を避ける）
    setHiddenPlays(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      newSet.delete(scenario.reservation_id || `${scenario.scenario}-${scenario.date}`)
      localStorage.setItem('hidden_played_scenarios', JSON.stringify(Array.from(newSet)))
      return newSet
    })
    setIsEditDialogOpen(false)
    setEditingScenario(null)
    showToast.success('履歴を削除しました')
  }
  
  // 削除した履歴を復元
  const handleRestoreDeletedHistory = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    setDeletedPlays(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      newSet.delete(scenario.reservation_id || `${scenario.scenario}-${scenario.date}`)
      localStorage.setItem('deleted_played_scenarios', JSON.stringify(Array.from(newSet)))
      return newSet
    })
    setIsEditDialogOpen(false)
    setEditingScenario(null)
    showToast.success('履歴を復元しました')
  }
  
  // 日付を更新（手動履歴）
  const handleUpdateManualDate = async (manualId: string, newDate: string) => {
    if (!customerId) {
      showToast.error('顧客情報が取得できません。再ログインしてお試しください。')
      return
    }
    try {
      const { data, error } = await supabase
        .from('manual_play_history')
        .update({ played_at: newDate })
        .eq('id', manualId)
        .eq('customer_id', customerId)
        .select('id')

      if (error) throw error
      if (!data?.length) {
        logger.error('手動履歴日付更新: 0件（RLSまたはID不一致）', { manualId, customerId })
        showToast.error('更新できませんでした。ページを再読み込みしてから再度お試しください。')
        return
      }

      // ローカルステートを更新
      setPlayedScenarios(prev => prev.map(p =>
        p.manual_id === manualId ? { ...p, date: newDate } : p
      ))
      setIsEditingDate(false)
      showToast.success('日付を更新しました')
    } catch (error) {
      logger.error('日付更新エラー:', error)
      showToast.error('日付の更新に失敗しました')
    }
  }
  
  // 日付を更新（予約ベース、localStorageで管理）
  const handleUpdateReservationDate = (scenario: PlayedScenario, newDate: string) => {
    const key = playedScenarioAlbumKey(scenario)
    const legacyKey = scenario.reservation_id || `${scenario.scenario}-${scenario.date}`
    const newOverrides = { ...dateOverrides, [key]: newDate }
    setDateOverrides(newOverrides)
    localStorage.setItem('played_scenarios_date_overrides', JSON.stringify(newOverrides))
    
    // ローカルステートも更新
    setPlayedScenarios(prev => prev.map(p => {
      const pKey = playedScenarioAlbumKey(p)
      const pLegacy = p.reservation_id || `${p.scenario}-${p.date}`
      return pKey === key || pLegacy === legacyKey ? { ...p, date: newDate } : p
    }))
    setIsEditingDate(false)
    showToast.success('日付を更新しました')
  }
  
  // 編集ダイアログを開く
  const handleOpenEditDialog = (scenario: PlayedScenario) => {
    setEditingScenario(scenario)
    setEditingDate(scenario.date || '')
    setIsEditingDate(false)
    setIsEditDialogOpen(true)
  }

  const formatTime = (dateString: string) => {
    const timeMatch = dateString.match(/T(\d{2}):(\d{2})/)
    if (timeMatch) return `${timeMatch[1]}:${timeMatch[2]}`
    return ''
  }

  // 公演成立状況を取得
  const getPerformanceStatus = (reservation: Reservation) => {
    // キャンセル済みは参加状況より優先して「キャンセル済み」を表示
    if (reservation.status === 'cancelled') {
      return { type: 'cancelled', label: 'キャンセル済み', color: 'bg-gray-100 text-gray-500' }
    }

    const event = reservation.schedule_event_id ? scheduleEvents[reservation.schedule_event_id] : null
    
    // 貸切公演は状況表示不要
    if (event?.category === 'private') {
      return null
    }
    
    const scenarioData = reservation.scenario_master_id ? scenarioInfo[reservation.scenario_master_id] : null
    const current = event?.current_participants || 0
    const max = event?.max_participants || scenarioData?.max || 8
    const min = scenarioData?.min || 1
    
    if (current >= max) {
      return { type: 'full', label: '満席', color: 'bg-green-100 text-green-700' }
    } else if (current >= min) {
      const remaining = max - current
      // 最少人数は満た済み。「残○席」だけだと「成立まであと○席」と誤読されやすいので満席までと明示
      return {
        type: 'confirmed',
        label: `公演成立済み（満席まであと${remaining}席）`,
        color: 'bg-blue-100 text-blue-700',
      }
    } else {
      const remaining = min - current
      return { type: 'pending', label: `あと${remaining}名で成立`, color: 'bg-amber-100 text-amber-700' }
    }
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
  // キャンセル済みは現役リストに混ぜず、専用サブタブで「注文履歴」として表示（新しい順）
  const cancelledReservations = reservations
    .filter(r => r.status === 'cancelled')
    .sort((a, b) => new Date(b.requested_datetime).getTime() - new Date(a.requested_datetime).getTime())
  // 調整中の貸切申込み（pending, pending_gm, gm_confirmed, pending_store）- 申込順（新しい順）
  const pendingPrivateBookings = reservations
    .filter(
      r => r.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE &&
           ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(r.status)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // タブごとのカウント
  // 表示するグループ: gathering（日程調整前）, date_adjusting（日程調整中）, booking_requested（申込済み）, confirmed（確定済み）
  const activePrivateGroups = privateGroups.filter(g => ['gathering', 'date_adjusting', 'booking_requested', 'confirmed'].includes(g.status))
  const getCounts = () => ({
    reservations: upcomingReservations.length + pendingPrivateBookings.length + activePrivateGroups.length,
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
              </div>
            </div>

            {/* 通知ボタン - 未実装のため非表示 */}
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
        {loading && (activeTab === 'reservations' || activeTab === 'album') ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : (
          <>
            {activeTab === 'reservations' && (
              <ReservationsTab
                privateGroups={privateGroups}
                activePrivateGroups={activePrivateGroups}
                pendingPrivateBookings={pendingPrivateBookings}
                upcomingReservations={upcomingReservations}
                pastReservations={pastReservations}
                cancelledReservations={cancelledReservations}
                scheduleEvents={scheduleEvents}
                scenarioImages={scenarioImages}
                orgNames={orgNames}
                stores={stores}
                reservationsSubTab={reservationsSubTab}
                setReservationsSubTab={setReservationsSubTab}
                cleanTitle={cleanTitle}
                getDaysUntil={getDaysUntil}
                getPerformanceDateTime={getPerformanceDateTime}
                getPerformanceStatus={getPerformanceStatus}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'coupons' && (
              <Suspense fallback={<div className="text-center py-12 text-gray-500">読み込み中...</div>}>
                <CouponsPage />
              </Suspense>
            )}

            {activeTab === 'album' && (
              <div className="space-y-6">
                {/* 踏破率 - シャープデザイン */}
                <div className="bg-white shadow-sm p-6 border border-gray-200" style={{ borderRadius: 0 }}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-gray-900">体験済みシナリオ</h2>
                    <span className="text-2xl font-bold" style={{ color: THEME.primary }}>{playedScenarios.filter(s => {
                      const key = playedScenarioAlbumKey(s)
                      const legacy = s.reservation_id || `${s.scenario}-${s.date}`
                      return !hiddenPlays.has(key) && !hiddenPlays.has(legacy)
                    }).length}作品</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      これまでに参加したマーダーミステリーの記録です
                    </p>
                    <AddPlayHistoryDialog
                      isAddDialogOpen={isAddDialogOpen}
                      setIsAddDialogOpen={setIsAddDialogOpen}
                      scenarioOptions={scenarioOptions}
                      storeOptions={storeOptions}
                      optionsLoading={optionsLoading}
                      newScenarioId={newScenarioId}
                      setNewScenarioId={setNewScenarioId}
                      newPlayedAt={newPlayedAt}
                      setNewPlayedAt={setNewPlayedAt}
                      newStoreId={newStoreId}
                      setNewStoreId={setNewStoreId}
                      handleAddManualHistory={handleAddManualHistory}
                      addManualHistoryMutation={addManualHistoryMutation}
                    />
                  </div>
                </div>

                {/* シナリオグリッド */}
                {playedScenarios.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1 h-6 rounded-full" style={{ backgroundColor: THEME.primary }}></span>
                        体験済みシナリオ
                      </h2>
                      <div className="flex items-center gap-2">
                        {/* ソート */}
                        <select
                          value={albumSortOrder}
                          onChange={e => setAlbumSortOrder(e.target.value as typeof albumSortOrder)}
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                        >
                          <option value="date">体験日順</option>
                          <option value="rating_desc">おすすめ度（高い順）</option>
                          <option value="rating_asc">おすすめ度（低い順）</option>
                        </select>
                      </div>
                    </div>

                    {/* メイン一覧は通常の体験済みのみ（非表示・未体験・削除済みは下のセクションへ） */}
                    {(() => {
                      const shown = playedScenarios.filter(s => !isScenarioExcluded(s))
                      if (shown.length === 0) {
                        return <p className="text-sm text-gray-400 py-6 text-center">表示中の体験済みシナリオはありません</p>
                      }
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {shown.sort(albumComparator).map(renderAlbumCard)}
                        </div>
                      )
                    })()}
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
                
                {/* 非表示・未体験・削除済みシナリオセクション（メイン一覧には混ぜず、ここにまとめて表示） */}
                {(() => {
                  const excluded = playedScenarios.filter(isScenarioExcluded)
                  if (excluded.length === 0) return null
                  return (
                    <div className="mt-8">
                      <button
                        onClick={() => setShowHiddenItems(v => !v)}
                        className="w-full p-4 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                        style={{ borderRadius: 0 }}
                      >
                        <div className="flex items-center justify-center gap-2 text-gray-500">
                          {showHiddenItems ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          <span className="text-sm">
                            非表示・未体験・削除済みのシナリオ ({excluded.length}件)
                          </span>
                          <span className="text-xs text-gray-400">{showHiddenItems ? '— 閉じる' : '— 開く'}</span>
                        </div>
                      </button>
                      {showHiddenItems && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
                          {excluded.sort(albumComparator).map(renderAlbumCard)}
                        </div>
                      )}
                    </div>
                  )
                })()}
                
                {/* アルバム編集ダイアログ */}
                <EditPlayHistoryDialog
                  isEditDialogOpen={isEditDialogOpen}
                  setIsEditDialogOpen={setIsEditDialogOpen}
                  setEditingScenario={setEditingScenario}
                  setIsEditingDate={setIsEditingDate}
                  editingScenario={editingScenario}
                  editingDate={editingDate}
                  setEditingDate={setEditingDate}
                  isEditingDate={isEditingDate}
                  handleUpdateManualDate={handleUpdateManualDate}
                  handleUpdateReservationDate={handleUpdateReservationDate}
                  isScenarioOverridden={isScenarioOverridden}
                  isScenarioDeleted={isScenarioDeleted}
                  isScenarioHidden={isScenarioHidden}
                  handleMarkPlayed={handleMarkPlayed}
                  handleRestoreDeletedHistory={handleRestoreDeletedHistory}
                  handleShowInAlbum={handleShowInAlbum}
                  handleHideFromAlbum={handleHideFromAlbum}
                  handleMarkUnplayed={handleMarkUnplayed}
                  handleDeleteManualHistory={handleDeleteManualHistory}
                  handleDeleteReservationHistory={handleDeleteReservationHistory}
                />
              </div>
            )}

            {activeTab === 'wishlist' && (
              <Suspense fallback={<div className="text-center py-12 text-gray-500">読み込み中...</div>}>
                <WantToPlayPage />
              </Suspense>
            )}

            {activeTab === 'settings' && (
              <Suspense fallback={<div className="text-center py-12 text-gray-500">読み込み中...</div>}>
                <SettingsPage />
              </Suspense>
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
          onClick={() => navigate('/')}
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      </div>
    </div>
  )
}
