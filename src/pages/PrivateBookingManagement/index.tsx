import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { AlertCircle, Calendar, CheckCircle, Clock, Settings, MapPin, Users, Search, X, Mail } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { resendPrivateBookingDiscordNotification, resendPrivateBookingDiscordNotificationForGm } from '@/lib/api/privateBookingNotificationApi'

// 分離されたコンポーネント
import { BookingRequestCard } from './components/BookingRequestCard'
import { CustomerInfo } from './components/CustomerInfo'
import { CandidateDateSelector } from './components/CandidateDateSelector'
import { ActionButtons } from './components/ActionButtons'
import { SurveyResponsesView } from './components/SurveyResponsesView'
import { TemplateEditDialog } from '@/components/settings/TemplateEditDialog'


// 分離されたフック
import type { PrivateBookingRequest } from './hooks/usePrivateBookingData'
import { useBookingRequests } from './hooks/useBookingRequests'
import { useBookingApproval } from './hooks/useBookingApproval'
import { useStoreAndGMManagement } from './hooks/useStoreAndGMManagement'
import { isGmMarkedAvailable } from './utils/gmAvailabilityStatus'
import { getCurrentOrganizationId } from '@/lib/organization'
import { DateRangePopover } from '@/components/ui/date-range-popover'

// 時間帯を正規化する関数（競合キーの一貫性を保つため）
const normalizeTimeSlot = (timeSlot: string): string => {
  if (timeSlot === '午前' || timeSlot === '午後' || timeSlot === '夜') {
    return timeSlot
  }
  if (timeSlot.includes('朝') || timeSlot.includes('午前')) return '午前'
  if (timeSlot.includes('昼') || timeSlot.includes('午後')) return '午後'
  if (timeSlot.includes('夜')) return '夜'
  return timeSlot
}

type TabValue = 'gm_pending' | 'store_pending' | 'rejected' | 'approved' | 'all'
const VALID_TABS: TabValue[] = ['gm_pending', 'store_pending', 'rejected', 'approved', 'all']
// 旧URL（?tab=cancelled）からの互換: 確定後キャンセルタブは承認済みタブに統合された
const LEGACY_TAB_MAP: Record<string, TabValue> = { cancelled: 'approved' }

export function PrivateBookingManagement() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab: TabValue = VALID_TABS.includes(rawTab as TabValue)
    ? (rawTab as TabValue)
    : (rawTab && LEGACY_TAB_MAP[rawTab]) || 'store_pending'
  const setActiveTab = useCallback((tab: TabValue) => {
    setSearchParams({ tab }, { replace: true })
  }, [setSearchParams])
  
  // 選択状態
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [selectedGMId, setSelectedGMId] = useState<string>('')
  const [selectedSubGmId, setSelectedSubGmId] = useState<string>('')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [confirmTemplateDialogOpen, setConfirmTemplateDialogOpen] = useState(false)  // 確定メールのテンプレ編集
  const [rejectTemplateOpen, setRejectTemplateOpen] = useState(false)  // 却下メールのテンプレ編集（次回も使う定型文）
  const [rejectTemplateStoreId, setRejectTemplateStoreId] = useState<string | null>(null)
  const [resolvingRejectStore, setResolvingRejectStore] = useState(false)
  const [selectedCandidateOrder, setSelectedCandidateOrder] = useState<number | null>(null)
  const [displayLimit, setDisplayLimit] = useState<string>('50')  // 表示件数
  const [searchText, setSearchText] = useState('')  // フリーワード検索
  const [scenarioFilter, setScenarioFilter] = useState<string>('all')  // シナリオ絞り込み
  const [storeFilter, setStoreFilter] = useState<string>('all')  // 店舗絞り込み（確定店舗または希望店舗）
  const [dateRangeStart, setDateRangeStart] = useState<string | undefined>(undefined)  // 期間フィルター開始日
  const [dateRangeEnd, setDateRangeEnd] = useState<string | undefined>(undefined)  // 期間フィルター終了日
  const [scenarioAvailableStores, setScenarioAvailableStores] = useState<string[]>([])  // シナリオ対応店舗ID
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('all')  // 地域フィルター
  const [assignedGMIds, setAssignedGMIds] = useState<string[]>([])  // シナリオ担当GM

  // リクエストデータ管理
  const { requests, loading, loadRequests } = useBookingRequests({
    userId: user?.id,
    userRole: user?.role,
  })

  // 承認・却下・削除処理
  const {
    submitting,
    showRejectDialog,
    rejectionReason,
    setRejectionReason,
    rejectBodyLoading,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel,
    handleDelete
  } = useBookingApproval({
    onSuccess: () => {
      setSelectedRequest(null)
      setSelectedGMId('')
      setSelectedSubGmId('')
      setSelectedStoreId('')
      setSelectedCandidateOrder(null)
      // force=true 必須: 引数なしだと loadRequests は何もしない（キャッシュ再取得しない）
      return loadRequests(true)
    }
  })

  // 店舗・GM管理
  const {
    stores,
    availableGMs,
    allGMs,
    conflictInfo,
    loadStores,
    loadConflictInfo,
    loadAllGMs,
    loadAvailableGMs
  } = useStoreAndGMManagement()

  // 全リクエストの候補日に対するグローバル競合マップ（カード表示時点から店舗バッジを出すため）
  const [globalStoreDateConflicts, setGlobalStoreDateConflicts] = useState<Set<string>>(new Set())

  // GM出欠手動記録ハンドラー
  const handleGMResponseSave = async (requestId: string, staffId: string, availableCandidates: number[]) => {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) { showToast.error('組織情報を取得できません'); return }
    const req = requests.find(r => r.id === requestId)
    const gm = allGMs.find(g => g.id === staffId)
    const responseStatus = availableCandidates.length === 0 ? 'all_unavailable' : 'available'
    const { error } = await supabase
      .from('gm_availability_responses')
      .upsert({
        organization_id: orgId,
        reservation_id: requestId,
        staff_id: staffId,
        gm_name: gm?.name || '',
        response_status: responseStatus,
        available_candidates: availableCandidates,
        responded_at: new Date().toISOString(),
        notes: '管理画面から手動入力',
      }, { onConflict: 'reservation_id,staff_id' })
    if (error) {
      logger.error('GM出欠保存エラー:', error)
      showToast.error('保存に失敗しました')
      throw error
    }
    showToast.success(`${gm?.name || 'GM'}の出欠を記録しました`)
    loadRequests(true)
  }

  // Discord通知再送信ハンドラー
  const handleResendDiscordNotification = async (cardRequest: { id: string; scenario_title: string }) => {
    const request = requests.find(r => r.id === cardRequest.id)
    if (!request) return
    
    const confirmed = window.confirm(
      `「${request.scenario_title}」のDiscord通知を再送信しますか？\n\n担当GMに新しいボタン付きメッセージが送信されます。`
    )
    if (!confirmed) return
    
    const result = await resendPrivateBookingDiscordNotification({
      id: request.id,
      scenario_master_id: request.scenario_master_id,
      scenario_title: request.scenario_title,
      customer_name: request.customer_name,
      customer_email: request.customer_email,
      customer_phone: request.customer_phone,
      participant_count: request.participant_count,
      candidate_datetimes: request.candidate_datetimes,
      notes: request.notes,
      created_at: request.created_at,
    })
    
    if (result.success) {
      showToast.success('Discord通知を再送信しました')
    } else {
      showToast.error(result.error || 'Discord通知の再送信に失敗しました')
    }
  }

  // GM個別の通知/再通知ハンドラー（未送信→送信、未回答→再送）
  const handleResendDiscordGm = async (
    cardRequest: { id: string; scenario_title: string },
    staffId: string,
    gmName: string,
  ) => {
    const request = requests.find(r => r.id === cardRequest.id)
    if (!request) return
    const result = await resendPrivateBookingDiscordNotificationForGm(
      {
        id: request.id,
        scenario_master_id: request.scenario_master_id,
        scenario_title: request.scenario_title,
        customer_name: request.customer_name,
        customer_email: request.customer_email,
        customer_phone: request.customer_phone,
        participant_count: request.participant_count,
        candidate_datetimes: request.candidate_datetimes,
        notes: request.notes,
        created_at: request.created_at,
      },
      staffId,
    )
    if (result.success) {
      showToast.success(`${gmName || 'GM'} にDiscord通知を送信しました`)
    } else {
      showToast.error(result.error || 'Discord通知の送信に失敗しました')
    }
  }

  // スクロール位置の保存と復元
  useReportRouteScrollRestoration('private-booking-management', { isLoading: loading })

  // スタッフマスタ＋GM回答のみにいるIDを統合（一覧の取りこぼし防止）
  const mergedGmOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; avatar_color?: string | null }>()
    for (const gm of allGMs) {
      if (gm?.id) byId.set(String(gm.id), gm)
    }
    for (const ag of availableGMs) {
      const sid = ag.gm_id != null ? String(ag.gm_id) : ''
      if (!sid || byId.has(sid)) continue
      byId.set(sid, {
        id: sid,
        name: ag.gm_name || '（スタッフ名不明）',
        avatar_color: ag.avatar_color ?? null,
      })
    }
    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ja', { sensitivity: 'base' })
    )
  }, [allGMs, availableGMs])

  // Radix Select はダイアログ内＋長い候補でビューポートが不安定になりがちなため、ネイティブ select で全件・確実にスクロール表示する
  const gmSelectOptions = useMemo(() => {
    const candidates = selectedRequest?.candidate_datetimes?.candidates
    const selectedCandidate =
      selectedCandidateOrder != null && candidates
        ? candidates.find((c: { order: number }) => c.order === selectedCandidateOrder)
        : undefined

    return mergedGmOptions
      .map((gm) => {
        const availableGM = availableGMs.find((ag) => String(ag.gm_id) === String(gm.id))
        const isAvailable = availableGM ? isGmMarkedAvailable(availableGM) : false
        const isAssigned = assignedGMIds.some((id) => String(id) === String(gm.id))
        let isGMDisabled = false
        if (selectedCandidate?.date && selectedCandidate?.timeSlot) {
          const conflictKey = `${gm.id}-${selectedCandidate.date}-${selectedCandidate.timeSlot}`
          isGMDisabled = conflictInfo.gmDateConflicts.has(conflictKey)
        }
        const tagParts: string[] = []
        if (isAssigned) tagParts.push('担当')
        if (isAvailable) tagParts.push('対応可能')
        if (isGMDisabled) tagParts.push('予約済み')
        let label = gm.name
        if (tagParts.length) label += ` [${tagParts.join('・')}]`
        const score = (isAssigned ? 2 : 0) + (isAvailable ? 1 : 0)
        return { gm, isGMDisabled, label, score }
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.gm.name.localeCompare(b.gm.name, 'ja', { sensitivity: 'base' })
      )
  }, [
    mergedGmOptions,
    availableGMs,
    assignedGMIds,
    selectedCandidateOrder,
    selectedRequest?.candidate_datetimes?.candidates,
    conflictInfo,
  ])

  // 初期データロード（loadRequests は useQuery が自動取得するため実質 no-op の互換呼び出し）
  useEffect(() => {
    loadRequests()
    loadStores()
    loadAllGMs()
  }, [loadRequests, loadStores, loadAllGMs])

  // requests ロード後：全候補日を1クエリで取得して店舗競合マップを構築
  useEffect(() => {
    if (!requests.length) return
    const allDates = [...new Set(
      requests.flatMap(r => (r.candidate_datetimes?.candidates || []).map((c: any) => c.date))
    )].filter(Boolean)
    if (!allDates.length) return

    supabase
      .from('schedule_events_staff_view')
      .select('store_id, date, start_time, end_time')
      .in('date', allDates)
      .eq('is_cancelled', false)
      .then(({ data }) => {
        if (!data) return
        const conflictSet = new Set<string>()
        requests.forEach(req => {
          (req.candidate_datetimes?.candidates || []).forEach((cand: any) => {
            data.forEach(ev => {
              if (ev.store_id && ev.date === cand.date) {
                const start = cand.startTime || ''
                const end   = cand.endTime   || ''
                const evEnd   = (ev.end_time   || '').substring(0, 5)
                const evStart = (ev.start_time || '').substring(0, 5)
                // 60分インターバル考慮
                const addMin = (t: string, m: number) => {
                  const [h, mn] = t.split(':').map(Number)
                  const tot = h * 60 + mn + m
                  return `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`
                }
                if (start < addMin(evEnd, 60) && addMin(end, 60) > evStart) {
                  const ts = cand.timeSlot
                  conflictSet.add(`${ev.store_id}-${cand.date}-${ts}`)
                }
              }
            })
          })
        })
        setGlobalStoreDateConflicts(conflictSet)
      })
  }, [requests])

  // 選択されたリクエストの初期化
  useEffect(() => {
    if (!selectedRequest) return
    loadAllGMs()
    loadAvailableGMs(selectedRequest.id)
    loadConflictInfo(selectedRequest.id)
    // 確定店舗があればそれを選択
    if (selectedRequest.candidate_datetimes?.confirmedStore) {
      setSelectedStoreId(selectedRequest.candidate_datetimes.confirmedStore.storeId)
    }
    // 候補の自動選択はしない（ユーザーが候補行を直接クリックして選択する）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest])

  // シナリオの対応店舗と担当GMを取得
  useEffect(() => {
    const loadScenarioData = async () => {
      const scenarioId = selectedRequest?.scenario_master_id
      if (scenarioId) {
        try {
          // 対応店舗とscenario_master_idを取得（organization_scenarios_with_masterで組織固有のavailable_stores）
          const orgId = await getCurrentOrganizationId()
          const { data: scenarioData, error } = await supabase
            .from('organization_scenarios_with_master')
            .select('available_stores, scenario_master_id')
            .eq('scenario_master_id', scenarioId)
            .eq('organization_id', orgId)
            .limit(1)
            .maybeSingle()
          
          if (error) {
            logger.error('シナリオ対応店舗取得エラー:', error)
            setScenarioAvailableStores([])
          } else {
            setScenarioAvailableStores(scenarioData?.available_stores || [])
          }
          
          const masterId = scenarioData?.scenario_master_id ?? scenarioId
          if (masterId) {
            const { data: assignmentData, error: assignmentError } = await supabase
              .from('staff_scenario_assignments')
              .select('staff_id')
              .eq('scenario_master_id', masterId)
              .or('can_main_gm.eq.true,can_sub_gm.eq.true')
            
            if (assignmentError) {
              logger.error('担当GM取得エラー:', assignmentError)
              setAssignedGMIds([])
            } else {
              setAssignedGMIds((assignmentData || []).map(a => a.staff_id))
            }
          } else {
            setAssignedGMIds([])
          }
        } catch (error) {
          logger.error('シナリオデータ取得エラー:', error)
          setScenarioAvailableStores([])
          setAssignedGMIds([])
        }
      } else {
        setScenarioAvailableStores([])
        setAssignedGMIds([])
      }
    }
    
    loadScenarioData()
  }, [selectedRequest?.scenario_master_id])

  // シナリオ対応店舗でフィルタリングした店舗リスト
  const filteredStores = useMemo(() => {
    const hasScenarioStoreLimit = scenarioAvailableStores.length > 0

    // シナリオのavailable_storesに含まれる店舗はis_temporaryでも表示する
    return stores.filter(s => 
      s.ownership_type !== 'office' && 
      s.status === 'active' &&
      (hasScenarioStoreLimit
        ? scenarioAvailableStores.includes(s.id)
        : !s.is_temporary)
    )
  }, [stores, scenarioAvailableStores])

  // 店舗を地域ごとにグループ化
  const storesByRegion = useMemo(() => {
    const grouped: Record<string, typeof filteredStores> = {}
    
    filteredStores.forEach(store => {
      const region = store.region || '未分類'
      if (!grouped[region]) {
        grouped[region] = []
      }
      grouped[region].push(store)
    })
    
    // 地域の表示順序（東京を先に、その他の地域、未分類は最後）
    const regionOrder = ['東京', '埼玉', '神奈川', '千葉', 'その他', '未分類']
    const sortedRegions = Object.keys(grouped).sort((a, b) => {
      const indexA = regionOrder.indexOf(a)
      const indexB = regionOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    
    return { grouped, sortedRegions }
  }, [filteredStores])

  // 地域フィルターで絞り込んだ店舗リスト
  const regionFilteredStores = useMemo(() => {
    if (selectedRegionFilter === 'all') {
      return filteredStores
    }
    return filteredStores.filter(store => (store.region || '未分類') === selectedRegionFilter)
  }, [filteredStores, selectedRegionFilter])


  // 選択可能な最初の候補日時を自動選択
  const selectFirstAvailableCandidate = () => {
    if (!selectedRequest?.candidate_datetimes?.candidates) return
    
    for (const candidate of selectedRequest.candidate_datetimes.candidates) {
      const normalizedSlot = normalizeTimeSlot(candidate.timeSlot)
      const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${candidate.date}-${normalizedSlot}` : null
      const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${normalizedSlot}` : null
      
      const hasStoreConflict = storeConflictKey && conflictInfo.storeDateConflicts.has(storeConflictKey)
      const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
      
      if (!hasStoreConflict && !hasGMConflict) {
        setSelectedCandidateOrder(candidate.order)
        return
      }
    }
    
    // 全て競合している場合は、最初の候補を選択
    if (selectedRequest.candidate_datetimes.candidates.length > 0) {
      setSelectedCandidateOrder(selectedRequest.candidate_datetimes.candidates[0].order)
    }
  }

  // GMが回答済みかどうかを判定（1人以上が出勤可能な候補を選択している）
  const isGMConfirmed = (r: PrivateBookingRequest): boolean => {
    if (!r.gm_responses || r.gm_responses.length === 0) return false
    // 1人以上のGMが出勤可能な候補を選択している場合はGM確認済み
    return r.gm_responses.some((response) => isGmMarkedAvailable(response))
  }
  
  // ── 検索・絞り込み ─────────────────────────────────────
  // タブ分けの前に適用する＝各タブの件数バッジも絞り込み後の数になり、
  // 「探しているものがどのタブにいるか」が検索だけで分かる
  const normalizedSearch = searchText.trim().toLowerCase()
  const matchesFilters = (req: PrivateBookingRequest): boolean => {
    // フリーワード（予約番号・顧客名・メール・電話・シナリオ名・招待コード）
    if (normalizedSearch) {
      const hit = [
        req.reservation_number,
        req.customer_name,
        req.customer_email,
        req.customer_phone,
        req.scenario_title,
        req.invite_code,
      ].some(v => (v || '').toLowerCase().includes(normalizedSearch))
      if (!hit) return false
    }
    // シナリオ
    if (scenarioFilter !== 'all' && req.scenario_title !== scenarioFilter) return false
    // 店舗（確定店舗または希望店舗のいずれかに一致）
    if (storeFilter !== 'all') {
      const cd = req.candidate_datetimes
      const storeNames = [
        cd?.confirmedStore?.storeName,
        ...(cd?.requestedStores || []).map(s => s.storeName),
      ].filter(Boolean) as string[]
      if (!storeNames.includes(storeFilter)) return false
    }
    // 期間（候補日の最初の日付）
    if (dateRangeStart || dateRangeEnd) {
      const firstDate = req.candidate_datetimes?.candidates?.[0]?.date
      if (!firstDate) return false
      if (dateRangeStart && firstDate < dateRangeStart) return false
      if (dateRangeEnd && firstDate > dateRangeEnd) return false
    }
    return true
  }
  const visibleRequests = requests.filter(matchesFilters)
  const hasActiveFilters =
    !!normalizedSearch || scenarioFilter !== 'all' || storeFilter !== 'all' || !!dateRangeStart || !!dateRangeEnd

  // 絞り込みプルダウンの選択肢（全データから生成、絞り込み状態に左右されない）
  const scenarioOptions = useMemo(
    () => Array.from(new Set(requests.map(r => r.scenario_title).filter(Boolean))).sort(),
    [requests]
  )
  const storeOptions = useMemo(() => {
    const names = new Set<string>()
    requests.forEach(r => {
      const cd = r.candidate_datetimes
      if (cd?.confirmedStore?.storeName) names.add(cd.confirmedStore.storeName)
      cd?.requestedStores?.forEach(s => { if (s.storeName) names.add(s.storeName) })
    })
    return Array.from(names).sort()
  }, [requests])

  // タブ分け
  // GM確認中: pending/pending_gm かつ GM回答がまだない
  const gmPendingRequests = visibleRequests.filter(r =>
    (r.status === 'pending' || r.status === 'pending_gm') && !isGMConfirmed(r)
  )
  // 店舗承認待ち: gm_confirmed/pending_store、または pending/pending_gm でGM回答済み
  const storePendingRequests = visibleRequests.filter(r =>
    r.status === 'gm_confirmed' || r.status === 'pending_store' ||
    ((r.status === 'pending' || r.status === 'pending_gm') && isGMConfirmed(r))
  )
  // 承認済み・却下済みタブは「動きがあった順」（承認・キャンセルなど直近に処理した
  // ものが上）に並べる。申込日順だと、古い申込を今処理したときにリストの奥へ
  // 消えてしまう感覚になるため（オーナー指示 2026-06-13）。
  // 作業キュー系タブ（GM確認中・店舗承認待ち）は従来どおり申込順。
  const activityTime = (r: PrivateBookingRequest): number =>
    Math.max(
      r.cancelled_at ? new Date(r.cancelled_at).getTime() : 0,
      r.approved_at ? new Date(r.approved_at).getTime() : 0,
      r.created_at ? new Date(r.created_at).getTime() : 0
    )
  const byActivityDesc = (a: PrivateBookingRequest, b: PrivateBookingRequest) =>
    activityTime(b) - activityTime(a)

  // 却下済み: cancelled かつ承認実績なし（承認前に断ったもの）
  const rejectedRequests = visibleRequests
    .filter(r => r.status === 'cancelled' && !r.approver_name)
    .sort(byActivityDesc)
  // 承認済み: 一度でも承認したもの（確定中＋確定後キャンセルの両方）。
  // タブは「却下したか／承認したか」の意思決定で分ける（オーナー指示 2026-06-13）。
  // 確定中かキャンセル済みかはカードのステータスバッジで見分ける
  const approvedRequests = visibleRequests
    .filter(r => r.status === 'confirmed' || (r.status === 'cancelled' && !!r.approver_name))
    .sort(byActivityDesc)

  // 表示件数でフィルタリング（作業キュー系は created_at 降順、承認済み/却下済みは動きがあった順でソート済み）
  const applyLimit = (reqs: PrivateBookingRequest[]) => {
    if (displayLimit === 'all') return reqs
    const limit = parseInt(displayLimit, 10)
    return reqs.slice(0, limit)
  }
  
  // 期間フィルターのハンドラー
  const handleDateRangeChange = (start?: string, end?: string) => {
    setDateRangeStart(start)
    setDateRangeEnd(end)
  }
  
  const baseRequests = activeTab === 'gm_pending'
    ? gmPendingRequests
    : activeTab === 'store_pending'
      ? storePendingRequests
      : activeTab === 'rejected'
        ? rejectedRequests
        : activeTab === 'approved'
          ? approvedRequests
          : visibleRequests
  const filteredRequests = applyLimit(baseRequests)

  if (loading) {
    return (
      <AppLayout
        currentPage="private-booking"
        maxWidth="max-w-[1440px]"
        containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
        stickyLayout={true}
      >
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">読み込み中...</p>
        </div>
      </AppLayout>
    )
  }

  // 却下ダイアログから「次回も使う却下メールのテンプレ」を編集する。
  // 却下メール送信側（useBookingApproval）と同じく reservation.store_id の店舗設定を対象にする。
  const openRejectTemplateEditor = async () => {
    const reqId = selectedRequest?.id
    if (!reqId) return
    setResolvingRejectStore(true)
    try {
      const { data } = await supabase
        .from('reservations')
        .select('store_id')
        .eq('id', reqId)
        .maybeSingle()
      if (!data?.store_id) {
        showToast.error('この貸切リクエストには店舗が紐づいていないため、テンプレートを開けません')
        return
      }
      setRejectTemplateStoreId(data.store_id)
      setRejectTemplateOpen(true)
    } catch (e) {
      logger.error('却下テンプレ店舗の取得エラー:', e)
      showToast.error('テンプレートを開けませんでした')
    } finally {
      setResolvingRejectStore(false)
    }
  }

  return (
    <AppLayout
      currentPage="private-booking"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-4">
        <PageHeader
          title={<><Calendar className="h-5 w-5 text-primary" />貸切予約管理</>}
          description="貸切予約リクエストの承認・却下・店舗調整を行います"
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          <div className="flex flex-col gap-3 mb-4">
            <TabsList className="w-full sm:w-auto flex-wrap self-start">
              <TabsTrigger value="gm_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">GM確認中 ({gmPendingRequests.length})</TabsTrigger>
              <TabsTrigger value="store_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">店舗承認待ち ({storePendingRequests.length})</TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1 sm:flex-initial text-xs sm:text-sm">却下済み ({rejectedRequests.length})</TabsTrigger>
              <TabsTrigger value="approved" className="flex-1 sm:flex-initial text-xs sm:text-sm">承認済み ({approvedRequests.length})</TabsTrigger>
              <TabsTrigger value="all" className="flex-1 sm:flex-initial text-xs sm:text-sm">全て ({visibleRequests.length})</TabsTrigger>
            </TabsList>

            {/* 検索・絞り込みツールバー（全タブ横断で効く。件数バッジにも反映） */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[280px] max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="予約番号・名前・メール・シナリオで検索"
                  className="pl-7 h-8 text-xs"
                />
              </div>
              <Select value={scenarioFilter} onValueChange={setScenarioFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="シナリオ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">シナリオ: 全て</SelectItem>
                  {scenarioOptions.map(title => (
                    <SelectItem key={title} value={title}>{title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="店舗" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">店舗: 全て</SelectItem>
                  {storeOptions.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePopover
                startDate={dateRangeStart}
                endDate={dateRangeEnd}
                onDateChange={handleDateRangeChange}
                label={dateRangeStart || dateRangeEnd
                  ? `${dateRangeStart || ''}〜${dateRangeEnd || ''}`
                  : '期間指定'}
                buttonClassName="!w-auto min-w-[110px] !h-8 text-xs input-bg rounded"
              />
              <Select value={displayLimit} onValueChange={setDisplayLimit}>
                <SelectTrigger className="w-[110px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">最新20件</SelectItem>
                  <SelectItem value="50">最新50件</SelectItem>
                  <SelectItem value="100">最新100件</SelectItem>
                  <SelectItem value="all">全件表示</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => {
                    setSearchText('')
                    setScenarioFilter('all')
                    setStoreFilter('all')
                    setDateRangeStart(undefined)
                    setDateRangeEnd(undefined)
                  }}
                >
                  <X className="h-4 w-4 mr-1" />クリア
                </Button>
              )}
            </div>
          </div>

          {/* 予約リクエストタブ */}
          <div className="mt-0">

            {filteredRequests.length === 0 ? (
              <Card className="shadow-none border">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  該当するリクエストがありません
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredRequests.map(req => (
                  <BookingRequestCard
                    key={req.id}
                    request={req}
                    onResendDiscordNotification={handleResendDiscordNotification}
                    onResendDiscordGm={handleResendDiscordGm}
                    gmList={allGMs}
                    onGMResponseSave={handleGMResponseSave}
                    selectedCandidateOrder={selectedRequest?.id === req.id ? selectedCandidateOrder : null}
                    storesPerCandidate={(() => {
                      // カードのバッジ表示は常に globalStoreDateConflicts を使用（切り替えによるちらつきを防ぐ）
                      const conflictSet = globalStoreDateConflicts
                      const ids = req.candidate_datetimes?.requestedStores?.map((s: any) => s.storeId) || []
                      const baseStores = ids.length > 0
                        ? stores.filter(s => ids.includes(s.id))
                        : stores.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
                      return (req.candidate_datetimes?.candidates || []).reduce((acc: any, cand: any) => {
                        acc[cand.order] = baseStores.filter(s => !conflictSet.has(`${s.id}-${cand.date}-${cand.timeSlot}`))
                        return acc
                      }, {} as Record<number, typeof baseStores>)
                    })()}
                    onSelectCandidate={(clickedReq, order) => {
                      // 同じ候補を再クリック → 選択解除
                      if (selectedRequest?.id === clickedReq.id && selectedCandidateOrder === order) {
                        setSelectedRequest(null)
                        setSelectedGMId('')
                        setSelectedSubGmId('')
                        setSelectedStoreId('')
                        setSelectedCandidateOrder(null)
                        return
                      }
                      // 別のリクエストを選択
                      if (selectedRequest?.id !== clickedReq.id) {
                        setSelectedGMId('')
                        setSelectedSubGmId('')
                        setSelectedStoreId('')
                        setSelectedRequest(clickedReq as any)
                      }
                      setSelectedCandidateOrder(order)
                    }}
                    inlineApprovalContent={selectedRequest?.id === req.id && selectedCandidateOrder ? (
                      <div className="space-y-3">
                        {/* アンケート */}
                        <SurveyResponsesView
                          reservationId={req.id}
                          scenarioId={req.scenario_master_id || ''}
                        />

                        {/* 店舗・GMプルダウン（候補行クリックで開く） */}
                        {(() => {
                          const selectedCand = req.candidate_datetimes?.candidates?.find(c => c.order === selectedCandidateOrder)
                          const candidateStores = (() => {
                            const ids = req.candidate_datetimes?.requestedStores?.map((s: any) => s.storeId) || []
                            const base = ids.length > 0 ? stores.filter(s => ids.includes(s.id)) : stores.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
                            if (!selectedCand) return base
                            return base.filter(s => !conflictInfo.storeDateConflicts.has(`${s.id}-${selectedCand.date}-${selectedCand.timeSlot}`))
                          })()
                          return (
                            <div className="space-y-2">
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-purple-700 font-medium w-16 shrink-0 pt-2">店舗</span>
                                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                                  <SelectTrigger className="flex-1 text-sm h-8">
                                    <SelectValue placeholder="選択してください" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {candidateStores.map(s => {
                                      const ev = selectedCand
                                        ? (conflictInfo.existingEvents || []).find(e =>
                                            e.storeId === s.id && e.date === selectedCand.date &&
                                            (selectedCand.startTime || '') < e.endTime &&
                                            (selectedCand.endTime || '') > e.startTime
                                          )
                                        : undefined
                                      const isRequested = req.candidate_datetimes?.requestedStores?.some((rs: any) => rs.storeId === s.id)
                                      return (
                                        <SelectItem key={s.id} value={s.id} className="whitespace-normal">
                                          <span className="block">
                                            {s.name}
                                            {isRequested && <span className="ml-1 text-purple-600 text-xs">（お客様希望）</span>}
                                            {(s as any).region && <span className="ml-1 text-xs text-muted-foreground">({(s as any).region})</span>}
                                          </span>
                                          {ev && (
                                            <span className="block text-xs text-orange-600 font-medium mt-0.5">
                                              ⚠️ {ev.scenario} ({ev.startTime}〜{ev.endTime})
                                            </span>
                                          )}
                                        </SelectItem>
                                      )
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                              {selectedStoreId && (
                                <div className="flex justify-end -mt-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-purple-700 hover:text-purple-900"
                                    onClick={() => setConfirmTemplateDialogOpen(true)}
                                  >
                                    <Mail className="h-3 w-3 mr-1" />
                                    確定メールのテンプレを編集
                                  </Button>
                                </div>
                              )}
                              {/* メインGM */}
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-purple-700 font-medium w-16 shrink-0 pt-2">
                                  {(req.required_gm_count ?? 1) >= 2 ? 'メインGM' : 'GM'}
                                </span>
                                <Select value={selectedGMId} onValueChange={v => { setSelectedGMId(v); setSelectedSubGmId(p => p === v ? '' : p) }}>
                                  <SelectTrigger className="flex-1 text-sm h-8">
                                    <SelectValue placeholder="選択してください" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {gmSelectOptions.map(({ gm, isGMDisabled, label }) => (
                                      <SelectItem key={gm.id} value={gm.id}
                                        disabled={isGMDisabled || ((req.required_gm_count ?? 1) >= 2 && gm.id === selectedSubGmId)}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {/* サブGM */}
                              {(req.required_gm_count ?? 1) >= 2 && (
                                <div className="flex items-start gap-2">
                                  <span className="text-xs text-purple-700 font-medium w-16 shrink-0 pt-2">サブGM</span>
                                  <Select value={selectedSubGmId} onValueChange={setSelectedSubGmId}>
                                    <SelectTrigger className="flex-1 text-sm h-8">
                                      <SelectValue placeholder="選択してください" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {gmSelectOptions.map(({ gm, isGMDisabled, label }) => (
                                        <SelectItem key={gm.id} value={gm.id}
                                          disabled={isGMDisabled || gm.id === selectedGMId}>
                                          {label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                      </div>
                    ) : undefined}
                    cardActionsContent={selectedRequest?.id === req.id && selectedCandidateOrder ? (
                      <ActionButtons
                        onApprove={async () => {
                          if (req.status === 'confirmed') {
                            const ok = window.confirm('この予約は既に承認済みです。内容を変更しますか？\n\n変更すると、お客様に再度確定メールが送信されます。')
                            if (!ok) return
                          }
                          const needTwo = (req.required_gm_count ?? 1) >= 2
                          const result = await handleApprove(req.id, req, selectedGMId, needTwo ? selectedSubGmId : null, selectedStoreId, selectedCandidateOrder, stores)
                          if (result?.success) {
                            showToast.success('貸切予約を確定しました。確定メールとGM通知を送信します。')
                          } else if (result?.error) {
                            showToast.error(getSafeErrorMessage(result.error, '処理に失敗しました'))
                          }
                        }}
                        onReject={() => handleRejectClick(req.id, req)}
                        disabled={submitting || !selectedGMId || !selectedStoreId || !selectedCandidateOrder || ((req.required_gm_count ?? 1) >= 2 && !selectedSubGmId)}
                        submitting={submitting}
                      />
                    ) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </Tabs>

        {/* 削除：承認ダイアログはカードのインライン展開に移行 */}

        {/* 確定メール（private_confirm_template）のテンプレ編集ダイアログ。承認時に選んだ店舗の設定を編集 */}
        <TemplateEditDialog
          templateKey="private_confirm_template"
          storeId={selectedStoreId}
          open={confirmTemplateDialogOpen}
          onOpenChange={setConfirmTemplateDialogOpen}
        />

        {/* 却下ダイアログ */}
        <Dialog open={showRejectDialog} onOpenChange={(open) => !open && handleRejectCancel()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>貸切リクエストの却下</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">却下メール本文（このまま送信されます）</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-purple-700 hover:text-purple-900"
                    onClick={openRejectTemplateEditor}
                    disabled={resolvingRejectStore || rejectBodyLoading}
                  >
                    <Mail className="h-3 w-3 mr-1" />
                    {resolvingRejectStore ? '読み込み中...' : '却下メールのテンプレを編集'}
                  </Button>
                </div>
                {rejectBodyLoading ? (
                  <div className="border rounded-md py-12 text-center text-sm text-muted-foreground">
                    メール本文を読み込み中...
                  </div>
                ) : (
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={14}
                    placeholder="却下メールの本文"
                    className="text-sm font-mono"
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  お客様に送られる却下メールの全文です。この場で自由に編集できます。次回以降の既定文面（テンプレート）を直すには「却下メールのテンプレを編集」から。
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleRejectCancel}
                disabled={submitting}
              >
                キャンセル
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleRejectConfirm(selectedRequest)}
                disabled={submitting || rejectBodyLoading || !rejectionReason.trim()}
              >
                {submitting ? '処理中...' : '却下する'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 却下メール（private_rejection_template）のテンプレ編集。却下ダイアログの上に重ねて開く */}
        <TemplateEditDialog
          templateKey="private_rejection_template"
          storeId={rejectTemplateStoreId}
          open={rejectTemplateOpen}
          onOpenChange={setRejectTemplateOpen}
        />
      </div>
    </AppLayout>
  )
}
