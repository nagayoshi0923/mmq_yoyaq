import { useState, useEffect, useRef, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, MapPin, Users, Trophy, Sparkles, ChevronRight, Heart, Camera, Settings, Pencil, Ticket, Plus, Trash2, EyeOff, Eye, UserPlus, MoreVertical, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
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
import { RESERVATION_SOURCE } from '@/lib/constants'

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

interface PlayedScenario {
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
  const [activeTab, setActiveTab] = useState<string>('reservations')
  /** 予約タブ内: 公演予約 vs 貸切（グループ・申込調整） */
  const [reservationsSubTab, setReservationsSubTab] = useState<'bookings' | 'private'>('bookings')
  
  // データ
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<Record<string, { 
    date: string
    start_time: string
    category?: string
    current_participants?: number
    max_participants?: number
  }>>({})
  const [scenarioImages, setScenarioImages] = useState<Record<string, string>>({})
  const [scenarioSlugs, setScenarioSlugs] = useState<Record<string, string>>({})
  const [scenarioInfo, setScenarioInfo] = useState<Record<string, { min: number; max: number }>>({})
  const [orgSlugs, setOrgSlugs] = useState<Record<string, string>>({})
  const [orgNames, setOrgNames] = useState<Record<string, string>>({})
  const [stores, setStores] = useState<Record<string, Store>>({})
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])
  const [privateGroups, setPrivateGroups] = useState<PrivateGroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ participationCount: 0, points: 0 })
  const [customerInfo, setCustomerInfo] = useState<{ name?: string; nickname?: string } | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  
  // 手動登録用ステート
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newScenarioId, setNewScenarioId] = useState('')
  const [newPlayedAt, setNewPlayedAt] = useState('')
  const [newStoreId, setNewStoreId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // アルバム編集ダイアログ用ステート
  const [editingScenario, setEditingScenario] = useState<PlayedScenario | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [showHiddenItems, setShowHiddenItems] = useState(false)
  const [editingDate, setEditingDate] = useState<string>('')
  const [isEditingDate, setIsEditingDate] = useState(false)
  
  // おすすめ度（ratings）
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({})
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
  
  // 選択肢用データ
  const [scenarioOptions, setScenarioOptions] = useState<ScenarioOption[]>([])
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  
  // アバター画像
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
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

  // 予約データ取得
  useEffect(() => {
    if (user?.email) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user変更時のみ実行
  }, [user])

  // アルバムの「過去の体験を追加」用オプションのみ必要のため、タブ表示時まで遅延（入室時の重いクエリを回避）
  const albumOptionsFetchedRef = useRef(false)
  useEffect(() => {
    if (activeTab !== 'album' || albumOptionsFetchedRef.current) return
    albumOptionsFetchedRef.current = true

    const fetchOptions = async () => {
      setOptionsLoading(true)
      try {
        const { data: scenarios, error: scenarioError } = await supabase
          .from('organization_scenarios_with_master')
          .select('scenario_master_id, title, org_status')
          .eq('org_status', 'available')
          .order('title')

        if (scenarioError) throw scenarioError

        const uniqueScenarios = scenarios?.reduce((acc, s) => {
          if (!acc.find(item => item.id === s.scenario_master_id)) {
            acc.push({ id: s.scenario_master_id, title: s.title })
          }
          return acc
        }, [] as ScenarioOption[]) || []

        setScenarioOptions(uniqueScenarios)

        const { data: storesData, error: storeError } = await supabase
          .from('stores')
          .select('id, name, short_name, is_temporary')
          .order('name')

        if (storeError) throw storeError

        const filteredStores = (storesData || []).filter(store => {
          if (!store.is_temporary) return true
          return store.short_name === '臨時1' || store.name === '臨時会場1'
        })

        setStoreOptions(filteredStores.map(s => ({ id: s.id, name: s.name })))
      } catch (error) {
        logger.error('オプション取得エラー:', error)
      } finally {
        setOptionsLoading(false)
      }
    }

    fetchOptions()
  }, [activeTab])

  const fetchData = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得（user_id優先、emailフォールバック）
      let customer = null
      
      // まずuser_idで検索
      const { data: customerByUserId } = await supabase
        .from('customers')
        .select('id, name, nickname, avatar_url, user_id, organization_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (customerByUserId) {
        customer = customerByUserId
      } else {
        // user_idで見つからない場合、emailで検索（大文字/小文字を区別しない）
        const { data: customerByEmail, error: emailError } = await supabase
          .from('customers')
          .select('id, name, nickname, avatar_url, user_id, organization_id')
          .ilike('email', user.email)
          .maybeSingle()
        
        if (emailError && emailError.code !== 'PGRST116') throw emailError
        
        if (customerByEmail) {
          customer = customerByEmail
          
          // user_idが設定されていない場合は自動で紐付け（非同期で実行、待機しない）
          if (!customerByEmail.user_id && user.id) {
            supabase
              .from('customers')
              .update({ user_id: user.id })
              .eq('id', customerByEmail.id)
              .then(() => logger.log('顧客レコードにuser_idを自動設定しました:', customerByEmail.id))
          }
        }
      }

      if (!customer) {
        setReservations([])
        setCustomerInfo(null)
        setLoading(false)
        return
      }
      
      // 顧客情報をセット
      setCustomerInfo({ name: customer.name, nickname: customer.nickname })
      setCustomerId(customer.id)
      // アバター画像をセット
      if (customer.avatar_url) {
        setAvatarUrl(customer.avatar_url)
      }

      // 🚀 並列でデータ取得（パフォーマンス最適化）
      const [reservationResult, privateGroupsResult, manualHistoryResult, ratingsResult] = await Promise.all([
        // 予約を取得
        supabase
          .from('reservations')
          .select('id, organization_id, reservation_number, title, scenario_id, scenario_master_id, store_id, schedule_event_id, requested_datetime, duration, participant_count, status, candidate_datetimes, reservation_source, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, created_at, updated_at')
          .eq('customer_id', customer.id)
          .order('requested_datetime', { ascending: false })
          .limit(50),
        
        // 貸切グループを取得（メンバー数も含めて取得）
        supabase
          .from('private_group_members')
          .select(`
            id,
            is_organizer,
            status,
            group_id,
            private_groups:group_id (
              id,
              name,
              invite_code,
              status,
              created_at,
              reservation_id,
              scenario_masters:scenario_master_id (id, title, key_visual_url, player_count_max)
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'joined'),
        
        // 手動登録履歴を取得
        supabase
          .from('manual_play_history')
          .select('id, scenario_title, played_at, venue, scenario_id, scenario_master_id')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER),

        // おすすめ度を取得
        supabase
          .from('scenario_ratings')
          .select('scenario_master_id, rating')
          .eq('customer_id', customer.id)
      ])
      
      const reservationData = reservationResult.data
      const reservationError = reservationResult.error

      if (reservationError) throw reservationError
      setReservations(reservationData || [])

      // おすすめ度マップをセット
      if (ratingsResult.data) {
        const map: Record<string, number> = {}
        ratingsResult.data.forEach((r: any) => {
          if (r.scenario_master_id) map[r.scenario_master_id] = r.rating
        })
        setRatingsMap(map)
      }

      // 統計情報を計算（即座に実行可能）
      const confirmedPast = (reservationData || []).filter(
        r => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
      )
      setStats({
        participationCount: confirmedPast.length,
        points: confirmedPast.length * 100
      })

      // 🚀 関連データを並列で取得（第2波）
      const eventIds = reservationData
        ?.map(r => r.schedule_event_id)
        .filter((id): id is string => id !== null && id !== undefined) || []
      
      const orgIds = [...new Set((reservationData || []).map(r => r.organization_id).filter(Boolean))]
      
      // 手動登録のシナリオIDも含める
      const manualScenarioIds = (manualHistoryResult.data || [])
        .map((m: any) => m.scenario_master_id ?? m.scenario_id)
        .filter((id: string | null): id is string => id !== null && id !== undefined)
      
      const scenarioMasterIds = [...new Set([
        ...(reservationData || [])
          .map(r => r.scenario_master_id)
          .filter((id): id is string => id !== null && id !== undefined),
        ...manualScenarioIds
      ])]
      const storeIdsFromReservations = [...new Set((reservationData || []).map(r => r.store_id).filter(Boolean))]

      const memberRecords = privateGroupsResult.data || []
      const groupIds = memberRecords
        .map(r => (r.private_groups as any)?.id)
        .filter(Boolean)

      const privateGroupReservationIds = [
        ...new Set(
          memberRecords
            .map((r) => (r.private_groups as { reservation_id?: string | null })?.reservation_id)
            .filter((id): id is string => !!id)
        )
      ]

      const [eventsResult, orgsResult, scenariosResult, privateGroupReservationsResult, membersDetailResult, candidateDatesResult] =
        await Promise.all([
          eventIds.length > 0
            ? supabase
                .from('schedule_events_public')
                .select('id, date, start_time, category, current_participants, max_participants')
                .in('id', eventIds)
            : Promise.resolve({ data: [] }),
          orgIds.length > 0
            ? supabase.from('organizations').select('id, slug, name').in('id', orgIds)
            : Promise.resolve({ data: [] }),
          scenarioMasterIds.length > 0
            ? supabase
                .from('scenario_masters')
                .select('id, title, key_visual_url, player_count_min, player_count_max')
                .in('id', scenarioMasterIds)
            : Promise.resolve({ data: [] }),
          privateGroupReservationIds.length > 0
            ? supabase
                .from('reservations')
                .select('id, title, requested_datetime, store_id')
                .in('id', privateGroupReservationIds)
            : Promise.resolve({ data: [] }),
          groupIds.length > 0
            ? supabase
                .from('private_group_members')
                .select('group_id, guest_name, user_id, is_organizer, status, joined_at')
                .in('group_id', groupIds)
                .eq('status', 'joined')
                .order('joined_at', { ascending: true })
            : Promise.resolve({ data: [] }),
          groupIds.length > 0
            ? supabase.from('private_group_candidate_dates').select('group_id').in('group_id', groupIds)
            : Promise.resolve({ data: [] as { group_id: string }[] })
        ])

      const privateGroupReservations = (privateGroupReservationsResult.data || []) as Array<{
        id: string
        title: string | null
        requested_datetime: string
        store_id: string | null
      }>
      const privateResById: Record<string, (typeof privateGroupReservations)[0]> = {}
      privateGroupReservations.forEach((r) => {
        privateResById[r.id] = r
      })

      const allStoreIds = [
        ...new Set([
          ...storeIdsFromReservations,
          ...privateGroupReservations.map((r) => r.store_id).filter((id): id is string => !!id)
        ])
      ]

      const storesFetchResult =
        allStoreIds.length > 0
          ? await supabase.from('stores').select('id, name, address, color').in('id', allStoreIds)
          : { data: [] }

      const storesData = storesFetchResult.data || []

      // スケジュールイベントをマップ化
      if (eventsResult.data && eventsResult.data.length > 0) {
        const eventMap: Record<string, { 
          date: string
          start_time: string
          category?: string
          current_participants?: number
          max_participants?: number
        }> = {}
        eventsResult.data.forEach(e => {
          eventMap[e.id] = { 
            date: e.date, 
            start_time: e.start_time, 
            category: e.category,
            current_participants: e.current_participants,
            max_participants: e.max_participants
          }
        })
        setScheduleEvents(eventMap)
      }

      // 組織情報をマップ化
      const orgSlugMap: Record<string, string> = {}
      const orgNameMap: Record<string, string> = {}
      if (orgsResult.data) {
        orgsResult.data.forEach(o => {
          if (o.slug) orgSlugMap[o.id] = o.slug
          if (o.name) orgNameMap[o.id] = o.name
        })
        setOrgSlugs(orgSlugMap)
        setOrgNames(orgNameMap)
      }

      // シナリオ情報をマップ化
      const imageMap: Record<string, string> = {}
      const slugMap: Record<string, string> = {}
      const infoMap: Record<string, { min: number; max: number }> = {}
      const titleToScenarioData: Record<string, { key_visual_url?: string, id?: string }> = {}
      if (scenariosResult.data) {
        scenariosResult.data.forEach(s => {
          if (s.key_visual_url) imageMap[s.id] = s.key_visual_url
          slugMap[s.id] = s.id
          infoMap[s.id] = { min: s.player_count_min || 1, max: s.player_count_max || 8 }
          if (s.title) titleToScenarioData[s.title] = { key_visual_url: s.key_visual_url, id: s.id }
        })
        setScenarioImages(imageMap)
        setScenarioSlugs(slugMap)
        setScenarioInfo(infoMap)
      }

      // 店舗情報をマップ化
      if (storesData.length > 0) {
        const storeMap: Record<string, Store> = {}
        storesData.forEach(store => {
          storeMap[store.id] = store as Store
        })
        setStores(storeMap)
      }

      const membersDetailRows = (membersDetailResult.data || []) as Array<{
        group_id: string
        guest_name: string | null
        user_id: string | null
        is_organizer: boolean
        status: string
        joined_at: string | null
      }>

      const candidateCountByGroup: Record<string, number> = {}
      ;(candidateDatesResult.data || []).forEach((row: { group_id: string }) => {
        if (!row.group_id) return
        candidateCountByGroup[row.group_id] = (candidateCountByGroup[row.group_id] || 0) + 1
      })

      const memberCountMap: Record<string, number> = {}
      const membersByGroupId: Record<string, typeof membersDetailRows> = {}
      membersDetailRows.forEach((m) => {
        memberCountMap[m.group_id] = (memberCountMap[m.group_id] || 0) + 1
        if (!membersByGroupId[m.group_id]) membersByGroupId[m.group_id] = []
        membersByGroupId[m.group_id].push(m)
      })

      const memberUserIds = [...new Set(membersDetailRows.map((m) => m.user_id).filter(Boolean) as string[])]
      const displayByUserId: Record<string, string> = {}
      if (memberUserIds.length > 0) {
        const { data: nameRows, error: nameRpcError } = await supabase.rpc('get_user_display_names', {
          user_ids: memberUserIds
        })
        if (nameRpcError) {
          logger.warn('get_user_display_names RPC エラー（メンバー名が一部省略される場合があります）:', nameRpcError)
        } else {
          ;(nameRows as { user_id: string; display_name: string }[] | null)?.forEach((row) => {
            if (row.user_id && row.display_name?.trim()) {
              displayByUserId[row.user_id] = row.display_name.trim()
            }
          })
        }
      }

      const storeNameById: Record<string, string> = {}
      storesData.forEach((s: { id: string; name: string }) => {
        storeNameById[s.id] = s.name
      })

      const formatConfirmedScheduleLine = (
        groupStatus: string,
        resId: string | null | undefined
      ): string | null => {
        if (!resId || !['confirmed', 'booking_requested'].includes(groupStatus)) return null
        const r = privateResById[resId]
        if (!r?.requested_datetime) return null
        const raw = r.requested_datetime
        const iso =
          raw.includes('+') || raw.endsWith('Z')
            ? raw
            : `${raw.slice(0, 10)}T${(raw.match(/T(\d{2}:\d{2})/)?.[1] || '12:00')}:00+09:00`
        const d = new Date(iso)
        const dateStr = d.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          weekday: 'short',
          timeZone: 'Asia/Tokyo'
        })
        const hm = raw.match(/T(\d{2}:\d{2})/)
        const timeStr = hm ? `${hm[1]}〜` : ''
        const store = r.store_id ? storeNameById[r.store_id] : ''
        const line = [dateStr, timeStr, store].filter(Boolean).join(' ')
        if (groupStatus === 'booking_requested') {
          return line ? `申込内容: ${line}` : null
        }
        return line || null
      }

      const buildMemberDisplays = (gid: string) => {
        const rows = membersByGroupId[gid] || []
        return rows.map((m) => {
          const fromGuest = m.guest_name?.trim()
          const fromUser = m.user_id ? displayByUserId[m.user_id] : ''
          const name = fromGuest || fromUser || '参加者'
          return { name, is_organizer: m.is_organizer }
        })
      }

      // 体験済みシナリオを構築（予約履歴 + 手動登録、両方を常に処理）
      {
        const pastReservations = (reservationData || []).filter(
          r => new Date(r.requested_datetime) < new Date() && (r.status === 'confirmed' || r.status === 'gm_confirmed')
        )
        
        // ratingsMapをローカル変数でも参照できるよう
        const localRatingsMap: Record<string, number> = {}
        if (ratingsResult.data) {
          ratingsResult.data.forEach((r: any) => {
            if (r.scenario_master_id) localRatingsMap[r.scenario_master_id] = r.rating
          })
        }

        const played: PlayedScenario[] = pastReservations.map(reservation => {
          const scenarioMasterId = reservation.scenario_master_id
          const title = reservation.title?.replace(/【貸切希望】/g, '').replace(/（候補\d+件）/g, '').trim() || ''
          const scenarioData = scenarioMasterId ? { key_visual_url: imageMap[scenarioMasterId], slug: scenarioMasterId } : null
          const titleFallback = title ? titleToScenarioData[title] : null
          const finalKeyVisual = scenarioData?.key_visual_url || titleFallback?.key_visual_url
          const finalScenarioId = scenarioMasterId || titleFallback?.id
          
          return {
            scenario: title,
            date: reservation.requested_datetime.split('T')[0],
            venue: storesData.find(s => s.id === reservation.store_id)?.name || '店舗情報なし',
            scenario_id: finalScenarioId || undefined,
            scenario_slug: scenarioData?.slug || titleFallback?.id || undefined,
            organization_slug: reservation.organization_id ? orgSlugMap[reservation.organization_id] : undefined,
            key_visual_url: finalKeyVisual || undefined,
            is_manual: false,
            reservation_id: reservation.id,
            rating: finalScenarioId ? (localRatingsMap[finalScenarioId] ?? null) : null,
          }
        })
        
        // 手動登録履歴を追加（予約の有無に関わらず常に追加）
        const manualHistory = manualHistoryResult.data
        if (manualHistoryResult.error) {
          logger.error('手動プレイ履歴の取得エラー:', manualHistoryResult.error)
        }
        if (manualHistory && manualHistory.length > 0) {
          manualHistory.forEach((item: any) => {
            const scenarioMasterId = item.scenario_master_id ?? item.scenario_id
            played.push({
              scenario: item.scenario_title,
              date: item.played_at,
              venue: item.venue || '',
              scenario_id: scenarioMasterId || undefined,
              scenario_slug: scenarioMasterId || undefined,
              organization_slug: undefined,
              key_visual_url: scenarioMasterId ? imageMap[scenarioMasterId] : undefined,
              is_manual: true,
              manual_id: item.id,
              rating: scenarioMasterId ? (localRatingsMap[scenarioMasterId] ?? null) : null,
            })
          })
        }
        
        // 日付でソート（新しい順）、手動登録(null日付)は先頭に、重複を除去
        const listDedupeKeys = new Set<string>()
        const uniquePlayed = played
          .sort((a, b) => {
            // 手動登録(is_manual)でdate nullは先頭に表示
            if (a.is_manual && !a.date && !(b.is_manual && !b.date)) return -1
            if (b.is_manual && !b.date && !(a.is_manual && !a.date)) return 1
            if (!a.date && !b.date) return 0
            if (!a.date) return 1
            if (!b.date) return -1
            return new Date(b.date).getTime() - new Date(a.date).getTime()
          })
          .filter(p => {
            const k = playedScenarioListDedupeKey(p)
            if (listDedupeKeys.has(k)) return false
            listDedupeKeys.add(k)
            return true
          })
          .slice(0, MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER)
        
        setPlayedScenarios(uniquePlayed)
      }

      // 貸切グループを構築（N+1問題解消済み）
      if (memberRecords.length > 0) {
        const groups: PrivateGroupSummary[] = []
        
        for (const record of memberRecords) {
          const group = record.private_groups as any
          if (!group || group.status === 'cancelled') continue
          
          const scenario = group.scenario_masters as any
          const resId = group.reservation_id as string | null | undefined
          groups.push({
            id: group.id,
            name: group.name,
            invite_code: group.invite_code,
            status: group.status,
            scenario_title: scenario?.title || null,
            scenario_image: scenario?.key_visual_url || null,
            scenario_player_count_max: scenario?.player_count_max || null,
            member_count: memberCountMap[group.id] || 0,
            is_organizer: record.is_organizer,
            created_at: group.created_at,
            reservation_id: resId ?? null,
            confirmed_schedule_line: formatConfirmedScheduleLine(group.status, resId),
            member_displays: buildMemberDisplays(group.id),
            candidate_dates_count: candidateCountByGroup[group.id] || 0
          })
        }
        
        // 作成日順（新しい順）でソート
        groups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setPrivateGroups(groups)
      }

    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 手動登録を追加
  const handleAddManualHistory = async () => {
    if (!customerId || !newScenarioId) {
      showToast.error('シナリオは必須です')
      return
    }

    setIsSubmitting(true)
    try {
      const manualCount = await countManualPlayHistoryForCustomer(customerId)
      if (isManualPlayHistoryAtCap(manualCount)) {
        showToast.error(
          `手動のプレイ履歴は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件まで登録できます`
        )
        return
      }

      // 選択されたシナリオのタイトルを取得
      const selectedScenario = scenarioOptions.find(s => s.id === newScenarioId)
      const scenarioTitle = selectedScenario?.title || ''
      
      // 選択された店舗の名前を取得
      const selectedStore = storeOptions.find(s => s.id === newStoreId)
      const storeName = selectedStore?.name || null

      // scenario_master_id を設定して画像を取得できるようにする
      const insertData = {
        customer_id: customerId,
        scenario_title: scenarioTitle,
        scenario_master_id: newScenarioId,
        played_at: newPlayedAt || null,
        venue: storeName,
      }
      const { data: insertedData, error } = await supabase
        .from('manual_play_history')
        .insert(insertData)
        .select()

      if (error) {
        logger.error('手動プレイ履歴の追加エラー:', error)
        throw error
      }

      if (!insertedData || insertedData.length === 0) {
        logger.error('手動プレイ履歴: insert 結果が空（RLS の可能性）')
        throw new Error('データの追加に失敗しました（権限エラーの可能性）')
      }

      showToast.success('プレイ履歴を追加しました')
      setIsAddDialogOpen(false)
      setNewScenarioId('')
      setNewPlayedAt('')
      setNewStoreId('')
      fetchData()
    } catch (error) {
      logger.error('手動履歴追加エラー:', error)
      showToast.error('追加に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 手動登録を削除
  const handleDeleteManualHistory = async (manualId: string) => {
    if (!customerId) {
      showToast.error('顧客情報が取得できません。再ログインしてお試しください。')
      return
    }
    try {
      const { data, error } = await supabase
        .from('manual_play_history')
        .delete()
        .eq('id', manualId)
        .eq('customer_id', customerId)
        .select('id')

      if (error) throw error
      if (!data?.length) {
        logger.error('手動履歴削除: 0件（RLSまたはID不一致）', { manualId, customerId })
        showToast.error('削除できませんでした。ページを再読み込みしてから再度お試しください。')
        await fetchData()
        return
      }

      showToast.success('削除しました')
      setPlayedScenarios(prev => prev.filter(p => p.manual_id !== manualId))
      setIsEditDialogOpen(false)
      setEditingScenario(null)
    } catch (error) {
      logger.error('手動履歴削除エラー:', error)
      showToast.error('削除に失敗しました')
    }
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
  
  // アイテムが非表示かどうか
  const isScenarioHidden = (scenario: PlayedScenario) => {
    const key = playedScenarioAlbumKey(scenario)
    const legacy = scenario.reservation_id || `${scenario.scenario}-${scenario.date}`
    return hiddenPlays.has(key) || hiddenPlays.has(legacy)
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
        await fetchData()
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

  // 公演成立状況を取得
  const getPerformanceStatus = (reservation: Reservation) => {
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
              <div className="space-y-4">
                {/* 予約タブ内サブナビ */}
                {(() => {
                  const activePg = privateGroups.filter((g) =>
                    ['gathering', 'date_adjusting', 'booking_requested', 'confirmed'].includes(g.status)
                  )
                  const privateCount = activePg.length + pendingPrivateBookings.length
                  return (
                    <div className="flex border border-gray-200 overflow-hidden bg-white" style={{ borderRadius: 0 }}>
                      <button
                        type="button"
                        onClick={() => setReservationsSubTab('bookings')}
                        className={`flex-1 py-3 px-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
                          reservationsSubTab === 'bookings' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                        style={
                          reservationsSubTab === 'bookings'
                            ? { backgroundColor: THEME.primary }
                            : undefined
                        }
                      >
                        <Calendar className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">公演予約</span>
                        <span className="sm:hidden">予約</span>
                        {upcomingReservations.length > 0 && (
                          <span
                            className={`text-xs tabular-nums px-1.5 py-0.5 rounded ${
                              reservationsSubTab === 'bookings' ? 'bg-white/20' : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {upcomingReservations.length}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReservationsSubTab('private')}
                        className={`flex-1 py-3 px-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1 border-l border-gray-200 ${
                          reservationsSubTab === 'private' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                        style={
                          reservationsSubTab === 'private'
                            ? { backgroundColor: THEME.primary }
                            : undefined
                        }
                      >
                        <Users className="w-4 h-4 shrink-0" />
                        貸切
                        {privateCount > 0 && (
                          <span
                            className={`text-xs tabular-nums px-1.5 py-0.5 rounded ${
                              reservationsSubTab === 'private' ? 'bg-white/20' : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {privateCount}
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })()}

                {reservationsSubTab === 'private' && (
                  <>
                {/* 貸切リクエスト（グループベース） */}
                {privateGroups.filter(g => ['gathering', 'date_adjusting', 'booking_requested', 'confirmed'].includes(g.status)).length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      <h3 className="text-sm font-bold text-gray-700">貸切リクエスト</h3>
                    </div>
                    {privateGroups.filter(g => ['gathering', 'date_adjusting', 'booking_requested', 'confirmed'].includes(g.status)).map((group) => {
                      const getGroupStatusLabel = (status: string) => {
                        switch (status) {
                          case 'gathering':
                            return '日程調整前'
                          case 'date_adjusting':
                            return '日程調整中'
                          case 'booking_requested':
                            return '申込済み'
                          case 'confirmed':
                            return '確定'
                          default:
                            return status
                        }
                      }
                      const statusLabel = getGroupStatusLabel(group.status)
                      
                      return (
                        <div 
                          key={group.id}
                          className="bg-white border border-purple-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
                          style={{ borderRadius: 0 }}
                          onClick={() => navigate(`/group/invite/${group.invite_code}`)}
                        >
                          <div 
                            className="px-3 py-1.5 text-purple-800 text-sm font-bold flex items-center justify-between"
                            style={{ backgroundColor: '#f3e8ff' }}
                          >
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>貸切（{statusLabel}）</span>
                              {group.is_organizer && (
                                <Badge variant="outline" className="text-xs bg-white">主催者</Badge>
                              )}
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                              {group.member_count}/{group.scenario_player_count_max || '?'}名
                            </span>
                          </div>

                          {group.is_organizer &&
                            group.candidate_dates_count > 0 &&
                            (group.status === 'gathering' || group.status === 'date_adjusting') && (
                              <div
                                className="border-b border-green-200 bg-green-50 px-3 py-2.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="text-xs font-semibold text-green-900">
                                  候補日程が登録されています
                                </p>
                                <p className="text-[11px] text-green-800/90 mt-1 leading-snug">
                                  グループページを開き、画面の「予約リクエストを作成」から店舗へ申し込みを進められます。
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full mt-2 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                                  style={{ borderRadius: 0 }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/group/invite/${group.invite_code}`)
                                  }}
                                >
                                  グループページを開く
                                </Button>
                              </div>
                            )}
                          
                          <div className="p-3 flex gap-3">
                            <div className="w-16 h-24 flex-shrink-0 bg-gray-900 relative overflow-hidden" style={{ borderRadius: 0 }}>
                              {group.scenario_image ? (
                                <>
                                  <div 
                                    className="absolute inset-0 scale-110"
                                    style={{
                                      backgroundImage: `url(${group.scenario_image})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                      filter: 'blur(8px) brightness(0.6)',
                                    }}
                                  />
                                  <img
                                    src={group.scenario_image}
                                    alt={group.scenario_title || ''}
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
                            
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">
                                {group.scenario_title || 'シナリオ未設定'}
                              </h3>
                              {group.name && (
                                <p className="text-xs text-gray-500 mt-0.5">{group.name}</p>
                              )}

                              {group.confirmed_schedule_line && (
                                <p className="flex items-start gap-1.5 mt-2 text-xs text-purple-900 font-medium leading-snug">
                                  <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-600" />
                                  <span>{group.confirmed_schedule_line}</span>
                                </p>
                              )}

                              {group.member_displays && group.member_displays.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {group.member_displays.map((m, i) => (
                                    <span
                                      key={`${group.id}-m-${i}`}
                                      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 border ${
                                        m.is_organizer
                                          ? 'bg-purple-100 border-purple-200 text-purple-900'
                                          : 'bg-gray-50 border-gray-200 text-gray-700'
                                      }`}
                                    >
                                      {m.is_organizer && (
                                        <span className="text-purple-600 font-semibold">主催</span>
                                      )}
                                      <span className="truncate max-w-[7rem] sm:max-w-[10rem]">{m.name}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                              
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-xs text-gray-500">
                                <Users className="w-3 h-3" />
                                <span>{group.member_count}名参加中</span>
                                <span>•</span>
                                <span>コード: {group.invite_code}</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center">
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {/* 調整中の貸切申込み */}
                {pendingPrivateBookings.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-bold text-gray-700">日程調整中の貸切申込み</h3>
                    </div>
                    {pendingPrivateBookings.map((reservation) => {
                      const imageUrl = reservation.scenario_master_id ? scenarioImages[reservation.scenario_master_id] : null
                      const candidateDatetimes = reservation.candidate_datetimes as {
                        candidates?: Array<{ order: number; date: string; timeSlot: string; startTime: string; endTime: string; status: string }>
                        confirmedStore?: { storeId: string; storeName?: string }
                        confirmedDateTime?: { date: string; timeSlot: string }
                        requestedStores?: Array<{ storeId: string; storeName: string; storeShortName?: string }>
                      } | null
                      
                      const getStatusLabel = (status: string) => {
                        switch (status) {
                          case 'pending':
                          case 'pending_gm':
                            return { label: 'GM回答待ち', color: 'bg-amber-100 text-amber-700' }
                          case 'gm_confirmed':
                          case 'pending_store':
                            return { label: '店舗確認中', color: 'bg-blue-100 text-blue-700' }
                          default:
                            return { label: '調整中', color: 'bg-gray-100 text-gray-700' }
                        }
                      }
                      const statusInfo = getStatusLabel(reservation.status)
                      
                      // 候補日をフォーマット（最初の3件まで表示）
                      const formatCandidateDate = (date: string, timeSlot: string) => {
                        const d = new Date(date)
                        const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                        return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]}) ${timeSlot}`
                      }
                      const candidates = candidateDatetimes?.candidates || []
                      const displayCandidates = candidates.slice(0, 3)
                      const remainingCount = candidates.length - 3
                      
                      // 希望店舗
                      const requestedStores = candidateDatetimes?.requestedStores || []
                      const storeNames = requestedStores.map(s => s.storeShortName || s.storeName).filter(Boolean)
                      
                      return (
                        <div 
                          key={reservation.id}
                          className="bg-white border border-amber-200 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer"
                          style={{ borderRadius: 0 }}
                          onClick={() => navigate(`/mypage/reservation/${reservation.id}`)}
                        >
                          <div 
                            className="px-3 py-1.5 text-amber-800 text-sm font-bold flex items-center justify-between"
                            style={{ backgroundColor: '#fef3c7' }}
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>日程調整中</span>
                              {reservation.organization_id && orgNames[reservation.organization_id] && (
                                <span className="text-xs font-normal text-amber-700">
                                  （{orgNames[reservation.organization_id]}）
                                </span>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          
                          <div className="p-3 flex gap-3">
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
                            
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">
                                {cleanTitle(reservation.title)}
                              </h3>
                              
                              {/* 候補日一覧 */}
                              <div className="mt-1.5 space-y-0.5">
                                {displayCandidates.map((c, i) => (
                                  <p key={i} className="text-xs text-gray-600 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                    <span className="font-medium">{formatCandidateDate(c.date, c.timeSlot)}</span>
                                  </p>
                                ))}
                                {remainingCount > 0 && (
                                  <p className="text-xs text-gray-400">
                                    他{remainingCount}件の候補日
                                  </p>
                                )}
                              </div>
                              
                              {/* 希望店舗 */}
                              {storeNames.length > 0 && (
                                <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  {storeNames.join('・')}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-gray-500">
                                <span className="font-mono">{reservation.reservation_number}</span>
                                <span>•</span>
                                <Users className="w-3 h-3" />
                                <span>{reservation.participant_count}名</span>
                                <span>•</span>
                                <span>
                                  {(() => {
                                    const d = new Date(reservation.created_at)
                                    return `${d.getMonth() + 1}/${d.getDate()} 申込`
                                  })()}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center">
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {activePrivateGroups.length === 0 && pendingPrivateBookings.length === 0 && (
                  <div
                    className="bg-white border border-gray-200 p-8 text-center text-gray-500 text-sm"
                    style={{ borderRadius: 0 }}
                  >
                    <Users className="w-8 h-8 mx-auto mb-2 text-purple-300" />
                    <p>貸切グループ・日程調整中の申込みはまだありません</p>
                    <p className="text-xs text-gray-400 mt-2">
                      招待ページから参加するか、新しくグループを作成できます
                    </p>
                  </div>
                )}
                  </>
                )}

                {reservationsSubTab === 'bookings' && (
                  <>
                {/* 予約一覧 */}
                {upcomingReservations.length > 0 ? (
                  <>
                    {upcomingReservations.map((reservation) => {
                      const perf = getPerformanceDateTime(reservation)
                      const daysUntil = getDaysUntil(perf.date)
                      const store = reservation.store_id ? stores[reservation.store_id] : null
                      const imageUrl = reservation.scenario_master_id ? scenarioImages[reservation.scenario_master_id] : null
                      
                      // 貸切公演かどうか
                      const eventId = reservation.schedule_event_id
                      const isPrivate = eventId ? scheduleEvents[eventId]?.category === 'private' : false
                      
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
                          {/* カウントダウンバー（各予約・公演日までの日数） */}
                          {daysUntil >= 0 && (
                            <div 
                              className="px-3 py-1.5 text-white text-sm font-bold flex items-center gap-2"
                              style={{ backgroundColor: THEME.primary }}
                            >
                              <Sparkles className="w-4 h-4" />
                              {daysUntil === 0 ? '本日公演' : `あと${daysUntil}日`}
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
                              
                              {/* 公演成立状況 */}
                              {(() => {
                                const status = getPerformanceStatus(reservation)
                                if (!status) return null
                                return (
                                  <div className="mt-1.5">
                                    <span className={`text-xs px-2 py-0.5 rounded ${status.color}`}>
                                      {status.label}
                                    </span>
                                  </div>
                                )
                              })()}

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
                  </>
                )}
              </div>
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
                            <SearchableSelect
                              options={scenarioOptions.map((s): SearchableSelectOption => ({
                                value: s.id,
                                label: s.title
                              }))}
                              value={newScenarioId}
                              onValueChange={setNewScenarioId}
                              placeholder={optionsLoading ? '読み込み中...' : scenarioOptions.length === 0 ? 'シナリオがありません' : 'シナリオを選択'}
                              searchPlaceholder="シナリオを検索..."
                              emptyText="シナリオが見つかりません"
                              disabled={optionsLoading || scenarioOptions.length === 0}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>プレイした日付（任意）</Label>
                            <SingleDatePopover
                              date={newPlayedAt}
                              onDateChange={(date) => setNewPlayedAt(date || '')}
                              placeholder="日付を選択"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>店舗（任意）</Label>
                            <SearchableSelect
                              options={storeOptions.map((s): SearchableSelectOption => ({
                                value: s.id,
                                label: s.name
                              }))}
                              value={newStoreId}
                              onValueChange={setNewStoreId}
                              placeholder={optionsLoading ? '読み込み中...' : storeOptions.length === 0 ? '店舗がありません' : '店舗を選択'}
                              searchPlaceholder="店舗を検索..."
                              emptyText="店舗が見つかりません"
                              disabled={optionsLoading || storeOptions.length === 0}
                              allowClear={true}
                            />
                          </div>
                          <Button 
                            onClick={handleAddManualHistory} 
                            disabled={isSubmitting || !newScenarioId}
                            className="w-full"
                          >
                            {isSubmitting ? '追加中...' : '追加'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {/* シナリオグリッド */}
                {playedScenarios.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1 h-6 rounded-full" style={{ backgroundColor: THEME.primary }}></span>
                        {showHiddenItems ? 'すべてのシナリオ（非表示・削除済み含む）' : '体験済みシナリオ'}
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
                        {showHiddenItems && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => setShowHiddenItems(false)}
                          >
                            <Eye className="h-4 w-4" />
                            <span className="text-xs">表示中のみ</span>
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {playedScenarios
                        .filter(s => {
                          const key = playedScenarioAlbumKey(s)
                          const legacy = s.reservation_id || `${s.scenario}-${s.date}`
                          const isHidden = hiddenPlays.has(key) || hiddenPlays.has(legacy)
                          const isDeleted = deletedPlays.has(key) || deletedPlays.has(legacy)
                          if (showHiddenItems) return true
                          return !isHidden && !isDeleted
                        })
                        .sort((a, b) => {
                          if (albumSortOrder === 'rating_desc') {
                            return (b.rating ?? 0) - (a.rating ?? 0)
                          }
                          if (albumSortOrder === 'rating_asc') {
                            const ra = a.rating ?? 6
                            const rb = b.rating ?? 6
                            return ra - rb
                          }
                          // date order (default)
                          if (a.is_manual && !a.date && !(b.is_manual && !b.date)) return -1
                          if (b.is_manual && !b.date && !(a.is_manual && !a.date)) return 1
                          if (!a.date && !b.date) return 0
                          if (!a.date) return 1
                          if (!b.date) return -1
                          return new Date(b.date).getTime() - new Date(a.date).getTime()
                        })
                        .map((scenario) => {
                        const isHidden = isScenarioHidden(scenario)
                        const isDeleted = isScenarioDeleted(scenario)
                        return (
                        <div
                          key={playedScenarioAlbumKey(scenario)}
                          className={`overflow-hidden bg-white shadow-sm hover:shadow-lg border border-gray-200 hover:border-gray-300 group relative ${isHidden || isDeleted ? 'opacity-50' : ''}`}
                          style={{ borderRadius: 0 }}
                        >
                          {/* ステータスバッジ */}
                          {(isHidden || isDeleted) && (
                            <div className={`absolute top-2 left-2 z-10 text-white text-xs px-2 py-0.5 rounded ${isDeleted ? 'bg-red-600/80' : 'bg-gray-800/80'}`}>
                              {isDeleted ? '削除済み' : '非表示'}
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
                                  {scenario.date ? new Date(scenario.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }) : '日付不明'}
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
                      })}
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
                
                {/* 非表示/削除済みシナリオセクション */}
                {(hiddenPlays.size > 0 || deletedPlays.size > 0) && !showHiddenItems && (
                  <div className="mt-8">
                    <button
                      onClick={() => setShowHiddenItems(true)}
                      className="w-full p-4 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                      style={{ borderRadius: 0 }}
                    >
                      <div className="flex items-center justify-center gap-2 text-gray-500">
                        <EyeOff className="h-4 w-4" />
                        <span className="text-sm">
                          非表示・削除済みのシナリオ ({hiddenPlays.size + deletedPlays.size}件)
                        </span>
                      </div>
                    </button>
                  </div>
                )}
                
                {/* アルバム編集ダイアログ */}
                <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
                  setIsEditDialogOpen(open)
                  if (!open) {
                    setEditingScenario(null)
                    setIsEditingDate(false)
                  }
                }}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>プレイ履歴の編集</DialogTitle>
                    </DialogHeader>
                    {editingScenario && (
                      <div className="space-y-4 pt-2">
                        {/* シナリオ情報 */}
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          {editingScenario.key_visual_url ? (
                            <img 
                              src={editingScenario.key_visual_url} 
                              alt={editingScenario.scenario}
                              className="w-16 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-16 h-12 bg-gray-200 rounded flex items-center justify-center">
                              <span className="text-xl opacity-50">🎭</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {editingScenario.scenario || '（タイトル不明）'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {editingScenario.venue && editingScenario.venue !== '店舗情報なし' && editingScenario.venue}
                            </p>
                          </div>
                        </div>
                        
                        {/* 日付編集 */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">プレイした日付</Label>
                          {isEditingDate ? (
                            <div className="flex gap-2">
                              <SingleDatePopover
                                date={editingDate}
                                onDateChange={(date) => setEditingDate(date || '')}
                                placeholder="日付を選択"
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (editingScenario.is_manual && editingScenario.manual_id) {
                                    handleUpdateManualDate(editingScenario.manual_id, editingDate)
                                  } else {
                                    handleUpdateReservationDate(editingScenario, editingDate)
                                  }
                                }}
                                disabled={!editingDate}
                              >
                                保存
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setIsEditingDate(false)
                                  setEditingDate(editingScenario.date || '')
                                }}
                              >
                                キャンセル
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-700">
                                {editingScenario.date ? new Date(editingScenario.date).toLocaleDateString('ja-JP') : '日付不明'}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsEditingDate(true)}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                編集
                              </Button>
                            </div>
                          )}
                        </div>
                        
                        {/* アクションボタン */}
                        <div className="space-y-2 pt-2 border-t">
                          {/* 削除済みの場合は復元ボタン */}
                          {isScenarioDeleted(editingScenario) ? (
                            <Button
                              variant="outline"
                              className="w-full justify-start gap-3"
                              onClick={() => handleRestoreDeletedHistory(editingScenario)}
                            >
                              <Eye className="h-4 w-4 text-green-600" />
                              <span>履歴を復元する</span>
                            </Button>
                          ) : (
                            <>
                              {/* 非表示/表示ボタン */}
                              {isScenarioHidden(editingScenario) ? (
                                <Button
                                  variant="outline"
                                  className="w-full justify-start gap-3"
                                  onClick={() => handleShowInAlbum(editingScenario)}
                                >
                                  <Eye className="h-4 w-4 text-green-600" />
                                  <span>アルバムに再表示する</span>
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  className="w-full justify-start gap-3"
                                  onClick={() => handleHideFromAlbum(editingScenario)}
                                >
                                  <EyeOff className="h-4 w-4 text-gray-500" />
                                  <span>アルバムから非表示にする</span>
                                </Button>
                              )}
                              
                              {/* 削除ボタン */}
                              <Button
                                variant="outline"
                                className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  const message = editingScenario.is_manual
                                    ? 'この履歴を完全に削除しますか？この操作は取り消せません。'
                                    : 'この履歴を削除しますか？'
                                  if (confirm(message)) {
                                    if (editingScenario.is_manual && editingScenario.manual_id) {
                                      handleDeleteManualHistory(editingScenario.manual_id)
                                    } else {
                                      handleDeleteReservationHistory(editingScenario)
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>履歴を削除する</span>
                              </Button>
                            </>
                          )}
                        </div>
                        
                        <p className="text-xs text-gray-400">
                          {editingScenario.is_manual 
                            ? '手動で追加した履歴です。削除すると完全に消去されます。'
                            : '予約履歴からの記録です。削除しても「非表示/削除」から復元できます。'}
                        </p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
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
