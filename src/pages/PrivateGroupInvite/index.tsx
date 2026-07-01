import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, Circle, X, HelpCircle, Loader2, Ticket, CreditCard, LogOut, MessageCircle, Check, UserPlus, Copy, Share2, ArrowLeft, Settings } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupChat } from '@/pages/PrivateGroupManage/components/GroupChat'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import { useAuth } from '@/contexts/AuthContext'
import { usePrivateGroup } from '@/hooks/usePrivateGroup'
import { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { DateResponse, PrivateGroupCandidateDate } from '@/types'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { fetchScenarioTimingFromDb, getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { memberInvitationCap } from '@/lib/privateGroupPlayerCap'
import { SurveyResponseForm } from './components/SurveyResponseForm'
import { GroupChatSheets } from './components/GroupChatSheets'
import { formatJstDateJa, getJstParts } from '@/utils/jstDate'

interface Coupon {
  id: string
  name: string
  discount_amount: number
  expires_at: string | null
  status: string
}

type ResponseValue = DateResponse | null

export function PrivateGroupInvite() {
  const navigate = useNavigate()
  const location = useLocation()

  // URLから招待コードを抽出: /group/invite/{code}
  const code = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    if (segments[0] === 'group' && segments[1] === 'invite' && segments[2]) {
      return segments[2]
    }
    return null
  }, [location.pathname])

  const { user } = useAuth()
  const { group, loading: groupLoading, error: groupError, refetch, linkedReservationStatus, confirmedByName } = usePrivateGroupByInviteCode(code || null)
  const { joinGroup, submitDateResponses, leaveGroup, updateGroupStatus, removeMember, loading: actionLoading } = usePrivateGroup()
  // group が宣言された後で呼ぶ（organization_id を参照するため）
  const { isCustomHoliday } = useCustomHolidays({ organizationId: group?.organization_id })

  /** 店舗承認後はチャットに「日程確定」が出ても、グループ行の status が未同期のことがあるため予約 status も見る */
  const isScheduleConfirmedUi = useMemo(
    () => Boolean(group && (group.status === 'confirmed' || linkedReservationStatus === 'confirmed')),
    [group, linkedReservationStatus]
  )

  /**
   * 店舗への貸切リクエスト送付済み（未キャンセルの予約が紐づく）の間は、
   * 候補日追加・希望店舗編集・予約リクエスト作成を禁止（グループ status の更新遅延にも対応）
   */
  const canMutateScheduleBeforeStoreReply = useMemo(() => {
    if (!group) return false
    if (group.status === 'booking_requested' || group.status === 'confirmed') return false
    if (!(group.status === 'gathering' || group.status === 'date_adjusting')) return false
    if (group.reservation_id) {
      return linkedReservationStatus === 'cancelled'
    }
    return true
  }, [group, linkedReservationStatus])

  // デバッグログ
  if (group) {
    logger.log('📋 PrivateGroupInvite: group data', {
      id: group.id,
      scenario_master_id: group.scenario_master_id,
      organization_id: group.organization_id,
      status: group.status
    })
  }

  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [responses, setResponses] = useState<Record<string, ResponseValue>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null)
  
  // クーポン関連
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
  const { data: coupons = [], isLoading: couponLoading } = useQuery({
    queryKey: ['private-group-invite', 'coupons', user?.id, group?.organization_id],
    enabled: !!user && !!group?.organization_id,
    queryFn: async (): Promise<Coupon[]> => {
      const { data: customer } = await supabase.from('customers').select('id').eq('user_id', user!.id).maybeSingle()
      if (!customer) return []
      const { data: couponData, error } = await supabase.from('customer_coupons').select(`id, expires_at, status, uses_remaining, coupon_campaigns (id, name, discount_amount)`).eq('customer_id', customer.id).eq('status', 'active').gt('uses_remaining', 0).or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
      if (error) throw error
      return (couponData || []).map((cc: any) => ({ id: cc.id, name: cc.coupon_campaigns?.name || 'クーポン', discount_amount: cc.coupon_campaigns?.discount_amount || 0, expires_at: cc.expires_at, status: cc.status }))
    },
  })

  // PIN認証関連
  const [pinEmail, setPinEmail] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [generatedPin, setGeneratedPin] = useState<string | null>(null)

  // URLパラメータでシート・タブ状態を管理（ブラウザバックで閉じる）
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSheet = searchParams.get('sheet')
  const activeTab = searchParams.get('tab') ?? 'chat'

  const showPinAuth = activeSheet === 'pin'
  const showMobileDates = activeSheet === 'dates'
  const showSettingsSheet = activeSheet === 'settings'
  const showInviteSheet = activeSheet === 'invite'
  const showStoreEditSheet = activeSheet === 'store-edit'
  const showBookingDialog = activeSheet === 'booking'

  // シートを開く（ブラウザ履歴に追加 → バックで閉じられる）
  const openSheet = (name: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('sheet', name)
    return next
  })

  // シートを閉じる：ユーザー操作（×・キャンセル）→ navigate(-1) でバック相当
  const closeSheet = () => navigate(-1)

  // シートを閉じる：処理完了後 → 履歴を置き換えてモーダルに戻れないようにする
  const closeSheetReplace = () => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.delete('sheet')
    return next
  }, { replace: true })

  // タブ切り替え（履歴は積まず replace）
  const setActiveTab = (tab: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('tab', tab)
    return next
  }, { replace: true })

  // 主催者向け機能
  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // グループ設定シート内
  const [isDeleting, setIsDeleting] = useState(false)
  const [contactMessage, setContactMessage] = useState('')
  const [showContactForm, setShowContactForm] = useState(false)
  const [isSubmittingContact, setIsSubmittingContact] = useState(false)

  // 希望店舗関連
  const { data: preferredStoreNames = [] } = useQuery({
    queryKey: ['private-group-invite', 'preferred-stores', group?.preferred_store_ids],
    enabled: !!(group?.preferred_store_ids?.length),
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').in('id', group!.preferred_store_ids!)
      if (error) throw error
      return data || []
    },
  })
  const [allStores, setAllStores] = useState<Array<{ id: string; name: string; short_name: string }>>([])
  const [isFilteredByScenario, setIsFilteredByScenario] = useState(false)
  const [loadingStoresForEdit, setLoadingStoresForEdit] = useState(false)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [savingStores, setSavingStores] = useState(false)

  // 申請ダイアログ（日程選択 + 送信）
  const [bookingSelectedDates, setBookingSelectedDates] = useState<Set<string>>(new Set())
  const [bookingPhone, setBookingPhone] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false)

  // SessionStorageキー
  const getStorageKey = (inviteCode: string) => `guest_session_${inviteCode}`

  // SessionStorageからゲストセッションを復元
  useEffect(() => {
    if (!code || user) return // ログインユーザーは不要
    
    const storageKey = getStorageKey(code)
    const savedSession = sessionStorage.getItem(storageKey)
    
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession)
        if (session.memberId) {
          setExistingMemberId(session.memberId)
          setGuestName(session.guestName || '')
          setGuestEmail(session.guestEmail || '')
          logger.info('ゲストセッションを復元:', { memberId: session.memberId })
        }
      } catch (err) {
        logger.error('セッション復元エラー:', err)
        sessionStorage.removeItem(storageKey)
      }
    }
  }, [code, user])

  // ゲストセッションを保存
  const saveGuestSession = (memberId: string, name: string, email: string) => {
    if (!code) return
    const storageKey = getStorageKey(code)
    sessionStorage.setItem(storageKey, JSON.stringify({
      memberId,
      guestName: name,
      guestEmail: email,
      savedAt: new Date().toISOString(),
    }))
  }

  // ゲストセッションをクリア
  const clearGuestSession = () => {
    if (!code) return
    const storageKey = getStorageKey(code)
    sessionStorage.removeItem(storageKey)
  }

  // 4桁PINを生成
  const generatePin = () => {
    return String(Math.floor(1000 + Math.random() * 9000))
  }

  // PIN認証を実行
  const handlePinAuth = async () => {
    if (!group || !pinEmail || !pinCode) {
      setPinError('メールアドレスとPINを入力してください')
      return
    }

    setPinError(null)

    try {
      // RPCでPIN認証
      logger.info('PIN認証リクエスト:', { groupId: group.id, email: pinEmail, pinLength: pinCode.length })
      
      const { data: authResult, error: authError } = await supabase.rpc('authenticate_guest_by_pin', {
        p_group_id: group.id,
        p_email: pinEmail,
        p_pin: pinCode,
      })

      logger.info('PIN認証結果:', { authResult, authError })

      if (authError) {
        logger.error('PIN認証エラー:', authError)
        setPinError('認証に失敗しました')
        return
      }

      if (authResult && authResult.length > 0) {
        const authMember = authResult[0]
        setExistingMemberId(authMember.member_id)
        setGuestName(authMember.guest_name || '')
        setGuestEmail(authMember.guest_email || '')
        
        // セッションを保存（リロード後も維持）
        saveGuestSession(authMember.member_id, authMember.guest_name || '', authMember.guest_email || '')
        
        // メンバーのdate_responsesを取得
        const matchingMember = group.members?.find(m => m.id === authMember.member_id)
        if (matchingMember) {
          const existingResponses: Record<string, ResponseValue> = {}
          matchingMember.date_responses?.forEach(r => {
            existingResponses[r.candidate_date_id] = r.response
          })
          setResponses(existingResponses)
        }
        
        closeSheetReplace()
        toast.success('認証しました')
      } else {
        setPinError('メールアドレスまたはPINが正しくありません')
      }
    } catch (err) {
      logger.error('PIN認証エラー:', err)
      setPinError('認証に失敗しました')
    }
  }

  useEffect(() => {
    if (!group) return

    // ログインユーザーの場合
    if (user) {
      const existingMember = group.members?.find(m => m.user_id === user.id)
      if (existingMember) {
        setExistingMemberId(existingMember.id)
        setGuestName(existingMember.guest_name || '')
        const existingResponses: Record<string, ResponseValue> = {}
        existingMember.date_responses?.forEach(r => {
          existingResponses[r.candidate_date_id] = r.response
        })
        setResponses(existingResponses)
        // 既に適用済みのクーポンがあればセット
        if ((existingMember as any).coupon_id) {
          setSelectedCouponId((existingMember as any).coupon_id)
        }
      }
    }
  }, [group, user])


  // 店舗編集用: シナリオの available_stores に基づいて選択可能な店舗を取得
  const fetchAllStores = async () => {
    if (!group?.organization_id) {
      setAllStores([])
      return
    }

    const mapRow = (s: { id: string; name: string; short_name: string | null }) => ({
      id: s.id,
      name: s.name,
      short_name: s.short_name || s.name,
    })

    try {
      // シナリオの available_stores を取得
      let scenarioAvailableStores: string[] = []
      if (group.scenario_master_id) {
        const { data: scenarioData } = await supabase
          .from('organization_scenarios_with_master')
          .select('available_stores')
          .eq('scenario_master_id', group.scenario_master_id)
          .eq('organization_id', group.organization_id)
          .limit(1)
          .maybeSingle()
        scenarioAvailableStores = scenarioData?.available_stores || []
      }

      const { data, error } = await supabase
        .from('stores')
        .select('id, name, short_name, ownership_type, is_temporary')
        .eq('organization_id', group.organization_id)
        .eq('status', 'active')
        .order('name')

      if (error) throw error

      let storeList: ReturnType<typeof mapRow>[]

      if (scenarioAvailableStores.length > 0) {
        // シナリオに対応店舗が設定されている場合: その店舗のみ（is_temporary 問わず、オフィス除外）
        storeList = (data || [])
          .filter(s => s.ownership_type !== 'office' && scenarioAvailableStores.includes(s.id))
          .map(mapRow)
      } else {
        // 未設定の場合: オフィス・臨時を除外（従来動作）
        storeList = (data || [])
          .filter(s => s.ownership_type !== 'office' && !s.is_temporary)
          .map(mapRow)
      }

      // 既に希望に入っている店舗も選択肢に残す（同じフィルタ条件を適用）
      const missingIds = (group.preferred_store_ids || []).filter(
        (id) => !storeList.some((s) => s.id === id)
      )
      if (missingIds.length > 0) {
        const { data: extra, error: err2 } = await supabase
          .from('stores')
          .select('id, name, short_name, ownership_type, is_temporary')
          .in('id', missingIds)
        if (err2) throw err2
        if (extra?.length) {
          const validExtra = scenarioAvailableStores.length > 0
            ? extra.filter(s => s.ownership_type !== 'office' && scenarioAvailableStores.includes(s.id))
            : extra.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
          storeList = [...storeList, ...validExtra.map(mapRow)]
        }
      }

      setAllStores(storeList)
      setIsFilteredByScenario(scenarioAvailableStores.length > 0)
    } catch (err) {
      logger.error('全店舗取得エラー:', err)
      setAllStores([])
      setIsFilteredByScenario(false)
      toast.error('店舗一覧の取得に失敗しました')
    }
  }

  // 希望店舗を保存
  const handleSavePreferredStores = async () => {
    if (!group) return
    if (!canMutateScheduleBeforeStoreReply) {
      toast.error('店舗の返答待ちのため、希望店舗を変更できません')
      return
    }

    setSavingStores(true)
    try {
      const { error } = await supabase
        .from('private_groups')
        .update({ preferred_store_ids: selectedStoreIds })
        .eq('id', group.id)

      if (error) throw error

      // 店舗変更後、既存候補日がすべての新選択店舗と競合していないか確認
      // 競合する候補日（全選択店舗が埋まっている日）は自動削除して通知する
      const candidateDatesToCheck = group.candidate_dates || []
      if (candidateDatesToCheck.length > 0 && selectedStoreIds.length > 0) {
        // 競合チェックあり（toast は if/else 内で出す）
        const today = new Date().toISOString().split('T')[0]
        const windowEnd = new Date()
        windowEnd.setDate(windowEnd.getDate() + 180)
        const windowEndStr = windowEnd.toISOString().split('T')[0]

        const { data: eventsForNewStores } = await supabase
          .from('schedule_events_public')
          .select('id, date, store_id, start_time, end_time, is_cancelled')
          .in('store_id', selectedStoreIds)
          .gte('date', today)
          .lte('date', windowEndStr)
          .eq('is_cancelled', false)

        // "09:00" or "09:00:00" → 分数に変換（秒付き形式にも対応）
        const toMin = (t: string) => {
          const parts = t.split(':').map(Number)
          return parts[0] * 60 + (parts[1] || 0)
        }

        const conflictingIds: string[] = []
        for (const cd of candidateDatesToCheck) {
          if (cd.status === 'rejected') continue
          const cdStartMin = toMin(cd.start_time)
          const cdEndMin = toMin(cd.end_time)
          // 全選択店舗が当該日時に埋まっているか確認
          const storeHasFreeSlot = selectedStoreIds.some(storeId => {
            const storeEvents = (eventsForNewStores || []).filter(e => e.store_id === storeId && e.date === cd.date)
            return !storeEvents.some(e =>
              toMin(e.start_time) < cdEndMin && toMin(e.end_time) > cdStartMin
            )
          })
          if (!storeHasFreeSlot) {
            conflictingIds.push(cd.id)
          }
        }

        if (conflictingIds.length > 0) {
          await supabase
            .from('private_group_candidate_dates')
            .delete()
            .in('id', conflictingIds)
          toast.warning(`希望店舗を更新しました（空き枠のない候補日 ${conflictingIds.length} 件を削除しました）`)
        } else {
          toast.success('希望店舗を更新しました')
        }
      } else {
        toast.success('希望店舗を更新しました')
      }

      closeSheetReplace()
      refetch()
    } catch (err) {
      logger.error('希望店舗保存エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSavingStores(false)
    }
  }

  // 店舗編集シートを開く
  const openStoreEditSheet = () => {
    if (!canMutateScheduleBeforeStoreReply) {
      toast.error('店舗の返答待ちのため、希望店舗を変更できません')
      return
    }
    setSelectedStoreIds(group?.preferred_store_ids || [])
    openSheet('store-edit')
    setLoadingStoresForEdit(true)
    void (async () => {
      try {
        await fetchAllStores()
      } finally {
        setLoadingStoresForEdit(false)
      }
    })()
  }

  // 料金計算
  const perPersonPrice = useMemo(() => {
    if (!group) return 0
    return (group as any).per_person_price || 0
  }, [group])

  const selectedCoupon = useMemo(() => {
    return coupons.find(c => c.id === selectedCouponId) || null
  }, [coupons, selectedCouponId])

  const discountAmount = selectedCoupon?.discount_amount || 0
  const finalAmount = Math.max(0, perPersonPrice - discountAmount)

  // 進捗表示用の計算（早期リターンの前に配置してフック順序を維持）
  const joinedMembers = useMemo(() => {
    return group?.members?.filter(m => m.status === 'joined') || []
  }, [group?.members])

  /** 却下済みは日程調整の対象外（status 未設定は従来どおり有効） */
  const activeCandidateDates = useMemo(
    () => group?.candidate_dates?.filter(cd => cd.status !== 'rejected') ?? [],
    [group?.candidate_dates]
  )

  const allMembersResponded = useMemo(() => {
    if (!activeCandidateDates.length || !joinedMembers.length) return false
    return joinedMembers.every(member =>
      activeCandidateDates.every(cd =>
        cd.responses?.some(r => r.member_id === member.id)
      )
    )
  }, [activeCandidateDates, joinedMembers])

  /** 全員が同一の「有効」候補日に OK */
  const hasViableDate = useMemo(() => {
    if (!activeCandidateDates.length || !joinedMembers.length) return false
    return activeCandidateDates.some(cd =>
      joinedMembers.every(member =>
        cd.responses?.some(r => r.member_id === member.id && r.response === 'ok')
      )
    )
  }, [activeCandidateDates, joinedMembers])

  /**
   * 進捗の「申込可能」表示用。
   * 却下後の再調整では、新候補にまだ全員OKが付く前に refetch で rejected が付くと
   * hasViableDate だけだと一瞬 true→false になるため、
   * date_adjusting かつ有効候補があれば再申請可能として表示する。
   */
  const bookingProgressReady = useMemo(
    () =>
      hasViableDate ||
      (group?.status === 'date_adjusting' &&
        activeCandidateDates.length > 0 &&
        joinedMembers.length > 0),
    [hasViableDate, group?.status, activeCandidateDates.length, joinedMembers.length]
  )

  const hasCharacters = useMemo(() => {
    const scenario = group?.scenario_masters
    return scenario?.characters && (scenario.characters as unknown[]).length > 0
  }, [group?.scenario_masters])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00+09:00')
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const parts = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      weekday: 'narrow',
    }).formatToParts(date)
    const m = parts.find(p => p.type === 'month')?.value ?? ''
    const d = parts.find(p => p.type === 'day')?.value ?? ''
    const wd = parts.find(p => p.type === 'weekday')?.value ?? ''
    return `${m}/${d}(${wd})`
  }

  // "11月30日(月)" 形式（候補日サマリー表示用）
  const formatDateJaMd = (dateStr: string) => {
    const p = getJstParts(dateStr)
    return p ? `${Number(p.mo)}月${Number(p.d)}日(${p.weekday})` : ''
  }

  const handleResponseChange = (candidateDateId: string, response: DateResponse) => {
    setResponses(prev => ({
      ...prev,
      [candidateDateId]: prev[candidateDateId] === response ? null : response,
    }))
  }

  const getResponseIcon = (response: ResponseValue, type: DateResponse) => {
    const isSelected = response === type
    const baseClass = 'w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer'

    switch (type) {
      case 'ok':
        return (
          <div className={`${baseClass} ${isSelected ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100'}`}>
            <Circle className="w-4 h-4" />
          </div>
        )
      case 'maybe':
        return (
          <div className={`${baseClass} ${isSelected ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-amber-100'}`}>
            <HelpCircle className="w-4 h-4" />
          </div>
        )
      case 'ng':
        return (
          <div className={`${baseClass} ${isSelected ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100'}`}>
            <X className="w-4 h-4" />
          </div>
        )
    }
  }

  const handleSubmit = async (options?: { skipSuccessPage?: boolean }) => {
    setError(null)

    if (!group) {
      setError('グループ情報の取得に失敗しました')
      return
    }

    if (!user && !guestName) {
      setError('お名前を入力してください')
      return
    }

    // ゲスト新規参加時はメールアドレス必須
    if (!user && !existingMemberId && !guestEmail) {
      setError('再訪問時の認証に必要なため、メールアドレスを入力してください')
      return
    }

    // 候補日への回答は任意（後から回答可能）

    try {
      let memberId = existingMemberId
      let newPin: string | null = null

      if (!memberId) {
        const member = await joinGroup({
          groupId: group.id,
          userId: user?.id,
          guestName: user ? undefined : guestName,
          guestEmail: user ? undefined : guestEmail || undefined,
          guestPhone: user ? undefined : guestPhone || undefined,
        })
        memberId = member.id
        
        // 新規参加後、existingMemberIdをセットして再度フォームを表示しないようにする
        setExistingMemberId(memberId)
        
        // ゲスト参加の場合、セッションを保存
        if (!user && guestEmail) {
          saveGuestSession(memberId, guestName, guestEmail)
        }
        
        // ゲスト参加の場合、PINを生成して保存・メール送信
        if (!user && guestEmail) {
          newPin = generatePin()
          // RPC経由でPINを保存（RLSを回避）
          const { error: pinError } = await supabase.rpc('save_guest_access_pin', {
            p_member_id: memberId,
            p_pin: newPin,
          })
          if (pinError) {
            logger.error('PIN保存エラー:', pinError)
          }
          setGeneratedPin(newPin)
          
          // PINをメールで送信（ゲスト用専用Edge Function）
          const scenarioName = group.scenario_masters?.title || 'グループ'
          const inviteUrl = `${window.location.origin}/group/invite/${group.invite_code}`
          supabase.functions.invoke('send-guest-pin', {
            body: {
              groupId: group.id,
              memberId: memberId,
              email: guestEmail,
              pin: newPin,
              scenarioName,
              inviteUrl,
              guestName: guestName || undefined,
            },
          }).catch(err => {
            logger.error('PIN送信メールエラー:', err)
          })
        }
      }

      const responseData = Object.entries(responses)
        .filter(([_, response]) => response != null)
        .map(([candidateDateId, response]) => ({
          candidateDateId,
          response: response as DateResponse,
        }))

      await submitDateResponses(group.id, memberId, responseData)

      // クーポン適用（ログインユーザーで選択済みの場合）
      if (user && selectedCouponId && perPersonPrice > 0) {
        const { error: couponError } = await supabase.rpc('apply_coupon_to_group_member', {
          p_member_id: memberId,
          p_coupon_id: selectedCouponId,
        })
        if (couponError) {
          logger.error('クーポン適用エラー:', couponError)
        }
      } else if (user && !selectedCouponId && perPersonPrice > 0) {
        // クーポン未選択の場合、既存のクーポンを解除
        await supabase.rpc('remove_coupon_from_group_member', {
          p_member_id: memberId,
        })
      }

      if (!options?.skipSuccessPage) {
        setSuccess(true)
      }
      refetch()

    } catch (err: any) {
      setError(err.message || '送信に失敗しました')
    }
  }

  const handleDeleteGroup = async () => {
    if (!group || !isOrganizer || (group.status !== 'gathering' && group.status !== 'cancelled')) return

    setIsDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_private_group', { p_group_id: group.id })
      if (error) throw error

      toast.success('グループを削除しました')
      navigate('/mypage')
    } catch (err: any) {
      logger.error('グループ削除エラー:', err)
      toast.error('グループの削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  if (groupLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            読み込み中...
          </div>
        </div>
      </div>
    )
  }

  if (groupError || !group) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">招待が見つかりません</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {groupError || '招待コードが無効か、有効期限が切れています'}
              </p>
              <Button onClick={() => navigate('/')}>
                トップへ戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (group.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">このグループはキャンセルされました</h2>
              <p className="text-sm text-muted-foreground mb-4">
                主催者によりグループがキャンセルされました
              </p>
              <Button onClick={() => navigate('/')}>
                トップへ戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12 space-y-4">
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <h2 className="text-lg text-green-800 font-medium">
                {generatedPin ? '参加登録が完了しました！' : '回答を更新しました！'}
              </h2>
              <p className="text-sm text-green-700">
                主催者が全員の回答を確認後、貸切予約を申し込みます。
                <br />
                予約確定後にご連絡いたします。
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setSuccess(false)
                    refetch()
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  グループページを見る
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="border-green-600 text-green-700"
                >
                  トップへ戻る
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* PIN表示（新規ゲスト参加時のみ） */}
          {generatedPin && (
            <Card className="border-2 border-red-300 bg-red-50">
              <CardContent className="p-4 text-center space-y-3">
                <p className="text-sm font-bold text-red-800">
                  🔑 アクセスPINを控えてください
                </p>
                <div className="bg-white border-2 border-red-300 rounded-lg py-3 px-6 inline-block">
                  <span className="text-3xl font-mono font-bold tracking-widest text-red-700">
                    {generatedPin}
                  </span>
                </div>
                <p className="text-xs text-red-700">
                  次回このグループにアクセスする際に、<br />
                  メールアドレス（{guestEmail}）とこのPINが必要です
                </p>
              </CardContent>
            </Card>
          )}
          
          {/* ブックマーク案内 */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-amber-800">
                📌 <span className="font-medium">このページをブックマークしてください</span>
              </p>
              <p className="text-xs text-amber-700 mt-1">
                グループの状況確認や回答変更にいつでもアクセスできます
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const scenario = group.scenario_masters as {
    id?: string
    slug?: string
    title?: string
    key_visual_url?: string
    player_count_min?: number
    player_count_max?: number
    effective_player_count_min?: number
    effective_player_count_max?: number
    characters?: unknown[]
  } | undefined
  const scenarioMin =
    scenario?.effective_player_count_min ?? scenario?.player_count_min ?? null
  const scenarioMax =
    scenario?.effective_player_count_max ?? scenario?.player_count_max ?? null
  const inviteBounds =
    scenarioMin != null &&
    scenarioMax != null &&
    scenarioMin > 0 &&
    scenarioMax >= scenarioMin
      ? { min: scenarioMin, max: scenarioMax }
      : null
  const inviteMemberCap = inviteBounds
    ? memberInvitationCap(inviteBounds)
    : null
  const organizerMember = group.members?.find(m => m.is_organizer)
  const organizerName = organizerMember?.guest_name || 'メンバー'
  const memberCount = joinedMembers.length

  // 参加人数が上限に達しているか（シナリオ超過で締め切る）
  const isGroupFull =
    inviteMemberCap !== null && inviteMemberCap > 0 && memberCount >= inviteMemberCap

  // 主催者判定
  const isOrganizer = user && group?.organizer_id === user.id

  // 招待URL取得
  const getInviteUrl = () => `${window.location.origin}/group/invite/${group.invite_code}`

  // URLコピー
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(getInviteUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      logger.error('Failed to copy URL')
    }
  }

  // LINEで共有
  const handleShareLine = () => {
    const scenarioTitle = group.scenario_masters?.title || 'シナリオ'
    const text = `貸切マーダーミステリーに参加しませんか？\n\n🎭 ${scenarioTitle}\n\n以下のリンクから参加・日程回答をお願いします👇`
    const url = getInviteUrl()
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
  }

  // グループキャンセル
  const handleCancelGroup = async () => {
    if (!isOrganizer || !group) return
    if (!confirm('本当にこのグループをキャンセルしますか？')) return
    
    setCancelling(true)
    try {
      await updateGroupStatus(group.id, 'cancelled')
      toast.success('グループをキャンセルしました')
      refetch()
    } catch (err) {
      logger.error('Failed to cancel group', err)
      toast.error('キャンセルに失敗しました')
    } finally {
      setCancelling(false)
    }
  }

  // 日程選択のトグル
  // 貸切申込ダイアログを開く
  const handleOpenBookingDialog = async () => {
    if (!isOrganizer || !group || !user) return
    if (!canMutateScheduleBeforeStoreReply) {
      toast.error('店舗の返答待ちのため、候補日の追加や予約リクエストの作成はできません')
      return
    }
    setBookingSelectedDates(new Set())
    setBookingNotes('')
    
    // 既存の電話番号を取得
    let phone = organizerMember?.guest_phone || ''
    if (!phone && group.organization_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('phone')
        .eq('user_id', user.id)
        .eq('organization_id', group.organization_id)
        .maybeSingle()
      phone = customer?.phone || ''
    }
    setBookingPhone(phone)
    openSheet('booking')
  }
  
  // ダイアログ内での日程選択トグル（最大6件まで）
  const MAX_BOOKING_DATES = 6
  const toggleBookingDate = (dateId: string) => {
    setBookingSelectedDates(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dateId)) {
        newSet.delete(dateId)
      } else {
        if (newSet.size >= MAX_BOOKING_DATES) {
          toast.error(`候補日程は最大${MAX_BOOKING_DATES}件まで選択できます`)
          return prev
        }
        newSet.add(dateId)
      }
      return newSet
    })
  }
  
  // 貸切申込を実行
  const handleSubmitBooking = async () => {
    if (!isOrganizer || !group || !user) return
    if (!canMutateScheduleBeforeStoreReply) {
      toast.error('店舗の返答待ちのため、予約リクエストを送信できません')
      return
    }

    const selectedCandidateDates =
      group.candidate_dates?.filter(
        cd => bookingSelectedDates.has(cd.id) && cd.status !== 'rejected'
      ) || []

    if (selectedCandidateDates.length === 0) {
      toast.error(
        bookingSelectedDates.size > 0
          ? '却下済みの日程は申請に含められません。有効な候補を選び直してください'
          : '申請する日程を選択してください'
      )
      return
    }
    
    // 電話番号の検証
    if (!bookingPhone.trim()) {
      toast.error('電話番号を入力してください')
      return
    }
    
    setIsSubmittingBooking(true)
    
    try {
      const orgId = group.organization_id
      if (!orgId) {
        toast.error('組織情報が取得できません。ページを再読み込みしてください。')
        return
      }

      // 顧客情報を取得または作成
      let customerId: string | null = null
      const customerName = organizerMember?.guest_name || user.email?.split('@')[0] || ''
      const customerEmail = organizerMember?.guest_email || user.email || ''
      const customerPhone = bookingPhone.trim()
      
      // Phase 1 以降、ログイン済み顧客の organization_id = NULL（プラットフォーム共通）
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingCustomer) {
        customerId = existingCustomer.id
        await supabase
          .from('customers')
          .update({ name: customerName, phone: customerPhone, email: customerEmail })
          .eq('id', customerId)
          .eq('user_id', user.id)
      } else {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            user_id: user.id,
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
            organization_id: null,  // Phase 1: ログイン済み顧客は org 不問
          })
          .select('id')
          .single()
        
        if (newCustomer) {
          customerId = newCustomer.id
        }
      }
      
      if (!customerId) {
        throw new Error('顧客情報の取得に失敗しました')
      }

      const { data: phoneRow, error: phoneVerifyError } = await supabase
        .from('customers')
        .select('phone')
        .eq('id', customerId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (phoneVerifyError || !hasNonEmptyCustomerPhone(phoneRow?.phone)) {
        throw new Error(MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING)
      }
      
      // 予約番号を生成
      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
      const baseReservationNumber = `${dateStr}-${randomStr}`
      
      const scenarioTiming = await fetchScenarioTimingFromDb(supabase, {
        organizationId: orgId,
        scenarioLookupId: group.scenario_master_id,
        scenarioMasterId: group.scenario_master_id,
      })

      // 候補日時をJSONB形式で準備（終了は営業枠ではなくシナリオ公演時間）
      const candidateDatetimes = {
        candidates: selectedCandidateDates.map((cd, index) => ({
          order: index + 1,
          date: cd.date,
          timeSlot: cd.time_slot,
          startTime: cd.start_time,
          endTime: getPrivateBookingDisplayEndTime(
            cd.start_time,
            cd.date,
            scenarioTiming,
            isCustomHoliday
          ),
          status: 'pending'
        })),
        requestedStores: preferredStoreNames.map(store => ({
          storeId: store.id,
          storeName: store.name,
          storeShortName: store.name
        }))
      }
      
      // 参加人数: 目標人数があればそれを使用。未設定時は「参加確定メンバー数」（最低1名）。
      // ※以前は target 未設定で 6 に落ちていて、管理画面の人数が実態とずれていた。
      const scenarioForBookingCap = group.scenario_masters as {
        effective_player_count_max?: number
        player_count_max?: number
      } | undefined
      const scenarioPlayerMax =
        scenarioForBookingCap?.effective_player_count_max ??
        scenarioForBookingCap?.player_count_max ??
        null
      const joinedForBooking = joinedMembers.length
      let bookingParticipantCount = Math.max(joinedForBooking, 1)
      if (scenarioPlayerMax != null && bookingParticipantCount > scenarioPlayerMax) {
        bookingParticipantCount = scenarioPlayerMax
      }

      // パラメータの検証
      if (!group.scenario_master_id) {
        throw new Error('シナリオが選択されていません')
      }

      logger.log('[貸切リクエスト] RPCパラメータ:', {
        scenario_id: group.scenario_master_id,
        customer_id: customerId,
        participant_count: bookingParticipantCount,
        candidateDatetimes,
        private_group_id: group.id
      })
      
      // RPC経由で貸切予約を作成
      const { data: reservationId, error: rpcError } = await supabase.rpc('create_private_booking_request', {
        p_scenario_id: group.scenario_master_id,
        p_customer_id: customerId,
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
        p_participant_count: bookingParticipantCount,
        p_candidate_datetimes: candidateDatetimes,
        p_notes: bookingNotes || null,
        p_reservation_number: baseReservationNumber,
        p_private_group_id: group.id
      })
      
      if (rpcError) {
        logger.error('貸切リクエストエラー:', {
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint
        })
        
        // エラーコードに応じたメッセージ
        let errorMessage = '貸切リクエストの送信に失敗しました'
        if (rpcError.code === 'P0001') {
          errorMessage = 'シナリオが見つかりません'
        } else if (rpcError.code === 'P0025') {
          errorMessage = '参加人数が上限を超えています'
        } else if (rpcError.code === 'P0026') {
          errorMessage = '組織情報が見つかりません'
        } else if (rpcError.code === 'P0030' || (rpcError.message && rpcError.message.includes('conflict'))) {
          errorMessage = '選択された全ての候補日時が既存の公演と重複しています。別の日時をお選びください。'
        } else if (rpcError.message) {
          errorMessage = rpcError.message
        }
        
        throw new Error(errorMessage)
      }
      
      const parentReservationId = reservationId as string
      
      // グループのステータスを「申込済み」に更新
      const { error: groupUpdateError } = await supabase
        .from('private_groups')
        .update({
          status: 'booking_requested',
          reservation_id: parentReservationId
        })
        .eq('id', group.id)
      
      if (groupUpdateError) {
        logger.error('グループステータス更新エラー:', groupUpdateError)
      }
      
      // システムメッセージを送信
      const { data: msgSettings } = await supabase
        .from('global_settings')
        .select('system_msg_booking_requested_title, system_msg_booking_requested_body')
        .eq('organization_id', group.organization_id)
        .maybeSingle()
      
      const title = msgSettings?.system_msg_booking_requested_title || '予約リクエストを送信しました'
      const body = msgSettings?.system_msg_booking_requested_body || '店舗からの返信をお待ちください。'
      
      await supabase
        .from('private_group_messages')
        .insert({
          group_id: group.id,
          member_id: organizerMember?.id,
          message: JSON.stringify({
            type: 'system',
            action: 'booking_requested',
            title,
            body
          })
        })
      
      // 貸切申し込み確認メールを送信
      if (parentReservationId && customerEmail) {
        try {
          const candidateDatesForEmail = group.candidate_dates
            ?.filter((cd: any) => bookingSelectedDates.has(cd.id))
            .map((cd: any) => ({
              date: cd.date,
              timeSlot: cd.time_slot,
              startTime: cd.start_time,
              endTime: cd.end_time
            })) || []
          
          const { error: emailError } = await supabase.functions.invoke('send-private-booking-request-confirmation', {
            body: {
              organizationId: orgId,
              reservationId: parentReservationId,
              customerEmail,
              customerName,
              scenarioTitle: group.scenario_masters?.title || 'シナリオ',
              reservationNumber: baseReservationNumber,
              candidateDates: candidateDatesForEmail,
              requestedStores: group.preferred_store_ids || [],
              participantCount: bookingParticipantCount,
              estimatedPrice: 0,
              notes: bookingNotes || undefined
            }
          })
          
          if (emailError) {
            logger.error('貸切申し込み確認メール送信エラー:', emailError)
            toast.error('確認メールの送信に失敗しました')
          } else {
            logger.log('貸切申し込み確認メールを送信しました')
            toast.success('確認メールを送信しました')
          }
        } catch (emailError) {
          logger.error('貸切申し込み確認メール送信エラー:', emailError)
        }
      }
      
      toast.success('予約リクエストを送信しました')
      closeSheetReplace()
      setBookingNotes('')
      setBookingSelectedDates(new Set())
      refetch()
      
    } catch (err) {
      logger.error('予約リクエストエラー:', err)
      toast.error(err instanceof Error ? err.message : '予約リクエストの送信に失敗しました')
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  // メンバー削除
  const handleRemoveMember = async (memberId: string) => {
    if (!isOrganizer || !group) return
    if (!confirm('このメンバーを削除しますか？')) return
    
    try {
      await removeMember(memberId)
      toast.success('メンバーを削除しました')
      refetch()
    } catch (err) {
      logger.error('Failed to remove member', err)
      toast.error('削除に失敗しました')
    }
  }

  // チャットタブ時はシンプルなレイアウト
  const isChatMode = existingMemberId && activeTab === 'chat'

  // 配役方法が未選択かつキャラクターが存在する場合
  // has_pre_reading=true のシナリオのみ配役フローを表示（表示目的のキャラクター登録では発火しない）
  const charAssignmentMethod = (group as any).character_assignment_method as string | null
  const scenarioCharacters = ((group.scenario_masters as any)?.characters || []).filter((c: any) => !c.is_npc)
  const scenarioSurveyEnabled = !!(group.scenario_masters as any)?.survey_enabled
  const needsCharAssignmentChoice = !!(isScheduleConfirmedUi && group.scenario_master_id && scenarioSurveyEnabled && scenarioCharacters.length > 0 && charAssignmentMethod == null)

  // 進捗ステップ数の計算
  // booking_requested以降のステータスであれば、ステップ1〜4は完了済みとして扱う
  const isBookingRequested = group.status === 'booking_requested' || group.status === 'confirmed'
  const completedSteps = [
    isBookingRequested || joinedMembers.length >= 1,
    isBookingRequested || (group.candidate_dates?.length || 0) > 0,
    isBookingRequested || allMembersResponded,
    isBookingRequested,
    isScheduleConfirmedUi
  ].filter(Boolean).length

  // チャットモード時は専用レイアウト
  if (isChatMode && group) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* ヘッダー */}
        <Header />
        
        {/* PC用ナビゲーション */}
        <div className="hidden lg:block">
          <NavigationBar currentPage="/" />
        </div>
        
        {/* メインコンテンツ */}
        <div className="flex-1 flex flex-col overflow-hidden lg:max-w-6xl lg:mx-auto lg:w-full lg:px-4 lg:py-4">
          {/* チャットヘッダー */}
          <div className="shrink-0 border-b lg:border lg:rounded-t-lg bg-white">
            <div className="flex items-center gap-3 px-4 py-2">
              <button 
                onClick={() => navigate('/mypage')}
                className="p-1.5 hover:bg-gray-100 rounded"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              {scenario?.key_visual_url && (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title || ''}
                  className="w-8 h-8 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 
                  className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                >
                  {scenario?.title || 'グループチャット'}
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{memberCount}名参加</span>
                  <span>•</span>
                  <span className={isScheduleConfirmedUi ? 'text-green-600' : group.status === 'booking_requested' ? 'text-blue-600' : ''}>
                    {isScheduleConfirmedUi ? '確定' : group.status === 'booking_requested' ? '確定待ち' : `進捗 ${completedSteps}/5`}
                  </span>
                  {isScheduleConfirmedUi && confirmedByName && (
                    <>
                      <span>•</span>
                      <span className="text-green-600">承認: {confirmedByName}</span>
                    </>
                  )}
                </div>
              </div>
            {isOrganizer && (
              <button
                onClick={() => openSheet('invite')}
                className="p-1.5 hover:bg-gray-100 rounded"
              >
                <UserPlus className="w-5 h-5 text-gray-600" />
              </button>
            )}
              {/* 日程シートを開く */}
            <button
              onClick={() => openSheet('dates')}
              className="p-1.5 hover:bg-gray-100 rounded relative"
            >
              <Calendar className="w-5 h-5 text-gray-600" />
              {(group.candidate_dates?.length || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-purple-600 text-white text-[10px] rounded-full flex items-center justify-center">
                  {group.candidate_dates?.length}
                </span>
              )}
            </button>
            {/* 設定 */}
            <button 
              onClick={() => {
                const statusText = isScheduleConfirmedUi ? '確定' : group.status === 'booking_requested' ? '確定待ち' : '日程調整中'
                setContactMessage(`【予約情報】
招待コード: ${group.invite_code}
シナリオ: ${scenario?.title || '-'}
参加人数: ${memberCount}名
ステータス: ${statusText}

【お問い合わせ内容】
`)
                openSheet('settings')
              }}
              className="p-1.5 hover:bg-gray-100 rounded"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* オーバーレイシート群（候補日/招待/設定/店舗編集/予約申請） */}
        <GroupChatSheets
          showMobileDates={showMobileDates}
          showInviteSheet={showInviteSheet}
          showSettingsSheet={showSettingsSheet}
          showStoreEditSheet={showStoreEditSheet}
          showBookingDialog={showBookingDialog}
          showContactForm={showContactForm}
          group={group}
          scenario={scenario}
          joinedMembers={joinedMembers}
          organizerMember={organizerMember}
          memberCount={memberCount}
          inviteMemberCap={inviteMemberCap}
          user={user}
          code={code}
          existingMemberId={existingMemberId}
          responses={responses}
          isOrganizer={isOrganizer}
          isFilteredByScenario={isFilteredByScenario}
          isScheduleConfirmedUi={isScheduleConfirmedUi}
          allMembersResponded={allMembersResponded}
          canMutateScheduleBeforeStoreReply={canMutateScheduleBeforeStoreReply}
          actionLoading={actionLoading}
          copied={copied}
          isDeleting={isDeleting}
          isSubmittingBooking={isSubmittingBooking}
          isSubmittingContact={isSubmittingContact}
          loadingStoresForEdit={loadingStoresForEdit}
          savingStores={savingStores}
          bookingNotes={bookingNotes}
          bookingPhone={bookingPhone}
          contactMessage={contactMessage}
          bookingSelectedDates={bookingSelectedDates}
          selectedStoreIds={selectedStoreIds}
          preferredStoreNames={preferredStoreNames}
          allStores={allStores}
          MAX_BOOKING_DATES={MAX_BOOKING_DATES}
          setBookingNotes={setBookingNotes}
          setBookingPhone={setBookingPhone}
          setContactMessage={setContactMessage}
          setExistingMemberId={setExistingMemberId}
          setIsSubmittingContact={setIsSubmittingContact}
          setSelectedStoreIds={setSelectedStoreIds}
          setShowContactForm={setShowContactForm}
          navigate={navigate}
          refetch={refetch}
          leaveGroup={leaveGroup}
          formatDateJaMd={formatDateJaMd}
          getInviteUrl={getInviteUrl}
          closeSheet={closeSheet}
          closeSheetReplace={closeSheetReplace}
          openStoreEditSheet={openStoreEditSheet}
          clearGuestSession={clearGuestSession}
          toggleBookingDate={toggleBookingDate}
          handleResponseChange={handleResponseChange}
          handleRemoveMember={handleRemoveMember}
          handleSavePreferredStores={handleSavePreferredStores}
          handleSubmitBooking={handleSubmitBooking}
          handleShareLine={handleShareLine}
          handleCopyUrl={handleCopyUrl}
          handleDeleteGroup={handleDeleteGroup}
          handleOpenBookingDialog={handleOpenBookingDialog}
          handleSubmit={handleSubmit}
        />

        {/* PC: 2カラム / モバイル: チャットのみ */}
        <div className="flex-1 flex overflow-hidden">
          {/* チャット */}
          <div className="flex-1 flex flex-col min-w-0">
            <GroupChat
              groupId={group.id}
              currentMemberId={existingMemberId}
              members={group.members || []}
              fullHeight={true}
              onGoToSchedule={() => openSheet('dates')}
              scenarioId={group.scenario_master_id || undefined}
              organizationId={group.organization_id || undefined}
              performanceDate={group.candidate_dates?.[0]?.date}
              needsCharAssignmentChoice={needsCharAssignmentChoice}
              onCharAssignmentMethodSelected={async (method) => {
                await supabase.from('private_groups').update({ character_assignment_method: method, character_assignments: null }).eq('id', group.id)
                await supabase.rpc('clear_character_selection_from_survey', { p_group_id: group.id })
                const methodLabel = method === 'survey' ? 'アンケート' : '自分たちで決める'
                await supabase.from('private_group_messages').insert({
                  group_id: group.id,
                  member_id: existingMemberId,
                  message: JSON.stringify({ type: 'system', action: 'character_method_selected', title: `配役方法が選択されました`, body: `「${methodLabel}」が選択されました。` }),
                })
                refetch()
              }}
              charAssignmentMethod={charAssignmentMethod}
              characters={scenarioCharacters}
              isOrganizer={group.members?.find(m => m.id === existingMemberId)?.is_organizer || false}
              onCharAssignmentConfirmed={() => refetch()}
              onResetCharAssignmentMethod={async () => {
                await supabase.from('private_groups').update({ character_assignment_method: null, character_assignments: null }).eq('id', group.id)
                await supabase.rpc('clear_character_selection_from_survey', { p_group_id: group.id })
                refetch()
              }}
              scenarioPlayerCount={scenarioMax}
            />
          </div>

          {/* PC用サイドバー */}
          <div className="hidden lg:block w-80 border-l bg-gray-50 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* 進捗ステップ */}
              <div className="bg-white rounded-lg p-3 border">
                <h3 className="font-semibold text-sm mb-2">進捗</h3>
                <div className="space-y-1.5">
                  {/* メンバー招待: 1名以上または申込済みなら完了 */}
                  <div className={`flex items-center gap-2 text-xs ${joinedMembers.length >= 1 || group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
                    {joinedMembers.length >= 1 || group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    メンバー招待 ({joinedMembers.length}名)
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${(group.candidate_dates?.length || 0) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                    {(group.candidate_dates?.length || 0) > 0 ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    候補日追加 ({group.candidate_dates?.length || 0}件)
                  </div>
                  {/* 日程回答: 全員回答済み、または申込済みなら完了 */}
                  <div className={`flex items-center gap-2 text-xs ${allMembersResponded || group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
                    {allMembersResponded || group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    日程回答
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
                    {group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    予約申込
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${isScheduleConfirmedUi ? 'text-green-600' : 'text-gray-500'}`}>
                    {isScheduleConfirmedUi ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    日程確定
                    {isScheduleConfirmedUi && confirmedByName && (
                      <span className="text-green-700">（{confirmedByName}）</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 希望店舗 */}
              <div className="bg-white rounded-lg p-3 border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">希望店舗</h3>
                  {isOrganizer && canMutateScheduleBeforeStoreReply && (
                    <button
                      onClick={openStoreEditSheet}
                      className="text-xs text-purple-600 hover:underline"
                    >
                      編集
                    </button>
                  )}
                </div>
                {preferredStoreNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {preferredStoreNames.map(store => (
                      <span
                        key={store.id}
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs"
                      >
                        {store.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">未設定</p>
                )}
              </div>

              {/* 候補日程 */}
              {group.candidate_dates && group.candidate_dates.length > 0 && (
                <div className="bg-white rounded-lg p-3 border">
                  <h3 className="font-semibold text-sm mb-2">候補日程</h3>
                  <div className="space-y-2">
                    {group.candidate_dates.slice(0, 3).map((cd) => (
                      <div key={cd.id} className="text-xs">
                        <div className="font-medium">{formatDateJaMd(cd.date)}</div>
                        <div className="text-muted-foreground">{cd.time_slot}</div>
                      </div>
                    ))}
                    {group.candidate_dates.length > 3 && (
                      <button 
                        onClick={() => setActiveTab('schedule')}
                        className="text-xs text-purple-600 hover:underline"
                      >
                        他{group.candidate_dates.length - 3}件を表示
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* メンバー（クリックで管理ダイアログを開く） */}
              <div 
                className={`bg-white rounded-lg p-3 border ${isOrganizer ? 'cursor-pointer hover:border-purple-300 transition-colors' : ''}`}
                onClick={() => isOrganizer && openSheet('invite')}
              >
                <h3 className="font-semibold text-sm mb-2 flex items-center justify-between">
                  <span>メンバー ({joinedMembers.length}名)</span>
                  {isOrganizer && <UserPlus className="w-4 h-4 text-purple-600" />}
                </h3>
                <div className="space-y-1.5">
                  {joinedMembers.slice(0, 5).map(member => (
                    <div key={member.id} className="flex items-center gap-2 text-xs">
                      <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                        <Users className="w-3 h-3 text-purple-600" />
                      </div>
                      <span className="truncate">{member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}</span>
                    </div>
                  ))}
                  {joinedMembers.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      他{joinedMembers.length - 5}名
                    </p>
                  )}
                </div>
              </div>

              {/* 主催者向け機能（日程調整中・再調整中の両方） */}
              {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
                <div className="pt-2 border-t">
                  <Button
                    size="sm"
                    className="w-full text-xs bg-green-600 hover:bg-green-700"
                    onClick={handleOpenBookingDialog}
                  >
                    予約リクエストを作成
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
        
        {/* モバイル用ナビゲーション */}
        <div className="lg:hidden shrink-0">
          <NavigationBar currentPage="/" />
        </div>

      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <NavigationBar currentPage="/" />

      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 戻るボタン */}
        <button
          onClick={() => navigate('/mypage')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          マイページに戻る
        </button>

        <Card className="border-purple-200 bg-purple-50/50 mb-6">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-purple-800">
              <span className="font-medium">{organizerName}</span>さんからの貸切お誘い
            </p>
          </CardContent>
        </Card>

        {/* 新規登録特典案内 */}
        {!user && (
          <Card className="mb-6 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">🎁</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-800">
                    新規会員登録で2,000円分クーポンプレゼント！
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    ログインして参加すると、次回予約で使えるクーポンがもらえます
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => navigate(`/signup?redirect=${encodeURIComponent(location.pathname)}`)}
                >
                  新規登録
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-amber-500 text-amber-700 hover:bg-amber-100"
                  onClick={() => navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)}
                >
                  ログイン
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* シナリオ情報 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4">
              {scenario?.key_visual_url && (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title || ''}
                  className="w-20 h-28 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                />
              )}
              <div className="flex-1">
                <h2 
                  className="text-base font-medium cursor-pointer hover:text-primary transition-colors"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                >
                  {scenario?.title || 'シナリオ'}
                </h2>
                {group.name && (
                  <p className="text-sm text-muted-foreground mt-1">{group.name}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>
                      {memberCount}/{inviteMemberCap ?? '?'}名
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="mt-2 bg-purple-100 text-purple-800 border-purple-200 text-xs">
                  貸切リクエスト
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-4 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {/* 進捗ステップ表示（参加済みメンバー向け、チャットモード時は非表示） */}
        {existingMemberId && (group.status as string) !== 'cancelled' && !isChatMode && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="space-y-1 mb-3">
                <h3 className="font-semibold text-sm text-gray-700">貸切予約の進捗</h3>
                {group.status === 'gathering' && (
                  <div className="text-xs text-muted-foreground">
                    申込準備中（{[joinedMembers.length >= 1, (group.candidate_dates?.length || 0) > 0, allMembersResponded].filter(Boolean).length}/3 完了）
                  </div>
                )}
                {group.status === 'booking_requested' && !isScheduleConfirmedUi && (
                  <div className="text-xs text-blue-600 font-medium">日程確定待ち</div>
                )}
                {isScheduleConfirmedUi && (
                  <div className="text-xs text-green-600 font-medium">公演日まであと少し！</div>
                )}
              </div>

              <div className="space-y-2">
                {/* STEP 1: メンバー招待（1名以上または申込済みで完了） */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status !== 'gathering' || joinedMembers.length >= 1 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status !== 'gathering' || joinedMembers.length >= 1 
                      ? 'bg-green-600 text-white' 
                      : 'bg-amber-500 text-white'
                  }`}>
                    {group.status !== 'gathering' || joinedMembers.length >= 1 ? <Check className="w-3 h-3" /> : '1'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">メンバーを招待</span>
                    <span className="text-xs text-muted-foreground ml-2">{joinedMembers.length}名</span>
                  </div>
                </div>

                {/* STEP 2: 候補日追加 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-400 text-white'
                  }`}>
                    {group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 ? <Check className="w-3 h-3" /> : '2'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">候補日を追加</span>
                    <span className="text-xs text-muted-foreground ml-2">{group.candidate_dates?.length || 0}件</span>
                  </div>
                </div>

                {/* STEP 3: 日程回答待ち */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status !== 'gathering' || allMembersResponded 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status !== 'gathering' || allMembersResponded 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-400 text-white'
                  }`}>
                    {group.status !== 'gathering' || allMembersResponded ? <Check className="w-3 h-3" /> : '3'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">日程回答を集める</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {group.status !== 'gathering' 
                        ? '完了' 
                        : `${joinedMembers.filter(m => group.candidate_dates?.every(cd => cd.responses?.some(r => r.member_id === m.id))).length}/${joinedMembers.length}名`}
                    </span>
                  </div>
                </div>

                {/* STEP 4: 予約申込 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status === 'booking_requested' || group.status === 'confirmed'
                    ? 'bg-green-50 border-green-200' 
                    : (group.status === 'gathering' || group.status === 'date_adjusting') && bookingProgressReady
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status === 'booking_requested' || group.status === 'confirmed'
                      ? 'bg-green-600 text-white' 
                      : (group.status === 'gathering' || group.status === 'date_adjusting') && bookingProgressReady
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-400 text-white'
                  }`}>
                    {group.status === 'booking_requested' || group.status === 'confirmed' ? <Check className="w-3 h-3" /> : '4'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">貸切を申し込む</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {group.status === 'booking_requested' || group.status === 'confirmed'
                        ? '申込完了' 
                        : bookingProgressReady ? '申込可能！' : '調整中'}
                    </span>
                  </div>
                </div>

                {/* STEP 5: 日程確定 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  isScheduleConfirmedUi
                    ? 'bg-green-50 border-green-200' 
                    : group.status === 'booking_requested'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isScheduleConfirmedUi
                      ? 'bg-green-600 text-white' 
                      : group.status === 'booking_requested'
                        ? 'bg-blue-600 text-white animate-pulse'
                        : 'bg-gray-400 text-white'
                  }`}>
                    {isScheduleConfirmedUi ? <Check className="w-3 h-3" /> : '5'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">日程確定</span>
                      <span className="text-xs text-muted-foreground">
                        {isScheduleConfirmedUi
                          ? '確定！' 
                          : group.status === 'booking_requested'
                            ? '連絡待ち'
                            : '申込後'}
                      </span>
                    </div>
                    {isScheduleConfirmedUi && confirmedByName && (
                      <div className="text-xs text-green-700">
                        承認者: {confirmedByName}
                      </div>
                    )}
                  </div>
                </div>

                {/* STEP 6: 事前アンケート */}
                {hasCharacters && (
                  <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                    isScheduleConfirmedUi
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isScheduleConfirmedUi
                        ? 'bg-amber-500 text-white'
                        : 'bg-gray-400 text-white'
                    }`}>
                      6
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">事前アンケート</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {isScheduleConfirmedUi ? '回答してください' : '確定後'}
                      </span>
                    </div>
                  </div>
                )}

                {/* STEP 7: 配役確定 */}
                {hasCharacters && (
                  <div className="flex items-center gap-3 p-2 rounded-lg border bg-gray-50 border-gray-200">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-400 text-white">
                      7
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">配役確定</span>
                      <span className="text-xs text-muted-foreground ml-2">アンケート後</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* チャットを開くボタン */}
              <Button
                onClick={() => setActiveTab('chat')}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                チャットを開く
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 参加済みメンバー向けタブ */}
        {existingMemberId && group.members && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsList className={`grid w-full mb-4 ${isOrganizer ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <TabsTrigger value="schedule" className="gap-1.5">
                <Calendar className="w-4 h-4" />
                日程
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-1.5">
                <MessageCircle className="w-4 h-4" />
                チャット
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5">
                <Users className="w-4 h-4" />
                メンバー
              </TabsTrigger>
              {isOrganizer && (
                <TabsTrigger value="manage" className="gap-1.5">
                  <UserPlus className="w-4 h-4" />
                  管理
                </TabsTrigger>
              )}
            </TabsList>

            {/* 日程タブ */}
            <TabsContent value="schedule">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">参加可能な日時を選んでください</h3>
                {group.candidate_dates?.map((cd, index) => {
                  const dateResponses = cd.responses || []
                  const okCount = dateResponses.filter(r => r.response === 'ok').length
                  const maybeCount = dateResponses.filter(r => r.response === 'maybe').length
                  const ngCount = dateResponses.filter(r => r.response === 'ng').length
                  const totalMembers = joinedMembers.length
                  const respondedCount = dateResponses.length
                  const isRejected = cd.status === 'rejected'
                  const showIcons = group.status === 'gathering' && !isRejected
                  
                  return (
                    <Card key={cd.id} className={isRejected ? 'opacity-70 bg-gray-50' : ''}>
                      <CardContent className="p-2.5 sm:p-3">
                        <div className={`flex items-center gap-2 ${showIcons ? 'mb-1.5' : ''}`}>
                          <div className="flex-1 min-w-0 leading-tight">
                            <div className="flex items-center gap-1.5 flex-wrap text-xs">
                              {isRejected ? (
                                <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] bg-red-100 text-red-800 border-red-200">
                                  却下
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] bg-purple-100 text-purple-800 border-purple-200">
                                  {index + 1}
                                </Badge>
                              )}
                              <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className={`font-medium ${isRejected ? 'line-through text-muted-foreground' : ''}`}>{formatDate(cd.date)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span className={isRejected ? 'line-through' : ''}>{cd.time_slot} {cd.start_time} - {cd.end_time}</span>
                            </div>
                          </div>
                          {/* 回答状況サマリー（却下された場合は非表示） */}
                          {!isRejected && (
                            <div className="text-right shrink-0">
                              <div className="flex items-center justify-end gap-0.5 text-[10px]">
                                <span className="text-green-600">○{okCount}</span>
                                <span className="text-amber-600">△{maybeCount}</span>
                                <span className="text-red-600">×{ngCount}</span>
                              </div>
                              <div className="text-[9px] text-muted-foreground leading-none mt-0.5">
                                {respondedCount}/{totalMembers}人
                              </div>
                            </div>
                          )}
                        </div>
                        {/* 回答ボタン（日程申込前かつ却下されていない場合のみ表示） */}
                        {showIcons && (
                          <div className="flex gap-2">
                            <div onClick={() => handleResponseChange(cd.id, 'ok')}>
                              {getResponseIcon(responses[cd.id], 'ok')}
                            </div>
                            <div onClick={() => handleResponseChange(cd.id, 'maybe')}>
                              {getResponseIcon(responses[cd.id], 'maybe')}
                            </div>
                            <div onClick={() => handleResponseChange(cd.id, 'ng')}>
                              {getResponseIcon(responses[cd.id], 'ng')}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
                <div className="flex justify-center gap-6 mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <Circle className="w-2 h-2 text-white" />
                    </div>
                    参加可能
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                      <HelpCircle className="w-2 h-2 text-white" />
                    </div>
                    未定
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                      <X className="w-2 h-2 text-white" />
                    </div>
                    不可
                  </div>
                </div>
                
                {/* 回答更新ボタン（日程申込前のみ表示） */}
                {group.status === 'gathering' && (
                  <Button
                    onClick={() => handleSubmit()}
                    disabled={actionLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700 mt-4"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        送信中...
                      </>
                    ) : '回答を更新する'}
                  </Button>
                )}
                
                {/* 主催者向け申請ボタン（日程調整中・再調整中の両方） */}
                {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
                  <Button
                    onClick={handleOpenBookingDialog}
                    className="w-full bg-green-600 hover:bg-green-700 mt-3"
                  >
                    予約リクエストを作成
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* チャットタブ */}
            <TabsContent value="chat">
              <GroupChat
                groupId={group.id}
                currentMemberId={existingMemberId}
                members={group.members}
                onGoToSchedule={() => setActiveTab('schedule')}
                scenarioId={group.scenario_master_id || undefined}
                organizationId={group.organization_id || undefined}
                performanceDate={group.candidate_dates?.[0]?.date}
                needsCharAssignmentChoice={needsCharAssignmentChoice}
                onCharAssignmentMethodSelected={async (method) => {
                  await supabase.from('private_groups').update({ character_assignment_method: method, character_assignments: null }).eq('id', group.id)
                  await supabase.rpc('clear_character_selection_from_survey', { p_group_id: group.id })
                  const methodLabel = method === 'survey' ? 'アンケート' : '自分たちで決める'
                  await supabase.from('private_group_messages').insert({
                    group_id: group.id,
                    member_id: existingMemberId,
                    message: JSON.stringify({ type: 'system', action: 'character_method_selected', title: `配役方法が選択されました`, body: `「${methodLabel}」が選択されました。` }),
                  })
                  refetch()
                }}
                charAssignmentMethod={charAssignmentMethod}
                characters={scenarioCharacters}
                isOrganizer={group.members?.find(m => m.id === existingMemberId)?.is_organizer || false}
                onCharAssignmentConfirmed={() => refetch()}
                onResetCharAssignmentMethod={async () => {
                  await supabase.from('private_groups').update({ character_assignment_method: null, character_assignments: null }).eq('id', group.id)
                  await supabase.rpc('clear_character_selection_from_survey', { p_group_id: group.id })
                  refetch()
                }}
                scenarioPlayerCount={scenarioMax}
              />
            </TabsContent>

            {/* メンバータブ */}
            <TabsContent value="members">
              <div className="space-y-3">
                <h3 className="text-base font-semibold">参加メンバー（{group.members.filter(m => m.status === 'joined').length}名）</h3>
                {group.members.filter(m => m.status === 'joined').map(member => (
                  <Card key={member.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                          <Users className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}
                          </p>
                          {member.is_organizer && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              主催者
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.id === existingMemberId && (
                          <Badge variant="outline" className="text-xs">あなた</Badge>
                        )}
                        {isOrganizer && !member.is_organizer && member.id !== existingMemberId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* 管理タブ（主催者のみ） */}
            {isOrganizer && (
              <TabsContent value="manage">
                <div className="space-y-6">
                  {/* 招待URL共有 */}
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        招待リンクを共有
                      </h3>
                      <div className="flex gap-2">
                        <Input
                          value={getInviteUrl()}
                          readOnly
                          className="text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyUrl}
                          className="shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 候補日追加 */}
                  {isOrganizer && canMutateScheduleBeforeStoreReply && (
                    <AddCandidateDates
                      groupId={group.id}
                      organizationId={group.organization_id || ''}
                      scenarioId={group.scenario_master_id || ''}
                      storeIds={group.preferred_store_ids || []}
                      existingDates={group.candidate_dates || []}
                      onDatesAdded={refetch}
                      organizerMemberId={organizerMember?.id}
                    />
                  )}

                  {/* 申込ガイダンス */}
                  {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="p-4 text-center text-sm text-muted-foreground">
                        ↑ 上の候補日から採用する日程を選んで「この日程で申請する」を押してください
                      </CardContent>
                    </Card>
                  )}

                  {/* キャンセルボタン */}
                  {group.status === 'gathering' && (
                    <Card className="border-red-200">
                      <CardContent className="p-4">
                        <Button
                          variant="outline"
                          onClick={handleCancelGroup}
                          disabled={cancelling}
                          className="w-full text-red-600 border-red-300 hover:bg-red-50"
                        >
                          {cancelling ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              キャンセル中...
                            </>
                          ) : 'グループをキャンセル'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}

        {/* 参加費・クーポン */}
        {perPersonPrice > 0 && (
          <Card className="mb-6 border-blue-200">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold">参加費</h3>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">1人あたり参加費</span>
                  <span className="font-medium">¥{perPersonPrice.toLocaleString()}</span>
                </div>
                
                {selectedCoupon && (
                  <div className="flex justify-between items-center text-sm text-green-600">
                    <span className="flex items-center gap-1">
                      <Ticket className="w-4 h-4" />
                      クーポン割引
                    </span>
                    <span>-¥{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="font-medium">お支払い金額</span>
                  <span className="text-lg font-bold text-blue-600">¥{finalAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* クーポン選択（ログインユーザーのみ） */}
              {user && (
                <div className="pt-2 border-t">
                  <Label className="text-sm font-medium mb-2 block flex items-center gap-1">
                    <Ticket className="w-4 h-4 text-amber-500" />
                    クーポンを使う
                  </Label>
                  {couponLoading ? (
                    <div className="text-sm text-muted-foreground">読み込み中...</div>
                  ) : coupons.length > 0 ? (
                    <Select
                      value={selectedCouponId || 'none'}
                      onValueChange={(value) => setSelectedCouponId(value === 'none' ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="クーポンを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">クーポンを使用しない</SelectItem>
                        {coupons.map((coupon) => (
                          <SelectItem key={coupon.id} value={coupon.id}>
                            {coupon.name} - ¥{coupon.discount_amount.toLocaleString()}OFF
                            {coupon.expires_at && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({formatJstDateJa(coupon.expires_at)}まで)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      利用可能なクーポンがありません
                    </p>
                  )}
                </div>
              )}

              {/* 未ログインの場合のクーポン案内 */}
              {!user && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    <Ticket className="w-4 h-4 inline-block mr-1 text-amber-500" />
                    ログインするとクーポンを使用できます
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                💡 お支払いは当日、店舗でお願いします。現金またはクレジットカードがご利用いただけます。
              </p>
            </CardContent>
          </Card>
        )}

        {/* ゲスト情報（非ログイン時） */}
        {!user && !existingMemberId && !showPinAuth && (
          <Card className="mb-6">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">お名前を入力</h3>
                <Button
                  variant="link"
                  size="sm"
                  className="text-purple-600 hover:text-purple-700 p-0 h-auto"
                  onClick={() => navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)}
                >
                  ログインして参加 →
                </Button>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">お名前 *</Label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="山田 太郎"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">メールアドレス *</Label>
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="example@example.com"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  再訪問時の認証と予約確定のご連絡に使用します
                </p>
              </div>
              
              {/* 既に参加済みの方向け */}
              <div className="border-t pt-3">
                <Button
                  variant="link"
                  size="sm"
                  className="text-gray-600 hover:text-gray-800 p-0 h-auto text-xs"
                  onClick={() => openSheet('pin')}
                >
                  既に参加済みの方はこちら（PIN認証）
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PIN認証フォーム */}
        {!user && !existingMemberId && showPinAuth && (
          <Card className="mb-6 border-purple-200">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">PINで認証</h3>
                <Button
                  variant="link"
                  size="sm"
                  className="text-gray-500 hover:text-gray-700 p-0 h-auto text-xs"
                  onClick={() => closeSheet()}
                >
                  新規参加に戻る
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground">
                以前参加登録した際のメールアドレスとPINを入力してください
              </p>
              
              {pinError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded">
                  {pinError}
                </div>
              )}
              
              <div>
                <Label className="text-sm font-medium mb-1.5 block">メールアドレス</Label>
                <Input
                  type="email"
                  value={pinEmail}
                  onChange={(e) => setPinEmail(e.target.value)}
                  placeholder="example@example.com"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">PIN（4桁）</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="1234"
                  className="text-sm text-center text-xl tracking-widest font-mono"
                />
              </div>
              <Button
                onClick={handlePinAuth}
                className="w-full bg-purple-600 hover:bg-purple-700"
                disabled={!pinEmail || pinCode.length !== 4}
              >
                認証する
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ログイン中のユーザー情報 */}
        {user && !existingMemberId && (
          <Card className="mb-6 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <p className="text-sm text-blue-800">
                <span className="font-medium">{user.email}</span> としてログイン中
              </p>
            </CardContent>
          </Card>
        )}

        {/* アンケート or キャラクター選択（配役方法選択済み・日程確定後） */}
        {isScheduleConfirmedUi && existingMemberId && group.scenario_master_id && !needsCharAssignmentChoice && (() => {
          const hasCharacters = scenarioCharacters.length > 0
          const method = charAssignmentMethod

          if (!hasCharacters || method === 'survey') {
            return (
              <SurveyResponseForm
                groupId={group.id}
                memberId={existingMemberId}
                performanceDate={group.candidate_dates?.find(cd => cd.order_num === 1)?.date}
                characters={(group as any).scenario_characters || []}
              />
            )
          }

          if (method === 'self') {
            return null
          }

          return null
        })()}

        {/* 送信ボタン（新規参加時のみ表示） */}
        {!existingMemberId && (
          <>
            {isGroupFull && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm text-center mb-2">
                参加人数が上限（{inviteMemberCap}名）に達しています
              </div>
            )}
            <Button
              onClick={() => handleSubmit()}
              disabled={actionLoading || isGroupFull}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  送信中...
                </>
              ) : isGroupFull ? (
                '参加人数上限に達しています'
              ) : (
                '参加する'
              )}
            </Button>
          </>
        )}

        {/* 退出ボタン（参加済みメンバー用、主催者以外） */}
        {(existingMemberId || (user && group?.members?.some(m => m.user_id === user.id && !m.is_organizer))) && (
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm('本当にこのグループから退出しますか？')) return
              try {
                if (existingMemberId) {
                  // RPC経由で削除（RLSを回避）
                  const { error: deleteError } = await supabase.rpc('delete_guest_member', {
                    p_member_id: existingMemberId,
                    p_invite_code: code ?? null,
                  })
                  if (deleteError) throw deleteError
                  toast.success('グループから退出しました')
                  setExistingMemberId(null)
                  clearGuestSession()
                  refetch()
                } else if (user && group) {
                  await leaveGroup(group.id)
                  toast.success('グループから退出しました')
                  navigate('/mypage')
                }
              } catch (err) {
                logger.error('Failed to leave group', err)
                toast.error('退出に失敗しました')
              }
            }}
            disabled={actionLoading}
            className="w-full mt-2 text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
          >
            <LogOut className="w-4 h-4 mr-2" />
            このグループから退出する
          </Button>
        )}

      </div>
    </div>
  )
}
