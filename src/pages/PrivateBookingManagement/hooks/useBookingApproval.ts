import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useOrganization } from '@/hooks/useOrganization'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { normalizeToJapanCalendarYmd } from '@/lib/japanCalendarDate'
import { GLOBAL_SETTINGS_MSG_SELECT } from '@/lib/constants'
import {
  reservationApi,
  RESERVATION_WITH_CUSTOMER_SELECT_FIELDS,
  joinedCustomerFromReservation,
} from '@/lib/reservationApi'
import type { PrivateBookingRequest } from './usePrivateBookingData'
import type { RpcApprovePrivateBookingParams } from '@/lib/rpcTypes'
import { updatePrivateGroupStatus } from '@/lib/privateGroupStatus'
import { sendEmail } from '@/lib/emailApi'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import { showToast } from '@/utils/toast'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { formatJstDateJa } from '@/utils/jstDate'
import { getDefaultPrivateRejectionTemplate } from '@/lib/templateRegistry'

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// 却下ダイアログの初期本文に入れる既定の理由。テンプレ側に「今後のご検討」等の
// 定型文があるため、ここは具体的な理由1文に留めて重複を避ける。
const DEFAULT_REJECTION_REASON = 'ご希望の日程では貸切での受付が難しい状況です。'
// reservationApi.cancel に渡すキャンセル記録用の理由（メール全文とは別物）
const REJECTION_CANCEL_REASON = '貸切リクエストを却下しました'

function buildRejectionCandidateDatesText(
  candidates: Array<{ date?: string; startTime?: string; endTime?: string }> | undefined
): string {
  if (!candidates || candidates.length === 0) return ''
  return candidates
    .map((c, i) => `候補${i + 1}: ${formatJstDateJa(c.date || '', true) || c.date || ''} ${(c.startTime || '').slice(0, 5)} - ${(c.endTime || '').slice(0, 5)}`)
    .join('\n')
}

// 却下メールの全文を組み立てる（テンプレの差し込み変数を実値に置換）。
// 送信側 send-private-booking-rejection / チャット共有本文と同じ置換ルール。
function buildRejectionEmailBody(template: string, vars: {
  customerName: string
  scenarioTitle: string
  rejectionReason: string
  candidateDatesText: string
  companyName: string
}): string {
  return template
    .replace(/{customer_name}/g, vars.customerName || '')
    .replace(/{scenario_title}/g, vars.scenarioTitle || '')
    .replace(/{rejection_reason}/g, vars.rejectionReason || '')
    .replace(/{candidate_dates}/g, vars.candidateDatesText || '')
    .replace(/{company_name}/g, vars.companyName || '')
}

interface UseBookingApprovalProps {
  onSuccess: () => void | Promise<void>
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
  const [rejectionReason, setRejectionReason] = useState('')  // 却下メールの全文（編集可能）
  const [rejectBodyLoading, setRejectBodyLoading] = useState(false)  // 全文の組み立て中

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
        .from('schedule_events_staff_view')
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

          // 直接重複チェック
          if (candidateStart < eventEnd && candidateEnd > eventStart) {
            setSubmitting(false)
            return {
              success: false,
              error: `${selectedDateYmd} ${candidateStart}〜${candidateEnd} の時間帯には既に「${event.scenario}」(${eventStart}〜${eventEnd})が入っています。`,
            }
          }
          // 60分インターバルチェック（設営・撤収時間）
          if (candidateStart < addMinutesToTime(eventEnd, 60) && addMinutesToTime(candidateEnd, 60) > eventStart) {
            setSubmitting(false)
            return {
              success: false,
              error: `${selectedDateYmd} ${candidateStart}〜${candidateEnd} は「${event.scenario}」(${eventStart}〜${eventEnd})との間隔が60分未満です。設営・撤収時間を確保するため60分以上の間隔が必要です。`,
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
      
      const rpcParams: RpcApprovePrivateBookingParams = {
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
        if (approveError.code === 'P0027') {
          setSubmitting(false)
          return {
            success: false,
            error: 'この時間帯は前後の公演と間隔が60分未満です。設営・撤収時間を確保するため60分以上の間隔が必要です。別の候補日時を選んでください。',
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

      // ✅ RPC成功後すぐに画面を更新（通知・メール・ログはバックグラウンドで実行）
      // onSuccess の完了（一覧再フェッチなど）まで await して、submitting=true を保つ。
      // これにより承認ボタンの再活性化前にリストが最新化され、二度押しでの重複承認を防ぐ。
      await onSuccess()

      // バックグラウンド処理（awaitしない）
      ;(async () => {
        // schedule_events の確定日時と予約料金情報を並列取得
        const [seResult, reservationResult] = await Promise.all([
          scheduleEventId
            ? supabase.from('schedule_events').select('date, start_time, end_time').eq('id', scheduleEventId as string).single()
            : Promise.resolve({ data: null, error: null }),
          supabase.from('reservations').select('total_price, final_price, customer_email, customer_name, reservation_number, customer_notes, private_group_id').eq('id', requestId).single()
        ])

        let notifyEventDate = selectedDateYmd
        let notifyStartTime = selectedCandidate.startTime
        let notifyEndTime = selectedEndTime
        if (seResult.data?.date != null && seResult.data.date !== '') {
          const fromRow = normalizeToJapanCalendarYmd(String(seResult.data.date))
          if (fromRow) notifyEventDate = fromRow
          if (seResult.data.start_time) notifyStartTime = String(seResult.data.start_time).slice(0, 5)
          if (seResult.data.end_time) notifyEndTime = String(seResult.data.end_time).slice(0, 5)
        }

        const updatedReservation = reservationResult.data
        const storeName = stores.find(s => s.id === selectedStoreId)?.name || ''
        const gmIds = requiredGm >= 2 && selectedSubGmId ? [selectedGMId, selectedSubGmId] : [selectedGMId]

        // イベント履歴・確定メール・GM通知・グループ処理を並列実行
        await Promise.all([
          // イベント履歴: フル状態スナップショットを取得して new_values に保存、
          // changed_by_name には「（貸切管理）」サフィックスを付ける
          scheduleEventId && organizationId
            ? (async () => {
                const createdSnapshot = await fetchEventSnapshot(scheduleEventId as string, organizationId)
                const fallback = {
                  scenario: cleanScenarioTitle, date: selectedDateYmd, store_id: selectedStoreId,
                  start_time: selectedCandidate.startTime, end_time: selectedEndTime, gms: gmIds,
                  reservation_name: selectedRequest?.customer_name || '',
                }
                const cellTimeSlot =
                  (createdSnapshot?.time_slot as string | null | undefined) ??
                  selectedCandidate.timeSlot ?? null
                await createEventHistory(
                  scheduleEventId as string, organizationId, 'create', null,
                  createdSnapshot ?? fallback,
                  { date: selectedDateYmd, storeId: selectedStoreId, timeSlot: cellTimeSlot },
                  { notes: '貸切予約承認により作成', source: '貸切管理' }
                )
              })().catch(e => logger.error('createEventHistory error:', e))
            : Promise.resolve(),

          // カスタマー確定メール
          (async () => {
            const customerEmail = selectedRequest?.customer_email || updatedReservation?.customer_email
            const customerName = selectedRequest?.customer_name
            if (!customerEmail || !customerName) return
            const selectedStore = stores.find(s => s.id === selectedStoreId)
            const priceToUse = updatedReservation?.final_price || updatedReservation?.total_price || 0
            const { error: emailErr } = await supabase.functions.invoke('send-private-booking-confirmation', {
              body: {
                organizationId, storeId: selectedStoreId, reservationId: requestId,
                customerEmail, customerName, scenarioTitle: selectedRequest?.scenario_title || '',
                eventDate: notifyEventDate, startTime: notifyStartTime, endTime: notifyEndTime,
                storeName, storeAddress: selectedStore?.address || undefined,
                participantCount: selectedRequest?.participant_count || 0, totalPrice: priceToUse,
                reservationNumber: selectedRequest?.reservation_number || updatedReservation?.reservation_number || '',
                notes: selectedRequest?.notes || updatedReservation?.customer_notes || undefined
              }
            })
            if (emailErr) logger.error('貸切予約確定メール送信エラー:', emailErr)
            else logger.log('貸切予約確定メール送信成功:', customerEmail)
          })(),

          // GM確定通知（複数GMも並列）
          (async () => {
            const { data: notifyStaffRows, error: staffErr } = await supabase
              .from('staff').select('id, name, email, discord_channel_id, discord_user_id').in('id', gmIds)
            if (staffErr) { logger.error('GM通知用スタッフ取得エラー:', staffErr); return }
            await Promise.all((notifyStaffRows || []).map(async row => {
              if (!row?.id) return
              const { data: notifyResult, error: notifyFnError } = await supabase.functions.invoke(
                'notify-gm-private-booking-confirmed',
                { body: {
                  organizationId, gmId: row.id, gmName: row.name, gmEmail: row.email,
                  gmDiscordChannelId: row.discord_channel_id ?? undefined,
                  gmDiscordUserId: row.discord_user_id ?? undefined,
                  scenarioTitle: selectedRequest?.scenario_title || '',
                  eventDate: notifyEventDate, startTime: notifyStartTime, endTime: notifyEndTime,
                  storeName, customerName: selectedRequest?.customer_name || '',
                  participantCount: selectedRequest?.participant_count || 0, reservationId: requestId,
                }}
              )
              if (notifyFnError) {
                logger.error('GM確定通知エラー:', { gmName: row.name, error: notifyFnError })
                showToast.warning(`${row.name} への確定通知の送信に失敗しました。手動でご連絡ください。`)
              } else if (notifyResult?.results?.discord === 'failed') {
                showToast.warning(`${row.name} へのDiscord通知が失敗しました。チャンネル設定またはBot権限をご確認ください。`)
              }
            }))
          })(),

          // グループステータス更新・確定メッセージ・アンケート通知
          (async () => {
            const groupId = updatedReservation?.private_group_id
            if (!groupId) return
            logger.log('予約のグループID:', { requestId, groupId })

            await updatePrivateGroupStatus(groupId, 'confirmed').catch(e => logger.error('グループステータス更新エラー:', e))

            const [organizerResult, msgSettingsResult] = await Promise.all([
              supabase.from('private_group_members').select('id').eq('group_id', groupId).eq('is_organizer', true).single(),
              supabase.from('global_settings').select(GLOBAL_SETTINGS_MSG_SELECT.SCHEDULE_CONFIRMED).eq('organization_id', organizationId).maybeSingle()
            ])
            const organizerMember = organizerResult.data
            if (!organizerMember) return

            const msgSettings = msgSettingsResult.data
            await supabase.from('private_group_messages').insert({
              group_id: groupId,
              member_id: organizerMember.id,
              message: JSON.stringify({
                type: 'system', action: 'schedule_confirmed',
                confirmedDate: notifyEventDate,
                confirmedTimeSlot: selectedCandidate.timeSlot || `${notifyStartTime}〜${notifyEndTime}`,
                storeName,
                title: msgSettings?.system_msg_schedule_confirmed_title || '日程が確定いたしました',
                body: msgSettings?.system_msg_schedule_confirmed_body || 'ご予約ありがとうございます。当日のご来店をお待ちしております。'
              })
            })
            logger.log('グループチャットに日程確定メッセージ送信成功')

            // アンケート通知
            const scenarioMasterId = selectedRequest?.scenario_master_id
            if (!scenarioMasterId) return
            const { data: orgScenarioData } = await supabase
              .from('organization_scenarios_with_master')
              .select('survey_enabled, survey_deadline_days, characters')
              .eq('scenario_master_id', scenarioMasterId).eq('organization_id', organizationId).maybeSingle()
            if (!orgScenarioData?.survey_enabled) return

            const hasPlayableCharacters = Array.isArray(orgScenarioData.characters) && orgScenarioData.characters.some((c: any) => !c.is_npc)
            if (hasPlayableCharacters) {
              const { data: globalSettings } = await supabase.from('global_settings').select('pre_reading_notice_message').eq('organization_id', organizationId).maybeSingle()
              const preReadingMessage = globalSettings?.pre_reading_notice_message || '【ご確認ください】\n\nこのシナリオには事前配役アンケートがございます。\n\n公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。\n\nご不明点がございましたら、店舗までお問い合わせください。'
              await Promise.all([
                supabase.from('private_group_messages').insert({ group_id: groupId, member_id: organizerMember.id, message: JSON.stringify({ type: 'system', action: 'pre_reading_notice', message: preReadingMessage }) }),
                selectedRequest?.customer_email ? sendEmail({ to: selectedRequest.customer_email, subject: '【事前配役アンケートのご案内】', body: preReadingMessage }) : Promise.resolve()
              ])
            } else {
              const confirmedCandidate = selectedRequest?.candidate_datetimes?.candidates?.find((c: any) => c.order === selectedCandidateOrder)
              let deadlineText = ''
              if (confirmedCandidate?.date && orgScenarioData.survey_deadline_days !== undefined) {
                const perfDate = new Date(confirmedCandidate.date + 'T00:00:00+09:00')
                perfDate.setDate(perfDate.getDate() - orgScenarioData.survey_deadline_days)
                deadlineText = `\n\n回答期限: ${perfDate.getMonth() + 1}月${perfDate.getDate()}日まで`
              }
              const surveyMessage = `【事前配役アンケートのご協力のお願い】\n\nこちらの公演では事前配役アンケートへのご回答をお願いしております。\n\n上記の「日程を確認・回答する」ボタンからアンケートにお答えください。${deadlineText}\n\nご不明点がございましたら、お気軽にお問い合わせください。`
              await Promise.all([
                supabase.from('private_group_messages').insert({ group_id: groupId, member_id: organizerMember.id, message: JSON.stringify({ type: 'system', action: 'survey_notice', message: surveyMessage }) }),
                selectedRequest?.customer_email ? sendEmail({ to: selectedRequest.customer_email, subject: '【事前配役アンケートのご案内】', body: surveyMessage }) : Promise.resolve()
              ])
            }
          })()
        ])
      })().catch(err => logger.error('バックグラウンド承認処理エラー:', err))

      return { success: true }
    } catch (error) {
      logger.error('承認エラー:', error)
      return { success: false, error: '承認処理中にエラーが発生しました' }
    } finally {
      setSubmitting(false)
    }
  }, [onSuccess, organizationId, isCustomHoliday])

  // 却下クリック
  // 却下ダイアログを開く。フラグメント（理由）だけでなく、実際に送られる「全文」を
  // 組み立てて編集できるようにする（テンプレ private_rejection_template ＋既定理由）。
  const handleRejectClick = useCallback(async (requestId: string, request?: PrivateBookingRequest | null) => {
    setRejectRequestId(requestId)
    setRejectionReason('')
    setRejectBodyLoading(true)
    setShowRejectDialog(true)
    try {
      // 貸切リクエストは store_id が無いことが多い。送信側と同じく
      // store_id → 無ければ organization_id で email_settings を引く。
      const { data: reservation } = await supabase
        .from('reservations')
        .select('store_id, organization_id, title, customer_name')
        .eq('id', requestId)
        .maybeSingle()

      const storeId = reservation?.store_id as string | undefined
      const orgId = reservation?.organization_id as string | undefined
      let template = ''
      let companyName = ''
      let companyPhone = ''
      let companyEmail = ''
      const settingsSelect = 'private_rejection_template, private_rejection_reason, company_name, company_phone, company_email'
      let settings: { private_rejection_template?: string | null; private_rejection_reason?: string | null; company_name?: string | null; company_phone?: string | null; company_email?: string | null } | null = null
      if (storeId) {
        settings = (await supabase.from('email_settings').select(settingsSelect).eq('store_id', storeId).maybeSingle()).data
      }
      if (!settings && orgId) {
        settings = (await supabase.from('email_settings').select(settingsSelect).eq('organization_id', orgId).limit(1).maybeSingle()).data
      }
      template = settings?.private_rejection_template || ''
      companyName = settings?.company_name || ''
      companyPhone = settings?.company_phone || ''
      companyEmail = settings?.company_email || ''
      if (!template) {
        template = getDefaultPrivateRejectionTemplate(companyName, companyPhone, companyEmail)
      }

      const body = buildRejectionEmailBody(template, {
        customerName: request?.customer_name || reservation?.customer_name || '',
        scenarioTitle: request?.scenario_title || reservation?.title || '',
        // メール設定で編集できる既定理由。未設定ならアプリの固定既定文。
        rejectionReason: settings?.private_rejection_reason || DEFAULT_REJECTION_REASON,
        candidateDatesText: buildRejectionCandidateDatesText(request?.candidate_datetimes?.candidates),
        companyName,
      })
      setRejectionReason(body)
    } catch (e) {
      logger.error('却下メール本文の組み立てエラー:', e)
      setRejectionReason(DEFAULT_REJECTION_REASON)
    } finally {
      setRejectBodyLoading(false)
    }
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
        // 却下メール本文（rejectionReason は全文）はキャンセル記録に流さず、固定の短い理由を渡す。
        // キャンセル確認メールは送らない（後段で却下専用メールを送るため、二重送信になる）。
        await reservationApi.cancel(rejectRequestId, REJECTION_CANCEL_REASON, { skipGroupCancel: true, skipCancellationEmail: true })
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

        // 却下通知（チャット・メール）はバックグラウンドで送信し、画面は即時更新する
        // （従来は直列で20秒以上かかり、その間UIが無反応で「何も起きていない」ように見えた）
        ;(async () => {
          // 候補日時を取得（メール・チャットメッセージ両方で使用）
          const candidateDates = reservation?.candidate_datetimes?.candidates?.map((c: any) => ({
            date: c.date,
            startTime: c.startTime,
            endTime: c.endTime
          })) || []

          // 管理者が却下ダイアログで編集した「全文」(rejectionReason) を、メールにもチャットにも
          // そのまま使う（再テンプレ化しない → 見たまま＝送られる文）。
          const rejectMailCustomerJoined = joinedCustomerFromReservation(reservation?.customers)
          const rejectCustomerEmail = rejectMailCustomerJoined?.email || reservation?.customer_email || selectedRequest?.customer_email
          const rejectCustomerName = rejectMailCustomerJoined?.name || reservation?.customer_name || selectedRequest?.customer_name
          const sharedBody = rejectionReason

          // グループチャットにシステムメッセージを送信
          const { error: msgInsertError } = await supabase
            .from('private_group_messages')
            .insert({
              group_id: reservation.private_group_id,
              member_id: null,
              message: JSON.stringify({
                type: 'system',
                action: 'booking_rejected',
                title: '貸切リクエストが却下されました',
                body: sharedBody
              })
            })
          if (msgInsertError) {
            logger.error('却下メッセージ送信エラー:', msgInsertError)
          }

          // 却下メール（貸切専用）を送信
          if (reservation && rejectCustomerEmail && rejectCustomerName) {
            try {
              const { error: rejectMailError } = await supabase.functions.invoke('send-private-booking-rejection', {
                body: {
                  organizationId,
                  reservationId: reservation.id,
                  customerEmail: rejectCustomerEmail,
                  customerName: rejectCustomerName,
                  scenarioTitle: reservation.title || '',
                  // 管理者が編集した全文をそのまま送る（最優先）
                  customEmailBody: rejectionReason,
                  // 旧Edge Function（customEmailBody 未対応）向けのフォールバック理由
                  rejectionReason: DEFAULT_REJECTION_REASON,
                  candidateDates: candidateDates.length > 0 ? candidateDates : undefined
                }
              })
              if (rejectMailError) {
                logger.error('却下メール送信エラー:', rejectMailError)
              } else {
                logger.log('貸切リクエスト却下メール送信成功')
              }
            } catch (emailError) {
              logger.error('却下メール送信エラー:', emailError)
            }
          } else {
            logger.warn('却下メール送信スキップ: メールアドレスまたは顧客名が取得できませんでした', { rejectCustomerEmail, rejectCustomerName })
          }
        })().catch(err => {
          logger.error('却下通知のバックグラウンド処理エラー:', err)
          showToast.warning('却下は完了しましたが、お客様への通知送信に失敗した可能性があります', '貸切管理から個別にご連絡ください')
        })
      }

      setRejectionReason('')
      setShowRejectDialog(false)
      setRejectRequestId(null)
      showToast.success('貸切リクエストを却下しました', 'お客様への却下連絡はバックグラウンドで送信されます')
      await onSuccess()
    } catch (error) {
      logger.error('却下エラー:', error)
      showToast.error(getSafeErrorMessage(error, '却下処理でエラーが発生しました'))
      // 部分的に処理が進んでいる可能性があるため、一覧を実態に同期する
      setShowRejectDialog(false)
      setRejectRequestId(null)
      await onSuccess()
    } finally {
      setSubmitting(false)
    }
  }, [rejectRequestId, rejectionReason, onSuccess, organizationId])

  // 却下キャンセル
  const handleRejectCancel = useCallback(() => {
    setShowRejectDialog(false)
    setRejectRequestId(null)
    setRejectionReason('')
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
    rejectBodyLoading,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel,
    handleDelete
  }
}

