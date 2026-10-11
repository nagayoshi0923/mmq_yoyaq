/**
 * 貸切グループから店舗へ予約リクエストを送る（主催者の操作。申込シート groupPage/booking/BookingRequestSheet から呼ぶ）。
 * 判断は ./bookingRequest.ts の関数、通信と画面の表示（トースト）はここで行う。
 * 候補日は選んだ順＝優先順で送る（DB は送られた並びを order 1, 2, … として保存。20261011200000）。
 * 希望店舗はグループの希望店舗のうち申込シートで選んだもの（DB はグループの希望店舗の中から 1 店舗以上を受け付ける）。
 */
import { addJstDays } from '@/utils/jstDate'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { bookingConfirmationReadApi } from '@/lib/api/bookingConfirmationReadApi'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { privateBookingSlotReadApi } from '@/lib/api/scheduleHookReadApi'
import { privateBookingRequestReadApi } from '@/lib/api/privateBookingRequestReadApi'
import { logger } from '@/utils/logger'
import { validateCustomerContact } from '@/lib/customerContactValidation'
import { notificationOutcome } from '@/lib/notificationResult'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
import { fetchScenarioTimingFromDb } from '@/lib/privateBookingScenarioTime'
import { formatBlockedCandidateLabel, type PrivateBookingBlockedSlotRow } from '@/lib/privateBookingBlockedSlotAvailability'
import type { RpcGetPublicPrivateBookingAvailabilityParams } from '@/lib/rpcTypes'
import { upsertOwnCustomer } from '@/lib/api/customerApi'
import { bookingRequestErrorMessage, buildCandidateDatetimes, findPastDeadlineCandidates, findUnavailableCandidates, generateReservationNumber, parseDeadlineDays, pastDeadlineMessage, selectBookableCandidates } from './bookingRequest'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
type GroupMember = NonNullable<GroupType['members']>[number]

export interface SubmitBookingRequestContext {
  group: GroupType | null
  user: { id: string; email?: string | null } | null
  isOrganizer: unknown
  canMutateScheduleBeforeStoreReply: boolean
  /** 送る候補日の id（優先順） */
  orderedCandidateIds: ReadonlyArray<string>
  bookingPhone: string
  bookingNotes: string
  /** 送る店舗（グループの希望店舗のうち選んだもの） */
  requestedStores: Array<{ id: string; name: string }>
  /** 参加人数（作品の最低〜最大人数の範囲。DB でも確かめる） */
  participantCount: number
  organizerMember: GroupMember | undefined
  isCustomHoliday: (date: string) => boolean
  setIsSubmittingBooking: (v: boolean) => void
}

/** 送れたら true（シートを閉じて読み直すのは呼び出し側） */
export async function submitGroupBookingRequest({
  group, user, isOrganizer, canMutateScheduleBeforeStoreReply, orderedCandidateIds, bookingPhone, bookingNotes,
  requestedStores, participantCount, organizerMember, isCustomHoliday, setIsSubmittingBooking,
}: SubmitBookingRequestContext): Promise<boolean> {
  if (!isOrganizer || !group || !user) return false
  if (!canMutateScheduleBeforeStoreReply) {
    toast.error('店舗の返答待ちのため、予約リクエストを送信できません')
    return false
  }

  const selectedCandidateDates = selectBookableCandidates(group.candidate_dates, orderedCandidateIds)

  if (selectedCandidateDates.length === 0) {
    toast.error(
      orderedCandidateIds.length > 0
        ? '却下済みの日程は申請に含められません。有効な候補を選び直してください'
        : '申請する日程を選択してください'
    )
    return false
  }
  
  // 電話番号の検証
  if (!bookingPhone.trim()) {
    toast.error('電話番号を入力してください')
    return false
  }
  
  try { validateCustomerContact(user.email, bookingPhone) }
  catch (error) { toast.error((error as Error).message); return false }
  setIsSubmittingBooking(true)
  
  try {
    const orgId = group.organization_id
    if (!orgId) {
      toast.error('組織情報が取得できません。ページを再読み込みしてください。')
      return false
    }
    if (requestedStores.length === 0) {
      toast.error('希望店舗を1店舗以上選択してください')
      return false
    }

    // 受付締切（公演日の何日前まで）を過ぎた候補があると、申込全体が DB で拒否される。送る前に知らせる（#506）
    // 締切日数が読めないときはここでは止めず、DB の確認に任せる（誤って止めない）
    const deadlineResult = await privateBookingSlotReadApi.getEffectiveDeadlineDays({ scenarioId: group.scenario_master_id, organizationId: orgId, organizationSlug: null })
    const deadlineDays = parseDeadlineDays(deadlineResult)
    const pastDeadline = findPastDeadlineCandidates(selectedCandidateDates, deadlineDays)
    if (pastDeadline.length > 0) {
      toast.error(pastDeadlineMessage(pastDeadline, deadlineDays))
      return false
    }

    const requestedStoreIds = requestedStores.map((store) => store.id)
    const selectedDates = selectedCandidateDates.map((candidate) => candidate.date).sort()
    const availabilityParams: RpcGetPublicPrivateBookingAvailabilityParams = {
      p_organization_id: orgId,
      p_store_ids: requestedStoreIds,
      p_start_date: selectedDates[0],
      p_end_date: selectedDates[selectedDates.length - 1],
    }
    const scenarioTiming = await fetchScenarioTimingFromDb(supabase, {
      organizationId: orgId,
      scenarioLookupId: group.scenario_master_id,
      scenarioMasterId: group.scenario_master_id,
    })
    const [blockedResult, eventsResult] = await Promise.all([
      privateBookingSlotReadApi.getPublicAvailability(availabilityParams),
      privateBookingRequestReadApi.listAvailabilityEvents(orgId, requestedStoreIds, addJstDays(selectedDates[0], -2), addJstDays(selectedDates[selectedDates.length - 1], 2)),
    ])
    if (blockedResult.error) throw blockedResult.error
    if (eventsResult.error) throw eventsResult.error

    const blockedRows = (blockedResult.data || []) as PrivateBookingBlockedSlotRow[]
    const eventRows = eventsResult.data || []
    const unavailableCandidates = findUnavailableCandidates(selectedCandidateDates, requestedStoreIds, blockedRows, eventRows, scenarioTiming)
    if (unavailableCandidates.length > 0) {
      const details = unavailableCandidates.map((candidate) =>
        formatBlockedCandidateLabel(
          { date: candidate.date, timeSlot: candidate.time_slot },
          requestedStores.map((store) => store.name)
        )
      ).join('、')
      toast.error(`${details} は現在受付停止中または既存公演と競合しています。候補を再選択してください`)
      return false
    }

    // 顧客情報を取得または作成
    let customerId: string | null = null
    const customerName = organizerMember?.guest_name || user.email?.split('@')[0] || ''
    const customerEmail = organizerMember?.guest_email || user.email || ''
    const customerPhone = bookingPhone.trim()
    
    // Phase 1 以降、ログイン済み顧客の organization_id = NULL（プラットフォーム共通）
    customerId = await upsertOwnCustomer({
      userId: user.id, name: customerName, phone: customerPhone, email: customerEmail, organizationId: null,
    })
    
    if (!customerId) {
      throw new Error('顧客情報の取得に失敗しました')
    }

    const { data: phoneRow, error: phoneVerifyError } = await bookingConfirmationReadApi.findOwnCustomerPhone(customerId, user.id)
    if (phoneVerifyError || !hasNonEmptyCustomerPhone(phoneRow?.phone)) {
      throw new Error(MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING)
    }
    
    // 予約番号を生成
    const baseReservationNumber = generateReservationNumber()
    


    // 候補日時をJSONB形式で準備（終了は営業枠ではなくシナリオ公演時間）
    const candidateDatetimes = buildCandidateDatetimes(selectedCandidateDates, requestedStores, scenarioTiming, isCustomHoliday)
    
    // 参加人数は申込シートで決めた人数（登録メンバー＋当日来る人。作品の最低〜最大人数の範囲は DB でも確かめる）。
    // 申込後のメンバー追加は作品の最大人数まで（予約の人数では止めない）。
    const bookingParticipantCount = Math.floor(participantCount)

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
    const { data: reservationId, error: rpcError } = await privateGroupRpcApi.createBookingRequestWithNotice({
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
      const errorMessage = bookingRequestErrorMessage(rpcError)
      
      throw new Error(errorMessage)
    }
    
    const parentReservationId = reservationId as string
    
    // 貸切申し込み確認メールを送信
    if (parentReservationId && customerEmail) {
      try {
        const candidateDatesForEmail = selectedCandidateDates
          .map((cd) => ({
            date: cd.date,
            timeSlot: cd.time_slot,
            startTime: cd.start_time,
            endTime: cd.end_time
          }))
        
        const { data: emailData, error: emailError } = await supabase.functions.invoke('send-private-booking-request-confirmation', {
          body: {
            organizationId: orgId,
            reservationId: parentReservationId,
            customerEmail,
            customerName,
            scenarioTitle: group.scenario_masters?.title || 'シナリオ',
            reservationNumber: baseReservationNumber,
            candidateDates: candidateDatesForEmail,
            requestedStores: requestedStoreIds,
            participantCount: bookingParticipantCount,
            estimatedPrice: 0,
            notes: bookingNotes || undefined
          }
        })
        
        if (notificationOutcome({ data: emailData, error: emailError }).status !== 'accepted' || emailData?.email_sent === false) {
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
    return true
  } catch (err) {
    logger.error('予約リクエストエラー:', err)
    toast.error(err instanceof Error ? err.message : '予約リクエストの送信に失敗しました')
    return false
  } finally {
    setIsSubmittingBooking(false)
  }
}
