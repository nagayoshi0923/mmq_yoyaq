/**
 * 貸切グループから店舗へ予約リクエストを送る（主催者の操作）。index.tsx の handleSubmitBooking から中身を変えずに移したもの。
 * 判断は ./bookingRequest.ts の関数、通信と画面の表示（トースト・シートの開閉）はここで行う。
 */
import { addJstDays } from '@/utils/jstDate'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { bookingConfirmationReadApi } from '@/lib/api/bookingConfirmationReadApi'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { privateBookingSlotReadApi } from '@/lib/api/scheduleHookReadApi'
import { privateBookingRequestReadApi } from '@/lib/api/privateBookingRequestReadApi'
import { logger } from '@/utils/logger'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
import { fetchScenarioTimingFromDb } from '@/lib/privateBookingScenarioTime'
import { resolvePrivateGroupBookingParticipantCount } from '@/lib/privateGroupPlayerCap'
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
  bookingSelectedDates: Set<string>
  bookingPhone: string
  bookingNotes: string
  preferredStoreNames: Array<{ id: string; name: string }>
  organizerMember: GroupMember | undefined
  isCustomHoliday: (date: string) => boolean
  setIsSubmittingBooking: (v: boolean) => void
  closeSheetReplace: () => void
  setBookingNotes: (v: string) => void
  setBookingSelectedDates: (v: Set<string>) => void
  refetch: () => void
}

export async function submitGroupBookingRequest({
  group, user, isOrganizer, canMutateScheduleBeforeStoreReply, bookingSelectedDates, bookingPhone, bookingNotes,
  preferredStoreNames, organizerMember, isCustomHoliday, setIsSubmittingBooking, closeSheetReplace, setBookingNotes,
  setBookingSelectedDates, refetch,
}: SubmitBookingRequestContext): Promise<void> {
  if (!isOrganizer || !group || !user) return
  if (!canMutateScheduleBeforeStoreReply) {
    toast.error('店舗の返答待ちのため、予約リクエストを送信できません')
    return
  }

  const selectedCandidateDates = selectBookableCandidates(group.candidate_dates, bookingSelectedDates)

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
    if (preferredStoreNames.length === 0) {
      toast.error('希望店舗を1店舗以上選択してください')
      return
    }

    // 受付締切（公演日の何日前まで）を過ぎた候補があると、申込全体が DB で拒否される。送る前に知らせる（#506）
    // 締切日数が読めないときはここでは止めず、DB の確認に任せる（誤って止めない）
    const deadlineResult = await privateBookingSlotReadApi.getEffectiveDeadlineDays({ scenarioId: group.scenario_master_id, organizationId: orgId, organizationSlug: null })
    const deadlineDays = parseDeadlineDays(deadlineResult)
    const pastDeadline = findPastDeadlineCandidates(selectedCandidateDates, deadlineDays)
    if (pastDeadline.length > 0) {
      toast.error(pastDeadlineMessage(pastDeadline, deadlineDays))
      return
    }

    const requestedStoreIds = preferredStoreNames.map((store) => store.id)
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
          preferredStoreNames.map((store) => store.name)
        )
      ).join('、')
      toast.error(`${details} は現在受付停止中または既存公演と競合しています。候補を再選択してください`)
      return
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
    const candidateDatetimes = buildCandidateDatetimes(selectedCandidateDates, preferredStoreNames, scenarioTiming, isCustomHoliday)
    
    // 参加人数は作品定員。今いるメンバー数で受けると、あとから追加できなくなる。
    const scenarioForBookingCap = group.scenario_masters as {
      effective_player_count_max?: number
      player_count_max?: number
    } | undefined
    const scenarioPlayerMax =
      scenarioForBookingCap?.effective_player_count_max ??
      scenarioForBookingCap?.player_count_max ??
      null
    const bookingParticipantCount = resolvePrivateGroupBookingParticipantCount({
      scenarioPlayerMax,
      targetParticipantCount: group.target_participant_count,
    })

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
        const candidateDatesForEmail = group.candidate_dates
          ?.filter((cd) => bookingSelectedDates.has(cd.id))
          .map((cd) => ({
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
