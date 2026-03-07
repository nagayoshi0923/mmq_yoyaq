import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, MapPin, Users, Star, Trophy, Sparkles, ChevronRight, Heart, Camera, Settings, Pencil, Ticket, Plus, Trash2, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { showToast } from '@/utils/toast'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { SettingsPage } from './pages/SettingsPage'
import { WantToPlayPage } from './pages/LikedScenariosPage'
import { CouponsPage } from './pages/CouponsPage'
import type { Reservation, Store } from '@/types'

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
  
  // 選択肢用データ
  const [scenarioOptions, setScenarioOptions] = useState<ScenarioOption[]>([])
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  
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
        const { data: storesData, error: storeError } = await supabase
          .from('stores')
          .select('id, name')
          .order('name')
        
        if (storeError) throw storeError
        setStoreOptions(storesData || [])
      } catch (error) {
        logger.error('オプション取得エラー:', error)
      } finally {
        setOptionsLoading(false)
      }
    }

    fetchOptions()
  }, [])

  const fetchData = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得（user_id優先、emailフォールバック）
      let customer = null
      
      // まずuser_idで検索
      const { data: customerByUserId } = await supabase
        .from('customers')
        .select('id, name, nickname, avatar_url, user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (customerByUserId) {
        customer = customerByUserId
      } else {
        // user_idで見つからない場合、emailで検索（大文字/小文字を区別しない）
        const { data: customerByEmail, error: emailError } = await supabase
          .from('customers')
          .select('id, name, nickname, avatar_url, user_id')
          .ilike('email', user.email)
          .maybeSingle()
        
        if (emailError && emailError.code !== 'PGRST116') throw emailError
        
        if (customerByEmail) {
          customer = customerByEmail
          
          // user_idが設定されていない場合は自動で紐付け
          if (!customerByEmail.user_id && user.id) {
            await supabase
              .from('customers')
              .update({ user_id: user.id })
              .eq('id', customerByEmail.id)
            logger.log('顧客レコードにuser_idを自動設定しました:', customerByEmail.id)
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

      // 予約を取得
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservations')
        .select('id, organization_id, reservation_number, reservation_page_id, title, scenario_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, candidate_datetimes')
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
          .select('id, date, start_time, category, current_participants, max_participants')
          .in('id', eventIds)
        
        if (eventsData) {
          const eventMap: Record<string, { 
            date: string
            start_time: string
            category?: string
            current_participants?: number
            max_participants?: number
          }> = {}
          eventsData.forEach(e => {
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
        const orgSlugMap: Record<string, string> = {}
        if (orgIds.length > 0) {
          const { data: orgs } = await supabase
            .from('organizations')
            .select('id, slug, name')
            .in('id', orgIds)
          
          if (orgs) {
            const orgNameMap: Record<string, string> = {}
            orgs.forEach(o => {
              if (o.slug) orgSlugMap[o.id] = o.slug
              if (o.name) orgNameMap[o.id] = o.name
            })
            setOrgSlugs(orgSlugMap)
            setOrgNames(orgNameMap)
          }
        }

        const scenarioMasterIds = reservationData
          .map(r => (r as { scenario_master_id?: string | null }).scenario_master_id ?? r.scenario_id)
          .filter((id): id is string => id !== null && id !== undefined)
        
        if (scenarioMasterIds.length > 0) {
          const { data: scenarioMasters, error: scenariosError } = await supabase
            .from('scenario_masters')
            .select('id, key_visual_url, player_count_min, player_count_max')
            .in('id', scenarioMasterIds)
          
          if (!scenariosError && scenarioMasters) {
            const imageMap: Record<string, string> = {}
            const slugMap: Record<string, string> = {}
            const infoMap: Record<string, { min: number; max: number }> = {}
            scenarioMasters.forEach(s => {
              if (s.key_visual_url) {
                imageMap[s.id] = s.key_visual_url
              }
              slugMap[s.id] = s.id
              infoMap[s.id] = {
                min: s.player_count_min || 1,
                max: s.player_count_max || 8
              }
            })
            setScenarioImages(imageMap)
            setScenarioSlugs(slugMap)
            setScenarioInfo(infoMap)
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
        logger.log('📸 予約データ（scenario_master_id確認）:', pastReservations.map(r => ({
          title: r.title,
          scenario_id: r.scenario_id,
          scenario_master_id: (r as { scenario_master_id?: string | null }).scenario_master_id,
        })))
        const pastScenarioMasterIds = pastReservations
          .map(r => (r as { scenario_master_id?: string | null }).scenario_master_id ?? r.scenario_id)
          .filter((id): id is string => id !== null && id !== undefined)
        logger.log('📸 取得対象のシナリオマスターID:', pastScenarioMasterIds)
        
        const additionalScenarioData: Record<string, { key_visual_url?: string, slug?: string }> = {}
        if (pastScenarioMasterIds.length > 0) {
          logger.log('📸 scenario_masters クエリ開始:', { ids: pastScenarioMasterIds })
          const { data: pastScenarios, error: scenarioError } = await supabase
            .from('scenario_masters')
            .select('id, key_visual_url')
            .in('id', pastScenarioMasterIds)
          
          logger.log('📸 scenario_masters 結果:', { data: pastScenarios, error: scenarioError })
          
          if (pastScenarios) {
            pastScenarios.forEach(s => {
              additionalScenarioData[s.id] = { key_visual_url: s.key_visual_url, slug: s.id }
            })
          }
        }
        
        const played: PlayedScenario[] = pastReservations.map(reservation => {
          const scenarioMasterId = (reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id
          const scenarioInfo = scenarioMasterId ? additionalScenarioData[scenarioMasterId] : null
          return {
            scenario: reservation.title?.replace(/【貸切希望】/g, '').replace(/（候補\d+件）/g, '').trim() || '',
            date: reservation.requested_datetime.split('T')[0],
            venue: storesData.find(s => s.id === reservation.store_id)?.name || '店舗情報なし',
            scenario_id: scenarioMasterId || undefined,
            scenario_slug: scenarioInfo?.slug || undefined,
            organization_slug: reservation.organization_id ? orgSlugMap[reservation.organization_id] : undefined,
            key_visual_url: scenarioInfo?.key_visual_url || undefined,
            is_manual: false,
            reservation_id: reservation.id,
          }
        })
        
        // 手動登録履歴を取得（scenario_master_id で scenario_masters を JOIN）
        const { data: manualHistory } = await supabase
          .from('manual_play_history')
          .select('id, scenario_title, played_at, venue, scenario_id, scenario_master_id, scenario_masters:scenario_master_id(key_visual_url)')
          .eq('customer_id', customer.id)
          .order('played_at', { ascending: false })
        
        if (manualHistory) {
          manualHistory.forEach((item: any) => {
            const master = item.scenario_masters as { key_visual_url?: string } | null
            played.push({
              scenario: item.scenario_title,
              date: item.played_at,
              venue: item.venue || '',
              scenario_id: (item.scenario_master_id ?? item.scenario_id) || undefined,
              scenario_slug: (item.scenario_master_id ?? item.scenario_id) || undefined,
              organization_slug: undefined,
              key_visual_url: master?.key_visual_url || undefined,
              is_manual: true,
              manual_id: item.id,
            })
          })
        }
        
        // 日付でソート（新しい順）、重複を除去（同じscenario_idは1つだけ）
        const uniqueScenarioIds = new Set<string>()
        const uniquePlayed = played
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .filter(p => {
            if (!p.scenario_id) return true // scenario_idがない場合は重複チェックしない
            if (uniqueScenarioIds.has(p.scenario_id)) return false
            uniqueScenarioIds.add(p.scenario_id)
            return true
          })
          .slice(0, 12)
        
        setPlayedScenarios(uniquePlayed)
      }

    } catch (error) {
      logger.error('データ取得エラー:', error)
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
    if (!confirm('この履歴を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('manual_play_history')
        .delete()
        .eq('id', manualId)

      if (error) throw error

      showToast.success('削除しました')
      setPlayedScenarios(prev => prev.filter(p => p.manual_id !== manualId))
    } catch (error) {
      logger.error('手動履歴削除エラー:', error)
      showToast.error('削除に失敗しました')
    }
  }

  // アルバムから非表示（予約ベースのプレイ履歴はローカルで非表示）
  const [hiddenPlays, setHiddenPlays] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('hidden_played_scenarios')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  const handleHideFromAlbum = (scenario: PlayedScenario) => {
    const key = scenario.reservation_id || `${scenario.scenario}-${scenario.date}`
    setHiddenPlays(prev => {
      const newSet = new Set(prev)
      newSet.add(key)
      localStorage.setItem('hidden_played_scenarios', JSON.stringify(Array.from(newSet)))
      return newSet
    })
    showToast.success('アルバムから非表示にしました')
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
    
    const scenarioData = reservation.scenario_id ? scenarioInfo[reservation.scenario_id] : null
    const current = event?.current_participants || 0
    const max = event?.max_participants || scenarioData?.max || 8
    const min = scenarioData?.min || 1
    
    if (current >= max) {
      return { type: 'full', label: '満席', color: 'bg-green-100 text-green-700' }
    } else if (current >= min) {
      const remaining = max - current
      return { type: 'confirmed', label: `公演成立（残${remaining}席）`, color: 'bg-blue-100 text-blue-700' }
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
      r => r.reservation_source === 'web_private' && 
           ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(r.status)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // タブごとのカウント
  const getCounts = () => ({
    reservations: upcomingReservations.length + pendingPrivateBookings.length,
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
        {loading && activeTab !== 'settings' ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : (
          <>
            {activeTab === 'reservations' && (
              <div className="space-y-4">
                {/* 調整中の貸切申込み */}
                {pendingPrivateBookings.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-bold text-gray-700">日程調整中の貸切申込み</h3>
                    </div>
                    {pendingPrivateBookings.map((reservation) => {
                      const imageUrl = reservation.scenario_id ? scenarioImages[reservation.scenario_id] : null
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
                ) : pendingPrivateBookings.length === 0 ? (
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
                ) : null}

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

            {activeTab === 'coupons' && (
              <CouponsPage />
            )}

            {activeTab === 'album' && (
              <div className="space-y-6">
                {/* 踏破率 - シャープデザイン */}
                <div className="bg-white shadow-sm p-6 border border-gray-200" style={{ borderRadius: 0 }}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-gray-900">プレイ済みシナリオ</h2>
                    <span className="text-2xl font-bold" style={{ color: THEME.primary }}>{playedScenarios.filter(s => {
                      const key = s.reservation_id || `${s.scenario}-${s.date}`
                      return !hiddenPlays.has(key)
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
                  </div>
                </div>

                {/* シナリオグリッド */}
                {playedScenarios.filter(s => {
                  const key = s.reservation_id || `${s.scenario}-${s.date}`
                  return !hiddenPlays.has(key)
                }).length > 0 ? (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-1 h-6 rounded-full" style={{ backgroundColor: THEME.primary }}></span>
                      プレイ済みシナリオ
                    </h2>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {playedScenarios
                        .filter(s => {
                          const key = s.reservation_id || `${s.scenario}-${s.date}`
                          return !hiddenPlays.has(key)
                        })
                        .map((scenario, index) => (
                        <div
                          key={index}
                          className="overflow-hidden bg-white shadow-sm hover:shadow-lg border border-gray-200 hover:border-gray-300 group relative"
                          style={{ borderRadius: 0 }}
                        >
                          {/* 画像部分 */}
                          <div 
                            className="aspect-[4/3] relative bg-gray-100 cursor-pointer"
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
                              {/* 削除/非表示ボタン */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (scenario.is_manual && scenario.manual_id) {
                                    handleDeleteManualHistory(scenario.manual_id)
                                  } else {
                                    handleHideFromAlbum(scenario)
                                  }
                                }}
                                title={scenario.is_manual ? '削除' : '非表示にする'}
                              >
                                {scenario.is_manual ? (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                ) : (
                                  <EyeOff className="h-4 w-4 text-gray-500" />
                                )}
                              </Button>
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
          onClick={() => navigate('/')}
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      </div>
    </div>
  )
}
