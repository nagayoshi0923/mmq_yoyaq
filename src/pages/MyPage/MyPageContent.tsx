// マイページ本体（プロフィール/アルバム/タブ・renderAlbumCard 含む）
// MyPage/index.tsx から presentational 抽出（byte 逐語移送・挙動不変）
import React, { Suspense } from 'react'
import { lazyWithRetry } from '@/utils/lazyWithRetry'
import { Button } from '@/components/ui/button'
import { Calendar, Trophy, Sparkles, Heart, Camera, Settings, Pencil, Ticket, EyeOff, Eye, MoreVertical, Star } from 'lucide-react'
import { AddPlayHistoryDialog } from './components/AddPlayHistoryDialog'
import { EditPlayHistoryDialog } from './components/EditPlayHistoryDialog'
import { ReservationsTab } from './components/ReservationsTab'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { formatJstDateJa } from '@/utils/jstDate'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { supabase } from '@/lib/supabase'
import type { Reservation } from '@/types'
import type { PlayedScenario } from '.'
import type { useMyPageDataQuery, useMyPageAlbumOptionsQuery, useAddManualHistoryMutation } from './hooks/useMyPageDataQuery'

const SettingsPage = lazyWithRetry(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const WantToPlayPage = lazyWithRetry(() =>
  import('./pages/LikedScenariosPage').then((m) => ({ default: m.WantToPlayPage }))
)
const CouponsPage = lazyWithRetry(() =>
  import('./pages/CouponsPage').then((m) => ({ default: m.CouponsPage }))
)

const menuItems = [
  { id: 'reservations', label: '予約', icon: Calendar },
  { id: 'coupons', label: 'クーポン', icon: Ticket },
  { id: 'album', label: 'アルバム', icon: Camera },
  { id: 'wishlist', label: '遊びたい', icon: Heart },
  { id: 'settings', label: '設定', icon: Settings },
]

type MyPageData = NonNullable<ReturnType<typeof useMyPageDataQuery>['data']>
type AlbumOptionsData = NonNullable<ReturnType<typeof useMyPageAlbumOptionsQuery>['data']>

interface MyPageContentProps {
  activeTab: string
  reservationsSubTab: 'bookings' | 'private' | 'cancelled'
  setActiveTab: (tab: string) => void
  setReservationsSubTab: (sub: 'bookings' | 'private' | 'cancelled') => void
  navigate: (path: string) => void
  displayName: string
  avatarUrl: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  handleAvatarClick: () => void
  handleAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  loading: boolean
  optionsLoading: boolean
  customerId: string | null
  stats: MyPageData['stats']
  stores: MyPageData['stores']
  orgNames: MyPageData['orgNames']
  scenarioImages: MyPageData['scenarioImages']
  scenarioInfo: MyPageData['scenarioInfo']
  scheduleEvents: MyPageData['scheduleEvents']
  reservations: MyPageData['reservations']
  privateGroups: MyPageData['privateGroups']
  scenarioOptions: AlbumOptionsData['scenarioOptions']
  storeOptions: AlbumOptionsData['storeOptions']
  playedScenarios: PlayedScenario[]
  setPlayedScenarios: React.Dispatch<React.SetStateAction<PlayedScenario[]>>
  albumComparator: (a: PlayedScenario, b: PlayedScenario) => number
  playedScenarioAlbumKey: (s: PlayedScenario) => string
  albumSortOrder: 'date' | 'rating_desc' | 'rating_asc'
  setAlbumSortOrder: React.Dispatch<React.SetStateAction<'date' | 'rating_desc' | 'rating_asc'>>
  showHiddenItems: boolean
  setShowHiddenItems: React.Dispatch<React.SetStateAction<boolean>>
  hiddenPlays: Set<string>
  setHiddenPlays: React.Dispatch<React.SetStateAction<Set<string>>>
  deletedPlays: Set<string>
  setDeletedPlays: React.Dispatch<React.SetStateAction<Set<string>>>
  dateOverrides: Record<string, string>
  setDateOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>
  isScenarioHidden: (scenario: PlayedScenario) => boolean
  isScenarioOverridden: (scenario: PlayedScenario) => boolean
  isScenarioExcluded: (scenario: PlayedScenario) => boolean
  isScenarioDeleted: (scenario: PlayedScenario) => boolean
  handleRatingChange: (scenario: PlayedScenario, rating: number) => Promise<void>
  handleHideFromAlbum: (scenario: PlayedScenario) => void
  handleShowInAlbum: (scenario: PlayedScenario) => void
  handleMarkPlayed: (scenario: PlayedScenario) => Promise<void>
  handleMarkUnplayed: (scenario: PlayedScenario) => Promise<void>
  isAddDialogOpen: boolean
  setIsAddDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  isEditDialogOpen: boolean
  setIsEditDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  editingScenario: PlayedScenario | null
  setEditingScenario: React.Dispatch<React.SetStateAction<PlayedScenario | null>>
  editingDate: string
  setEditingDate: React.Dispatch<React.SetStateAction<string>>
  isEditingDate: boolean
  setIsEditingDate: React.Dispatch<React.SetStateAction<boolean>>
  newScenarioId: string
  setNewScenarioId: React.Dispatch<React.SetStateAction<string>>
  newStoreId: string
  setNewStoreId: React.Dispatch<React.SetStateAction<string>>
  newPlayedAt: string
  setNewPlayedAt: React.Dispatch<React.SetStateAction<string>>
  addManualHistoryMutation: ReturnType<typeof useAddManualHistoryMutation>
  handleAddManualHistory: () => Promise<void>
  handleDeleteManualHistory: (manualId: string) => Promise<void>
}

export function MyPageContent({
  activeTab, reservationsSubTab, setActiveTab, setReservationsSubTab, navigate, displayName, avatarUrl, fileInputRef,
  handleAvatarClick, handleAvatarChange, loading, optionsLoading, customerId, stats, stores, orgNames, scenarioImages,
  scenarioInfo, scheduleEvents, reservations, privateGroups, scenarioOptions, storeOptions, playedScenarios, setPlayedScenarios,
  albumComparator, playedScenarioAlbumKey, albumSortOrder, setAlbumSortOrder, showHiddenItems, setShowHiddenItems,
  hiddenPlays, setHiddenPlays, deletedPlays, setDeletedPlays, dateOverrides, setDateOverrides,
  isScenarioHidden, isScenarioOverridden, isScenarioExcluded, isScenarioDeleted, handleRatingChange, handleHideFromAlbum, handleShowInAlbum,
  handleMarkPlayed, handleMarkUnplayed, isAddDialogOpen, setIsAddDialogOpen, isEditDialogOpen, setIsEditDialogOpen,
  editingScenario, setEditingScenario, editingDate, setEditingDate, isEditingDate, setIsEditingDate,
  newScenarioId, setNewScenarioId, newStoreId, setNewStoreId, newPlayedAt, setNewPlayedAt,
  addManualHistoryMutation, handleAddManualHistory, handleDeleteManualHistory,
}: MyPageContentProps) {
  const renderAlbumCard = (scenario: PlayedScenario) => {
    const isHidden = isScenarioHidden(scenario)
    const isDeleted = isScenarioDeleted(scenario)
    const isOverridden = isScenarioOverridden(scenario)
    return (
      <div
        key={playedScenarioAlbumKey(scenario)}
        className={`overflow-hidden bg-white shadow-sm hover:shadow-lg border border-gray-200 hover:border-gray-300 group relative rounded-none ${isHidden || isDeleted || isOverridden ? 'opacity-50' : ''}`}
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
    <div className="min-h-screen mypage-shell bg-mypage-background">
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
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg overflow-hidden transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${avatarUrl ? '' : 'mypage-avatar-gradient'}`}
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
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center shadow-md cursor-pointer bg-mypage-primary"
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
                  <Trophy className="w-4 h-4 text-mypage-primary" />
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
                      ? 'text-mypage-primary' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="hidden sm:inline">{item.label}</span>
                  {count !== null && count > 0 && (
                    <span 
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isActive ? 'text-white bg-mypage-primary' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-mypage-primary" 
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
                <div className="bg-white shadow-sm p-6 border border-gray-200 rounded-none">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-gray-900">体験済みシナリオ</h2>
                    <span className="text-2xl font-bold text-mypage-primary">{playedScenarios.filter(s => {
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
                        <span className="w-1 h-6 rounded-full bg-mypage-primary"></span>
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
                  <div className="bg-white shadow-sm p-8 text-center border border-gray-200 rounded-none">
                    <div 
                      className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-mypage-primary-light rounded-none"
                    >
                      <Camera className="w-8 h-8 text-mypage-primary" />
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
                        className="w-full p-4 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors rounded-none"
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
          className="w-14 h-14 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 bg-mypage-primary hover:bg-mypage-primary-hover rounded-none"
          size="icon"
          onClick={() => navigate('/')}
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      </div>
    </div>
  )
}
