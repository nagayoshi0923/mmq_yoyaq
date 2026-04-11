import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, Circle, X, HelpCircle, Loader2, Ticket, CreditCard, LogOut, MessageCircle, Check, UserPlus, Copy, Share2, ArrowLeft, Settings, Trash2, ChevronDown, MapPin } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupChat } from '@/pages/PrivateGroupManage/components/GroupChat'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import { useAuth } from '@/contexts/AuthContext'
import { usePrivateGroup, usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroup'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { DateResponse, PrivateGroupCandidateDate } from '@/types'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { fetchScenarioTimingFromDb, getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { memberInvitationCap } from '@/lib/privateGroupPlayerCap'
import { SurveyResponseForm } from './components/SurveyResponseForm'

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
  const { isCustomHoliday } = useCustomHolidays()
  
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
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)

  // PIN認証関連
  const [showPinAuth, setShowPinAuth] = useState(false)
  const [pinEmail, setPinEmail] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [generatedPin, setGeneratedPin] = useState<string | null>(null)
  
  // タブ状態（チャットをデフォルトに）
  const [activeTab, setActiveTab] = useState('chat')

  // 主催者向け機能
  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  
  // モバイル候補日シート
  const [showMobileDates, setShowMobileDates] = useState(false)
  
  
  // グループ設定シート
  const [showSettingsSheet, setShowSettingsSheet] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [contactMessage, setContactMessage] = useState('')
  const [showContactForm, setShowContactForm] = useState(false)
  const [isSubmittingContact, setIsSubmittingContact] = useState(false)
  
  // メンバー招待シート
  const [showInviteSheet, setShowInviteSheet] = useState(false)
  
  // 希望店舗関連
  const [preferredStoreNames, setPreferredStoreNames] = useState<Array<{ id: string; name: string }>>([])
  const [showStoreEditSheet, setShowStoreEditSheet] = useState(false)
  const [allStores, setAllStores] = useState<Array<{ id: string; name: string; short_name: string }>>([])
  const [isFilteredByScenario, setIsFilteredByScenario] = useState(false)
  const [loadingStoresForEdit, setLoadingStoresForEdit] = useState(false)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [savingStores, setSavingStores] = useState(false)
  
  // 申請ダイアログ（日程選択 + 送信）
  const [showBookingDialog, setShowBookingDialog] = useState(false)
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
        
        setShowPinAuth(false)
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

  // ログインユーザーの利用可能クーポンを取得
  useEffect(() => {
    const fetchCoupons = async () => {
      if (!user) {
        setCoupons([])
        return
      }
      if (!group?.organization_id) {
        setCoupons([])
        return
      }

      setCouponLoading(true)
      try {
        // 顧客IDを取得（グループ所属組織の顧客行に限定）
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .eq('organization_id', group.organization_id)
          .maybeSingle()

        if (!customer) {
          setCoupons([])
          return
        }

        // 利用可能なクーポンを取得
        const { data: couponData, error } = await supabase
          .from('customer_coupons')
          .select(`
            id,
            expires_at,
            status,
            uses_remaining,
            coupon_campaigns (
              id,
              name,
              discount_amount
            )
          `)
          .eq('customer_id', customer.id)
          .eq('status', 'active')
          .gt('uses_remaining', 0)
          .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)

        if (error) throw error
        
        // customer_coupons のデータを Coupon 形式に変換
        const transformedCoupons: Coupon[] = (couponData || []).map((cc: any) => ({
          id: cc.id,
          name: cc.coupon_campaigns?.name || 'クーポン',
          discount_amount: cc.coupon_campaigns?.discount_amount || 0,
          expires_at: cc.expires_at,
          status: cc.status,
        }))
        setCoupons(transformedCoupons)
      } catch (err) {
        logger.error('クーポン取得エラー:', err)
        setCoupons([])
      } finally {
        setCouponLoading(false)
      }
    }

    fetchCoupons()
  }, [user, group?.organization_id])

  // 希望店舗の名前を取得
  useEffect(() => {
    const fetchStoreNames = async () => {
      if (!group?.preferred_store_ids?.length) {
        setPreferredStoreNames([])
        return
      }
      
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name')
          .in('id', group.preferred_store_ids)
        
        if (error) throw error
        setPreferredStoreNames(data || [])
      } catch (err) {
        logger.error('店舗名取得エラー:', err)
        setPreferredStoreNames([])
      }
    }
    
    fetchStoreNames()
  }, [group?.preferred_store_ids])

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
      
      toast.success('希望店舗を更新しました')
      setShowStoreEditSheet(false)
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
    setShowStoreEditSheet(true)
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
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
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

  // グループ削除（主催者かつgatheringまたはcancelledステータスのみ）
  const handleDeleteGroup = async () => {
    if (!group || !isOrganizer || (group.status !== 'gathering' && group.status !== 'cancelled')) return
    
    setIsDeleting(true)
    try {
      // メンバーを全員削除
      const { error: membersError } = await supabase
        .from('private_group_members')
        .delete()
        .eq('group_id', group.id)
      
      if (membersError) throw membersError
      
      // 候補日を全て削除
      const { error: datesError } = await supabase
        .from('private_group_candidate_dates')
        .delete()
        .eq('group_id', group.id)
      
      if (datesError) throw datesError
      
      // メッセージを削除
      const { error: messagesError } = await supabase
        .from('private_group_messages')
        .delete()
        .eq('group_id', group.id)
      
      if (messagesError) throw messagesError
      
      // グループを削除
      const { error: groupDeleteError } = await supabase
        .from('private_groups')
        .delete()
        .eq('id', group.id)
      
      if (groupDeleteError) throw groupDeleteError
      
      toast.success('グループを削除しました')
      setShowSettingsSheet(false)
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
    setShowBookingDialog(true)
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
      
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .maybeSingle()
      
      if (existingCustomer) {
        customerId = existingCustomer.id
        await supabase
          .from('customers')
          .update({ name: customerName, phone: customerPhone, email: customerEmail })
          .eq('id', customerId)
          .eq('user_id', user.id)
          .eq('organization_id', orgId)
      } else {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            user_id: user.id,
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
            organization_id: orgId
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
        .eq('organization_id', orgId)
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
      setShowBookingDialog(false)
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
  const charAssignmentMethod = (group as any).character_assignment_method as string | null
  const scenarioCharacters = ((group.scenario_masters as any)?.characters || []).filter((c: any) => !c.is_npc)
  const needsCharAssignmentChoice = !!(isScheduleConfirmedUi && group.scenario_master_id && scenarioCharacters.length > 0 && charAssignmentMethod == null)

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
                onClick={() => setShowInviteSheet(true)}
                className="p-1.5 hover:bg-gray-100 rounded"
              >
                <UserPlus className="w-5 h-5 text-gray-600" />
              </button>
            )}
              {/* 日程シートを開く */}
            <button 
              onClick={() => setShowMobileDates(true)}
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
                setShowSettingsSheet(true)
              }}
              className="p-1.5 hover:bg-gray-100 rounded"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* モバイル候補日シート */}
        {showMobileDates && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowMobileDates(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl bg-white lg:bottom-4 lg:left-auto lg:right-4 lg:w-[520px] lg:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ハンドル（モバイルのみ） */}
              <div className="flex shrink-0 justify-center py-1 lg:hidden">
                <div className="h-1 w-10 rounded-full bg-gray-300" />
              </div>
              
              {/* ヘッダー */}
              <div className="flex shrink-0 items-center justify-between border-b px-3 pb-1.5 pt-0 sm:px-4 sm:pb-2">
                <h3 className="font-semibold">日程・進捗</h3>
                <button 
                  onClick={() => setShowMobileDates(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              
              {/* コンテンツ（min-h-0 で子の flex / sticky が効く） */}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 sm:space-y-4 sm:p-4">
                {isOrganizer && !canMutateScheduleBeforeStoreReply && (group.status === 'gathering' || group.status === 'date_adjusting') && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-snug text-amber-900">
                    店舗の返答待ちのため、候補日の追加・希望店舗の変更・予約リクエストの作成はできません。
                  </div>
                )}
                {/* 進捗ステップ */}
                <div className="rounded-lg bg-gray-50 p-2 sm:p-3">
                  <h4 className="mb-1 text-xs font-medium sm:text-sm">進捗状況</h4>
                  <div className="grid grid-cols-5 gap-0.5 sm:gap-1">
                    <div className={`rounded p-1 text-center sm:p-1.5 ${joinedMembers.length >= 1 || group.status !== 'gathering' ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${joinedMembers.length >= 1 || group.status !== 'gathering' ? 'text-green-700' : 'text-gray-500'}`}>
                        {joinedMembers.length >= 1 || group.status !== 'gathering' ? '✓' : '1'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">招待</div>
                    </div>
                    <div className={`rounded p-1 text-center sm:p-1.5 ${(group.candidate_dates?.length || 0) > 0 ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${(group.candidate_dates?.length || 0) > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                        {(group.candidate_dates?.length || 0) > 0 ? '✓' : '2'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">候補日</div>
                    </div>
                    <div className={`rounded p-1 text-center sm:p-1.5 ${allMembersResponded || group.status !== 'gathering' ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${allMembersResponded || group.status !== 'gathering' ? 'text-green-700' : 'text-gray-500'}`}>
                        {allMembersResponded || group.status !== 'gathering' ? '✓' : '3'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">回答</div>
                    </div>
                    <div className={`rounded p-1 text-center sm:p-1.5 ${group.status !== 'gathering' ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${group.status !== 'gathering' ? 'text-green-700' : 'text-gray-500'}`}>
                        {group.status !== 'gathering' ? '✓' : '4'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">申込</div>
                    </div>
                    <div className={`rounded p-1 text-center sm:p-1.5 ${isScheduleConfirmedUi ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${isScheduleConfirmedUi ? 'text-green-700' : 'text-gray-500'}`}>
                        {isScheduleConfirmedUi ? '✓' : '5'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">確定</div>
                    </div>
                  </div>
                </div>

                {/* 希望店舗 */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <h4 className="text-xs font-medium sm:text-sm">希望店舗（{preferredStoreNames.length}件）</h4>
                    {isOrganizer && canMutateScheduleBeforeStoreReply && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={openStoreEditSheet}
                      >
                        <Settings className="mr-0.5 h-3 w-3" />
                        編集
                      </Button>
                    )}
                  </div>
                  {preferredStoreNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {preferredStoreNames.map(store => (
                        <span
                          key={store.id}
                          className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 sm:text-xs"
                        >
                          {store.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground sm:text-sm">店舗が指定されていません</p>
                  )}
                </div>

                {/* 候補日追加 */}
                {isOrganizer && canMutateScheduleBeforeStoreReply && (
                  <div className="mb-1">
                    <AddCandidateDates
                      groupId={group.id}
                      organizationId={group.organization_id || ''}
                      scenarioId={group.scenario_master_id || ''}
                      storeIds={group.preferred_store_ids || []}
                      existingDates={group.candidate_dates || []}
                      onDatesAdded={() => {
                        refetch()
                        setShowMobileDates(false)
                      }}
                      organizerMemberId={organizerMember?.id}
                    />
                  </div>
                )}

                {/* 候補日リスト */}
                <div>
                  <h4 className="font-medium text-xs sm:text-sm mb-1.5">候補日程（{group.candidate_dates?.length || 0}件）</h4>
                  <div className="space-y-1.5">
                    {group.candidate_dates && group.candidate_dates.length > 0 ? (
                      group.candidate_dates.map((cd, index) => {
                        const currentResponse = responses[cd.id]
                        const dateResponses = cd.responses || []
                        const okCount = dateResponses.filter(r => r.response === 'ok').length
                        const maybeCount = dateResponses.filter(r => r.response === 'maybe').length
                        const ngCount = dateResponses.filter(r => r.response === 'ng').length
                        const totalMembers = joinedMembers.length
                        const respondedCount = dateResponses.length
                        const isRejected = cd.status === 'rejected'
                        const showResponseRow = existingMemberId && group.status === 'gathering' && !isRejected
                        
                        return (
                          <div 
                            key={cd.id} 
                            className={`px-2 py-1.5 rounded-md ${isRejected ? 'bg-gray-100/90 opacity-70' : 'bg-gray-50'}`}
                          >
                            <div className={`flex items-center gap-2 ${showResponseRow ? 'mb-1.5' : ''}`}>
                              <div className="flex-1 min-w-0 leading-tight">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isRejected ? (
                                    <span className="text-[10px] leading-none bg-red-100 text-red-700 px-1 py-0.5 rounded shrink-0">
                                      却下
                                    </span>
                                  ) : (
                                    <span className="text-[10px] leading-none bg-purple-100 text-purple-700 px-1 py-0.5 rounded shrink-0">
                                      {index + 1}
                                    </span>
                                  )}
                                  <span className={`font-medium text-xs ${isRejected ? 'line-through text-muted-foreground' : ''}`}>
                                    {new Date(cd.date + 'T00:00:00+09:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                                  </span>
                                </div>
                                <div className={`text-[10px] text-muted-foreground mt-0.5 ${isRejected ? 'line-through' : ''}`}>
                                  {cd.time_slot} {cd.start_time} - {cd.end_time}
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
                            {showResponseRow && (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleResponseChange(cd.id, 'ok')}
                                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    currentResponse === 'ok'
                                      ? 'bg-green-500 text-white'
                                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-green-50'
                                  }`}
                                >
                                  ○ OK
                                </button>
                                <button
                                  onClick={() => handleResponseChange(cd.id, 'maybe')}
                                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    currentResponse === 'maybe'
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-amber-50'
                                  }`}
                                >
                                  △ 微妙
                                </button>
                                <button
                                  onClick={() => handleResponseChange(cd.id, 'ng')}
                                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    currentResponse === 'ng'
                                      ? 'bg-red-500 text-white'
                                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-red-50'
                                  }`}
                                >
                                  × NG
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-center text-muted-foreground py-6 text-sm">
                        候補日がまだ追加されていません
                      </div>
                    )}
                  </div>
                </div>

                {/* メンバー */}
                <div>
                  <h4 className="font-medium text-sm mb-2">メンバー（{joinedMembers.length}名）</h4>
                  <div className="flex flex-wrap gap-2">
                    {joinedMembers.map(member => (
                      <div key={member.id} className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-full text-xs">
                        <div className="w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center">
                          <Users className="w-2.5 h-2.5 text-purple-600" />
                        </div>
                        <span>{member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}</span>
                        {member.is_organizer && <span className="text-amber-600">★</span>}
                        {member.id === existingMemberId && <span className="text-purple-600">（自分）</span>}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
              
              {/* アクションボタン */}
              <div className="p-4 border-t shrink-0 space-y-2">
                {/* 回答保存ボタン（日程申込前のみ表示） */}
                {existingMemberId && group.status === 'gathering' && Object.keys(responses).length > 0 && (
                  <Button 
                    onClick={async () => {
                      await handleSubmit({ skipSuccessPage: true })
                      setShowMobileDates(false)
                    }}
                    disabled={actionLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : '回答を保存'}
                  </Button>
                )}
                
                {/* 主催者向け申請ボタン（日程調整中・再調整中の両方） */}
                {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
                  <Button
                    onClick={() => {
                      setShowMobileDates(false)
                      handleOpenBookingDialog()
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    予約リクエストを作成
                  </Button>
                )}
                
                {/* チャットに戻るボタン */}
                <Button
                  variant="outline"
                  onClick={() => setShowMobileDates(false)}
                  className="w-full"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  チャットに戻る
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* メンバー招待シート */}
        {showInviteSheet && isOrganizer && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowInviteSheet(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ハンドル（モバイルのみ） */}
              <div className="flex justify-center py-2 shrink-0 lg:hidden">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
                <h3 className="font-semibold">メンバー招待・管理</h3>
                <button 
                  onClick={() => setShowInviteSheet(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              
              {/* コンテンツ */}
              <div className="overflow-y-auto flex-1 p-4 space-y-4">
                {/* 招待URL */}
                <div>
                  <h4 className="font-medium text-sm mb-2">招待リンク</h4>
                  <div className="flex gap-2">
                    <Input
                      value={getInviteUrl()}
                      readOnly
                      className="text-xs"
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full gap-1.5 text-[#06C755] border-[#06C755] hover:bg-[#06C755]/10"
                    onClick={handleShareLine}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                    </svg>
                    LINEで共有
                  </Button>
                </div>

                {/* メンバー一覧 */}
                <div>
                  <h4 className="font-medium text-sm mb-2">参加メンバー（{joinedMembers.length}名）</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {joinedMembers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-purple-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}
                            </p>
                            {member.is_organizer && (
                              <span className="text-xs text-amber-600">主催者</span>
                            )}
                          </div>
                        </div>
                        {!member.is_organizer && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* フッター */}
              <div className="p-4 border-t shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setShowInviteSheet(false)}
                  className="w-full"
                >
                  閉じる
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* グループ設定シート */}
        {showSettingsSheet && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowSettingsSheet(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ハンドル（モバイルのみ） */}
              <div className="flex justify-center py-2 shrink-0 lg:hidden">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
                <h3 className="font-semibold">グループ設定</h3>
                <button 
                  onClick={() => setShowSettingsSheet(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              
              {/* コンテンツ */}
              <div className="overflow-y-auto flex-1 p-4 space-y-4">
                {/* グループ情報 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    {scenario?.key_visual_url && (
                      <img
                        src={scenario.key_visual_url}
                        alt={scenario.title || ''}
                        className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                      />
                    )}
                    <div>
                      <h4 
                        className="font-medium cursor-pointer hover:text-primary transition-colors"
                        onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                      >
                        {scenario?.title || 'グループ'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {memberCount}名参加 • 
                        {isScheduleConfirmedUi ? ' 確定' : group.status === 'booking_requested' ? ' 確定待ち' : ' 日程調整中'}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* 主催者用: 削除オプション（gatheringまたはcancelledステータスのみ） */}
                {isOrganizer && ((group.status as string) === 'gathering' || (group.status as string) === 'cancelled') && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-red-600">危険な操作</h4>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      onClick={() => {
                        if (confirm('このグループを削除しますか？\n\nこの操作は取り消せません。グループのすべてのデータ（メンバー、候補日、メッセージ）が削除されます。')) {
                          handleDeleteGroup()
                        }
                      }}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span>グループを削除する</span>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {(group.status as string) === 'cancelled' 
                        ? 'キャンセルされたグループを削除できます。'
                        : '日程リクエストを送信する前のグループのみ削除できます。'}
                    </p>
                  </div>
                )}
                
                {/* 主催者用: 削除不可の場合の説明 */}
                {isOrganizer && (group.status as string) !== 'gathering' && (group.status as string) !== 'cancelled' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-800">
                      日程リクエスト送信済みのグループは削除できません。
                      キャンセルをご希望の場合は店舗にお問い合わせください。
                    </p>
                  </div>
                )}

                {/* 非主催者用: 退出オプション */}
                {!isOrganizer && (existingMemberId || (user && group?.members?.some(m => m.user_id === user.id))) && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-red-600">グループから退出</h4>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      onClick={async () => {
                        if (!confirm('本当にこのグループから退出しますか？')) return
                        try {
                          if (existingMemberId) {
                            const { error: deleteError } = await supabase.rpc('delete_guest_member', {
                              p_member_id: existingMemberId,
                            })
                            if (deleteError) throw deleteError
                            toast.success('グループから退出しました')
                            setExistingMemberId(null)
                            clearGuestSession()
                            setShowSettingsSheet(false)
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
                    >
                      <LogOut className="h-4 w-4" />
                      <span>このグループから退出する</span>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      退出すると、このグループの情報にアクセスできなくなります。
                    </p>
                  </div>
                )}
                
                {/* 店舗への問い合わせ */}
                <div className="border rounded-lg">
                  <button
                    type="button"
                    onClick={() => setShowContactForm(!showContactForm)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">店舗への問い合わせ</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showContactForm ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showContactForm && (
                    <div className="p-3 pt-0 space-y-3 border-t">
                      <div className="space-y-2 pt-3">
                        <Label htmlFor="contact-email" className="text-sm text-muted-foreground">
                          返信先メールアドレス
                        </Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={organizerMember?.guest_email || user?.email || ''}
                          readOnly
                          className="bg-gray-50"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="contact-message" className="text-sm text-muted-foreground">
                          問い合わせ内容（コピーしてフォームに貼り付けてください）
                        </Label>
                        <Textarea
                          id="contact-message"
                          value={contactMessage}
                          onChange={(e) => setContactMessage(e.target.value)}
                          rows={8}
                          placeholder="お問い合わせ内容を入力してください"
                          className="resize-none"
                        />
                      </div>
                      
                      <Button
                        className="w-full gap-2"
                        disabled={isSubmittingContact || contactMessage.length < 10}
                        onClick={async () => {
                          if (contactMessage.length < 10) {
                            toast.error('問い合わせ内容を10文字以上で入力してください')
                            return
                          }
                          
                          setIsSubmittingContact(true)
                          try {
                            const { data: org } = await supabase
                              .from('organizations')
                              .select('id, name, contact_email')
                              .eq('id', group.organization_id)
                              .single()
                            
                            if (!org?.contact_email) {
                              toast.error('組織の問い合わせ先が設定されていません')
                              return
                            }
                            
                            const replyEmail = organizerMember?.guest_email || user?.email || ''
                            const replyName = organizerMember?.guest_name || user?.name || '貸切予約者'
                            
                            if (!replyEmail) {
                              toast.error('返信先メールアドレスが設定されていません')
                              return
                            }
                            
                            logger.info('問い合わせ送信開始:', { organizationId: org.id, replyEmail, replyName })
                            
                            const { data, error } = await supabase.functions.invoke('send-contact-inquiry', {
                              body: {
                                organizationId: org.id,
                                organizationName: org.name,
                                name: replyName,
                                email: replyEmail,
                                type: 'private',
                                subject: `【貸切予約のお問い合わせ】${group.invite_code}`,
                                message: contactMessage,
                              }
                            })
                            
                            logger.info('問い合わせ送信結果:', { data, error })
                            
                            if (error) {
                              throw new Error(error.message || '送信に失敗しました')
                            }
                            
                            if (data && !data.success) {
                              throw new Error(data.error || '送信に失敗しました')
                            }
                            
                            toast.success('問い合わせを送信しました')
                            setShowContactForm(false)
                            setContactMessage('')
                          } catch (err) {
                            logger.error('問い合わせ送信エラー:', err)
                            
                            // Edge Functionが利用できない場合はmailtoにフォールバック
                            const replyEmail = organizerMember?.guest_email || user?.email || ''
                            const { data: org } = await supabase
                              .from('organizations')
                              .select('contact_email')
                              .eq('id', group.organization_id)
                              .single()
                            
                            const toEmail = org?.contact_email || 'info@queens-waltz.com'
                            const subject = encodeURIComponent(`【貸切予約のお問い合わせ】${group.invite_code}`)
                            const body = encodeURIComponent(`${contactMessage}\n\n---\n返信先: ${replyEmail}`)
                            
                            window.location.href = `mailto:${toEmail}?subject=${subject}&body=${body}`
                            toast.info('メールアプリを開きます')
                            setShowContactForm(false)
                          } finally {
                            setIsSubmittingContact(false)
                          }
                        }}
                      >
                        {isSubmittingContact ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            送信中...
                          </>
                        ) : (
                          <>
                            <MessageCircle className="h-4 w-4" />
                            問い合わせる
                          </>
                        )}
                      </Button>
                      {contactMessage.length > 0 && contactMessage.length < 10 && (
                        <p className="text-xs text-red-500 text-center">
                          あと{10 - contactMessage.length}文字必要です
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* フッター */}
              <div className="p-4 border-t shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setShowSettingsSheet(false)}
                  className="w-full"
                >
                  閉じる
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 希望店舗編集シート */}
        {showStoreEditSheet && isOrganizer && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowStoreEditSheet(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ハンドル（モバイルのみ） */}
              <div className="flex justify-center py-2 shrink-0 lg:hidden">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
                <h3 className="font-semibold">希望店舗を編集</h3>
                <button 
                  onClick={() => setShowStoreEditSheet(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              
              {/* コンテンツ */}
              <div className="overflow-y-auto flex-1 p-4">
                <p className="text-sm text-muted-foreground mb-2">
                  利用を希望する店舗を選択してください。
                </p>
                {isFilteredByScenario && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                    このシナリオで公演可能な店舗のみ表示しています。
                  </p>
                )}
                <div className="space-y-2">
                  {loadingStoresForEdit ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      店舗を読み込み中...
                    </div>
                  ) : allStores.length > 0 ? (
                    allStores.map(store => (
                      <label
                        key={store.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedStoreIds.includes(store.id)
                            ? 'bg-blue-50 border-blue-500'
                            : 'bg-gray-50 border-transparent hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedStoreIds.includes(store.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStoreIds([...selectedStoreIds, store.id])
                            } else {
                              setSelectedStoreIds(selectedStoreIds.filter(id => id !== store.id))
                            }
                          }}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          selectedStoreIds.includes(store.id)
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'border-gray-300'
                        }`}>
                          {selectedStoreIds.includes(store.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className="font-medium text-sm">{store.name}</span>
                      </label>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      表示できる店舗がありません。しばらくしてから再度お試しください。
                    </div>
                  )}
                </div>
              </div>
              
              {/* フッター */}
              <div className="p-4 border-t shrink-0 space-y-2">
                <Button
                  onClick={handleSavePreferredStores}
                  className="w-full"
                  disabled={savingStores || selectedStoreIds.length === 0}
                >
                  {savingStores ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      保存中...
                    </>
                  ) : (
                    `保存する（${selectedStoreIds.length}件選択中）`
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowStoreEditSheet(false)}
                  className="w-full"
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 予約申請シート（日程選択 + 送信） */}
        {showBookingDialog && isOrganizer && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowBookingDialog(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ハンドル（モバイルのみ） */}
              <div className="flex justify-center py-2 shrink-0 lg:hidden">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
                <h3 className="font-semibold">予約リクエスト</h3>
                <button 
                  onClick={() => setShowBookingDialog(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              
              {/* コンテンツ */}
              <div className="overflow-y-auto flex-1 p-4 space-y-4">
                {/* 日程選択 */}
                <div>
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    希望日程を選択（{bookingSelectedDates.size}/{MAX_BOOKING_DATES}件）
                  </h4>
                  <div className="space-y-2">
                    {group.candidate_dates && group.candidate_dates.length > 0 ? (
                      group.candidate_dates
                        .filter(cd => cd.status !== 'rejected')
                        .map((cd) => {
                          const isSelected = bookingSelectedDates.has(cd.id)
                          const dateResponses = cd.responses || []
                          const okCount = dateResponses.filter(r => r.response === 'ok').length
                          const maybeCount = dateResponses.filter(r => r.response === 'maybe').length
                          const ngCount = dateResponses.filter(r => r.response === 'ng').length
                          
                          return (
                            <label
                              key={cd.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-purple-50 border-purple-500'
                                  : 'bg-gray-50 border-transparent hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleBookingDate(cd.id)}
                                className="sr-only"
                              />
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-purple-500 border-purple-500 text-white'
                                  : 'border-gray-300'
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">
                                  {new Date(cd.date + 'T00:00:00+09:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {cd.time_slot} {cd.start_time}-{cd.end_time}
                                </div>
                              </div>
                              <div className="text-xs text-right shrink-0">
                                <span className="text-green-600">○{okCount}</span>
                                <span className="text-amber-600 ml-1">△{maybeCount}</span>
                                <span className="text-red-600 ml-1">×{ngCount}</span>
                              </div>
                            </label>
                          )
                        })
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        候補日程がありません
                      </p>
                    )}
                  </div>
                </div>
                
                {/* 希望店舗 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-blue-600" />
                      希望店舗
                    </h4>
                    {canMutateScheduleBeforeStoreReply ? (
                      <button
                        onClick={() => {
                          setShowBookingDialog(false)
                          openStoreEditSheet()
                        }}
                        className="text-xs text-purple-600 hover:underline"
                      >
                        変更
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">変更不可</span>
                    )}
                  </div>
                  {preferredStoreNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {preferredStoreNames.map(store => (
                        <span
                          key={store.id}
                          className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium"
                        >
                          {store.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-2">
                      店舗が未選択です。「変更」から店舗を選択してください。
                    </p>
                  )}
                </div>
                
                {/* 参加人数 */}
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-600" />
                    参加人数
                  </span>
                  <span>
                    {joinedMembers.length}名 / 招待上限 {inviteMemberCap ?? '-'}名
                  </span>
                </div>
                
                {/* 連絡先電話番号 */}
                <div>
                  <Label htmlFor="booking-phone" className="text-sm mb-2 block">
                    連絡先電話番号 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="booking-phone"
                    type="tel"
                    value={bookingPhone}
                    onChange={(e) => setBookingPhone(e.target.value)}
                    placeholder="090-1234-5678"
                    className="text-sm"
                  />
                </div>
                
                {/* 備考 */}
                <div>
                  <Label htmlFor="booking-notes" className="text-sm mb-2 block">
                    備考・リクエスト（任意）
                  </Label>
                  <Textarea
                    id="booking-notes"
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    placeholder="特別なリクエストがあればご記入ください"
                    className="resize-none text-sm"
                    rows={2}
                  />
                </div>
              </div>
              
              {/* フッター */}
              <div className="p-4 border-t shrink-0 space-y-2">
                <Button
                  onClick={handleSubmitBooking}
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={isSubmittingBooking || bookingSelectedDates.size === 0 || preferredStoreNames.length === 0 || !bookingPhone.trim()}
                >
                  {isSubmittingBooking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      送信中...
                    </>
                  ) : bookingSelectedDates.size === 0 ? (
                    '日程を選択してください'
                  ) : !bookingPhone.trim() ? (
                    '電話番号を入力してください'
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {bookingSelectedDates.size}件の日程で申請する
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowBookingDialog(false)}
                  className="w-full"
                  disabled={isSubmittingBooking}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* PC: 2カラム / モバイル: チャットのみ */}
        <div className="flex-1 flex overflow-hidden">
          {/* チャット */}
          <div className="flex-1 flex flex-col min-w-0">
            <GroupChat
              groupId={group.id}
              currentMemberId={existingMemberId}
              members={group.members || []}
              fullHeight={true}
              onGoToSchedule={() => setShowMobileDates(true)}
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
                        <div className="font-medium">{new Date(cd.date + 'T00:00:00+09:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</div>
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
                onClick={() => isOrganizer && setShowInviteSheet(true)}
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
                                ({new Date(coupon.expires_at).toLocaleDateString('ja-JP')}まで)
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
                  onClick={() => setShowPinAuth(true)}
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
                  onClick={() => setShowPinAuth(false)}
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
                scenarioId={group.scenario_master_id}
                organizationId={group.organization_id}
                performanceDate={group.candidate_dates?.find(cd => cd.order_num === 1)?.date}
                characters={(group as any).scenario_characters || []}
                hideCharacterSelection={method === 'survey'}
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
