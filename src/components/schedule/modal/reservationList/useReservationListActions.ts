/**
 * 予約リストの操作ハンドラ群（ReservationList から抽出・挙動不変）。
 * ステータス変更・キャンセル（メール送信含む）・参加者追加・貸切削除・一括メール送信。
 * 826行のハンドラ本体を逐語移送し、状態・setter・props を deps として注入。
 * 内部相互参照（handleUpdateReservationStatus→openCancelDialog 等）はフック内で解決。
 */
import type { Dispatch, SetStateAction } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { reservationApi, RESERVATION_SELECT_FIELDS } from '@/lib/reservationApi'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { buildCancellationEmailBody } from '@/lib/cancellationEmail'
import { getDefaultStoreCancellationTemplate } from '@/lib/templateRegistry'
import { getCurrentOrganizationId } from '@/lib/organization'
import { findMatchingStaff } from '@/utils/staffUtils'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import { ACTIVE_RESERVATION_STATUSES_SET, STAFF_RESERVATION_SOURCES } from '@/lib/constants'
import type { Staff as StaffType, Scenario, Store, Reservation, Customer } from '@/types'
import type { ScheduleEvent, EventFormData } from '@/types/schedule'
import { sumActiveParticipants } from './participants'
import { EMPTY_CANCELLATION_EMAIL_STATE, type ReservationCancellationEmailState } from './cancellationEmailState'
import type { NewParticipant } from './newParticipant'

interface UseReservationListActionsDeps {
  event: ScheduleEvent | null
  currentEventData: EventFormData
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  onDeleteEvent?: () => Promise<void>
  onParticipantChange?: (eventId: string, newCount: number) => void
  onGmsChange?: (gms: string[], gmRoles: Record<string, string>) => void
  reservations: Reservation[]
  cancellingReservation: Reservation | null
  emailContent: ReservationCancellationEmailState
  newParticipant: NewParticipant
  selectedReservations: Set<string>
  emailSubject: string
  emailBody: string
  isCancelling: boolean
  expandedReservation: string | null
  onPendingAdd?: (p: { name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }) => void
  setReservations: Dispatch<SetStateAction<Reservation[]>>
  setCancellingReservation: Dispatch<SetStateAction<Reservation | null>>
  setEmailContent: Dispatch<SetStateAction<ReservationCancellationEmailState>>
  setEmailSubject: Dispatch<SetStateAction<string>>
  setEmailBody: Dispatch<SetStateAction<string>>
  setExpandedReservation: Dispatch<SetStateAction<string | null>>
  setIsAddingParticipant: Dispatch<SetStateAction<boolean>>
  setIsCancelDialogOpen: Dispatch<SetStateAction<boolean>>
  setIsCancelling: Dispatch<SetStateAction<boolean>>
  setIsDeleteEventDialogOpen: Dispatch<SetStateAction<boolean>>
  setIsDeletingEvent: Dispatch<SetStateAction<boolean>>
  setIsEmailConfirmOpen: Dispatch<SetStateAction<boolean>>
  setIsEmailModalOpen: Dispatch<SetStateAction<boolean>>
  setNewParticipant: Dispatch<SetStateAction<NewParticipant>>
  setSelectedReservations: Dispatch<SetStateAction<Set<string>>>
  setSendingEmail: Dispatch<SetStateAction<boolean>>
  setShouldSendEmail: Dispatch<SetStateAction<boolean>>
}

export function useReservationListActions(deps: UseReservationListActionsDeps) {
  const {
    event,
    currentEventData,
    stores,
    scenarios,
    staff,
    onDeleteEvent,
    onParticipantChange,
    onGmsChange,
    reservations,
    cancellingReservation,
    emailContent,
    newParticipant,
    selectedReservations,
    emailSubject,
    emailBody,
    isCancelling,
    expandedReservation,
    onPendingAdd,
    setReservations,
    setCancellingReservation,
    setEmailContent,
    setEmailSubject,
    setEmailBody,
    setExpandedReservation,
    setIsAddingParticipant,
    setIsCancelDialogOpen,
    setIsCancelling,
    setIsDeleteEventDialogOpen,
    setIsDeletingEvent,
    setIsEmailConfirmOpen,
    setIsEmailModalOpen,
    setNewParticipant,
    setSelectedReservations,
    setSendingEmail,
    setShouldSendEmail,
  } = deps

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

  // 遅刻フラグ（arrived_late）のトグル。来店済の行で「遅刻して来た」を別軸で記録する。
  // status は変えないので参加者カウントは不変（checked_in のまま active）。
  const handleToggleArrivedLate = async (reservationId: string, value: boolean) => {
    const reservation = reservations.find(r => r.id === reservationId)
    if (!reservation) return
    const oldValue = reservation.arrived_late ?? false

    // オプティミスティックUI
    setReservations(prev =>
      prev.map(r => r.id === reservationId ? { ...r, arrived_late: value } : r)
    )

    try {
      await reservationApi.update(reservationId, { arrived_late: value })
      logger.log('遅刻フラグ更新成功:', { id: reservationId, value })
    } catch (error) {
      // ロールバック
      setReservations(prev =>
        prev.map(r => r.id === reservationId ? { ...r, arrived_late: oldValue } : r)
      )
      logger.error('遅刻フラグ更新エラー:', error)
      showToast.error('遅刻の更新に失敗しました')
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

    // 楽観作成の temp- 仮ID中は reservations.schedule_event_id に存在しないIDを
    // INSERT することになり 400/500 になる（保存完了で useEventModalState の同期 effect が
    // 実IDへ差し替えるまでの数秒間だけの状態）。保留バッファ（onPendingAdd）は add モード
    // 専用で、編集モードでは保存後に反映される保証がないため、ここでは案内して待ってもらう。
    if (event?.id?.startsWith('temp-')) {
      showToast.error('公演を保存中です。数秒後にもう一度お試しください')
      return
    }

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

  return {
    handleUpdateReservationStatus,
    handleToggleArrivedLate,
    handleConfirmCancelFromDialog,
    handleExecuteCancel,
    handleAddParticipant,
    handleConfirmDeleteEvent,
    closeEmailConfirm,
    handleSendBulkEmail,
  }
}
