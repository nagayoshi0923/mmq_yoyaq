import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, Circle, X, HelpCircle, Loader2, Ticket, CreditCard, LogOut, MessageCircle, Check, UserPlus, Copy, Share2, ArrowLeft } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupChat } from '@/pages/PrivateGroupManage/components/GroupChat'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import { UserSearchInvite } from '@/pages/PrivateGroupManage/components/UserSearchInvite'
import { useAuth } from '@/contexts/AuthContext'
import { usePrivateGroup, usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroup'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { DateResponse, PrivateGroupCandidateDate } from '@/types'
import { SurveyResponseForm } from './components/SurveyResponseForm'

interface Coupon {
  id: string
  code: string
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
  const { group, loading: groupLoading, error: groupError, refetch } = usePrivateGroupByInviteCode(code || null)
  const { joinGroup, submitDateResponses, leaveGroup, updateGroupStatus, removeMember, loading: actionLoading } = usePrivateGroup()

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
  
  // メンバー招待シート
  const [showInviteSheet, setShowInviteSheet] = useState(false)

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

      setCouponLoading(true)
      try {
        // 顧客IDを取得
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!customer) {
          setCoupons([])
          return
        }

        // 利用可能なクーポンを取得
        const { data: couponData, error } = await supabase
          .from('coupons')
          .select('id, code, discount_amount, expires_at, status')
          .eq('customer_id', customer.id)
          .eq('status', 'active')
          .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
          .order('discount_amount', { ascending: false })

        if (error) throw error
        setCoupons(couponData || [])
      } catch (err) {
        logger.error('クーポン取得エラー:', err)
        setCoupons([])
      } finally {
        setCouponLoading(false)
      }
    }

    fetchCoupons()
  }, [user])

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

  const allMembersResponded = useMemo(() => {
    if (!group?.candidate_dates?.length || !joinedMembers.length) return false
    return joinedMembers.every(member => 
      group.candidate_dates?.every(cd => 
        cd.responses?.some(r => r.member_id === member.id)
      )
    )
  }, [group?.candidate_dates, joinedMembers])

  const hasViableDate = useMemo(() => {
    if (!group?.candidate_dates?.length || !joinedMembers.length) return false
    return group.candidate_dates.some(cd => 
      joinedMembers.every(member => 
        cd.responses?.some(r => r.member_id === member.id && r.response === 'ok')
      )
    )
  }, [group?.candidate_dates, joinedMembers])

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

  const scenario = group.scenario_masters
  const organizerMember = group.members?.find(m => m.is_organizer)
  const organizerName = organizerMember?.guest_name || 'メンバー'
  const memberCount = joinedMembers.length

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

  // 貸切申込
  const handleProceedToBooking = async () => {
    if (!isOrganizer || !group) return
    
    // 組織のスラッグを取得
    const { data: org } = await supabase
      .from('organizations')
      .select('slug')
      .eq('id', group.organization_id)
      .single()
    
    if (!org?.slug) {
      toast.error('組織情報の取得に失敗しました')
      return
    }
    
    const params = new URLSearchParams()
    params.set('groupId', group.id)
    
    // シナリオID（必須）
    if (group.scenario_id) {
      params.set('scenario', group.scenario_id)
    }
    
    // 最初の候補日をデフォルトで設定
    if (group.candidate_dates && group.candidate_dates.length > 0) {
      const firstDate = group.candidate_dates[0]
      params.set('date', firstDate.date)
      params.set('slot', firstDate.time_slot)
    }
    
    // 店舗（最初の1つ）
    if (group.store_ids && group.store_ids.length > 0) {
      params.set('store', group.store_ids[0])
    }
    
    navigate(`/${org.slug}/private-booking-request?${params.toString()}`)
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

  // 進捗ステップ数の計算
  const completedSteps = [
    joinedMembers.length >= 2,
    (group.candidate_dates?.length || 0) > 0,
    allMembersResponded,
    group.status === 'booking_requested' || group.status === 'confirmed',
    group.status === 'confirmed'
  ].filter(Boolean).length

  // チャットモード時は専用レイアウト
  if (isChatMode && group) {
    return (
      <div className="fixed inset-0 lg:relative lg:h-screen flex flex-col bg-background overflow-hidden z-50 lg:z-auto">
        {/* PC用ヘッダー */}
        <div className="hidden lg:block shrink-0">
          <Header />
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
                  className="w-8 h-8 object-cover rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium truncate">{scenario?.title || 'グループチャット'}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{memberCount}名参加</span>
                  <span>•</span>
                  <span className={group.status === 'confirmed' ? 'text-green-600' : group.status === 'booking_requested' ? 'text-blue-600' : ''}>
                    {group.status === 'confirmed' ? '確定' : group.status === 'booking_requested' ? '確定待ち' : `進捗 ${completedSteps}/5`}
                  </span>
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
              {/* モバイル: 候補日シートを開く / PC: 日程タブへ */}
            <button 
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setShowMobileDates(true)
                } else {
                  setActiveTab('schedule')
                }
              }}
              className="p-1.5 hover:bg-gray-100 rounded relative"
            >
              <Calendar className="w-5 h-5 text-gray-600" />
              {(group.candidate_dates?.length || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-purple-600 text-white text-[10px] rounded-full flex items-center justify-center">
                  {group.candidate_dates?.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* モバイル候補日シート */}
        {showMobileDates && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setShowMobileDates(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ハンドル */}
              <div className="flex justify-center py-2 shrink-0">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
                <h3 className="font-semibold">日程・進捗</h3>
                <button 
                  onClick={() => setShowMobileDates(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* コンテンツ */}
              <div className="overflow-y-auto flex-1 p-4 space-y-4">
                {/* 進捗ステップ */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2">進捗状況</h4>
                  <div className="grid grid-cols-5 gap-1">
                    <div className={`text-center p-1.5 rounded ${joinedMembers.length >= 2 ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${joinedMembers.length >= 2 ? 'text-green-700' : 'text-gray-500'}`}>
                        {joinedMembers.length >= 2 ? '✓' : '1'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">招待</div>
                    </div>
                    <div className={`text-center p-1.5 rounded ${(group.candidate_dates?.length || 0) > 0 ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${(group.candidate_dates?.length || 0) > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                        {(group.candidate_dates?.length || 0) > 0 ? '✓' : '2'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">候補日</div>
                    </div>
                    <div className={`text-center p-1.5 rounded ${allMembersResponded ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${allMembersResponded ? 'text-green-700' : 'text-gray-500'}`}>
                        {allMembersResponded ? '✓' : '3'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">回答</div>
                    </div>
                    <div className={`text-center p-1.5 rounded ${group.status !== 'gathering' ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${group.status !== 'gathering' ? 'text-green-700' : 'text-gray-500'}`}>
                        {group.status !== 'gathering' ? '✓' : '4'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">申込</div>
                    </div>
                    <div className={`text-center p-1.5 rounded ${group.status === 'confirmed' ? 'bg-green-100' : 'bg-gray-200'}`}>
                      <div className={`text-xs font-medium ${group.status === 'confirmed' ? 'text-green-700' : 'text-gray-500'}`}>
                        {group.status === 'confirmed' ? '✓' : '5'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">確定</div>
                    </div>
                  </div>
                </div>

                {/* 候補日リスト */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">候補日程（{group.candidate_dates?.length || 0}件）</h4>
                    {isOrganizer && group.status === 'gathering' && (
                      <AddCandidateDates
                        groupId={group.id}
                        scenarioId={group.scenario_id || ''}
                        storeIds={group.store_ids || []}
                        existingDates={group.candidate_dates || []}
                        onDatesAdded={() => {
                          refetch()
                          setShowMobileDates(false)
                        }}
                        organizerMemberId={organizerMember?.id}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    {group.candidate_dates && group.candidate_dates.length > 0 ? (
                      group.candidate_dates.map((cd, index) => {
                        const currentResponse = responses[cd.id]
                        return (
                          <div key={cd.id} className="p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                    {index + 1}
                                  </span>
                                  <span className="font-medium text-sm">
                                    {new Date(cd.date + 'T00:00:00+09:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {cd.time_slot} {cd.start_time} - {cd.end_time}
                                </div>
                              </div>
                            </div>
                            {/* 回答ボタン */}
                            {existingMemberId && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleResponseChange(cd.id, 'ok')}
                                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    currentResponse === 'ok'
                                      ? 'bg-green-500 text-white'
                                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-green-50'
                                  }`}
                                >
                                  ○ OK
                                </button>
                                <button
                                  onClick={() => handleResponseChange(cd.id, 'maybe')}
                                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    currentResponse === 'maybe'
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-amber-50'
                                  }`}
                                >
                                  △ 微妙
                                </button>
                                <button
                                  onClick={() => handleResponseChange(cd.id, 'ng')}
                                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                      <div className="text-center text-muted-foreground py-8">
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
                        <span>{member.guest_name || member.users?.email?.split('@')[0] || 'メンバー'}</span>
                        {member.is_organizer && <span className="text-amber-600">★</span>}
                        {member.id === existingMemberId && <span className="text-purple-600">（自分）</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 退出ボタン */}
                {existingMemberId && !organizerMember?.id?.includes(existingMemberId) && (
                  <div className="pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!confirm('本当にこのグループから退出しますか？')) return
                        try {
                          const { error: deleteError } = await supabase.rpc('delete_guest_member', {
                            p_member_id: existingMemberId,
                          })
                          if (deleteError) throw deleteError
                          toast.success('グループから退出しました')
                          setShowMobileDates(false)
                          clearGuestSession()
                          navigate('/mypage')
                        } catch (err) {
                          logger.error('Failed to leave group', err)
                          toast.error('退出に失敗しました')
                        }
                      }}
                      className="w-full text-red-600 border-red-300 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      グループから退出
                    </Button>
                  </div>
                )}
              </div>
              
              {/* アクションボタン */}
              <div className="p-4 border-t shrink-0 space-y-2">
                {/* 回答保存ボタン */}
                {existingMemberId && Object.keys(responses).length > 0 && (
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
                
                {/* 主催者向け申込ボタン */}
                {isOrganizer && group.status === 'gathering' && (group.candidate_dates?.length || 0) > 0 && (
                  <Button 
                    onClick={() => {
                      setShowMobileDates(false)
                      handleProceedToBooking()
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    貸切予約を申し込む
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* メンバー招待シート */}
        {showInviteSheet && isOrganizer && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowInviteSheet(false)}>
            <div 
              className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-96 bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
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
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
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
                </div>

                {/* ユーザー検索・招待 */}
                {group.status === 'gathering' && (
                  <UserSearchInvite
                    groupId={group.id}
                    inviteCode={group.invite_code}
                    members={group.members || []}
                    onInvitationSent={refetch}
                  />
                )}

                {/* メンバー一覧 */}
                <div>
                  <h4 className="font-medium text-sm mb-2">参加メンバー（{joinedMembers.length}名）</h4>
                  <div className="space-y-2">
                    {joinedMembers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                            <Users className="w-4 h-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {member.guest_name || member.users?.email?.split('@')[0] || 'メンバー'}
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
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 申込ボタン */}
                {group.status === 'gathering' && (group.candidate_dates?.length || 0) > 0 && (
                  <Button
                    onClick={() => {
                      setShowInviteSheet(false)
                      handleProceedToBooking()
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    貸切予約を申し込む
                  </Button>
                )}

                {/* キャンセルボタン */}
                {group.status === 'gathering' && (
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
                )}
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
            />
          </div>

          {/* PC用サイドバー */}
          <div className="hidden lg:block w-80 border-l bg-gray-50 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* 進捗ステップ */}
              <div className="bg-white rounded-lg p-3 border">
                <h3 className="font-semibold text-sm mb-2">進捗</h3>
                <div className="space-y-1.5">
                  <div className={`flex items-center gap-2 text-xs ${joinedMembers.length >= 2 ? 'text-green-600' : 'text-gray-500'}`}>
                    {joinedMembers.length >= 2 ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    メンバー招待 ({joinedMembers.length}名)
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${(group.candidate_dates?.length || 0) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                    {(group.candidate_dates?.length || 0) > 0 ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    候補日追加 ({group.candidate_dates?.length || 0}件)
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${allMembersResponded ? 'text-green-600' : 'text-gray-500'}`}>
                    {allMembersResponded ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    日程回答
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
                    {group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    予約申込
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${group.status === 'confirmed' ? 'text-green-600' : 'text-gray-500'}`}>
                    {group.status === 'confirmed' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    日程確定
                  </div>
                </div>
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

              {/* メンバー */}
              <div className="bg-white rounded-lg p-3 border">
                <h3 className="font-semibold text-sm mb-2">メンバー ({joinedMembers.length}名)</h3>
                <div className="space-y-1.5">
                  {joinedMembers.slice(0, 5).map(member => (
                    <div key={member.id} className="flex items-center gap-2 text-xs">
                      <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                        <Users className="w-3 h-3 text-purple-600" />
                      </div>
                      <span className="truncate">{member.guest_name || member.users?.email?.split('@')[0] || 'メンバー'}</span>
                    </div>
                  ))}
                  {joinedMembers.length > 5 && (
                    <button 
                      onClick={() => setActiveTab('members')}
                      className="text-xs text-purple-600 hover:underline"
                    >
                      他{joinedMembers.length - 5}名を表示
                    </button>
                  )}
                </div>
              </div>

              {/* アクションボタン */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setActiveTab('schedule')}
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                日程回答・詳細を見る
              </Button>

              {/* 主催者向け機能 */}
              {isOrganizer && (
                <div className="space-y-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={handleCopyUrl}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                    {copied ? 'コピー完了' : '招待リンクをコピー'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setActiveTab('manage')}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    メンバー招待・管理
                  </Button>
                  {group.status === 'gathering' && (group.candidate_dates?.length || 0) > 0 && (
                    <Button
                      size="sm"
                      className="w-full text-xs bg-green-600 hover:bg-green-700"
                      onClick={handleProceedToBooking}
                    >
                      貸切予約を申し込む
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <NavigationBar currentPage="/" />

      <div className="container mx-auto max-w-lg px-4 py-6">
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
                  className="w-20 h-28 object-cover rounded"
                />
              )}
              <div className="flex-1">
                <h2 className="text-base font-medium">{scenario?.title || 'シナリオ'}</h2>
                {group.name && (
                  <p className="text-sm text-muted-foreground mt-1">{group.name}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{memberCount}/{group.target_participant_count || '?'}名</span>
                  </div>
                </div>
                <Badge variant="outline" className="mt-2 bg-purple-100 text-purple-800 border-purple-200 text-xs">
                  貸切グループ
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
        {existingMemberId && group.status !== 'cancelled' && !isChatMode && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="space-y-1 mb-3">
                <h3 className="font-semibold text-sm text-gray-700">貸切予約の進捗</h3>
                {group.status === 'gathering' && (
                  <div className="text-xs text-muted-foreground">
                    申込準備中（{[joinedMembers.length >= 1, (group.candidate_dates?.length || 0) > 0, allMembersResponded].filter(Boolean).length}/3 完了）
                  </div>
                )}
                {group.status === 'booking_requested' && (
                  <div className="text-xs text-blue-600 font-medium">日程確定待ち</div>
                )}
                {group.status === 'confirmed' && (
                  <div className="text-xs text-green-600 font-medium">公演日まであと少し！</div>
                )}
              </div>

              <div className="space-y-2">
                {/* STEP 1: メンバー招待 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status !== 'gathering' || joinedMembers.length >= 2 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status !== 'gathering' || joinedMembers.length >= 2 
                      ? 'bg-green-600 text-white' 
                      : 'bg-amber-500 text-white'
                  }`}>
                    {group.status !== 'gathering' || joinedMembers.length >= 2 ? <Check className="w-3 h-3" /> : '1'}
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
                    : group.status === 'gathering' && hasViableDate
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status === 'booking_requested' || group.status === 'confirmed'
                      ? 'bg-green-600 text-white' 
                      : group.status === 'gathering' && hasViableDate
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
                        : hasViableDate ? '申込可能！' : '調整中'}
                    </span>
                  </div>
                </div>

                {/* STEP 5: 日程確定 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status === 'confirmed'
                    ? 'bg-green-50 border-green-200' 
                    : group.status === 'booking_requested'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status === 'confirmed'
                      ? 'bg-green-600 text-white' 
                      : group.status === 'booking_requested'
                        ? 'bg-blue-600 text-white animate-pulse'
                        : 'bg-gray-400 text-white'
                  }`}>
                    {group.status === 'confirmed' ? <Check className="w-3 h-3" /> : '5'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">日程確定</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {group.status === 'confirmed'
                        ? '確定！' 
                        : group.status === 'booking_requested'
                          ? '連絡待ち'
                          : '申込後'}
                    </span>
                  </div>
                </div>

                {/* STEP 6: 事前アンケート */}
                {hasCharacters && (
                  <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                    group.status === 'confirmed'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      group.status === 'confirmed'
                        ? 'bg-amber-500 text-white'
                        : 'bg-gray-400 text-white'
                    }`}>
                      6
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">事前アンケート</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {group.status === 'confirmed' ? '回答してください' : '確定後'}
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
              <div className="space-y-3">
                <h3 className="text-base font-semibold">参加可能な日時を選んでください</h3>
                {group.candidate_dates?.map((cd, index) => (
                  <Card key={cd.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                              候補 {index + 1}
                            </Badge>
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span>{formatDate(cd.date)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>{cd.time_slot} {cd.start_time} - {cd.end_time}</span>
                          </div>
                        </div>
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
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
                <Button
                  onClick={handleSubmit}
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
              </div>
            </TabsContent>

            {/* チャットタブ */}
            <TabsContent value="chat">
              <GroupChat
                groupId={group.id}
                currentMemberId={existingMemberId}
                members={group.members}
                onGoToSchedule={() => setActiveTab('schedule')}
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
                            {member.guest_name || member.users?.email?.split('@')[0] || 'メンバー'}
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
                  {group.status === 'gathering' && (
                    <AddCandidateDates
                      groupId={group.id}
                      scenarioId={group.scenario_id || ''}
                      storeIds={group.store_ids || []}
                      existingDates={group.candidate_dates || []}
                      onDatesAdded={refetch}
                      organizerMemberId={organizerMember?.id}
                    />
                  )}

                  {/* ユーザー検索・招待 */}
                  {group.status === 'gathering' && (
                    <UserSearchInvite
                      groupId={group.id}
                      inviteCode={group.invite_code}
                      members={group.members || []}
                      onInvitationSent={refetch}
                    />
                  )}

                  {/* 申込ボタン */}
                  {group.status === 'gathering' && (group.candidate_dates?.length || 0) > 0 && (
                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="p-4">
                        <Button
                          onClick={handleProceedToBooking}
                          className="w-full bg-green-600 hover:bg-green-700"
                        >
                          貸切予約を申し込む
                        </Button>
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
                            {coupon.code} - ¥{coupon.discount_amount.toLocaleString()}OFF
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

        {/* 公演前アンケート（日程確定後、参加済みメンバーのみ表示） */}
        {group.status === 'confirmed' && existingMemberId && group.scenario_id && (
          <SurveyResponseForm
            groupId={group.id}
            memberId={existingMemberId}
            scenarioId={group.scenario_id}
            organizationId={group.organization_id}
            performanceDate={group.candidate_dates?.find(cd => 
              // 確定した候補日を探す（通常は reservation 経由で取得するが、ここでは最初の候補を使用）
              cd.order_num === 1
            )?.date}
            characters={(group as any).scenario_characters || []}
          />
        )}

        {/* 送信ボタン（新規参加時のみ表示） */}
        {!existingMemberId && (
          <Button
            onClick={handleSubmit}
            disabled={actionLoading}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {actionLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                送信中...
              </>
            ) : (
              '参加する'
            )}
          </Button>
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

        {/* チャットに戻るフローティングボタン（チャットタブ以外で表示） */}
        {existingMemberId && activeTab !== 'chat' && (
          <button
            onClick={() => setActiveTab('chat')}
            className="fixed bottom-6 right-6 w-14 h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 z-40"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  )
}
