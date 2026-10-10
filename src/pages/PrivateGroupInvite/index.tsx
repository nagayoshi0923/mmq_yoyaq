import { usePrivateGroupMemberRestore } from '@/hooks/usePrivateGroupMemberRestore'
import { privateGroupMemberAction, getPrivateGroupGuestToken, clearPrivateGroupGuestToken, guestStorage } from '@/lib/privateGroupGuestSession'
import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { GroupChat } from '@/pages/PrivateGroupManage/components/GroupChat'
import { useAuth } from '@/contexts/AuthContext'
import { usePrivateGroup } from '@/hooks/usePrivateGroup'
import { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { customerLookupReadApi } from '@/lib/api/customerHookReadApi'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { logger } from '@/utils/logger'
import type { DateResponse } from '@/types'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { memberInvitationCap } from '@/lib/privateGroupPlayerCap'
import { GroupChatSheets } from './components/GroupChatSheets'
import { GroupInviteView } from './components/GroupInviteView'
import { SurveyScreen } from './components/SurveyScreen'
import { canMutateScheduleBeforeStoreReply as canMutateScheduleRule, privateGroupProgress } from '@/components/patterns/privateGroup/privateGroupScheduleRules'
import { InviteCancelledScreen, InviteJoinSuccessScreen, InviteLoadingScreen, InviteNotFoundScreen } from './components/InviteStatusScreens'
import { getJstParts } from '@/utils/jstDate'
import { getErrorMessage } from '@/lib/errorFields'
import { submitGroupBookingRequest } from './submitBookingRequest'
import { usePreferredStoreEditor } from './usePreferredStoreEditor'
import { authenticateGroupGuestByPin } from './pinAuth'
import { useGroupBookingActions } from './useGroupBookingActions'
import { BookingSummaryBox } from './components/BookingSummaryBox'
import { HandoverScreen } from './components/HandoverScreen'
import { usePrivateGroupMessages } from '@/hooks/usePrivateGroupMessages'
import { usePrivateGroupChatState } from '@/hooks/usePrivateGroupChatState'
import { GroupMemberScreen } from './groupPage/GroupMemberScreen'
import { parseGroupTab, type GroupTab } from './groupPage/groupPageModel'
import { markPromptPending } from '@/lib/webPushSupport'

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
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null)
  const { group, loading: groupLoading, error: groupError, refetch, linkedReservationStatus, linkedReservation, handover } = usePrivateGroupByInviteCode(code || null, existingMemberId)
  const { joinGroup, submitDateResponses, leaveGroup, loading: actionLoading } = usePrivateGroup()
  // group が宣言された後で呼ぶ（organization_id を参照するため）
  const { isCustomHoliday } = useCustomHolidays({ organizationId: group?.organization_id })

  /** 店舗承認後はチャットに「日程確定」が出ても、グループ行の status が未同期のことがあるため予約 status も見る */
  const isScheduleConfirmedUi = useMemo(
    () => Boolean(group && (group.status === 'confirmed' || linkedReservationStatus === 'confirmed')),
    [group, linkedReservationStatus]
  )

  const canMutateScheduleBeforeStoreReply = useMemo(() => canMutateScheduleRule(group, linkedReservationStatus), [group, linkedReservationStatus])


  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [responses, setResponses] = useState<Record<string, ResponseValue>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const { data: effectiveSurvey } = useQuery({
    queryKey: ['group-survey-settings', group?.id, existingMemberId],
    enabled: Boolean(group?.id && existingMemberId),
    queryFn: async () => {
      const { data, error } = await privateGroupMemberAction(group!.id, existingMemberId!, 'survey_read')
      if (error) throw error
      return data as { survey_enabled?: boolean; survey_url?: string }
    },
  })



  // クーポン関連
  const existingMember = group?.members?.find(member => member.status === 'joined' && (member.id === existingMemberId || member.user_id === user?.id))
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
  const { data: coupons = [], isLoading: couponLoading } = useQuery({
    queryKey: ['private-group-invite', 'coupons', user?.id, group?.organization_id, existingMember?.coupon_id],
    enabled: !!user && !!group?.organization_id,
    queryFn: async (): Promise<Coupon[]> => {
      const { data: customers, error: lookupError } = await customerLookupReadApi.listIdsByUserId(user!.id)
      if (lookupError) throw lookupError
      if (!customers?.length) return []
      const results = await Promise.all(customers.map(customer => privateGroupPageReadApi.listActiveCouponsForGroup(customer.id, new Date().toISOString(), group!.organization_id, existingMember?.coupon_id)))
      const error = results.find(result => result.error)?.error
      if (error) throw error
      const couponData = results.flatMap(result => result.data ?? [])
      return (couponData || []).map((cc: any) => ({ id: cc.id, name: cc.coupon_campaigns?.name || 'クーポン', discount_amount: cc.coupon_campaigns?.discount_amount || 0, expires_at: cc.expires_at, status: cc.status }))
    },
  })

  // PIN認証関連
  const [pinEmail, setPinEmail] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [generatedPin, setGeneratedPin] = useState<string | null>(null)
  const [joinedAsNewMember, setJoinedAsNewMember] = useState(false)

  // URLパラメータでシート・タブ状態を管理（ブラウザバックで閉じる）
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSheet = searchParams.get('sheet')
  // 旧い ?sheet=invite（メンバー招待シート）はメンバータブで受ける
  const tabParam = activeSheet === 'invite' ? 'members' : parseGroupTab(searchParams.get('tab'))

  const showPinAuth = activeSheet === 'pin'
  const showSettingsSheet = activeSheet === 'settings'
  const showStoreEditSheet = activeSheet === 'store-edit'
  const showBookingDialog = activeSheet === 'booking'

  // シートを開く（ブラウザ履歴に追加 → バックで閉じられる）
  const openSheet = (name: string, extra: Record<string, string> = {}) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('sheet', name)
    Object.entries(extra).forEach(([key, value]) => next.set(key, value))
    return next
  })

  // シートを閉じる：ユーザー操作（×・キャンセル）→ navigate(-1) でバック相当
  const closeSheet = () => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.delete('sheet'); next.delete('request')
    return next
  }, { replace: true })

  // シートを閉じる：処理完了後 → 履歴を置き換えてモーダルに戻れないようにする
  const closeSheetReplace = () => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.delete('sheet'); next.delete('request')
    return next
  }, { replace: true })

  // タブ切り替え（履歴は積まず replace）。旧い招待シートの ?sheet=invite はタブに置き換える
  const setActiveTab = (tab: GroupTab | 'survey') => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('tab', tab)
    if (next.get('sheet') === 'invite') next.delete('sheet')
    return next
  }, { replace: true })

  // 主催者向け機能
  const [copied, setCopied] = useState(false)


  // 希望店舗関連
  const { data: preferredStoreNames = [] } = useQuery({
    queryKey: ['private-group-invite', 'preferred-stores', group?.preferred_store_ids],
    enabled: !!(group?.preferred_store_ids?.length),
    queryFn: async () => {
      const { data, error } = await privateGroupPageReadApi.listStoresByIds(group!.preferred_store_ids!)
      if (error) throw error
      return data || []
    },
  })

  // 希望店舗の編集
  const { prepareStoreEdit, allStores, isFilteredByScenario, loadingStoresForEdit, selectedStoreIds, setSelectedStoreIds, savingStores, handleSavePreferredStores, openStoreEditSheet } = usePreferredStoreEditor({ group, canMutateScheduleBeforeStoreReply, openSheet, closeSheetReplace, refetch })

  // 申請ダイアログ（日程選択 + 送信）
  const [bookingSelectedDates, setBookingSelectedDates] = useState<Set<string>>(new Set())
  const [bookingPhone, setBookingPhone] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false)

  // SessionStorageキー
  const getStorageKey = (inviteCode: string) => `guest_session_${inviteCode}`

  // UUID alone is not proof. Validate the saved token before restoring guest controls.
  useEffect(() => {
    if (!code || user || !group?.id) return
    let cancelled = false
    const storageKey = getStorageKey(code)
    const saved = guestStorage.getItem(storageKey)
    if (!saved) return
    void (async () => {
      try {
        const session = JSON.parse(saved)
        if (!session.memberId || !getPrivateGroupGuestToken(group.id)) return
        const { error } = await privateGroupMemberAction(group.id, session.memberId, 'validate')
        if (cancelled) return
        if (error) {
          if (error.code === '42501') {
            guestStorage.removeItem(storageKey)
            clearPrivateGroupGuestToken(group.id)
            setExistingMemberId(null)
          }
          return
        }
        setExistingMemberId(session.memberId)
        setGuestName(session.guestName || '')
        setGuestEmail(session.guestEmail || '')
      } catch {
        if (!cancelled) guestStorage.removeItem(storageKey)
      }
    })()
    return () => { cancelled = true }
  }, [code, user, group?.id])

  useEffect(() => {
    const handleExpired = (event: Event) => {
      if (user || !code || (event as CustomEvent).detail?.groupId !== group?.id) return
      guestStorage.removeItem(getStorageKey(code))
      setExistingMemberId(null)
      toast.error('本人確認の期限が切れました。メールアドレスとPINで入り直してください。')
    }
    window.addEventListener('private-group-auth-expired', handleExpired)
    return () => window.removeEventListener('private-group-auth-expired', handleExpired)
  }, [code, user, group?.id])

  // ゲストセッションを保存
  const saveGuestSession = (memberId: string, name: string, email: string) => {
    if (!code) return
    const storageKey = getStorageKey(code)
    guestStorage.setItem(storageKey, JSON.stringify({
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
    guestStorage.removeItem(storageKey)
    if (group) clearPrivateGroupGuestToken(group.id)
  }

  // 4桁PINを生成
  const generatePin = () => {
    return String(1000 + crypto.getRandomValues(new Uint32Array(1))[0] % 9000)
  }

  // PIN認証を実行
  const handlePinAuth = () => authenticateGroupGuestByPin({ group, pinEmail, pinCode, setPinError, setExistingMemberId, setGuestName, setGuestEmail, saveGuestSession, setResponses, closeSheetReplace })

  usePrivateGroupMemberRestore(group, code, user?.id, existingMemberId, existingMember => {
    setExistingMemberId(existingMember.id)
    setGuestName(existingMember.guest_name || '')
    const existingResponses: Record<string, ResponseValue> = {}
    existingMember.date_responses?.forEach(r => {
      existingResponses[r.candidate_date_id] = r.response
    })
    setResponses(existingResponses)
    setSelectedCouponId(existingMember.coupon_id || null)
  })

  // チャットのメッセージ（未読数の赤丸と GroupChat で共用。二重に読まない）
  const chatMessages = usePrivateGroupMessages(group?.id ?? '', existingMemberId, { enabled: Boolean(group?.id && existingMemberId) })
  // 既読・リアクション（段階 2。未読数と GroupChat で共用）と、⋮ から開く写真・ピン留めの一覧
  const chatState = usePrivateGroupChatState(group?.id ?? '', existingMemberId, { enabled: Boolean(group?.id && existingMemberId) })
  const [chatListSheet, setChatListSheet] = useState<'photos' | 'pins' | null>(null)

  // 料金計算
  const perPersonPrice = useMemo(() => {
    if (!group) return 0
    return (group as any).per_person_price || 0
  }, [group])

  const selectedCoupon = useMemo(() => {
    return coupons.find(c => c.id === selectedCouponId) || null
  }, [coupons, selectedCouponId])

  const discountAmount = selectedCouponId && selectedCouponId === existingMember?.coupon_id ? (existingMember.coupon_discount || 0) : 0
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

  // "11月30日(月)" 形式（候補日サマリー表示用）
  const formatDateJaMd = (dateStr: string) => {
    const p = getJstParts(dateStr)
    return p ? `${Number(p.mo)}月${Number(p.d)}日(${p.weekday})` : ''
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
        setJoinedAsNewMember(true)
        newPin = user ? null : generatePin()
        const member = await joinGroup({
          inviteCode: group.invite_code,
          pin: newPin || undefined,
          groupId: group.id,
          userId: user?.id,
          guestName: user ? undefined : guestName,
          guestEmail: user ? undefined : guestEmail || undefined,
          guestPhone: user ? undefined : guestPhone || undefined,
        })
        memberId = member.id
        // 会員は参加した直後にグループ画面で通知の案内を出す（段階 3）
        if (user) markPromptPending(group.id)
        
        // 新規参加後、existingMemberIdをセットして再度フォームを表示しないようにする
        setExistingMemberId(memberId)
        
        // ゲスト参加の場合、セッションを保存
        if (!user && guestEmail) {
          saveGuestSession(memberId, guestName, guestEmail)
        }
        
        // ゲスト参加の場合、PINを生成して保存・メール送信
        if (!user && guestEmail) {
          setGeneratedPin(newPin)
          
          // PINをメールで送信（ゲスト用専用Edge Function）
          const scenarioName = group.scenario_masters?.title || 'グループ'
          const inviteUrl = `${window.location.origin}/group/invite/${group.invite_code}`
          supabase.functions.invoke('send-guest-pin', {
            body: {
              groupId: group.id,
              memberId: memberId,
              guestToken: getPrivateGroupGuestToken(group.id),
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
        .filter(([candidateId, response]) => response != null && group.candidate_dates?.some(date => date.id === candidateId && date.status !== 'rejected'))
        .map(([candidateDateId, response]) => ({
          candidateDateId,
          response: response as DateResponse,
        }))

      await submitDateResponses(group.id, memberId, responseData)

      // クーポン適用（ログインユーザーで選択済みの場合）
      if (user && selectedCouponId && perPersonPrice > 0) {
        const { data: couponResult, error: couponError } = await privateGroupRpcApi.applyCouponToMember({
          p_member_id: memberId,
          p_coupon_id: selectedCouponId,
        })
        if (couponError) {
          throw couponError
        }
        if ((couponResult as { pending?: boolean } | null)?.pending) toast.info('クーポンを選択しました。割引は日程確定後に利用条件を確認して適用します')
      } else if (user && !selectedCouponId && perPersonPrice > 0) {
        // クーポン未選択の場合、既存のクーポンを解除
        const { error: couponError } = await privateGroupRpcApi.removeCouponFromMember({
          p_member_id: memberId,
        })
        if (couponError) throw couponError
      }

      if (!options?.skipSuccessPage) {
        setSuccess(true)
      }
      refetch()

    } catch (err) {
      setError(getErrorMessage(err) || '送信に失敗しました')
    }
  }

  // 「操作」メニュー・申込内容の箱・メンバー管理・問い合わせ（マイページの貸切カードと共通の部品）
  const { bookingPhase, bookingActions } = useGroupBookingActions({
    group, user, existingMember, linkedReservation, linkedReservationStatus, handover,
    joinedCount: joinedMembers.length, candidateCount: activeCandidateDates.length,
    // 閉じる・取り下げ・キャンセル・抜けるのあとはグループ画面に居場所が無いのでマイページへ
    onDone: () => navigate('/mypage?tab=reservations&sub=private'),
    onMembersChanged: () => refetch(),
  })

  // マイページの「操作」から ?open=dates / ?open=store-edit で来たら、そのシートを開く
  const openParam = searchParams.get('open')
  useEffect(() => {
    if (!openParam || !group?.id || !existingMemberId) return
    const sheet = openParam === 'dates' ? 'dates' : openParam === 'store-edit' && prepareStoreEdit() ? 'store-edit' : null
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('open')
      if (sheet) next.set('sheet', sheet)
      return next
    }, { replace: true })
    // prepareStoreEdit は毎回作り直されるので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, group?.id, existingMemberId])

  if (groupLoading) {
    return <InviteLoadingScreen />
  }

  if (groupError || !group) {
    return <InviteNotFoundScreen onBackToTop={() => navigate('/')} />
  }

  if (group.status === 'cancelled') {
    return <InviteCancelledScreen onBackToTop={() => navigate('/')} />
  }

  if (success) {
    return (
      <InviteJoinSuccessScreen
        generatedPin={generatedPin}
        isNewMember={joinedAsNewMember}
        guestEmail={guestEmail}
        progress={privateGroupProgress(group, linkedReservationStatus)}
        isMember={Boolean(user)}
        onViewGroup={() => {
          setSuccess(false)
          refetch()
        }}
        onBackToTop={() => navigate('/')}
      />
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
  const organizerName = group.organizer_display_name || organizerMember?.guest_name || organizerMember?.users?.nickname || organizerMember?.users?.email?.split('@')[0] || 'メンバー'
  const memberCount = group?.joined_member_count ?? joinedMembers.length

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

  // 日程選択のトグル
  // 貸切申込ダイアログを開く
  // preselect: 回答表の「この日で申し込む」・状態の箱の「○○ で店舗に申し込む」から来たとき、その候補日を選んでおく
  const handleOpenBookingDialog = async (preselect?: string) => {
    if (!isOrganizer || !group || !user) return
    if (!canMutateScheduleBeforeStoreReply) {
      toast.error('店舗の返答待ちのため、候補日の追加や予約リクエストの作成はできません')
      return
    }
    setBookingSelectedDates(new Set(preselect ? [preselect] : []))
    setBookingNotes('')
    
    // 既存の電話番号を取得
    let phone = organizerMember?.guest_phone || ''
    if (!phone) {
      // お客様の customers 行は組織に属さない（organization_id NULL）ので user_id だけで引く
      const { data: customer } = await privateGroupPageReadApi.findOwnCustomerPhone(user.id)
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
  const handleSubmitBooking = () => submitGroupBookingRequest({
    group, user, isOrganizer, canMutateScheduleBeforeStoreReply, bookingSelectedDates, bookingPhone, bookingNotes,
    preferredStoreNames, organizerMember, isCustomHoliday, setIsSubmittingBooking, closeSheetReplace, setBookingNotes,
    setBookingSelectedDates, refetch,
  })

  const bookingSummary = (
    <BookingSummaryBox
      phase={bookingPhase}
      linkedReservation={linkedReservation}
      preferredStoreNames={preferredStoreNames.map(s => s.name)}
      memberCount={memberCount}
      confirmedPerformance={group.confirmed_performance}
      isOrganizer={Boolean(isOrganizer)}
      actions={bookingActions}
    />
  )
  // 配役方法が未選択かつキャラクターが存在する場合
  // has_pre_reading=true のシナリオのみ配役フローを表示（表示目的のキャラクター登録では発火しない）
  const charAssignmentMethod = group.character_assignment_method as string | null
  const scenarioCharacters = ((group.scenario_masters as any)?.characters || []).filter((c: any) => !c.is_npc)
  const scenarioSurveyEnabled = effectiveSurvey?.survey_enabled === true && !effectiveSurvey.survey_url
  const needsCharAssignmentChoice = !!(isScheduleConfirmedUi && group.scenario_master_id && scenarioSurveyEnabled && scenarioCharacters.length > 0 && charAssignmentMethod == null)

  // 主催者の引き継ぎ確認画面（段階 3。?sheet=handover。チャットのお知らせからは &request=依頼 id つき）
  if (activeSheet === 'handover' && group && user) {
    return <HandoverScreen requestId={searchParams.get('request') ?? handover?.id ?? null} user={user} onBack={closeSheet} onFinished={async () => { closeSheetReplace(); await refetch() }} />
  }

  // 公演前アンケートは、チャットの上の枠ではなく専用の画面で開く（2026-10-05、ゲストが回答できない報告への対策）
  if (existingMemberId && tabParam === 'survey' && group) {
    return (
      <SurveyScreen
        groupId={group.id}
        memberId={existingMemberId}
        scenarioTitle={scenario?.title}
        performanceDate={group.confirmed_performance?.date}
        charAssignmentMethod={charAssignmentMethod}
        characters={scenarioCharacters}
        onBack={() => setActiveTab(isScheduleConfirmedUi ? 'overview' : 'dates')}
      />
    )
  }

  // 参加中の人（会員・ゲスト）: グループページ刷新 段階 1（見出し・いまの状態・タブ・チャット）
  if (existingMemberId && group) {
    const chat = (
      <GroupChat
        groupId={group.id}
        currentMemberId={existingMemberId}
        members={group.members || []}
        fullHeight={true}
        messagesSource={chatMessages}
        chatStateSource={chatState}
        onOpenPins={() => setChatListSheet('pins')}
        channelKey={group.invite_code}
        onGoToSchedule={() => setActiveTab('dates')}
        onOpenSurvey={() => setActiveTab('survey')}
        onOpenHandover={requestId => openSheet('handover', { request: requestId })}
        scenarioId={group.scenario_master_id || undefined}
        organizationId={group.organization_id || undefined}
        performanceDate={group.confirmed_performance?.date}
        needsCharAssignmentChoice={needsCharAssignmentChoice}
        onCharAssignmentMethodSelected={async (method) => {
          const { error } = await privateGroupRpcApi.setCharacterMethod({
            p_group_id: group.id, p_method: method,
            p_expected_method: group.character_assignment_method || null,
            p_expected_assignments: group.character_assignments || {},
          })
          if (error) throw error
          await refetch()
        }}
        charAssignmentMethod={charAssignmentMethod}
        characters={scenarioCharacters}
        isOrganizer={group.members?.find(m => m.id === existingMemberId)?.is_organizer || false}
        onCharAssignmentConfirmed={() => refetch()}
        onResetCharAssignmentMethod={async () => {
          const { error } = await privateGroupRpcApi.setCharacterMethod({
            p_group_id: group.id, p_method: null,
            p_expected_method: group.character_assignment_method || null,
            p_expected_assignments: group.character_assignments || {},
          })
          if (error) throw error
          await refetch()
        }}
        scenarioPlayerCount={scenarioMax}
      />
    )
    return (
      <>
        <GroupMemberScreen
          group={group}
          scenario={scenario}
          playerRange={{ min: scenarioMin, max: scenarioMax }}
          isLoggedIn={Boolean(user)}
          userId={user?.id ?? null}
          reservationStatus={linkedReservationStatus ?? null}
          existingMemberId={existingMemberId}
          isOrganizer={Boolean(isOrganizer)}
          organizerName={organizerName}
          memberCount={memberCount}
          inviteMemberCap={inviteMemberCap}
          linkedReservation={linkedReservation}
          handover={handover}
          bookingPhase={bookingPhase}
          canMutateSchedule={canMutateScheduleBeforeStoreReply}
          survey={effectiveSurvey}
          preferredStoreNames={preferredStoreNames.map(s => s.name)}
          copied={copied}
          tabParam={tabParam === 'survey' ? null : tabParam}
          dateEditorOpen={activeSheet === 'dates' && Boolean(isOrganizer) && canMutateScheduleBeforeStoreReply}
          chatMessages={chatMessages}
          chatState={chatState}
          listSheet={chatListSheet}
          setListSheet={setChatListSheet}
          bookingActions={bookingActions}
          bookingSummary={bookingSummary}
          chat={chat}
          navigate={navigate}
          setTab={setActiveTab}
          openSheet={openSheet}
          closeSheet={closeSheet}
          openBooking={candidateId => void handleOpenBookingDialog(candidateId)}
          openStoreEdit={openStoreEditSheet}
          copyInvite={handleCopyUrl}
          shareLine={handleShareLine}
          getInviteUrl={getInviteUrl}
          refetch={refetch}
          submitDateResponses={submitDateResponses}
          formatDateJaMd={formatDateJaMd}
        />

        {/* シート（グループ設定・希望店舗の編集・予約申請） */}
        <GroupChatSheets
          showSettingsSheet={showSettingsSheet}
          showStoreEditSheet={showStoreEditSheet}
          showBookingDialog={showBookingDialog}
          group={group}
          scenario={scenario}
          joinedMembers={joinedMembers}
          memberCount={memberCount}
          inviteMemberCap={inviteMemberCap}
          user={user}
          existingMemberId={existingMemberId}
          isOrganizer={isOrganizer}
          isFilteredByScenario={isFilteredByScenario}
          isScheduleConfirmedUi={isScheduleConfirmedUi}
          canMutateScheduleBeforeStoreReply={canMutateScheduleBeforeStoreReply}
          actionLoading={actionLoading}
          isSubmittingBooking={isSubmittingBooking}
          loadingStoresForEdit={loadingStoresForEdit}
          savingStores={savingStores}
          bookingNotes={bookingNotes}
          bookingPhone={bookingPhone}
          bookingSelectedDates={bookingSelectedDates}
          selectedStoreIds={selectedStoreIds}
          preferredStoreNames={preferredStoreNames}
          allStores={allStores}
          MAX_BOOKING_DATES={MAX_BOOKING_DATES}
          setBookingNotes={setBookingNotes}
          setBookingPhone={setBookingPhone}
          setExistingMemberId={setExistingMemberId}
          setSelectedStoreIds={setSelectedStoreIds}
          navigate={navigate}
          refetch={refetch}
          leaveGroup={leaveGroup}
          formatDateJaMd={formatDateJaMd}
          closeSheet={closeSheet}
          closeSheetReplace={closeSheetReplace}
          openStoreEditSheet={openStoreEditSheet}
          clearGuestSession={clearGuestSession}
          toggleBookingDate={toggleBookingDate}
          handleSavePreferredStores={handleSavePreferredStores}
          handleSubmitBooking={handleSubmitBooking}
          onOpenInquiry={() => { closeSheetReplace(); bookingActions.openInquiry() }}
        />
        {bookingActions.dialogs}
      </>
    )
  }

  return (
    <>
    <GroupInviteView
      group={group}
      scenario={scenario}
      organizerName={organizerName}
      memberCount={memberCount}
      inviteMemberCap={inviteMemberCap}
      isGroupFull={isGroupFull}
      user={user}
      code={code}
      existingMemberId={existingMemberId}
      isScheduleConfirmedUi={isScheduleConfirmedUi}
      actionLoading={actionLoading}
      error={error}
      showPinAuth={showPinAuth}
      guestName={guestName}
      guestEmail={guestEmail}
      pinEmail={pinEmail}
      pinCode={pinCode}
      pinError={pinError}
      couponLoading={couponLoading}
      coupons={coupons}
      selectedCoupon={selectedCoupon}
      selectedCouponId={selectedCouponId}
      perPersonPrice={perPersonPrice}
      discountAmount={discountAmount}
      finalAmount={finalAmount}
      setExistingMemberId={setExistingMemberId}
      setGuestName={setGuestName}
      setGuestEmail={setGuestEmail}
      setPinEmail={setPinEmail}
      setPinCode={setPinCode}
      setSelectedCouponId={setSelectedCouponId}
      navigate={navigate}
      refetch={refetch}
      leaveGroup={leaveGroup}
      openSheet={openSheet}
      closeSheet={closeSheet}
      clearGuestSession={clearGuestSession}
      handlePinAuth={handlePinAuth}
      handleSubmit={handleSubmit}
    />

    {bookingActions.dialogs}
    </>
  )
}
