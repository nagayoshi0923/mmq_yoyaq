import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Mail, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  reservationApi,
  RESERVATION_SELECT_FIELDS,
} from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { ACTIVE_RESERVATION_STATUSES_SET } from '@/lib/constants'
import { sumActiveParticipants } from './reservationList/participants'
import { useReservationListData } from './reservationList/useReservationListData'
import { CancelReservationDialog } from './reservationList/dialogs/CancelReservationDialog'
import { DeleteEventDialog } from './reservationList/dialogs/DeleteEventDialog'
import { EmailConfirmDialog } from './reservationList/dialogs/EmailConfirmDialog'
import { SendEmailDialog } from './reservationList/dialogs/SendEmailDialog'
import { AddParticipantSection } from './reservationList/AddParticipantSection'
import { ReservationRow } from './reservationList/ReservationRow'
import type { NewParticipant } from './reservationList/newParticipant'
import { EMPTY_CANCELLATION_EMAIL_STATE, type ReservationCancellationEmailState } from './reservationList/cancellationEmailState'
import { showToast } from '@/utils/toast'
import { buildCancellationEmailBody } from '@/lib/cancellationEmail'
import { getDefaultStoreCancellationTemplate } from '@/lib/templateRegistry'
import { TemplateEditButton } from '@/components/settings/TemplateEditButton'
import { findMatchingStaff } from '@/utils/staffUtils'
import { getCurrentOrganizationId } from '@/lib/organization'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import type { Staff as StaffType, Scenario, Store, Reservation, Customer } from '@/types'
import { ScheduleEvent, EventFormData } from '@/types/schedule'
import { STAFF_RESERVATION_SOURCES } from '@/lib/constants'

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
  // add モードで「+ 参加者を追加」した時のバッファ (event 未保存のため INSERT できない)
  pendingParticipants?: Array<{ name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }>
  onPendingAdd?: (p: { name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }) => void
  onPendingRemove?: (idx: number) => void
  // GM タブで「スタッフ参加」役割を付けたが DB 予約として未登録の名前 (公演情報タブ ⇔ 予約者タブの双方向同期用)
  pendingStaffGmNames?: string[]
  onPendingStaffGmRemove?: (name: string) => void
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
  pendingParticipants = [],
  onPendingAdd,
  onPendingRemove,
  pendingStaffGmNames = [],
  onPendingStaffGmRemove,
  onDeleteEvent
}: ReservationListProps) {
  // データ層（取得・realtime購読・顧客名）はフックへ分離
  const { reservations, setReservations, loadingReservations, customerNames } = useReservationListData({
    event,
    mode,
    onParticipantChange,
    onLocalParticipantUpdate,
  })
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
  const [emailContent, setEmailContent] = useState<ReservationCancellationEmailState>(EMPTY_CANCELLATION_EMAIL_STATE)
  
  // メール本文の生成は共通モジュール（lib/cancellationEmail）に移動。
  // 公演の中止・削除フロー（DeleteEventCancelDialog）と同じロジックを共有する
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [newParticipant, setNewParticipant] = useState<NewParticipant>({
    customer_name: '',
    participant_count: 1,
    payment_method: 'onsite',
    notes: ''
  })
  const cancellationTemplateStoreId =
    currentEventData.venue ||
    (event?.venue ? stores.find(s => s.id === event.venue || s.name === event.venue)?.id : null)


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
      let cancellationEmailTemplate = ''
      let companyName = ''
      let companyPhone = ''
      let companyEmail = ''
      const totalPrice = reservation.total_price || reservation.final_price || 0

      // 店舗都合のキャンセルなのでキャンセル料は0
      // ※顧客都合のキャンセルの場合のみキャンセル料が発生する
      const cancellationFee = 0

      if (storeId) {
        try {
          const [settingsResult, emailSettingsResult, storeResult] = await Promise.all([
            supabase.from('reservation_settings').select('cancellation_policy').eq('store_id', storeId).maybeSingle(),
            supabase.from('email_settings').select('store_cancellation_template, company_name, company_phone, company_email').eq('store_id', storeId).maybeSingle(),
            supabase.from('stores').select('organization_id, organizations(name)').eq('id', storeId).single(),
          ])

          if (settingsResult.data) {
            cancellationPolicy = settingsResult.data.cancellation_policy || ''
          }

          if (emailSettingsResult.data?.store_cancellation_template) {
            cancellationEmailTemplate = emailSettingsResult.data.store_cancellation_template
          }
          // 「テンプレを編集」の registry デフォルトと同じ会社情報を使うため取得
          companyName = (emailSettingsResult.data as Record<string, string | null> | null)?.company_name || ''
          companyPhone = (emailSettingsResult.data as Record<string, string | null> | null)?.company_phone || ''
          companyEmail = (emailSettingsResult.data as Record<string, string | null> | null)?.company_email || ''

          if (storeResult.data?.organizations) {
            // リレーション結果がオブジェクトか配列かを判定
            const org = storeResult.data.organizations as { name: string } | { name: string }[]
            if (Array.isArray(org)) {
              organizationName = org[0]?.name || ''
            } else {
              organizationName = org.name || ''
            }
          }
          if (!organizationName && emailSettingsResult.data?.company_name) {
            organizationName = emailSettingsResult.data.company_name
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
      // メール本文を生成。未保存時は「テンプレを編集」(TemplateEditDialog)と同じ
      // registry デフォルト(getDefaultStoreCancellationTemplate)を使い、編集画面と
      // プレビューの文面を一致させる（buildCancellationEmailBody 内の別 fallback を踏まない）
      const resolvedCancellationTemplate =
        cancellationEmailTemplate ||
        getDefaultStoreCancellationTemplate(companyName || organizationName, companyPhone, companyEmail)
      newEmailContent.emailBody = buildCancellationEmailBody(newEmailContent, resolvedCancellationTemplate)
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
            
            const orgSlug = org?.slug || ''
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
            const eventSnapshot = await fetchEventSnapshot(event.id, organizationId)
            const cellTimeSlot =
              (eventSnapshot?.time_slot as string | null | undefined) ??
              currentEventData.time_slot ??
              event.time_slot ??
              null
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
                timeSlot: cellTimeSlot
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
      // 判定は useEventDelete と同条件: 未承認の擬似イベント（is_private_request）に加え、
      // 承認済み貸切（category='private' + 予約リンクあり）も対象（2026-06-13修正）
      const isPrivateBookingEvent = event?.is_private_request ||
        (event?.category === 'private' && !!event?.reservation_id)
      if (isPrivateBookingEvent && onDeleteEvent) {
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

    if (!event?.id) {
      // add モード: event 未保存のため、parent (PerformanceModal) でバッファリングする
      if (onPendingAdd) {
        // staff 名と一致するかでスタッフ判定 → 自動で payment_method=staff にする
        const isStaff = staff.some(s => s.name === participantName.trim())
        const pm = isStaff ? 'staff' : newParticipant.payment_method
        onPendingAdd({
          name: participantName,
          count: newParticipant.participant_count,
          paymentMethod: pm,
        })
        // 入力欄をリセット
        setNewParticipant({
          customer_name: '',
          participant_count: 1,
          payment_method: 'onsite',
          notes: ''
        })
        setIsAddingParticipant(false)
      }
      return
    }

    try {
      const scenarioObj = scenarios.find(s => s.title === currentEventData.scenario)
      const storeObj = stores.find(s => s.id === currentEventData.venue)
      
      // スタッフかどうかを判定
      const matchedStaff = findMatchingStaff(participantName, null, staff)
      const isStaff = matchedStaff !== null
      const paymentMethod = isStaff ? 'staff' : newParticipant.payment_method
      
      const isGmTest = currentEventData.category === 'gmtest'
      const participationFee = isGmTest
        ? (scenarioObj?.gm_test_participation_fee || scenarioObj?.participation_fee || 0)
        : (scenarioObj?.participation_fee || 0)
      const unitPrice = paymentMethod === 'staff' ? 0 : participationFee
      const basePrice = unitPrice * newParticipant.participant_count
      const totalPrice = basePrice
      
      // スタッフ参加の場合は reservation_source を 'staff_participation' に設定
      const reservationSource = isStaff ? 'staff_participation' : 'walk_in'
      
      // 参加者名から顧客を検索して customer_id を設定
      // マイページで予約を表示するために必要
      let customerId: string | null = null
      let customerInfo: { name: string | null; email: string | null; phone: string | null } | null = null
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
        // platform customer (organization_id = NULL) も拾うため `eq` ではなく `or` で
        // 自組織 OR platform-level を許容する。
        try {
          let query = supabase
            .from('customers')
            .select('id, name, email, phone')
            .eq('name', participantName)

          if (organizationId) {
            query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`)
          }

          const { data: customer } = await query.limit(1).maybeSingle()

          if (customer) {
            customerId = customer.id
            // walk_in / staff_participation でも customer 行の連絡先を reservation にコピーし、
            // 公演中止メール等の自動通知で取得できるようにする。
            customerInfo = { name: customer.name, email: customer.email, phone: customer.phone }
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
          // 顧客が見つかった場合は連絡先を reservation 行にコピー（中止メール送信等で参照される）
          customer_name: customerInfo?.name ?? null,
          customer_email: customerInfo?.email ?? null,
          customer_phone: customerInfo?.phone ?? null,
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
            const eventSnapshot = await fetchEventSnapshot(event.id, organizationId)
            const cellTimeSlot =
              (eventSnapshot?.time_slot as string | null | undefined) ??
              currentEventData.time_slot ??
              event.time_slot ??
              null
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
                timeSlot: cellTimeSlot
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

  // 貸切公演の削除実行（DeleteEventDialog から呼ぶ・元はダイアログ内インライン処理）
  const handleConfirmDeleteEvent = async () => {
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
  }

  // メール送信確認ダイアログを閉じて状態をリセット（やめる／onOpenChange 共通）
  const closeEmailConfirm = () => {
    setIsEmailConfirmOpen(false)
    setCancellingReservation(null)
    setEmailContent(EMPTY_CANCELLATION_EMAIL_STATE)
  }

  // 選択した予約者への一括メール送信（元は SendEmailDialog 内のインライン onClick）
  const handleSendBulkEmail = async () => {
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

      // 履歴を記録（モーダル経由の手動メール送信）
      if (event?.id) {
        try {
          const organizationId = await getCurrentOrganizationId()
          const storeObj = stores.find(s => s.id === currentEventData.venue || s.name === event.venue)
          if (organizationId && storeObj?.id) {
            const snapshot = await fetchEventSnapshot(event.id, organizationId)
            const cellTimeSlot =
              (snapshot?.time_slot as string | null | undefined) ??
              currentEventData.time_slot ??
              event.time_slot ??
              null
            await createEventHistory(
              event.id,
              organizationId,
              'email_sent',
              null,
              {
                subject: emailSubject,
                body: emailBody,
                recipient_count: selectedEmails.length,
                recipient_emails: selectedEmails,
              },
              {
                date: currentEventData.date || event.date,
                storeId: storeObj.id,
                timeSlot: cellTimeSlot,
              },
              {
                notes: `${selectedEmails.length}名に「${emailSubject}」を送信`,
              }
            )
          }
        } catch (historyError) {
          logger.error('メール送信履歴の記録に失敗:', historyError)
        }
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
            <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-2">
              <span className="text-xs font-medium text-muted-foreground mr-1">関連テンプレ:</span>
              <TemplateEditButton
                templateKey="reservation_confirmation_template"
                storeId={cancellationTemplateStoreId}
                label="予約確認"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="booking_change_template"
                storeId={cancellationTemplateStoreId}
                label="予約変更"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="cancellation_template"
                storeId={cancellationTemplateStoreId}
                label="お客様キャンセル"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="reminder_template"
                storeId={cancellationTemplateStoreId}
                label="リマインド"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="waitlist_notify_template"
                storeId={cancellationTemplateStoreId}
                label="キャンセル待ち通知"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="waitlist_registration_template"
                storeId={cancellationTemplateStoreId}
                label="キャンセル待ち登録"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="performance_cancellation_template"
                storeId={cancellationTemplateStoreId}
                label="人数未達中止"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="event_cancellation_template"
                storeId={cancellationTemplateStoreId}
                label="公演中止"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="performance_extension_template"
                storeId={cancellationTemplateStoreId}
                label="募集延長"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
            </div>
            <AddParticipantSection
              event={event}
              scenarios={scenarios}
              stores={stores}
              staff={staff}
              currentEventData={currentEventData}
              isAddingParticipant={isAddingParticipant}
              setIsAddingParticipant={setIsAddingParticipant}
              newParticipant={newParticipant}
              setNewParticipant={setNewParticipant}
              handleAddParticipant={handleAddParticipant}
              customerNames={customerNames}
              onParticipantChange={onParticipantChange}
              setReservations={setReservations}
            />
          </div>

          {/* 保存後追加予定 (add モードでバッファされた参加者 + GM タブの staff 役割で未保存) */}
          {(pendingParticipants.length > 0 || pendingStaffGmNames.length > 0) && (
            <div className="mb-3 space-y-1.5">
              <p className="text-[11px] font-medium text-amber-700">
                保存後に追加されます ({pendingParticipants.length + pendingStaffGmNames.length}件)
              </p>
              {pendingStaffGmNames.map((name) => (
                <div key={`staff-${name}`} className="flex items-center justify-between gap-2 p-2 rounded border border-dashed border-amber-300 bg-amber-50/60">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">追加予定</span>
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">×1</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">スタッフ (GMタブから)</span>
                  </div>
                  {onPendingStaffGmRemove && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onPendingStaffGmRemove(name)} title="GM タブからも完全に削除します">
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              {pendingParticipants.map((p, idx) => (
                <div key={`buf-${idx}`} className="flex items-center justify-between gap-2 p-2 rounded border border-dashed border-amber-300 bg-amber-50/60">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">追加予定</span>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">×{p.count}</span>
                    {p.paymentMethod === 'staff' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">スタッフ</span>
                    )}
                  </div>
                  {onPendingRemove && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onPendingRemove(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {reservations.length === 0 && pendingParticipants.length === 0 && pendingStaffGmNames.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              予約はありません
            </div>
          ) : reservations.length === 0 ? null : (
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
                  {reservations.map((reservation, index) => (
                    <ReservationRow
                      key={reservation.id}
                      reservation={reservation}
                      index={index}
                      reservations={reservations}
                      setReservations={setReservations}
                      expandedReservation={expandedReservation}
                      setExpandedReservation={setExpandedReservation}
                      selectedReservations={selectedReservations}
                      setSelectedReservations={setSelectedReservations}
                      staff={staff}
                      stores={stores}
                      scenarios={scenarios}
                      event={event}
                      handleUpdateReservationStatus={handleUpdateReservationStatus}
                      onParticipantChange={onParticipantChange}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <SendEmailDialog
        open={isEmailModalOpen}
        onOpenChange={setIsEmailModalOpen}
        recipientCount={selectedReservations.size}
        recipients={reservations.filter(r => selectedReservations.has(r.id))}
        subject={emailSubject}
        setSubject={setEmailSubject}
        body={emailBody}
        setBody={setEmailBody}
        sending={sendingEmail}
        onClose={() => {
          setIsEmailModalOpen(false)
          setEmailSubject('')
          setEmailBody('')
        }}
        onSend={handleSendBulkEmail}
      />

      <CancelReservationDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        reservation={cancellingReservation}
        onClose={() => {
          setIsCancelDialogOpen(false)
          setCancellingReservation(null)
        }}
        isCancelling={isCancelling}
        onConfirm={handleConfirmCancelFromDialog}
      />

      <EmailConfirmDialog
        open={isEmailConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCancellingReservation(null)
          }
          setIsEmailConfirmOpen(open)
        }}
        emailContent={emailContent}
        setEmailContent={setEmailContent}
        shouldSendEmail={shouldSendEmail}
        setShouldSendEmail={setShouldSendEmail}
        isCancelling={isCancelling}
        cancellationTemplateStoreId={cancellationTemplateStoreId}
        onClose={closeEmailConfirm}
        onConfirm={() => handleExecuteCancel(shouldSendEmail)}
      />

      {/* 貸切イベント削除確認ダイアログ */}
      <DeleteEventDialog
        open={isDeleteEventDialogOpen}
        onOpenChange={setIsDeleteEventDialogOpen}
        onClose={() => setIsDeleteEventDialogOpen(false)}
        isDeleting={isDeletingEvent}
        onConfirm={handleConfirmDeleteEvent}
      />
    </>
  )
}
