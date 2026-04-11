import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useOrganization } from '@/hooks/useOrganization'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { normalizeToJapanCalendarYmd } from '@/lib/japanCalendarDate'
import {
  reservationApi,
  RESERVATION_WITH_CUSTOMER_SELECT_FIELDS,
  joinedCustomerFromReservation,
} from '@/lib/reservationApi'
import type { PrivateBookingRequest } from './usePrivateBookingData'

interface UseBookingApprovalProps {
  onSuccess: () => void
}

/**
 * 貸切リクエストの承認・却下処理を管理するフック
 */
export function useBookingApproval({ onSuccess }: UseBookingApprovalProps) {
  // 組織IDを取得（マルチテナント対応）
  const { organizationId } = useOrganization()
  const { isCustomHoliday } = useCustomHolidays()
  
  const [submitting, setSubmitting] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [sendRescheduleNotification, setSendRescheduleNotification] = useState(true)

  // 承認処理
  const handleApprove = useCallback(async (
    requestId: string,
    selectedRequest: PrivateBookingRequest | null,
    selectedGMId: string,
    selectedSubGmId: string | null,
    selectedStoreId: string,
    selectedCandidateOrder: number | null,
    stores: any[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (!selectedGMId || !selectedStoreId || !selectedCandidateOrder) {
      logger.error('承認に必要な情報が不足しています')
      return { success: false, error: '承認に必要な情報が不足しています' }
    }

    const requiredGm = selectedRequest?.required_gm_count ?? 1
    if (requiredGm >= 2) {
      if (!selectedSubGmId?.trim() || selectedSubGmId === selectedGMId) {
        return {
          success: false,
          error:
            '必要GM数が2名のシナリオです。メインGMとサブGMで、異なる2名を選択してください。',
        }
      }
    }

    try {
      setSubmitting(true)

      // 選択された候補日時のみを残す
      const selectedCandidate = selectedRequest?.candidate_datetimes?.candidates?.find(
        c => c.order === selectedCandidateOrder
      )
      
      if (!selectedCandidate) {
        setSubmitting(false)
        return { success: false, error: '候補日時が見つかりません' }
      }

      const selectedDateYmd = normalizeToJapanCalendarYmd(selectedCandidate.date)
      if (!selectedDateYmd) {
        setSubmitting(false)
        return {
          success: false,
          error: '候補日が無効です。画面を更新してから再度お試しください。',
        }
      }

      const resolveEndTime = (
        c: { startTime: string; endTime: string; date: string },
        dateYmd: string
      ) =>
        selectedRequest?.scenario_timing
          ? getPrivateBookingDisplayEndTime(
              c.startTime,
              dateYmd,
              selectedRequest.scenario_timing,
              isCustomHoliday
            )
          : c.endTime

      const selectedEndTime = resolveEndTime(selectedCandidate, selectedDateYmd)

      // 🚨 CRITICAL: 同じ日時・店舗に既存の公演がないかチェック
      // 再承認の場合は、この予約に紐づくイベントを除外する
      const existingEventsQuery = supabase
        .from('schedule_events')
        .select('id, scenario, start_time, end_time, reservation_id')
        .eq('date', selectedDateYmd)
        .eq('store_id', selectedStoreId)
        .neq('is_cancelled', true)
      
      const { data: existingEvents, error: checkError } = await existingEventsQuery

      if (checkError) {
        logger.error('既存公演チェックエラー:', checkError)
      } else if (existingEvents && existingEvents.length > 0) {
        // 時間帯の重複チェック
        const candidateStart = selectedCandidate.startTime
        const candidateEnd = selectedEndTime

        for (const event of existingEvents) {
          // 再承認の場合、同じ予約のイベントは競合チェックから除外
          if (event.reservation_id === requestId) {
            continue
          }
          
          const eventStart = event.start_time?.substring(0, 5) || ''
          const eventEnd = event.end_time?.substring(0, 5) || ''

          // 時間帯が重複しているかチェック
          if (candidateStart < eventEnd && candidateEnd > eventStart) {
            setSubmitting(false)
            return { 
              success: false, 
              error: `${selectedDateYmd} ${candidateStart}〜${candidateEnd} の時間帯には既に「${event.scenario}」(${eventStart}〜${eventEnd})が入っています。` 
            }
          }
        }
      }

      // 全候補日を保持し、選択された候補のみ 'confirmed' にする（各 date を日本暦 YYYY-MM-DD に正規化して保存）
      const updatedCandidates = (selectedRequest?.candidate_datetimes?.candidates || []).map((c: any) => {
        const dateYmd = normalizeToJapanCalendarYmd(c.date) || c.date
        return {
          ...c,
          date: dateYmd,
          endTime: resolveEndTime(c, dateYmd),
          status: c.order === selectedCandidateOrder ? 'confirmed' : 'pending',
        }
      })

      const updatedCandidateDatetimes = {
        ...selectedRequest?.candidate_datetimes,
        candidates: updatedCandidates,
        confirmedStore: selectedRequest?.candidate_datetimes?.requestedStores?.find(
          (s: any) => s.storeId === selectedStoreId
        ) || {
          storeId: selectedStoreId,
          storeName: stores.find(s => s.id === selectedStoreId)?.name || '',
          storeShortName: stores.find(s => s.id === selectedStoreId)?.short_name || ''
        }
      }

      // ✅ SEC-P0-04: 承認はDB側RPCでアトミックに実行（途中失敗の不整合を防ぐ）
      // シナリオタイトルから「【貸切希望】」プレフィックスを除去（schedule_eventsでシナリオマスタとマッチさせるため）
      const cleanScenarioTitle = (selectedRequest?.scenario_title || '')
        .replace(/^【貸切希望】/, '')
        .replace(/^【貸切】/, '')
        .trim()
      
      const rpcParams = {
        p_reservation_id: requestId,
        p_selected_date: selectedDateYmd,
        p_selected_start_time: selectedCandidate.startTime,
        p_selected_end_time: selectedEndTime,
        p_selected_store_id: selectedStoreId,
        p_selected_gm_id: selectedGMId,
        p_candidate_datetimes: updatedCandidateDatetimes,
        p_scenario_title: cleanScenarioTitle,
        p_customer_name: selectedRequest?.customer_name || '',
        p_selected_sub_gm_id: requiredGm >= 2 ? selectedSubGmId : null,
      }
      logger.log('貸切承認RPCパラメータ:', rpcParams)
      
      const { data: scheduleEventId, error: approveError } = await supabase.rpc('approve_private_booking', rpcParams)

      if (approveError) {
        logger.error('貸切承認RPCエラー:', approveError)
        logger.error('RPCエラー詳細:', JSON.stringify(approveError, null, 2))
        if (approveError.code === 'P0019') {
          setSubmitting(false)
          return {
            success: false,
            error: 'この時間帯には既に別の公演が入っています。別の候補を選んでください。'
          }
        }
        if (approveError.code === 'P0025') {
          setSubmitting(false)
          return {
            success: false,
            error: '選択した担当GMはこの時間帯に既に別の予定があります。別のGMまたは候補日時を選んでください。'
          }
        }
        if (approveError.code === 'P0026') {
          setSubmitting(false)
          return {
            success: false,
            error: 'メインGMとサブGMに同じ人は指定できません。別々のスタッフを選んでください。',
          }
        }
        if (approveError.code === 'P0018') {
          setSubmitting(false)
          return {
            success: false,
            error: 'このリクエストは既に処理済みの可能性があります。画面を更新してください。'
          }
        }
        if (approveError.code === 'P0010') {
          setSubmitting(false)
          return { success: false, error: '権限がありません' }
        }
        throw approveError
      }

      logger.log('貸切承認RPC成功:', { requestId, scheduleEventId })

      // 通知・メールは DB に実際に作成された公演日（schedule_events.date）を優先（クライアント保持の候補とズレないようにする）
      let notifyEventDate = selectedDateYmd
      let notifyStartTime = selectedCandidate.startTime
      let notifyEndTime = selectedEndTime
      if (scheduleEventId) {
        const { data: seRow, error: seErr } = await supabase
          .from('schedule_events')
          .select('date, start_time, end_time')
          .eq('id', scheduleEventId as string)
          .single()
        if (seErr) {
          logger.error('承認後スケジュール取得エラー（通知は候補日時を使用）:', seErr)
        } else if (seRow?.date != null && seRow.date !== '') {
          const fromRow = normalizeToJapanCalendarYmd(String(seRow.date))
          if (fromRow) notifyEventDate = fromRow
          if (seRow.start_time) {
            notifyStartTime = String(seRow.start_time).slice(0, 5)
          }
          if (seRow.end_time) {
            notifyEndTime = String(seRow.end_time).slice(0, 5)
          }
        }
      }

      // 貸切予約確定メールを送信
      try {
        // 承認後の予約データを取得（total_priceを含む）
        const { data: updatedReservation, error: reservationError } = await supabase
          .from('reservations')
          .select('total_price, final_price, customer_email, customer_name, reservation_number, customer_notes')
          .eq('id', requestId)
          .single()

        if (reservationError) {
          logger.error('予約データ取得エラー:', reservationError)
        }

        const customerEmail = selectedRequest?.customer_email || updatedReservation?.customer_email
        const customerName = selectedRequest?.customer_name
        if (customerEmail && customerName) {
          const selectedStore = stores.find(s => s.id === selectedStoreId)
          const storeAddress = selectedStore?.address || undefined
          const priceToUse = updatedReservation?.final_price || updatedReservation?.total_price || 0

          await supabase.functions.invoke('send-private-booking-confirmation', {
            body: {
              organizationId,
              storeId: selectedStoreId,
              reservationId: requestId,
              customerEmail,
              customerName,
              scenarioTitle: selectedRequest?.scenario_title || '',
              eventDate: notifyEventDate,
              startTime: notifyStartTime,
              endTime: notifyEndTime,
              storeName: stores.find(s => s.id === selectedStoreId)?.name || '',
              storeAddress,
              participantCount: selectedRequest?.participant_count || 0,
              totalPrice: priceToUse,
              reservationNumber: selectedRequest?.reservation_number || updatedReservation?.reservation_number || '',
              notes: selectedRequest?.notes || updatedReservation?.customer_notes || undefined
            }
          })
          logger.log('貸切予約確定メール送信成功:', customerEmail)
        }
      } catch (emailError) {
        logger.error('メール送信エラー:', emailError)
        // メール送信失敗しても承認処理は続行
      }

      // GMへの確定通知を送信（Discord / メール）— 2名必要ならメイン・サブ両方へ
      try {
        const gmIdsToNotify: string[] =
          requiredGm >= 2 && selectedSubGmId ? [selectedGMId, selectedSubGmId] : [selectedGMId]

        const { data: notifyStaffRows, error: notifyStaffError } = await supabase
          .from('staff')
          .select('id, name, email, discord_channel_id, discord_user_id')
          .in('id', gmIdsToNotify)

        if (notifyStaffError) {
          logger.error('GM通知用スタッフ取得エラー:', notifyStaffError)
        } else {
          const storeName = stores.find(s => s.id === selectedStoreId)?.name || ''
          for (const row of notifyStaffRows || []) {
            if (!row?.id) continue
            const { error: notifyFnError } = await supabase.functions.invoke(
              'notify-gm-private-booking-confirmed',
              {
                body: {
                  organizationId,
                  gmId: row.id,
                  gmName: row.name,
                  gmEmail: row.email,
                  gmDiscordChannelId: row.discord_channel_id ?? undefined,
                  gmDiscordUserId: row.discord_user_id ?? undefined,
                  scenarioTitle: selectedRequest?.scenario_title || '',
                  eventDate: notifyEventDate,
                  startTime: notifyStartTime,
                  endTime: notifyEndTime,
                  storeName,
                  customerName: selectedRequest?.customer_name || '',
                  participantCount: selectedRequest?.participant_count || 0,
                  reservationId: requestId,
                },
              }
            )
            if (notifyFnError) {
              logger.error('GM確定通知Edge Functionエラー:', notifyFnError)
            } else {
              logger.log('GM確定通知リクエスト完了:', row.name)
            }
          }
        }
      } catch (gmNotifyError) {
        logger.error('GM通知送信エラー:', gmNotifyError)
        // GM通知失敗しても承認処理は続行
      }

      // グループチャットに日程確定のシステムメッセージを送信
      try {
        // 予約に紐づくグループIDを取得
        const { data: reservation, error: reservationQueryError } = await supabase
          .from('reservations')
          .select('private_group_id')
          .eq('id', requestId)
          .single()
        
        logger.log('予約のグループID取得結果:', { requestId, private_group_id: reservation?.private_group_id, error: reservationQueryError })

        if (reservation?.private_group_id) {
          // グループのステータスを confirmed に更新
          const { error: groupUpdateError } = await supabase
            .from('private_groups')
            .update({ status: 'confirmed' })
            .eq('id', reservation.private_group_id)
          
          if (groupUpdateError) {
            logger.error('グループステータス更新エラー:', groupUpdateError)
          } else {
            logger.log('グループステータスをconfirmedに更新:', reservation.private_group_id)
          }

          // 主催者のメンバーIDを取得
          const { data: organizerMember } = await supabase
            .from('private_group_members')
            .select('id')
            .eq('group_id', reservation.private_group_id)
            .eq('is_organizer', true)
            .single()

          if (organizerMember) {
            // 設定からメッセージ文言を取得
            const { data: msgSettings } = await supabase
              .from('global_settings')
              .select('system_msg_schedule_confirmed_title, system_msg_schedule_confirmed_body')
              .eq('organization_id', organizationId)
              .maybeSingle()
            
            // 日程確定のシステムメッセージ
            const confirmedMessage = JSON.stringify({
              type: 'system',
              action: 'schedule_confirmed',
              confirmedDate: notifyEventDate,
              confirmedTimeSlot: selectedCandidate.timeSlot || `${notifyStartTime}〜${notifyEndTime}`,
              storeName: stores.find(s => s.id === selectedStoreId)?.name || '',
              // 設定されたメッセージ文言を含める
              title: msgSettings?.system_msg_schedule_confirmed_title || '日程が確定いたしました',
              body: msgSettings?.system_msg_schedule_confirmed_body || 'ご予約ありがとうございます。当日のご来店をお待ちしております。'
            })

            await supabase.from('private_group_messages').insert({
              group_id: reservation.private_group_id,
              member_id: organizerMember.id,
              message: confirmedMessage
            })

            // 事前読み込みシナリオの場合、追加通知を送信
            const preReadingScenarioMasterId = selectedRequest?.scenario_master_id
            if (preReadingScenarioMasterId) {
              const { data: scenarioData } = await supabase
                .from('scenario_masters')
                .select('has_pre_reading')
                .eq('id', preReadingScenarioMasterId)
                .single()

              if (scenarioData?.has_pre_reading) {
                // 全体設定から事前読み込み通知メッセージを取得
                const { data: globalSettings } = await supabase
                  .from('global_settings')
                  .select('pre_reading_notice_message')
                  .eq('organization_id', organizationId)
                  .maybeSingle()

                const preReadingMessage = globalSettings?.pre_reading_notice_message || 
                  '【ご確認ください】\n\nこのシナリオには事前読み込みがございます。\n\n公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。\n\nご不明点がございましたら、店舗までお問い合わせください。'

                const preReadingSystemMessage = JSON.stringify({
                  type: 'system',
                  action: 'pre_reading_notice',
                  message: preReadingMessage
                })

                await supabase.from('private_group_messages').insert({
                  group_id: reservation.private_group_id,
                  member_id: organizerMember.id,
                  message: preReadingSystemMessage
                })
              }
            }

            // アンケートが有効な場合、回答案内を送信
            const scenarioMasterId = selectedRequest?.scenario_master_id
            logger.log('📋 アンケート通知チェック:', { 
              scenarioMasterId, 
              organizationId,
              hasScenarioMasterId: !!selectedRequest?.scenario_master_id,
            })
            
            if (scenarioMasterId) {
              const { data: orgScenarioData, error: orgScenarioError } = await supabase
                .from('organization_scenarios_with_master')
                .select('survey_enabled, survey_deadline_days, characters')
                .eq('scenario_master_id', scenarioMasterId)
                .eq('organization_id', organizationId)
                .maybeSingle()

              logger.log('📋 organization_scenarios取得結果:', { orgScenarioData, orgScenarioError })

              // キャラクターがあるシナリオは配役方法選択が先なので、ここではアンケート通知を送らない
              const hasPlayableCharacters = Array.isArray(orgScenarioData?.characters) && orgScenarioData.characters.some((c: any) => !c.is_npc)

              if (orgScenarioData?.survey_enabled && !hasPlayableCharacters) {
                // 確定日からアンケート期限を計算
                const confirmedCandidate = selectedRequest.candidate_datetimes?.candidates?.find(
                  (c: any) => c.order === selectedCandidateOrder
                )
                let deadlineText = ''
                if (confirmedCandidate?.date && orgScenarioData.survey_deadline_days !== undefined) {
                  const perfDate = new Date(confirmedCandidate.date + 'T00:00:00+09:00')
                  perfDate.setDate(perfDate.getDate() - orgScenarioData.survey_deadline_days)
                  deadlineText = `\n\n回答期限: ${perfDate.getMonth() + 1}月${perfDate.getDate()}日まで`
                }

                const surveyMessage = `【アンケートのご協力のお願い】\n\nこちらの公演では事前アンケートへのご回答をお願いしております。\n\n上記の「日程を確認・回答する」ボタンからアンケートにお答えください。${deadlineText}\n\nご不明点がございましたら、お気軽にお問い合わせください。`

                const surveySystemMessage = JSON.stringify({
                  type: 'system',
                  action: 'survey_notice',
                  message: surveyMessage
                })

                const { error: surveyMsgError } = await supabase.from('private_group_messages').insert({
                  group_id: reservation.private_group_id,
                  member_id: organizerMember.id,
                  message: surveySystemMessage
                })
                
                if (surveyMsgError) {
                  logger.error('📋 アンケート通知送信エラー:', surveyMsgError)
                } else {
                  logger.log('📋 アンケート通知送信成功')
                }
              } else {
                logger.log('📋 アンケートが無効のためスキップ:', { survey_enabled: orgScenarioData?.survey_enabled })
              }
            } else {
              logger.log('📋 scenario_master_idがないためアンケート通知スキップ')
            }

            logger.log('グループチャットに日程確定メッセージ送信成功')
          }
        }
      } catch (msgError) {
        logger.error('グループメッセージ送信エラー:', msgError)
        // メッセージ送信失敗しても承認処理は続行
      }

      onSuccess()
      return { success: true }
    } catch (error) {
      logger.error('承認エラー:', error)
      return { success: false, error: '承認処理中にエラーが発生しました' }
    } finally {
      setSubmitting(false)
    }
  }, [onSuccess, organizationId, isCustomHoliday])

  // 却下クリック
  const handleRejectClick = useCallback((requestId: string) => {
    const defaultMessage = `誠に申し訳ございませんが、ご希望の日程では店舗の空きがなく、貸切での受付が難しい状況です。

別の日程でのご検討をお願いできますでしょうか。
または、通常公演へのご参加も歓迎しております。

ご不明点等ございましたら、お気軽にお問い合わせください。`
    
    setRejectionReason(defaultMessage)
    setRejectRequestId(requestId)
    setShowRejectDialog(true)
  }, [])

  // 却下確定
  const handleRejectConfirm = useCallback(async (selectedRequest?: PrivateBookingRequest | null) => {
    if (!rejectRequestId || !rejectionReason.trim()) return

    try {
      setSubmitting(true)

      // 予約情報を取得（メール送信用）
      const { data: reservation, error: fetchError } = await supabase
        .from('reservations')
        .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
        .eq('id', rejectRequestId)
        .single()

      if (fetchError) throw fetchError

      // 予約をキャンセル（在庫返却 + 通知）
      // 貸切予約の却下なので、reservationApi.cancel()を使用してキャンセル待ち通知も送信
      // ただしグループはキャンセルせず、候補日選択フェーズに戻す
      // 既にキャンセル済みの場合はスキップ
      if (reservation?.status !== 'cancelled') {
        await reservationApi.cancel(rejectRequestId, rejectionReason, { skipGroupCancel: true })
      }
      
      // 関連するグループを候補日選択フェーズに戻し、候補日を rejected にする。
      // 直接 UPDATE は RLS で主催者のみ許可のため、店舗スタッフでは 0 件になる。RPC で更新する。
      if (reservation?.private_group_id) {
        const { error: rejectSyncError } = await supabase.rpc(
          'mark_private_group_rejected_after_booking_rejection',
          { p_reservation_id: rejectRequestId }
        )
        if (rejectSyncError) {
          logger.error('貸切却下: グループ・候補日の同期 RPC エラー:', rejectSyncError)
          throw rejectSyncError
        }
        logger.log('グループを date_adjusting・候補日を rejected に同期:', reservation.private_group_id)
        
        // 日程再調整の通知を送信する場合
        if (sendRescheduleNotification) {
          // システムメッセージ設定を取得
          const { data: settings } = await supabase
            .from('global_settings')
            .select('system_msg_booking_rejected_title, system_msg_booking_rejected_body')
            .eq('organization_id', organizationId)
            .maybeSingle()
          
          const title = settings?.system_msg_booking_rejected_title || '日程の再調整をお願いします'
          const body = settings?.system_msg_booking_rejected_body || '店舗の都合がつかず、ご希望の日程でのご予約をお受けすることができませんでした。お手数ですが、別の候補日を選択のうえ再度お申し込みください。'
          
          // グループチャットにシステムメッセージを送信
          await supabase
            .from('private_group_messages')
            .insert({
              group_id: reservation.private_group_id,
              sender_type: 'system',
              message: JSON.stringify({
                type: 'system',
                action: 'booking_rejected',
                title,
                body,
                rejectionReason: rejectionReason
              })
            })

          // 却下メール（貸切専用）を送信
          const rejectMailCustomer = joinedCustomerFromReservation(reservation?.customers)
          if (reservation && rejectMailCustomer) {
            try {
              // 候補日時を取得
              const candidateDates = reservation.candidate_datetimes?.candidates?.map((c: any) => ({
                date: c.date,
                startTime: c.startTime,
                endTime: c.endTime
              })) || []

              await supabase.functions.invoke('send-private-booking-rejection', {
                body: {
                  organizationId,
                  reservationId: reservation.id,
                  customerEmail: rejectMailCustomer.email,
                  customerName: rejectMailCustomer.name,
                  scenarioTitle: reservation.title || '',
                  rejectionReason: rejectionReason,
                  candidateDates: candidateDates.length > 0 ? candidateDates : undefined
                }
              })
              logger.log('貸切リクエスト却下メール送信成功')
            } catch (emailError) {
              logger.error('却下メール送信エラー:', emailError)
            }
          }
        }
      }

      setRejectionReason('')
      setSendRescheduleNotification(true)
      setShowRejectDialog(false)
      setRejectRequestId(null)
      onSuccess()
    } catch (error) {
      logger.error('却下エラー:', error)
    } finally {
      setSubmitting(false)
    }
  }, [rejectRequestId, rejectionReason, sendRescheduleNotification, onSuccess, organizationId])

  // 却下キャンセル
  const handleRejectCancel = useCallback(() => {
    setShowRejectDialog(false)
    setRejectRequestId(null)
    setRejectionReason('')
    setSendRescheduleNotification(true)
  }, [])

  // 完全削除
  const handleDelete = useCallback(async (requestId: string) => {
    if (!confirm('この申込を完全に削除しますか？\n\nこの操作は取り消せません。関連するグループ、メッセージ、候補日程も削除されます。')) {
      return
    }
    
    setSubmitting(true)
    try {
      // 予約情報を取得
      const { data: reservation, error: fetchError } = await supabase
        .from('reservations')
        .select('id, private_group_id')
        .eq('id', requestId)
        .single()
      
      if (fetchError) {
        logger.error('予約情報取得エラー:', fetchError)
        throw new Error('予約情報の取得に失敗しました')
      }
      
      const privateGroupId = reservation?.private_group_id
      
      // グループが紐づいている場合は関連データも削除
      if (privateGroupId) {
        // グループメッセージを削除
        await supabase
          .from('private_group_messages')
          .delete()
          .eq('group_id', privateGroupId)
        
        // 候補日程の回答を削除
        const { data: candidateDates } = await supabase
          .from('private_group_candidate_dates')
          .select('id')
          .eq('group_id', privateGroupId)
        
        if (candidateDates && candidateDates.length > 0) {
          const dateIds = candidateDates.map(d => d.id)
          await supabase
            .from('private_group_date_responses')
            .delete()
            .in('candidate_date_id', dateIds)
        }
        
        // 候補日程を削除
        await supabase
          .from('private_group_candidate_dates')
          .delete()
          .eq('group_id', privateGroupId)
        
        // グループメンバーを削除
        await supabase
          .from('private_group_members')
          .delete()
          .eq('group_id', privateGroupId)
        
        // グループを削除
        await supabase
          .from('private_groups')
          .delete()
          .eq('id', privateGroupId)
      }
      
      // GM回答を削除
      await supabase
        .from('gm_availability_responses')
        .delete()
        .eq('reservation_id', requestId)
      
      // 予約を削除
      // eslint-disable-next-line no-restricted-syntax -- 貸切予約リクエストの却下処理のため直接削除が必要
      const { error: deleteError } = await supabase
        .from('reservations')
        .delete()
        .eq('id', requestId)
      
      if (deleteError) {
        logger.error('予約削除エラー:', deleteError)
        throw new Error('予約の削除に失敗しました')
      }
      
      logger.log('貸切申込を完全に削除しました:', requestId)
      onSuccess()
    } catch (error) {
      logger.error('削除エラー:', error)
      alert(error instanceof Error ? error.message : '削除に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }, [onSuccess])

  return {
    submitting,
    showRejectDialog,
    rejectionReason,
    setRejectionReason,
    sendRescheduleNotification,
    setSendRescheduleNotification,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel,
    handleDelete
  }
}

