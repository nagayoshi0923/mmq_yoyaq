import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { Mail, ChevronDown, ChevronUp } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  reservationApi,
  RESERVATION_SELECT_FIELDS,
  RESERVATION_WITH_CUSTOMER_SELECT_FIELDS,
} from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { ACTIVE_RESERVATION_STATUSES, ACTIVE_RESERVATION_STATUSES_SET } from '@/lib/constants'
import { showToast } from '@/utils/toast'
import { findMatchingStaff } from '@/utils/staffUtils'
import { getCurrentOrganizationId } from '@/lib/organization'
import { createEventHistory } from '@/lib/api/eventHistoryApi'
import type { Staff as StaffType, Scenario, Store, Reservation, Customer } from '@/types'
import { ScheduleEvent, EventFormData } from '@/types/schedule'
import { EmailPreview } from './EmailPreview'
import { RESERVATION_SOURCE, STAFF_RESERVATION_SOURCES } from '@/lib/constants'

interface ReservationListProps {
  event: ScheduleEvent | null
  currentEventData: EventFormData
  mode: 'add' | 'edit'
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  onParticipantChange?: (eventId: string, newCount: number) => void
  // モーダル内バッジのみ更新（スケジュールカードへは伝播しない）
  onLocalParticipantUpdate?: (count: number) => void
  onGmsChange?: (gms: string[], gmRoles: Record<string, string>) => void
  // 予約データから取得したスタッフ参加者を親に通知（DBの情報を直接反映）
  onStaffParticipantsChange?: (staffParticipants: string[]) => void
  // イベント削除時のコールバック（貸切参加者全員キャンセル時）
  onDeleteEvent?: () => Promise<void>
}

export function ReservationList({
  event,
  currentEventData,
  mode,
  stores,
  scenarios,
  staff,
  onParticipantChange,
  onLocalParticipantUpdate,
  onGmsChange,
  onStaffParticipantsChange,
  onDeleteEvent
}: ReservationListProps) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  // リアルタイム更新トリガー（他スタッフが予約を変更したとき増分）
  const [realtimeRefreshKey, setRealtimeRefreshKey] = useState(0)
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [expandedReservation, setExpandedReservation] = useState<string | null>(null)
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set())
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isEmailConfirmOpen, setIsEmailConfirmOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [shouldSendEmail, setShouldSendEmail] = useState(true) // メール送信するかどうか
  const [isDeleteEventDialogOpen, setIsDeleteEventDialogOpen] = useState(false) // イベント削除確認ダイアログ
  const [isDeletingEvent, setIsDeletingEvent] = useState(false) // イベント削除中フラグ
  const [emailContent, setEmailContent] = useState({
    customerEmail: '',
    customerName: '',
    cancellationReason: '店舗都合によるキャンセル',
    scenarioTitle: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    storeName: '',
    participantCount: 0,
    totalPrice: 0,
    reservationNumber: '',
    cancellationFee: 0,
    paymentMethod: 'onsite' as 'onsite' | 'online' | 'staff' | string,
    cancellationPolicy: '', // 設定から取得したポリシー
    organizationName: '', // 組織名
    emailBody: '' // メール本文全体
  })
  
  // メール本文を生成
  const generateEmailBody = (content: typeof emailContent) => {
    const formatDate = (dateStr: string): string => {
      if (!dateStr) return ''
      try {
        const date = new Date(dateStr)
        const weekdays = ['日', '月', '火', '水', '木', '金', '土']
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
      } catch {
        return dateStr
      }
    }
    const formatTime = (t: string) => t?.slice(0, 5) || ''
    
    // 支払い方法によって文言を変える
    const isOnsitePayment = content.paymentMethod === 'onsite'
    const refundMessage = isOnsitePayment
      ? 'お支払いは不要となりました。'
      : 'お支払いいただいた料金は全額返金させていただきます。'
    
    // キャンセルポリシーがあれば追加
    const policySection = content.cancellationPolicy 
      ? `\n【キャンセルポリシー】\n${content.cancellationPolicy}\n`
      : ''
    
    return `${content.customerName} 様

いつもご利用いただきありがとうございます。

誠に申し訳ございませんが、以下のご予約をキャンセルさせていただくこととなりました。

【予約情報】
予約番号: ${content.reservationNumber}
シナリオ: ${content.scenarioTitle}
日時: ${formatDate(content.eventDate)} ${formatTime(content.startTime)} - ${formatTime(content.endTime)}
会場: ${content.storeName}
参加人数: ${content.participantCount}名

【キャンセル理由】
${content.cancellationReason}

${content.cancellationFee > 0 ? `【キャンセル料】\n¥${content.cancellationFee.toLocaleString()}\n\n` : ''}${refundMessage}${policySection}
この度は大変ご迷惑をおかけし、誠に申し訳ございませんでした。
またのご利用を心よりお待ちしております。

---
${content.organizationName || '店舗'}
このメールは自動送信されています。
ご不明な点がございましたら、お気軽にお問い合わせください。`
  }
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [newParticipant, setNewParticipant] = useState({
    customer_name: '',
    participant_count: 1,
    payment_method: 'onsite' as 'onsite' | 'online' | 'staff',
    notes: ''
  })
  const [customerNames, setCustomerNames] = useState<string[]>([])

  const sumActiveParticipants = (list: Reservation[]) =>
    list.reduce((sum, r) => {
      if (!r?.status || !ACTIVE_RESERVATION_STATUSES_SET.has(r.status)) return sum
      return sum + (r.participant_count || 0)
    }, 0)

  // 予約データを読み込む
  useEffect(() => {
    const loadReservations = async () => {
      if (mode === 'edit' && event?.id) {
        setLoadingReservations(true)
        try {
          const eventOrgId =
            (event as any)?.organization_id ||
            (event as any)?.scenarios?.organization_id ||
            (event as any)?.stores?.organization_id ||
            null

          // 貸切予約の場合
          if (event.is_private_request && event.reservation_id) {
            logger.log('貸切予約を取得:', { reservationId: event.reservation_id, eventId: event.id })
            
            // event.idが仮想ID（UUID形式でない、または`private-`プレフィックス、または複合ID形式）の場合は、reservation_idから直接取得
            const isVirtualId = event.id.startsWith('private-') || 
                               !event.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
                               event.id.split('-').length > 5
            
            if (isVirtualId) {
              // 仮想IDの場合はreservation_idから直接取得
              const { data, error } = await supabase
                .from('reservations')
                .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
                .eq('id', event.reservation_id)
                .in('status', ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'])
              
              if (error) {
                logger.error('貸切予約データの取得に失敗:', error)
                setReservations([])
              } else {
                logger.log('貸切予約データ取得成功:', data)
                setReservations(data || [])
              }
            } else {
              // 実IDの場合（schedule_event_idが紐付いている）、schedule_event_idで取得を試みる
              const reservations = await reservationApi.getByScheduleEvent(event.id, eventOrgId)
              
              // schedule_event_idで取得できなかった場合、reservation_idで直接取得（フォールバック）
              if (reservations.length === 0) {
                logger.log('schedule_event_idで取得できず、reservation_idで取得を試みます')
                const { data, error } = await supabase
                  .from('reservations')
                  .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
                .eq('id', event.reservation_id)
                .in('status', ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'])
                
                if (error) {
                  logger.error('貸切予約データの取得に失敗:', error)
                  setReservations([])
                } else {
                  logger.log('貸切予約データ取得成功（フォールバック）:', data)
                  setReservations(data || [])
                }
              } else {
                logger.log('貸切予約データ取得成功（schedule_event_id経由）:', reservations)
                setReservations(reservations)
              }
            }
          } else {
            // 通常の予約の場合、schedule_event_idで取得
            const data = await reservationApi.getByScheduleEvent(event.id, eventOrgId)
            logger.log('通常予約データ取得:', { eventId: event.id, count: data.length })
            setReservations(data)
            const totalParticipants = sumActiveParticipants(data)
            // DBのcurrent_participantsと実際の予約合計がズレていれば修正
            if (event.id && totalParticipants !== (event.current_participants ?? -1)) {
              recalculateCurrentParticipants(event.id).catch(e =>
                logger.warn('参加者数のDB修正に失敗（制約違反の可能性）:', e)
              )
            }
            // バッジ・スケジュールカード両方を正しい値に同期
            onLocalParticipantUpdate?.(totalParticipants)
            if (onParticipantChange && event.id) {
              onParticipantChange(event.id, totalParticipants)
            }
          }
        } catch (error) {
          logger.error('予約データの取得に失敗:', error)
          setReservations([])
        } finally {
          setLoadingReservations(false)
        }
      } else {
        setReservations([])
      }
    }
    
    loadReservations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, event?.id, event?.is_private_request, event?.reservation_id, realtimeRefreshKey])

  // リアルタイム購読: 他スタッフが同じ公演の予約を変更したとき自動更新
  useEffect(() => {
    if (mode !== 'edit' || !event?.id) return

    const eventId = event.id
    const channelName = `reservation_list_${eventId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          // 貸切予約は reservation_id で紐付くため、schedule_event_id フィルターは貸切非対応
          // → クライアント側で event.id をチェックして絞り込む
        },
        (payload) => {
          const record = (payload.new || payload.old) as { schedule_event_id?: string } | null
          // 現在開いている公演の予約変更のみ処理
          if (record?.schedule_event_id !== eventId) return

          logger.log('📡 ReservationList Realtime: 予約変更検知', payload.eventType)

          // デバウンス: 500ms 以内の連続更新をまとめる
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
          realtimeDebounceRef.current = setTimeout(() => {
            setRealtimeRefreshKey(k => k + 1)
          }, 500)
        }
      )
      .subscribe()

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
      supabase.removeChannel(channel)
      logger.log('🔌 ReservationList Realtime: 購読解除', channelName)
    }
  }, [mode, event?.id])

  // 顧客名を取得（customersテーブル + 過去予約のparticipant_names）
  useEffect(() => {
    const fetchCustomerNames = async () => {
      try {
        const orgId = await getCurrentOrganizationId()
        const names = new Set<string>()

        // 1. customers テーブルから取得
        let customerQuery = supabase
          .from('customers')
          .select('name')
          .not('name', 'is', null)
          .not('name', 'eq', '')
        if (orgId) {
          customerQuery = customerQuery.eq('organization_id', orgId)
        }
        const { data: customers, error: custError } = await customerQuery
        if (custError) {
          logger.error('顧客テーブル取得エラー:', custError)
        } else {
          customers?.forEach(c => {
            if (c.name?.trim()) names.add(c.name.trim())
          })
        }

        // 2. 過去予約の participant_names からも補完
        let resQuery = supabase
          .from('reservations')
          .select('customer_notes, participant_names')
          .not('customer_notes', 'is', null)
          .not('customer_notes', 'eq', '')
        if (orgId) {
          resQuery = resQuery.eq('organization_id', orgId)
        }
        const { data: reservations, error: resError } = await resQuery
        if (!resError && reservations) {
          reservations.forEach(r => {
            if (r.customer_notes) {
              const name = r.customer_notes.replace(/様$/, '').trim()
              if (name) names.add(name)
            }
            if (Array.isArray(r.participant_names)) {
              r.participant_names.forEach((name: string) => {
                if (name?.trim()) names.add(name.trim())
              })
            }
          })
        }

        setCustomerNames(Array.from(names).sort())
      } catch (error) {
        logger.error('顧客名の取得に失敗:', error)
      }
    }

    fetchCustomerNames()
  }, [])

  // 参加者名が変更された時にスタッフ名と一致するかチェック
  useEffect(() => {
    if (newParticipant.customer_name.trim()) {
      const isStaff = staff.some(s => s.name === newParticipant.customer_name.trim())
      if (isStaff && newParticipant.payment_method !== 'staff') {
        setNewParticipant(prev => ({ ...prev, payment_method: 'staff' }))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParticipant.customer_name, staff])

  // 予約データからスタッフ参加者を抽出して親に通知（DBをシングルソースとする）
  useEffect(() => {
    if (onStaffParticipantsChange) {
      const staffParticipants = reservations
        .filter(r => 
          r.payment_method === 'staff' && 
          r.status !== 'cancelled' &&
          r.participant_names?.length
        )
        .flatMap(r => r.participant_names || [])

      // 重複除去（同一スタッフが複数予約に入る/名前配列が重複するケース対策）
      onStaffParticipantsChange(Array.from(new Set(staffParticipants)))
    }
  }, [reservations, onStaffParticipantsChange])

  // 予約ステータスを更新する関数
  const handleUpdateReservationStatus = async (reservationId: string, newStatus: Reservation['status']) => {
    const reservation = reservations.find(r => r.id === reservationId)
    if (!reservation) return

    const oldStatus = reservation.status

    if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
      // 直接メール文面付き確認ダイアログを開く
      openCancelDialog(reservation)
      return
    }

    // オプティミスティックUI: APIレスポンスを待たずに即座にUIを更新
    setReservations(prev =>
      prev.map(r => r.id === reservationId ? { ...r, status: newStatus } : r)
    )

    try {
      await reservationApi.update(reservationId, { status: newStatus })

      if (event?.id) {
        const wasActive = ACTIVE_RESERVATION_STATUSES_SET.has(oldStatus)
        const isActive = ACTIVE_RESERVATION_STATUSES_SET.has(newStatus)

        // アクティブ状態が変わる場合、またはチェックインの場合は再計算
        // （checked_in は pending/confirmed/gm_confirmed と同様にカウントするため）
        if (wasActive !== isActive || newStatus === 'checked_in') {
          try {
            // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
            const newCount = await recalculateCurrentParticipants(event.id)
            if (onParticipantChange) {
              onParticipantChange(event.id, newCount)
            }
          } catch (error) {
            logger.error('公演参加者数の更新に失敗:', error)
          }
        }
      }

      if (newStatus === 'checked_in') {
        showToast.success('チェックインしました')
      }
      logger.log('予約ステータス更新成功:', { id: reservationId, oldStatus, newStatus })
    } catch (error) {
      // ロールバック: APIが失敗したら元のステータスに戻す
      setReservations(prev =>
        prev.map(r => r.id === reservationId ? { ...r, status: oldStatus } : r)
      )
      logger.error('予約ステータス更新エラー:', error)
      showToast.error('ステータスの更新に失敗しました')
    }
  }

  // キャンセル確認ダイアログを開く（メール文面も準備）
  const openCancelDialog = async (reservation: Reservation) => {
    if (!event) return

    try {
      setCancellingReservation(reservation)
      
      // スタッフ参加かどうかを判定
      const isStaffReservation =
        (STAFF_RESERVATION_SOURCES as readonly string[]).includes(reservation.reservation_source ?? '') ||
        reservation.payment_method === 'staff'

      const customerName = reservation.customer_name || 
        (reservation.customers ? 
          (Array.isArray(reservation.customers) ? reservation.customers[0]?.name : reservation.customers?.name) : 
          null) || 
        reservation.customer_notes

      // 顧客・スタッフからメールアドレスを取得
      let customerEmail = reservation.customer_email || 
        (reservation.customers ? 
          (Array.isArray(reservation.customers) ? reservation.customers[0]?.email : reservation.customers?.email) : 
          null)

      // スタッフかどうかを名前から判定し、スタッフのメールアドレスも取得
      let isStaffByName = false
      let staffEmail: string | undefined
      if (customerName) {
        const normalizedName = customerName.replace(/様$/, '').trim()
        const staffMember = staff.find(s => s.name === normalizedName || s.display_name === normalizedName)
        if (staffMember) {
          isStaffByName = true
          staffEmail = staffMember.email
        }
      }

      const isStaff = isStaffReservation || isStaffByName

      // スタッフの場合でもメールアドレスがあればメール送信可能
      if (!customerEmail && staffEmail) {
        customerEmail = staffEmail
      }

      // スタッフかつメールアドレスがない場合のみシンプルな確認ダイアログを表示
      if (isStaff && !customerEmail) {
        setIsCancelDialogOpen(true)
        return
      }

      // 顧客の場合はメール文面付き確認ダイアログを開く
      const eventDate = event.date || currentEventData.date
      const startTime = event.start_time || currentEventData.start_time
      const endTime = event.end_time || currentEventData.end_time
      const scenarioTitle = event.scenario || currentEventData.scenario || reservation.title || ''
      
      // 店舗情報を取得
      const storeId = currentEventData.venue || (event.venue ? stores.find(s => s.name === event.venue)?.id : null)
      const storeName = storeId 
        ? stores.find(s => s.id === storeId)?.name 
        : event.venue || ''

      // 店舗のキャンセル設定と組織名を取得
      let cancellationPolicy = ''
      let organizationName = ''
      const totalPrice = reservation.total_price || reservation.final_price || 0
      
      // 店舗都合のキャンセルなのでキャンセル料は0
      // ※顧客都合のキャンセルの場合のみキャンセル料が発生する
      const cancellationFee = 0
      
      if (storeId) {
        try {
          // キャンセル設定を取得（ポリシー文章のみ使用）
          const { data: settings } = await supabase
            .from('reservation_settings')
            .select('cancellation_policy')
            .eq('store_id', storeId)
            .maybeSingle()
          
          if (settings) {
            cancellationPolicy = settings.cancellation_policy || ''
          }
          
          // 組織名を取得
          const { data: storeData } = await supabase
            .from('stores')
            .select('organization_id, organizations(name)')
            .eq('id', storeId)
            .single()
          
          if (storeData?.organizations) {
            // リレーション結果がオブジェクトか配列かを判定
            const org = storeData.organizations as { name: string } | { name: string }[]
            if (Array.isArray(org)) {
              organizationName = org[0]?.name || ''
            } else {
              organizationName = org.name || ''
            }
          }
        } catch (settingsError) {
          logger.warn('キャンセル設定取得エラー:', settingsError)
        }
      }

      const newEmailContent = {
        customerEmail: customerEmail || '',
        customerName: customerName || '',
        cancellationReason: '店舗都合によるキャンセル',
        scenarioTitle,
        eventDate: eventDate || '',
        startTime: startTime || '',
        endTime: endTime || '',
        storeName: storeName || '',
        participantCount: reservation.participant_count,
        totalPrice,
        reservationNumber: reservation.reservation_number || '',
        cancellationFee,
        paymentMethod: reservation.payment_method || 'onsite',
        cancellationPolicy,
        organizationName,
        emailBody: ''
      }
      // メール本文を生成
      newEmailContent.emailBody = generateEmailBody(newEmailContent)
      setEmailContent(newEmailContent)
      
      // メールアドレスがある場合はデフォルトでメール送信ON
      setShouldSendEmail(!!customerEmail)
      
      setIsEmailConfirmOpen(true)
    } catch (error) {
      logger.error('キャンセル確認ダイアログの準備エラー:', error)
      showToast.error('エラーが発生しました')
    }
  }
  
  // シンプル確認ダイアログからのキャンセル実行（スタッフ用）
  const handleConfirmCancelFromDialog = async () => {
    if (!cancellingReservation) return
    const ok = await handleExecuteCancel(false)
    // 成功したときだけ閉じる（失敗時はダイアログを残してリトライ可能にする）
    if (ok) {
      setIsCancelDialogOpen(false)
    }
  }

  // キャンセル処理を実行
  const handleExecuteCancel = async (sendEmail: boolean): Promise<boolean> => {
    if (!cancellingReservation || !event) return false
    // 二重実行ガード（連打/二重クリック/ダイアログ経由の重複を防ぐ）
    if (isCancelling) return false
    setIsCancelling(true)

    try {
      const reservationId = cancellingReservation.id

      // スタッフ参加の場合はシンプルなキャンセル
      const isStaffReservation =
        (STAFF_RESERVATION_SOURCES as readonly string[]).includes(cancellingReservation.reservation_source ?? '') ||
        cancellingReservation.payment_method === 'staff'
      
      if (isStaffReservation) {
        // スタッフ予約: RPC経由で在庫返却のみ（通知不要）
        await reservationApi.cancelWithLock(
          reservationId,
          cancellingReservation.customer_id ?? null,
          emailContent?.cancellationReason || 'スタッフによるキャンセル'
        )
      } else {
        // 顧客予約: reservationApi.cancel()を使用（在庫返却 + キャンセル待ち通知）
        // ただし、メール送信は既にhandleExecuteCancel内で行うため、ここでは通知のみ
        await reservationApi.cancelWithLock(
          reservationId,
          cancellingReservation.customer_id ?? null,
          emailContent?.cancellationReason || 'スタッフによるキャンセル'
        )
        
        // キャンセル待ち通知を送信
        const cancelOrgId = event.organization_id 
          || (event as any)?.scenarios?.organization_id 
          || await getCurrentOrganizationId()
        
        if (cancellingReservation.schedule_event_id && cancelOrgId) {
          try {
            const { data: org } = await supabase
              .from('organizations')
              .select('slug')
              .eq('id', cancelOrgId)
              .single()
            
            const orgSlug = org?.slug || 'queens-waltz'
            const bookingUrl = `${window.location.origin}/${orgSlug}`
            
            await supabase.functions.invoke('notify-waitlist', {
              body: {
                organizationId: cancelOrgId,
                scheduleEventId: cancellingReservation.schedule_event_id,
                freedSeats: cancellingReservation.participant_count,
                scenarioTitle: event.scenario || event.scenarios?.title || cancellingReservation.title,
                eventDate: event.date,
                startTime: event.start_time,
                endTime: event.end_time,
                storeName: event.venue || (event as any).stores?.name || '',
                bookingUrl
              }
            })
            logger.log('キャンセル待ち通知送信成功')
          } catch (waitlistError) {
            logger.error('キャンセル待ち通知エラー:', waitlistError)
          }
        }
      }
      
      const cancelledAt = new Date().toISOString()

      // UIを更新（キャンセルRPC成功後のみ）
      // UI更新 + 予約数表示を即時反映
      setReservations(prev => {
        const next = prev.map(r =>
          r.id === reservationId
            ? { ...r, status: 'cancelled' as const, cancelled_at: cancelledAt }
            : r
        )
        // schedule_event_id がない（private- 仮想IDなど）場合でも、ダイアログ上の人数表示は更新したい
        if (onParticipantChange && event.id) {
          onParticipantChange(event.id, sumActiveParticipants(next))
        }
        return next
      })
      
      if (expandedReservation === reservationId) {
        setExpandedReservation(null)
      }
      
      setSelectedReservations(prev => {
        const newSelected = new Set(prev)
        newSelected.delete(reservationId)
        return newSelected
      })

      // 参加者数を再計算（DBの single source of truth を更新）
      if (event.id && !event.id.startsWith('private-')) {
        try {
          const newCount = await recalculateCurrentParticipants(event.id)
          if (onParticipantChange) {
            onParticipantChange(event.id, newCount)
          }
        } catch (error) {
          logger.error('参加者数の更新エラー:', error)
        }
      }

      // 履歴を記録
      const storeObj = stores.find(s => s.id === currentEventData.venue || s.name === event.venue)
      if (event.id && storeObj?.id) {
        try {
          const organizationId = await getCurrentOrganizationId()
          if (organizationId) {
            const participantName = cancellingReservation.participant_names?.[0] || 
              cancellingReservation.customer_notes || 
              emailContent.customerName ||
              '不明'
            await createEventHistory(
              event.id,
              organizationId,
              'remove_participant',
              {
                participant_name: participantName,
                participant_count: cancellingReservation.participant_count
              },
              {},
              {
                date: currentEventData.date || event.date,
                storeId: storeObj.id,
                timeSlot: currentEventData.time_slot || null
              },
              {
                notes: `${participantName}（${cancellingReservation.participant_count}名）をキャンセル`
              }
            )
          }
        } catch (error) {
          logger.error('参加者キャンセル履歴の記録に失敗:', error)
        }
      }

      // スタッフ参加の場合、GM欄からも連動して削除
      const isStaff =
        (STAFF_RESERVATION_SOURCES as readonly string[]).includes(cancellingReservation.reservation_source ?? '') ||
        cancellingReservation.payment_method === 'staff'
      
      if (isStaff && onGmsChange && cancellingReservation.participant_names?.length) {
        const staffName = cancellingReservation.participant_names[0]
        const { data: eventData } = await supabase
          .from('schedule_events_staff_view')
          .select('gms, gm_roles')
          .eq('id', event.id)
          .single()
        
        if (eventData) {
          const currentGms = eventData.gms || []
          const currentRoles = eventData.gm_roles || {}
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          const newGms = currentGms.filter((g: string) => g !== staffName && !uuidPattern.test(g))
          const newRoles = { ...currentRoles }
          delete newRoles[staffName]
          Object.keys(newRoles).forEach(key => {
            if (uuidPattern.test(key)) {
              delete newRoles[key]
            }
          })
          
          await supabase
            .from('schedule_events')
            .update({ gms: newGms, gm_roles: newRoles })
            .eq('id', event.id)
          
          onGmsChange(newGms, newRoles)
        }
        showToast.success('スタッフ参加を削除しました')
      } else {
        // メール送信（チェックボックスがONの場合のみ）
        if (sendEmail && emailContent.customerEmail) {
          try {
            const { error: emailError } = await supabase.functions.invoke('send-cancellation-confirmation', {
              body: {
                organizationId: event?.organization_id,
                storeId: event?.venue,
                reservationId,
                customerEmail: emailContent.customerEmail,
                customerName: emailContent.customerName,
                scenarioTitle: emailContent.scenarioTitle,
                eventDate: emailContent.eventDate,
                startTime: emailContent.startTime,
                endTime: emailContent.endTime,
                storeName: emailContent.storeName,
                participantCount: emailContent.participantCount,
                totalPrice: emailContent.totalPrice,
                reservationNumber: emailContent.reservationNumber,
                cancelledBy: 'store',
                cancellationReason: emailContent.cancellationReason,
                cancellationFee: emailContent.cancellationFee,
                customEmailBody: emailContent.emailBody,
                organizationName: emailContent.organizationName
              }
            })

            if (emailError) throw emailError
            showToast.success('予約をキャンセルし、メールを送信しました')
          } catch (emailError) {
            logger.error('キャンセル確認メール送信エラー:', emailError)
            showToast.warning('予約はキャンセルされましたが、メール送信に失敗しました')
          }
        } else {
          showToast.success('予約をキャンセルしました')
        }
      }

      setIsEmailConfirmOpen(false)
      setCancellingReservation(null)
      setEmailContent({
        customerEmail: '',
        customerName: '',
        cancellationReason: '店舗都合によるキャンセル',
        scenarioTitle: '',
        eventDate: '',
        startTime: '',
        endTime: '',
        storeName: '',
        participantCount: 0,
        totalPrice: 0,
        reservationNumber: '',
        cancellationFee: 0,
        paymentMethod: 'onsite',
        cancellationPolicy: '',
        organizationName: '',
        emailBody: ''
      })
      
      // 貸切公演の場合、全員キャンセル後にイベント削除を確認
      if (event?.is_private_request && onDeleteEvent) {
        // 最新の予約リストを取得（UIの状態更新後）
        // setReservations は非同期なので、少し遅延を入れてからチェック
        setTimeout(() => {
          setReservations(currentReservations => {
            const activeReservations = currentReservations.filter(r => 
              r.status !== 'cancelled'
            )
            if (activeReservations.length === 0) {
              setIsDeleteEventDialogOpen(true)
            }
            return currentReservations
          })
        }, 100)
      }
      
      return true
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      showToast.error('予約のキャンセルに失敗しました')
      return false
    } finally {
      setIsCancelling(false)
    }
  }

  // 参加者を追加する関数
  const handleAddParticipant = async () => {
    const participantName = newParticipant.customer_name.trim() || 'デモ参加者'

    if (!event?.id) return

    try {
      const scenarioObj = scenarios.find(s => s.title === currentEventData.scenario)
      const storeObj = stores.find(s => s.id === currentEventData.venue)
      
      // スタッフかどうかを判定
      const matchedStaff = findMatchingStaff(participantName, null, staff)
      const isStaff = matchedStaff !== null
      const paymentMethod = isStaff ? 'staff' : newParticipant.payment_method
      
      const participationFee = scenarioObj?.participation_fee || 0
      const unitPrice = paymentMethod === 'staff' ? 0 : participationFee
      const basePrice = unitPrice * newParticipant.participant_count
      const totalPrice = basePrice
      
      // スタッフ参加の場合は reservation_source を 'staff_participation' に設定
      const reservationSource = isStaff ? 'staff_participation' : 'walk_in'
      
      // 参加者名から顧客を検索して customer_id を設定
      // マイページで予約を表示するために必要
      let customerId: string | null = null
      const organizationId =
        (await getCurrentOrganizationId()) || event?.organization_id || undefined
      
      if (participantName === 'デモ参加者') {
        // デモ参加者の場合はデモ顧客を取得
        try {
          let query = supabase
            .from('customers')
            .select('id')
            .or('name.ilike.%デモ%,email.ilike.%demo%')
          
          if (organizationId) {
            query = query.eq('organization_id', organizationId)
          }
          
          const { data: demoCustomer } = await query.limit(1).single()
          
          if (demoCustomer) {
            customerId = demoCustomer.id
            logger.log(`デモ顧客を設定: ${demoCustomer.id}`)
          }
        } catch (error) {
          logger.error('デモ顧客取得エラー:', error)
        }
      } else {
        // 参加者名で顧客を検索（スタッフ参加・当日飛び込み共通）
        try {
          let query = supabase
            .from('customers')
            .select('id')
            .eq('name', participantName)
          
          if (organizationId) {
            query = query.eq('organization_id', organizationId)
          }
          
          const { data: customer } = await query.limit(1).maybeSingle()
          
          if (customer) {
            customerId = customer.id
            logger.log(`顧客を設定（名前一致）: ${customer.id} (${participantName})`)
          } else {
            logger.log(`顧客が見つかりませんでした: ${participantName}`)
          }
        } catch (error) {
          logger.error('顧客検索エラー:', error)
        }
      }
      
      // 予約番号を生成
      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
      const reservationNumber = `${dateStr}-${randomStr}`

      const finalPaymentMethod = participantName === 'デモ参加者' ? 'onsite' : paymentMethod
      const finalPaymentStatus = (participantName === 'デモ参加者' || paymentMethod === 'online') ? 'paid' : (paymentMethod === 'staff' ? 'paid' : 'pending')

      // 管理者による手動追加は直接INSERTで実行（RPCの満員・重複チェックを回避）
      const { data: insertedRows, error: insertError } = await supabase
        .from('reservations')
        .insert({
          schedule_event_id: event.id,
          organization_id: organizationId ?? event?.organization_id ?? null,
          title: currentEventData.scenario || '',
          scenario_master_id: scenarioObj?.id || null,
          store_id: storeObj?.id || null,
          customer_id: customerId,
          customer_notes: participantName,
          reservation_number: reservationNumber,
          requested_datetime: `${currentEventData.date}T${currentEventData.start_time}+09:00`,
          duration: scenarioObj?.duration || 120,
          participant_count: newParticipant.participant_count,
          participant_names: [participantName],
          assigned_staff: currentEventData.gms || [],
          base_price: basePrice,
          options_price: 0,
          total_price: totalPrice,
          discount_amount: 0,
          final_price: totalPrice,
          unit_price: unitPrice,
          payment_method: finalPaymentMethod,
          payment_status: finalPaymentStatus,
          status: 'confirmed',
          reservation_source: reservationSource
        })
        .select(RESERVATION_SELECT_FIELDS)

      if (insertError) throw insertError
      const createdReservation = insertedRows?.[0] || null
      
      // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
      if (event.id) {
        try {
          const newCount = await recalculateCurrentParticipants(event.id)
          if (onParticipantChange) {
            onParticipantChange(event.id, newCount)
          }
        } catch (error) {
          logger.error('公演参加者数の更新に失敗:', error)
        }
      }
      
      // 履歴を記録
      if (event.id && storeObj?.id) {
        try {
          const organizationId = await getCurrentOrganizationId()
          if (organizationId) {
            await createEventHistory(
              event.id,
              organizationId,
              'add_participant',
              null,
              {
                participant_name: participantName,
                participant_count: newParticipant.participant_count,
                payment_method: paymentMethod,
                reservation_source: reservationSource
              },
              {
                date: currentEventData.date,
                storeId: storeObj.id,
                timeSlot: currentEventData.time_slot || null
              },
              {
                notes: `${participantName}（${newParticipant.participant_count}名）を追加`
              }
            )
          }
        } catch (error) {
          logger.error('参加者追加履歴の記録に失敗:', error)
        }
      }
      
      if (createdReservation) {
        setReservations(prev => [...prev, createdReservation])
      }
      
      if (event.id) {
        try {
          const data = await reservationApi.getByScheduleEvent(event.id)
          setReservations(data)
        } catch (error) {
          logger.error('予約データの取得に失敗:', error)
        }
      }
      
      setNewParticipant({
        customer_name: '',
        participant_count: 1,
        payment_method: 'onsite',
        notes: ''
      })
      setIsAddingParticipant(false)
      
    } catch (error) {
      logger.error('参加者追加エラー:', error)
      showToast.error('参加者の追加に失敗しました')
    }
  }

  return (
    <>
      {loadingReservations ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex gap-2 mt-1">
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {/* 公演中止バナー */}
          {event?.is_cancelled && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <span className="text-red-600 font-semibold text-xs">公演中止済み</span>
              <span className="text-red-500 text-xs">— 下記の予約は公演中止によりキャンセルまたは無効です</span>
            </div>
          )}
          <div className="mb-4">
            {!isAddingParticipant ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsAddingParticipant(true)}
                  size="sm"
                >
                  + 参加者を追加
                </Button>
                <Button
                  onClick={async () => {
                    if (!event?.id) return
                    try {
                      const organizationId =
                        (await getCurrentOrganizationId()) || event?.organization_id || undefined
                      
                      // デモ顧客を取得
                      let customerId: string | null = null
                      try {
                        let query = supabase
                          .from('customers')
                          .select('id')
                          .or('name.ilike.%デモ%,email.ilike.%demo%')
                        if (organizationId) {
                          query = query.eq('organization_id', organizationId)
                        }
                        const { data: demoCustomer } = await query.limit(1).single()
                        if (demoCustomer) {
                          customerId = demoCustomer.id
                        }
                      } catch {
                        // デモ顧客が見つからなくても続行
                      }
                      
                      // 予約番号を生成
                      const now = new Date()
                      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
                      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
                      const reservationNumber = `${dateStr}-${randomStr}`
                      
                      // シナリオ情報を取得
                      const scenarioObj = scenarios.find(s => s.title === currentEventData.scenario)
                      const storeObj = stores.find(s => s.id === currentEventData.venue)
                      const participationFee = scenarioObj?.participation_fee || 0
                      
                      // 直接INSERTでデモ参加者を追加（キャンセル済み公演でも追加可能）
                      const duration = scenarioObj?.duration || 120
                      const { error: insertError } = await supabase
                        .from('reservations')
                        .insert({
                          schedule_event_id: event.id,
                          organization_id: organizationId ?? event?.organization_id ?? null,
                          scenario_master_id: scenarioObj?.id || null,
                          store_id: storeObj?.id || null,
                          customer_id: customerId,
                          customer_notes: 'デモ参加者',
                          participant_count: 1,
                          participant_names: ['デモ参加者'],
                          reservation_number: reservationNumber,
                          requested_datetime: `${currentEventData.date}T${currentEventData.start_time}+09:00`,
                          title: currentEventData.scenario || '',
                          duration: duration,
                          base_price: participationFee,
                          total_price: participationFee,
                          final_price: participationFee,
                          unit_price: participationFee,
                          payment_method: 'onsite',
                          payment_status: 'paid',
                          status: 'confirmed',
                          reservation_source: RESERVATION_SOURCE.WALK_IN
                        })
                      
                      if (insertError) {
                        throw insertError
                      }
                      
                      // 参加者数を再計算
                      const { data: updatedReservationsData } = await supabase
                        .from('reservations')
                        .select('participant_count')
                        .eq('schedule_event_id', event.id)
                        .in('status', [...ACTIVE_RESERVATION_STATUSES])
                      
                      const totalParticipants = updatedReservationsData?.reduce((sum, r) => sum + (r.participant_count || 0), 0) || 0
                      
                      await supabase
                        .from('schedule_events')
                        .update({ current_participants: totalParticipants })
                        .eq('id', event.id)
                      
                      showToast.success('デモ参加者を追加しました')
                      
                      // 予約リストを再取得
                      const eventOrgId = (event as any)?.organization_id || null
                      const updatedReservationList = await reservationApi.getByScheduleEvent(event.id, eventOrgId)
                      setReservations(updatedReservationList)
                      
                      // 参加者数を親に通知
                      if (onParticipantChange) {
                        onParticipantChange(event.id, totalParticipants)
                      }
                    } catch (error) {
                      logger.error('デモ参加者追加エラー:', error)
                      showToast.error('デモ参加者の追加に失敗しました')
                    }
                  }}
                  size="sm"
                  variant="outline"
                >
                  + デモ追加
                </Button>
              </div>
            ) : (
              <div className="border rounded-lg p-3 bg-muted/30">
                <h4 className="font-medium mb-2 text-sm">新しい参加者を追加</h4>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="customer_name" className="text-xs">参加者名 *</Label>
                    <AutocompleteInput
                      value={newParticipant.customer_name}
                      onChange={(value) => {
                        // スタッフかどうかを判定し、自動的にpayment_methodを設定
                        const matchedStaff = findMatchingStaff(value, null, staff)
                        setNewParticipant(prev => ({
                          ...prev,
                          customer_name: value,
                          // スタッフの場合は自動的に「スタッフ参加」に設定
                          payment_method: matchedStaff ? 'staff' : prev.payment_method === 'staff' ? 'onsite' : prev.payment_method
                        }))
                      }}
                      placeholder="参加者名を入力"
                      staffOptions={staff.map(s => ({ value: s.name, label: s.name, type: 'staff' as const }))}
                      customerOptions={customerNames.map(name => ({ value: name, label: name, type: 'customer' as const }))}
                      showStaffOnFocus={true}
                    />
                    {findMatchingStaff(newParticipant.customer_name, null, staff) && (
                      <p className="text-xs text-blue-600 mt-1">
                        ※ スタッフとして認識されました
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="participant_count" className="text-xs">人数</Label>
                      <Input
                        id="participant_count"
                        type="number"
                        min="1"
                        className="h-8"
                        value={newParticipant.participant_count}
                        onChange={(e) => setNewParticipant(prev => ({ ...prev, participant_count: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment_method" className="text-xs">支払い方法</Label>
                      <Select
                        value={newParticipant.payment_method}
                        onValueChange={(value: 'onsite' | 'online' | 'staff') => setNewParticipant(prev => ({ ...prev, payment_method: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="onsite">現地決済</SelectItem>
                          <SelectItem value="online">事前決済</SelectItem>
                          <SelectItem value="staff">スタッフ参加（無料）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="notes" className="text-xs">メモ</Label>
                    <Textarea
                      id="notes"
                      value={newParticipant.notes}
                      onChange={(e) => setNewParticipant(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="特記事項があれば入力"
                      rows={1}
                      className="min-h-[32px]"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddingParticipant(false)
                        setNewParticipant({
                          customer_name: '',
                          participant_count: 1,
                          payment_method: 'onsite',
                          notes: ''
                        })
                      }}
                    >
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddParticipant}
                    >
                      追加
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {reservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              予約はありません
            </div>
          ) : (
            <div>
              {selectedReservations.size > 0 && (
                <div className="mb-3 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedReservations.size}件選択中
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      const selectedEmails = reservations
                        .filter(r => selectedReservations.has(r.id))
                        .map(r => r.customer_id)
                        .filter(Boolean)
                      if (selectedEmails.length > 0) {
                        setIsEmailModalOpen(true)
                      } else {
                        showToast.warning('選択した予約にメールアドレスが設定されていません')
                      }
                    }}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    メール送信
                  </Button>
                </div>
              )}
              <div>
                <div className="hidden sm:flex border rounded-t-lg bg-muted/30 p-3 h-[50px] items-center justify-between font-medium text-xs">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-[40px] flex items-center justify-center">
                      <Checkbox
                        checked={selectedReservations.size === reservations.length && reservations.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedReservations(new Set(reservations.map(r => r.id)))
                          } else {
                            setSelectedReservations(new Set())
                          }
                        }}
                      />
                    </div>
                    <span className="flex-1">顧客名</span>
                    <span className="w-[60px]">人数</span>
                    <span className="w-[100px]">予約日時</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="w-[80px]">ステータス</span>
                    <span className="w-[80px]"></span>
                  </div>
                </div>
                <div className="sm:hidden border rounded-t-lg bg-muted/30 p-3 flex items-center justify-between font-medium text-xs">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedReservations.size === reservations.length && reservations.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedReservations(new Set(reservations.map(r => r.id)))
                        } else {
                          setSelectedReservations(new Set())
                        }
                      }}
                    />
                    <span>予約一覧</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {reservations.length}件
                  </span>
                </div>
                
                <div className="border-l border-r border-b rounded-b-lg">
                  {reservations.map((reservation, index) => {
                    const isExpanded = expandedReservation === reservation.id
                    const isLast = index === reservations.length - 1
                    const isCancelled = reservation.status === 'cancelled'
                    return (
                      <div key={reservation.id} className={`${isLast ? '' : 'border-b'} ${isCancelled ? 'bg-gray-50 opacity-60' : ''}`}>
                        <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedReservations.has(reservation.id)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedReservations)
                                if (checked) {
                                  newSelected.add(reservation.id)
                                } else {
                                  newSelected.delete(reservation.id)
                                }
                                setSelectedReservations(newSelected)
                              }}
                              disabled={isCancelled}
                            />
                            <span className={`font-medium truncate flex-1 min-w-0 flex items-center gap-2 ${isCancelled ? 'line-through text-gray-500' : ''}`}>
                              {(() => {
                                const customer = reservation.customers
                                  ? (Array.isArray(reservation.customers) ? reservation.customers[0] : reservation.customers)
                                  : null
                                const name = reservation.customer_name || customer?.name || reservation.customer_notes || '顧客名なし'
                                const nickname = customer?.nickname
                                if (nickname && nickname !== name) {
                                  return <>{name}<span className="text-xs text-muted-foreground ml-1">({nickname})</span></>
                                }
                                return name
                              })()}
                              {/* キャンセル済みバッジ + 日時 */}
                              {isCancelled && (
                                <>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200">
                                    キャンセル済
                                  </span>
                                  {(reservation.cancelled_at || reservation.updated_at) && (
                                    <span className="text-[10px] text-gray-400 shrink-0">
                                      {new Date(reservation.cancelled_at || reservation.updated_at!).toLocaleString('ja-JP', {
                                        month: 'numeric',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  )}
                                </>
                              )}
                              {/* 貸切バッジ */}
                              {reservation.private_group_id && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                  貸切
                                </span>
                              )}
                              {/* スタッフ参加バッジ */}
                              {!isCancelled && (reservation.payment_method === 'staff' ||
                                (STAFF_RESERVATION_SOURCES as readonly string[]).includes(reservation.reservation_source ?? '')) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                  スタッフ
                                </span>
                              )}
                            </span>
                            {isCancelled ? (
                              <span className="w-[60px] h-7 text-xs text-gray-400 flex items-center">{reservation.participant_count}名</span>
                            ) : (
                              <Select 
                                value={String(reservation.participant_count || 1)}
                                onValueChange={async (value) => {
                                  const newCount = parseInt(value)
                                  
                                  // 予約時の1人あたり料金を取得（unit_price優先、なければbase_priceから計算）
                                  const unitPrice = reservation.unit_price 
                                    || Math.round((reservation.base_price || 0) / (reservation.participant_count || 1))
                                  
                                  // 料金を再計算
                                  const newBasePrice = unitPrice * newCount
                                  const optionsPrice = reservation.options_price || 0
                                  const discountAmount = reservation.discount_amount || 0
                                  const newTotalPrice = newBasePrice + optionsPrice
                                  const newFinalPrice = newTotalPrice - discountAmount
                                  
                                  // 参加人数の更新はRPCでロック付き実行
                                  try {
                                    await reservationApi.updateParticipantsWithLock(
                                      reservation.id,
                                      newCount,
                                      reservation.customer_id ?? null
                                    )
                                  } catch (updateError: any) {
                                    showToast.error(getSafeErrorMessage(updateError, '人数の更新に失敗しました'))
                                    return
                                  }

                                  // 料金/参加者名の再計算はサーバー側で実施（直UPDATE禁止）
                                  try {
                                    await reservationApi.recalculatePrices(
                                      reservation.id,
                                      Array(newCount).fill(reservation.participant_names?.[0] || 'デモ参加者')
                                    )
                                  } catch (recalcError: any) {
                                    showToast.error(getSafeErrorMessage(recalcError, '料金の再計算に失敗しました'))
                                    return
                                  }
                                  
                                  // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
                                  if (event?.id) {
                                    try {
                                      const newEventCount = await recalculateCurrentParticipants(event.id)
                                      onParticipantChange?.(event.id, newEventCount)
                                    } catch (updateError) {
                                      logger.error('参加者数の更新エラー:', updateError)
                                    }
                                  }
                                  
                                  // ローカルの予約データを更新
                                  setReservations(prev => 
                                    prev.map(r => r.id === reservation.id 
                                      ? { ...r, participant_count: newCount }
                                      : r
                                    )
                                  )
                                  
                                  // 🔔 人数が減少した場合、キャンセル待ちに通知
                                  const oldCount = reservation.participant_count || 0
                                  const freedSeats = oldCount - newCount
                                  
                                  // organization_idを複数のソースから取得（優先順位順）
                                  // デバッグ: 各ソースの値を確認
                                  const eventOrgId = event?.organization_id
                                  const scenarioOrgId = (event as any)?.scenarios?.organization_id
                                  const currentUserOrgId = await getCurrentOrganizationId()
                                  
                                  logger.info('🔍 orgId デバッグ:', { 
                                    eventOrgId, 
                                    scenarioOrgId, 
                                    currentUserOrgId,
                                    eventKeys: event ? Object.keys(event) : []
                                  })
                                  
                                  const orgId = eventOrgId || scenarioOrgId || currentUserOrgId
                                  
                                  logger.info('🔍 キャンセル待ち通知準備:', { freedSeats, orgId, eventId: event?.id })
                                  
                                  if (freedSeats > 0 && event && orgId) {
                                    try {
                                      const { data: org } = await supabase
                                        .from('organizations')
                                        .select('slug')
                                        .eq('id', orgId)
                                        .single()
                                      
                                      const orgSlug = org?.slug || 'queens-waltz'
                                      const bookingUrl = `${window.location.origin}/${orgSlug}`
                                      
                                      await supabase.functions.invoke('notify-waitlist', {
                                        body: {
                                          organizationId: orgId,
                                          scheduleEventId: event.id,
                                          freedSeats,
                                          scenarioTitle: event.scenario || event.scenarios?.title || '',
                                          eventDate: event.date,
                                          startTime: event.start_time,
                                          endTime: event.end_time,
                                          storeName: event.venue || (event as any).stores?.name || '',
                                          bookingUrl
                                        }
                                      })
                                      logger.info('キャンセル待ち通知を送信（人数減少）:', { freedSeats })
                                    } catch (notifyError) {
                                      logger.warn('キャンセル待ち通知エラー:', notifyError)
                                      // 通知失敗はエラー表示しない（メイン処理は成功しているため）
                                    }
                                  } else {
                                    logger.info('🔍 キャンセル待ち通知スキップ:', { freedSeats, hasEvent: !!event, hasOrgId: !!orgId })
                                  }
                                  
                                  showToast.success('人数を更新しました')
                                }}
                              >
                                <SelectTrigger className="w-[60px] h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                                    <SelectItem key={n} value={String(n)}>{n}名</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <span className="hidden sm:block text-xs text-muted-foreground w-[100px]">
                              {isCancelled && reservation.cancelled_at ? (
                                <span title="キャンセル日時">
                                  {new Date(reservation.cancelled_at).toLocaleString('ja-JP', {
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              ) : reservation.created_at ? (
                                new Date(reservation.created_at).toLocaleString('ja-JP', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              ) : '-'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 ml-6 sm:ml-0 flex-wrap">
                            {isCancelled ? (
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-xs text-red-500">キャンセル済</span>
                                {(() => {
                                  const reason = reservation.cancellation_reason
                                  const isCustomerCancel = reason && (reason.includes('お客様') || reason.includes('顧客'))
                                  const isEventCancel = event?.is_cancelled && !isCustomerCancel
                                  const displayReason = isCustomerCancel
                                    ? reason
                                    : (event?.is_cancelled ? '公演中止によるキャンセル' : (reason || ''))
                                  const colorClass = isEventCancel ? 'text-orange-500' : 'text-gray-400'
                                  return (
                                    <>
                                      {displayReason && (
                                        <span className={`text-[10px] leading-tight ${colorClass}`}>{displayReason}</span>
                                      )}
                                      {(reservation.cancelled_at || reservation.updated_at) && (
                                        <span className={`text-[10px] leading-tight ${colorClass}`}>
                                          {new Date(reservation.cancelled_at || reservation.updated_at!).toLocaleString('ja-JP', {
                                            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                          })}
                                        </span>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            ) : reservation.status === 'checked_in' ? (
                              <span className="w-[80px] h-8 text-xs text-green-600 font-semibold flex items-center gap-1">
                                ✓ 来店済
                              </span>
                            ) : (
                              <>
                                <Select 
                                  value={reservation.status} 
                                  onValueChange={(value) => handleUpdateReservationStatus(reservation.id, value as Reservation['status'])}
                                >
                                  <SelectTrigger className="w-[80px] h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="confirmed">確定</SelectItem>
                                    <SelectItem value="cancelled">キャンセル</SelectItem>
                                    <SelectItem value="pending">保留中</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() => handleUpdateReservationStatus(reservation.id, 'checked_in')}
                                >
                                  チェックイン
                                </Button>
                              </>
                            )}
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => setExpandedReservation(isExpanded ? null : reservation.id)}
                            >
                              詳細
                              {isExpanded ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t">
                            <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">人数</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={reservation.participant_count}
                                    onChange={async (e) => {
                                      const newCount = parseInt(e.target.value) || 1
                                      if (newCount < 1 || newCount > 20) return
                                      
                                      // 予約時の1人あたり料金を取得（unit_price優先、なければbase_priceから計算）
                                      const unitPrice = reservation.unit_price 
                                        || Math.round((reservation.base_price || 0) / (reservation.participant_count || 1))
                                      
                                      // 料金を再計算
                                      const newBasePrice = unitPrice * newCount
                                      const optionsPrice = reservation.options_price || 0
                                      const discountAmount = reservation.discount_amount || 0
                                      const newTotalPrice = newBasePrice + optionsPrice
                                      const newFinalPrice = newTotalPrice - discountAmount
                                      
                                      // 人数変更はロック付きRPCで実施（直UPDATE禁止）
                                      try {
                                        await reservationApi.updateParticipantsWithLock(
                                          reservation.id,
                                          newCount,
                                          reservation.customer_id ?? null
                                        )
                                        await reservationApi.recalculatePrices(
                                          reservation.id,
                                          Array(newCount).fill(reservation.participant_names?.[0] || 'デモ参加者')
                                        )
                                      } catch (updateError: any) {
                                        showToast.error(getSafeErrorMessage(updateError, '人数の更新に失敗しました'))
                                        return
                                      }
                                      
                                      // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
                                      if (event?.id) {
                                        try {
                                          const newEventCount = await recalculateCurrentParticipants(event.id)
                                          onParticipantChange?.(event.id, newEventCount)
                                        } catch (updateError) {
                                          logger.error('参加者数の更新エラー:', updateError)
                                        }
                                      }
                                      
                                      // ローカルの予約データを更新
                                      setReservations(prev => 
                                        prev.map(r => r.id === reservation.id 
                                          ? { ...r, participant_count: newCount }
                                          : r
                                        )
                                      )
                                      
                                      showToast.success('人数を更新しました')
                                    }}
                                    className="w-20 h-8 text-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">名</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">予約ソース</Label>
                                <div className="text-sm">
                                  {reservation.reservation_source === RESERVATION_SOURCE.DEMO ? 'デモ' :
                                   reservation.reservation_source === RESERVATION_SOURCE.STAFF_PARTICIPATION ? 'スタッフ参加' :
                                   reservation.reservation_source === RESERVATION_SOURCE.WEB ? 'Web予約' :
                                   reservation.reservation_source === RESERVATION_SOURCE.WALK_IN ? '当日予約' :
                                   reservation.reservation_source || '-'}
                                </div>
                              </div>
                            </div>
                            {(() => {
                              const customer = reservation.customers as any
                              let email = reservation.customer_email 
                                || customer?.email 
                                || customer?.user?.email
                              
                              // スタッフのメールアドレスを検索
                              if (!email) {
                                const participantName = reservation.participant_names?.[0] || reservation.customer_notes
                                if (participantName) {
                                  const matchedStaff = staff.find(s => 
                                    s.name === participantName || 
                                    s.display_name === participantName
                                  )
                                  if (matchedStaff?.email) {
                                    email = matchedStaff.email
                                  }
                                }
                              }

                              const phone = reservation.customer_phone || customer?.phone_number

                              return (
                                <div className="mt-3 space-y-2 border-t pt-3">
                                  <Label className="text-xs font-semibold text-muted-foreground">顧客情報</Label>
                                  {phone && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">電話番号</span>
                                      <a href={`tel:${phone}`} className="text-sm text-blue-600 hover:underline">{phone}</a>
                                    </div>
                                  )}
                                  {email && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">メール</span>
                                      <a href={`mailto:${email}`} className="text-sm text-blue-600 hover:underline break-all">{email}</a>
                                    </div>
                                  )}
                                  {!phone && !email && (
                                    <div className="text-xs text-muted-foreground">連絡先情報なし</div>
                                  )}
                                </div>
                              )
                            })()}
                            {reservation.customer_notes && (
                              <div className="mt-3">
                                <Label className="text-xs text-muted-foreground">備考</Label>
                                <div className="text-sm mt-1">{reservation.customer_notes}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>メール送信</DialogTitle>
            <DialogDescription>
              選択した{selectedReservations.size}件の予約者にメールを送信します
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email-subject">件名</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="例: 公演のご案内"
              />
            </div>

            <div>
              <Label htmlFor="email-body">本文</Label>
              <Textarea
                id="email-body"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="メール本文を入力してください..."
                rows={10}
              />
            </div>

            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">送信先:</p>
              <ul className="list-disc list-inside space-y-1">
                {reservations
                  .filter(r => selectedReservations.has(r.id))
                  .map(r => (
                    <li key={r.id}>
                      {r.customer_notes || '顧客名なし'} ({r.customer_id})
                    </li>
                  ))}
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEmailModalOpen(false)
                  setEmailSubject('')
                  setEmailBody('')
                }}
                disabled={sendingEmail}
              >
                キャンセル
              </Button>
              <Button
                onClick={async () => {
                  if (!emailSubject.trim() || !emailBody.trim()) {
                    showToast.warning('件名と本文を入力してください')
                    return
                  }

                  setSendingEmail(true)
                  try {
                    const selectedEmails = reservations
                      .filter(r => selectedReservations.has(r.id))
                      .map(r => {
                        if (r.customers) {
                          if (Array.isArray(r.customers)) {
                            return r.customers[0]?.email
                          }
                          return (r.customers as Customer).email
                        }
                        return null
                      })
                      .filter((email): email is string => email !== null && email !== undefined)
                    
                    if (selectedEmails.length === 0) {
                      showToast.warning('送信先のメールアドレスが見つかりませんでした')
                      return
                    }

                    logger.log('メール送信:', {
                      to: selectedEmails,
                      subject: emailSubject,
                      body: emailBody
                    })
                    
                    const { error } = await supabase.functions.invoke('send-email', {
                      body: {
                        recipients: selectedEmails,
                        subject: emailSubject,
                        body: emailBody
                      }
                    })
                    
                    if (error) {
                      throw error
                    }

                    showToast.success(`${selectedEmails.length}件のメールを送信しました`)
                    setIsEmailModalOpen(false)
                    setEmailSubject('')
                    setEmailBody('')
                    setSelectedReservations(new Set())
                  } catch (error) {
                    logger.error('メール送信エラー:', error)
                    showToast.error('メール送信に失敗しました')
                  } finally {
                    setSendingEmail(false)
                  }
                }}
                disabled={sendingEmail || selectedReservations.size === 0}
              >
                {sendingEmail ? '送信中...' : `送信 (${selectedReservations.size}件)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>予約をキャンセルしますか？</DialogTitle>
            <DialogDescription>
              キャンセル確認メールが送信されます。
            </DialogDescription>
          </DialogHeader>
          {cancellingReservation && (
            <div className="space-y-2 py-4">
              <div className="text-sm">
                <span className="font-medium">予約者:</span>{' '}
                {cancellingReservation.customer_name || 
                  (cancellingReservation.customers ? 
                    (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.name : cancellingReservation.customers?.name) : 
                    '顧客名なし')}
              </div>
              <div className="text-sm">
                <span className="font-medium">参加者数:</span> {cancellingReservation.participant_count}名
              </div>
              <div className="text-sm">
                <span className="font-medium">予約番号:</span> {cancellingReservation.reservation_number || 'なし'}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsCancelDialogOpen(false)
                setCancellingReservation(null)
              }}
              disabled={isCancelling}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancelFromDialog}
              disabled={isCancelling}
            >
              {isCancelling ? '処理中...' : 'キャンセル確定'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEmailConfirmOpen} onOpenChange={(open) => {
        if (!open) {
          setCancellingReservation(null)
        }
        setIsEmailConfirmOpen(open)
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>予約をキャンセル</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* 送信先 */}
            <div className="text-sm">
              <span className="text-muted-foreground">送信先: </span>
              <span className="font-medium">{emailContent.customerEmail}</span>
            </div>

            {/* メール本文 */}
            <div>
              <Label htmlFor="email-body">メール本文</Label>
              <Textarea
                id="email-body"
                value={emailContent.emailBody}
                onChange={(e) => setEmailContent(prev => ({ ...prev, emailBody: e.target.value }))}
                className="mt-1 font-mono text-xs"
                rows={16}
              />
            </div>
          </div>
          <div className="flex flex-col gap-4 pt-4 border-t flex-shrink-0">
            {/* メール送信チェックボックス */}
            {emailContent.customerEmail && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="send-cancel-email"
                  checked={shouldSendEmail}
                  onCheckedChange={(checked) => setShouldSendEmail(!!checked)}
                />
                <label 
                  htmlFor="send-cancel-email" 
                  className="text-sm font-medium cursor-pointer"
                >
                  キャンセル確認メールを送信する
                </label>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEmailConfirmOpen(false)
                  setCancellingReservation(null)
                  setEmailContent({
                    customerEmail: '',
                    customerName: '',
                    cancellationReason: '店舗都合によるキャンセル',
                    scenarioTitle: '',
                    eventDate: '',
                    startTime: '',
                    endTime: '',
                    storeName: '',
                    participantCount: 0,
                    totalPrice: 0,
                    reservationNumber: '',
                    cancellationFee: 0,
                    paymentMethod: 'onsite',
                    cancellationPolicy: '',
                    organizationName: '',
                    emailBody: ''
                  })
                }}
                disabled={isCancelling}
              >
                やめる
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleExecuteCancel(shouldSendEmail)}
                disabled={isCancelling}
              >
                {isCancelling ? '処理中...' : 'キャンセル確定'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 貸切イベント削除確認ダイアログ */}
      <Dialog open={isDeleteEventDialogOpen} onOpenChange={setIsDeleteEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>貸切公演を削除しますか？</DialogTitle>
            <DialogDescription>
              全ての参加者がキャンセルされました。この貸切公演自体を削除しますか？
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              「削除する」を選択すると、この貸切公演がスケジュールから完全に削除されます。
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteEventDialogOpen(false)}
              disabled={isDeletingEvent}
            >
              削除しない
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!onDeleteEvent) return
                setIsDeletingEvent(true)
                try {
                  await onDeleteEvent()
                  setIsDeleteEventDialogOpen(false)
                  showToast.success('貸切公演を削除しました')
                } catch (error) {
                  logger.error('イベント削除エラー:', error)
                  showToast.error('削除に失敗しました')
                } finally {
                  setIsDeletingEvent(false)
                }
              }}
              disabled={isDeletingEvent}
            >
              {isDeletingEvent ? '削除中...' : '削除する'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}


