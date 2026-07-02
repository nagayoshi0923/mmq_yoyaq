import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMyPageDataQuery, useMyPageAlbumOptionsQuery, useAddManualHistoryMutation, useDeleteManualHistoryMutation, myPageKeys } from './hooks/useMyPageDataQuery'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ReservationsTab } from './components/ReservationsTab'
import { MyPageContent } from './MyPageContent'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { showToast } from '@/utils/toast'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { countManualPlayHistoryForCustomer, isManualPlayHistoryAtCap } from '@/lib/manualPlayHistoryLimit'
import { addPlayedOverride, removePlayedOverride } from '@/lib/playedOverrides'

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
// キャッシュヒットで再マウントした際も初回同期を発火させるためのセンチネル（未同期）
const SYNC_UNSET = Symbol('mypage-sync-unset')

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

export default function MyPage() {
  const { user } = useAuth()
  const { organizationId } = useOrganization()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const prevRatingsRef = useRef<unknown>(SYNC_UNSET)
  if (myPageData?.ratingsMap !== prevRatingsRef.current) {
    prevRatingsRef.current = myPageData?.ratingsMap
    if (myPageData?.ratingsMap) setRatingsMap(myPageData.ratingsMap)
  }
  const prevPlayedRef = useRef<unknown>(SYNC_UNSET)
  if (myPageData?.playedScenarios !== prevPlayedRef.current) {
    prevPlayedRef.current = myPageData?.playedScenarios
    if (myPageData?.playedScenarios) setPlayedScenarios(myPageData.playedScenarios)
  }
  // 体験済み解除（DB override）の scenario_master_id 集合。optimistic 反映のためローカルに同期
  const [playedOverrideIds, setPlayedOverrideIds] = useState<Set<string>>(new Set())
  const prevOverrideRef = useRef<unknown>(SYNC_UNSET)
  if (myPageData?.playedOverrideIds !== prevOverrideRef.current) {
    prevOverrideRef.current = myPageData?.playedOverrideIds
    if (myPageData?.playedOverrideIds) setPlayedOverrideIds(myPageData.playedOverrideIds)
  }

  // アバター画像はローカルステートで管理（アップロード後に即反映するため）
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const prevAvatarRef = useRef<unknown>(SYNC_UNSET)
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
  // 重複登録確認ダイアログ用ステート（同じシナリオが既に登録されている場合に表示）
  const [duplicateConfirmTitle, setDuplicateConfirmTitle] = useState<string | null>(null)

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
        // クエリを無効化して再取得（別ページ遷移→再マウント時に新アバターが復元されるように）
        queryClient.invalidateQueries({ queryKey: myPageKeys.data(user?.id ?? '', user?.email ?? '') })
        logger.log('アバター画像を保存しました')
      }
    } catch (error) {
      logger.error('アバター処理エラー:', error)
    }
  }


  // 手動登録の実処理（重複確認が不要 or 確認済みの場合に実行）
  const proceedAddManualHistory = async () => {
    try {
      await addManualHistoryMutation.mutateAsync({ scenarioId: newScenarioId, scenarioOptions, playedAt: newPlayedAt, storeId: newStoreId, storeOptions })
      setIsAddDialogOpen(false)
      setNewScenarioId('')
      setNewPlayedAt('')
      setNewStoreId('')
    } catch { /* エラーはmutation内で処理済み */ }
  }

  // 手動登録を追加
  const handleAddManualHistory = async () => {
    if (!customerId || !newScenarioId) { showToast.error('シナリオは必須です'); return }
    // 既に登録済み（予約 or 手動）のシナリオなら確認してから追加（同じ作品の再プレイは許容）
    const alreadyRegistered = playedScenarios.some(s => s.scenario_id === newScenarioId)
    if (alreadyRegistered) {
      const title = scenarioOptions.find(o => o.id === newScenarioId)?.title || 'このシナリオ'
      setDuplicateConfirmTitle(title)
      return
    }
    await proceedAddManualHistory()
  }

  // 重複登録確認ダイアログで「登録する」が押されたときの続行処理
  const handleConfirmDuplicateAdd = async () => {
    setDuplicateConfirmTitle(null)
    await proceedAddManualHistory()
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

  // アイテムが削除済みかどうか
  const isScenarioDeleted = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    const legacy = scenario.reservation_id || `${scenario.scenario}-${scenario.date}`
    return deletedPlays.has(key) || deletedPlays.has(legacy)
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
  return (
    <MyPageContent
      activeTab={activeTab}
      reservationsSubTab={reservationsSubTab}
      setActiveTab={setActiveTab}
      setReservationsSubTab={setReservationsSubTab}
      navigate={navigate}
      displayName={displayName}
      avatarUrl={avatarUrl}
      fileInputRef={fileInputRef}
      handleAvatarClick={handleAvatarClick}
      handleAvatarChange={handleAvatarChange}
      loading={loading}
      optionsLoading={optionsLoading}
      customerId={customerId}
      stats={stats}
      stores={stores}
      orgNames={orgNames}
      scenarioImages={scenarioImages}
      scenarioInfo={scenarioInfo}
      scheduleEvents={scheduleEvents}
      reservations={reservations}
      privateGroups={privateGroups}
      scenarioOptions={scenarioOptions}
      storeOptions={storeOptions}
      playedScenarios={playedScenarios}
      setPlayedScenarios={setPlayedScenarios}
      albumComparator={albumComparator}
      playedScenarioAlbumKey={playedScenarioAlbumKey}
      albumSortOrder={albumSortOrder}
      setAlbumSortOrder={setAlbumSortOrder}
      showHiddenItems={showHiddenItems}
      setShowHiddenItems={setShowHiddenItems}
      hiddenPlays={hiddenPlays}
      setHiddenPlays={setHiddenPlays}
      deletedPlays={deletedPlays}
      setDeletedPlays={setDeletedPlays}
      dateOverrides={dateOverrides}
      setDateOverrides={setDateOverrides}
      isScenarioHidden={isScenarioHidden}
      isScenarioOverridden={isScenarioOverridden}
      isScenarioExcluded={isScenarioExcluded}
      isScenarioDeleted={isScenarioDeleted}
      handleRatingChange={handleRatingChange}
      handleHideFromAlbum={handleHideFromAlbum}
      handleShowInAlbum={handleShowInAlbum}
      handleMarkPlayed={handleMarkPlayed}
      handleMarkUnplayed={handleMarkUnplayed}
      isAddDialogOpen={isAddDialogOpen}
      setIsAddDialogOpen={setIsAddDialogOpen}
      isEditDialogOpen={isEditDialogOpen}
      setIsEditDialogOpen={setIsEditDialogOpen}
      editingScenario={editingScenario}
      setEditingScenario={setEditingScenario}
      editingDate={editingDate}
      setEditingDate={setEditingDate}
      isEditingDate={isEditingDate}
      setIsEditingDate={setIsEditingDate}
      newScenarioId={newScenarioId}
      setNewScenarioId={setNewScenarioId}
      newStoreId={newStoreId}
      setNewStoreId={setNewStoreId}
      newPlayedAt={newPlayedAt}
      setNewPlayedAt={setNewPlayedAt}
      addManualHistoryMutation={addManualHistoryMutation}
      handleAddManualHistory={handleAddManualHistory}
      handleDeleteManualHistory={handleDeleteManualHistory}
      duplicateConfirmTitle={duplicateConfirmTitle}
      setDuplicateConfirmTitle={setDuplicateConfirmTitle}
      handleConfirmDuplicateAdd={handleConfirmDuplicateAdd}
    />
  )
}
