import { sendRecruitmentXPosts } from '../_shared/recruitment-x.ts'
/**
 * 公演中止判定 Edge Function
 * 
 * この3つだけ。リマインド・全予定一覧は出さない。
 * 1. 予告（前日21:00）: 中止判断と同じ計算を見せるだけ。書かない・メールしない。#運営 のみ
 * 2. 中止判断（前日23:59）: 書いて確定。お客様メール。判定結果を業務連絡
 * 3. 4時間前判断: 延長中オープンだけ開催／中止。お客様メール。判定があるときだけ業務連絡
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, timingSafeEqualString, getServiceRoleKey, isCronOrServiceRoleCall, maskEmail } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'
import { getEmailSettings, getDiscordSettings, sendDiscordNotificationWithRetry, getStoreEmailSettings, replaceTemplateVariables } from '../_shared/organization-settings.ts'

import { recruitmentNotice } from '../_shared/recruitment-notice.ts'

interface CheckRequest {
  check_type: 'day_before' | 'day_before_preview' | 'four_hours_before'
}

/** 21:00予告の送信先。#運営・事務/運営。設定には持たせず予告だけ使う */
const PREVIEW_OPS_CHANNEL_ID = '1415498605996937236'
const PREVIEW_OPS_ORG_SLUG = 'queens-waltz'

interface EventDetail {
  recruitment_deadline?: string | null
  event_id: string
  date: string
  start_time: string
  scenario: string
  store_name: string
  current_participants: number
  max_participants: number
  min_required?: number
  half_required?: number
  result: string
  category?: string
  organization_id: string
  gms: string[]
}

const ALWAYS_HOLD_CATEGORIES = new Set([
  'private',
  'gmtest',
  'testplay',
  'offsite',
  'venue_rental',
  'venue_rental_free',
  'package',
  'mtg',
])

function categoryShortName(category: string | undefined): string {
  switch (category) {
    case 'private': return '貸切'
    case 'gmtest': return 'GMテスト'
    case 'testplay': return 'テスト'
    case 'offsite': return '出張'
    case 'venue_rental':
    case 'venue_rental_free': return '会場レンタル'
    case 'package': return 'パッケージ'
    case 'mtg': return 'MTG'
    case 'open': return 'オープン'
    default: return ''
  }
}

// Cron Secret / Service Role Key による呼び出しかチェック
function isRecruitmentSchedulerCall(req: Request): boolean {
  const expected = Deno.env.get('RECRUITMENT_CRON_SECRET') || ''
  const received = req.headers.get('x-recruitment-cron-secret') || ''
  return !!expected && !!received && timingSafeEqualString(expected, received)
}
function isSystemCall(req: Request): boolean {
  return isCronOrServiceRoleCall(req) || isRecruitmentSchedulerCall(req)
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 環境変数の状態を必ず出力（auth より前 - root cause 調査用）
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const serviceRoleKeyEnv = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')
  console.log('🔍 [DEBUG] env state on entry:', {
    RESEND_API_KEY: resendKey ? `set (len=${resendKey.length}, prefix=${resendKey.slice(0, 6)})` : 'NULL',
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKeyEnv ? `set (len=${serviceRoleKeyEnv.length}, prefix=${serviceRoleKeyEnv.slice(0, 6)})` : 'NULL',
    SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? 'set' : 'NULL',
    SENDER_EMAIL: Deno.env.get('SENDER_EMAIL') ? `set (${Deno.env.get('SENDER_EMAIL')})` : 'NULL',
    SENDER_NAME: Deno.env.get('SENDER_NAME') ? `set` : 'NULL',
    CRON_SECRET: Deno.env.get('CRON_SECRET') ? `set (len=${(Deno.env.get('CRON_SECRET') || '').length})` : 'NULL',
  })

  try {
    // 認証チェック: Cron/システム または管理者のみ
    if (!isSystemCall(req)) {
      const authResult = await verifyAuth(req, ['admin', 'owner', 'license_admin'])
      if (!authResult.success) {
        console.warn('⚠️ 認証失敗: check-performance-cancellation への不正アクセス試行')
        return errorResponse(
          authResult.error || '認証が必要です',
          authResult.statusCode || 401,
          corsHeaders
        )
      }
      console.log('✅ 管理者認証成功:', authResult.user?.email)
    } else {
      console.log('✅ システム認証成功（Cron/トリガー/Service）')
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    const body = await req.json().catch(() => ({}))
    if (isRecruitmentSchedulerCall(req) && !isCronOrServiceRoleCall(req) && body.check_type !== 'recruitment_deadline') {
      throw new Error('Invalid recruitment scheduler scope')
    }
    let check_type = body.check_type as string | undefined
    const PREVIEW_TYPE = 'day_before_preview'
    const allowedTypes = new Set(['day_before', PREVIEW_TYPE, 'four_hours_before', 'recruitment_deadline'])

    // check_typeが未指定の場合、現在時刻に基づいてデフォルトを決定
    if (!check_type || !allowedTypes.has(check_type)) {
      const now = new Date()
      const jstHour = (now.getUTCHours() + 9) % 24
      if (jstHour === 21) {
        check_type = PREVIEW_TYPE
      } else if (jstHour >= 23 || jstHour < 1) {
        check_type = 'day_before'
      } else {
        check_type = 'four_hours_before'
      }
      console.log(`⚠️ check_type未指定/無効: デフォルト "${check_type}" を使用 (JST ${jstHour}時)`)
    }
    const isPreview = check_type === PREVIEW_TYPE

    // target_date: cronがキュー積み時点で計算した対象日付（レースコンディション対策）
    // 渡されない場合は RPC 内で NOW()+1 にフォールバックする
    const target_date = body.target_date as string | undefined
    if (target_date) {
      console.log(`📅 target_date（cronから）: ${target_date}`)
    } else {
      console.log('⚠️ target_date未指定: RPCがNOW()+1で計算します')
    }

    console.log('🔍 公演中止チェック開始:', check_type)

    let result: {
      events_checked: number
      events_confirmed: number
      events_extended?: number
      events_cancelled: number
      details: EventDetail[]
    }

    // RPC関数を実行（RETURNS TABLEは配列を返すため[0]で取得）
    if (check_type === 'day_before' || isPreview) {
      // p_target_date は DATE 型なので文字列のまま渡す（PostgreSQL が自動キャスト）
      const rpcParams: Record<string, unknown> = {}
      if (target_date) rpcParams.p_target_date = target_date
      if (isPreview) rpcParams.p_dry_run = true
      const { data, error } = await serviceClient.rpc('check_performances_day_before', rpcParams)
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      result = {
        events_checked: row?.events_checked ?? 0,
        events_confirmed: row?.events_confirmed ?? 0,
        events_extended: row?.events_extended ?? 0,
        events_cancelled: row?.events_cancelled ?? 0,
        details: row?.details ?? []
      }
    } else if (check_type === 'four_hours_before' || check_type === 'recruitment_deadline') {
      const scoped = check_type === 'recruitment_deadline'
      if (scoped) {
        if (!isSystemCall(req) || typeof body.organization_id !== 'string') throw new Error('Invalid recruitment scheduler call')
        const { data: policy, error: policyError } = await serviceClient.from('performance_recruitment_policies')
          .select('organization_id').eq('organization_id', body.organization_id).eq('one_seat_enabled', true).maybeSingle()
        if (policyError || !policy) throw new Error('Recruitment policy is not enabled')
      }
      const { data, error } = scoped
        ? await serviceClient.rpc('check_performances_with_recruitment_deadlines_for_org', { p_organization_id: body.organization_id })
        : await serviceClient.rpc('check_performances_with_recruitment_deadlines')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      result = {
        events_checked: row?.events_checked ?? 0,
        events_confirmed: row?.events_confirmed ?? 0,
        events_cancelled: row?.events_cancelled ?? 0,
        details: row?.details ?? []
      }
    } else {
      throw new Error('Invalid check_type')
    }

    console.log('📊 チェック結果:', {
      checked: result.events_checked,
      confirmed: result.events_confirmed,
      extended: result.events_extended,
      cancelled: result.events_cancelled
    })

    // 21:00 予告はお客様メール・公演更新をしない。Discord は #運営 だけ。
    if (!isPreview) {
      const notifications: Promise<void>[] = []

      for (const event of result.details) {
        // 個別期限の最終メールはDB outboxが担う（開催決定済みメールの重複ガードと分離）。
        if (event.recruitment_deadline) continue
        if (event.result === 'cancelled') {
          notifications.push(
            sendCancellationNotifications(serviceClient, event, event.recruitment_deadline ? 'recruitment_deadline' : check_type)
          )
        } else if (event.result === 'extended') {
          notifications.push(
            sendExtensionNotification(serviceClient, event)
          )
        } else if (event.result === 'confirmed' && !ALWAYS_HOLD_CATEGORIES.has(event.category || '')) {
          notifications.push(
            sendConfirmationNotification(serviceClient, event)
          )
        }
      }

      await Promise.allSettled(notifications)
    }

    await sendBusinessSummaryNotification(serviceClient, check_type, result, isPreview)
    if (!isPreview && check_type === 'recruitment_deadline') await sendRecruitmentXPosts(serviceClient, body.organization_id, ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET'].map(name => Deno.env.get(name) || ''))
    if (!isPreview) await sendRecruitmentNotices(serviceClient)

    return new Response(
      JSON.stringify({
        success: true,
        check_type,
        ...result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(error.message || '公演中止チェックに失敗しました')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

/**
 * 中止通知を送信（メール + Discord）
 */
async function sendCancellationNotifications(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail,
  checkType: string
): Promise<void> {
  console.log('📧 中止通知送信開始:', event.event_id)

  // 1. 予約者一覧を取得（全ての基本変数に必要な情報を取得）
  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_email, participant_count, reservation_number, total_price, title')
    .eq('schedule_event_id', event.event_id)
    .in('status', ['pending', 'confirmed', 'gm_confirmed'])

  if (resError) {
    console.error('予約取得エラー:', resError)
  }

  // 2. メール設定を取得
  const emailSettings = await getEmailSettings(supabase, event.organization_id)
  
  // 2.5. カスタムテンプレートを取得
  const storeEmailSettings = await getStoreEmailSettings(supabase, {
    organizationId: event.organization_id
  })
  const customTemplate = storeEmailSettings?.performance_cancellation_template
  
  // 2.6. スタッフテーブルを取得（メールアドレスがない予約者のフォールバック用）
  const { data: staffList } = await supabase
    .from('staff')
    .select('name, display_name, email')
    .eq('organization_id', event.organization_id)
  
  // 3. 予約をキャンセル状態に更新（メール設定の有無に関わらず必ず実行）
  if (reservations && reservations.length > 0) {
    const reservationIds = reservations.map(r => r.id)
    const { error: cancelError } = await supabase
      .from('reservations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: checkType === 'day_before' 
          ? '人数未達による公演中止（前日判定）' 
          : checkType === 'recruitment_deadline' ? '人数未達による公演中止（追加募集期限の判定）' : '人数未達による公演中止（4時間前判定）'
      })
      .in('id', reservationIds)

    if (cancelError) {
      console.error('❌ 予約キャンセル更新エラー:', cancelError)
    } else {
      console.log(`✅ 予約キャンセル更新完了: ${reservationIds.length}件`)
    }
  }

  // 4. 各予約者にメール送信（APIキーが設定されている場合のみ）
  // ⚠️ getEmailSettings は内部で env フォールバックしているが、戻り値が null のときに
  //    短絡してしまうケースの保険として、ここでも env を直接フォールバック確認する。
  //    send-cancellation-confirmation と同じ二重フォールバック方式に揃える。
  const resolvedResendApiKey = emailSettings.resendApiKey || Deno.env.get('RESEND_API_KEY') || null
  console.log('🔍 [DEBUG] email送信前チェック:', {
    eventId: event.event_id,
    reservationsCount: reservations?.length ?? 0,
    reservationsWithEmail: (reservations || []).filter(r => !!r.customer_email).length,
    resolvedResendApiKey: resolvedResendApiKey ? `set (len=${resolvedResendApiKey.length})` : 'NULL',
    envHasKey: !!Deno.env.get('RESEND_API_KEY'),
    settingsHasKey: !!emailSettings.resendApiKey
  })
  if (!resolvedResendApiKey) {
    console.error('❌ Resend API キー未設定のため中止メール送信をスキップ:', {
      eventId: event.event_id,
      reservationsCount: reservations?.length || 0,
      envHasKey: !!Deno.env.get('RESEND_API_KEY'),
      settingsHasKey: !!emailSettings.resendApiKey
    })
  }
  if (reservations && reservations.length > 0 && resolvedResendApiKey) {
    // emailSettings を mutating せず、resolvedResendApiKey で上書きしたコピーを渡す
    const effectiveEmailSettings = { ...emailSettings, resendApiKey: resolvedResendApiKey }
    for (const reservation of reservations) {
      // メールアドレスを取得（customer_email → スタッフテーブルからの検索）
      let emailToSend = reservation.customer_email
      if (!emailToSend && reservation.customer_name && staffList) {
        const normalizedName = reservation.customer_name.replace(/様$/, '').trim()
        const matchedStaff = staffList.find(s =>
          s.name === normalizedName || s.display_name === normalizedName
        )
        if (matchedStaff?.email) {
          emailToSend = matchedStaff.email
          console.log('📧 スタッフテーブルからメール取得:', normalizedName)
        }
      }

      if (!emailToSend) {
        console.warn('⚠️ [DEBUG] emailToSend が空のためスキップ:', {
          reservationId: reservation.id,
          reservationNumber: reservation.reservation_number,
          hasCustomerEmail: !!reservation.customer_email,
          hasCustomerName: !!reservation.customer_name
        })
        continue
      }

      try {
        console.log('📮 [DEBUG] sendCancellationEmail 呼び出し開始:', maskEmail(emailToSend), 'reservationNumber=', reservation.reservation_number)
        await sendCancellationEmail(
          supabase,
          effectiveEmailSettings,
          emailToSend,
          reservation.customer_name || 'お客様',
          event,
          customTemplate,
          {
            reservationNumber: reservation.reservation_number,
            participantCount: reservation.participant_count,
            totalPrice: reservation.total_price,
            companyPhone: storeEmailSettings?.company_phone || '',
            companyEmail: storeEmailSettings?.company_email || ''
          }
        )
        console.log('✅ 中止メール送信:', maskEmail(emailToSend))
      } catch (emailError) {
        console.error('❌ メール送信エラー:', maskEmail(emailToSend), emailError instanceof Error ? emailError.message : emailError, emailError instanceof Error ? emailError.stack : undefined)
      }
    }
  }

  // 5. イベント自体を中止状態に更新
  //    履歴用にスナップショットを前後で取得 → schedule_event_history に cancel 行を残す
  const SNAPSHOT_COLUMNS = 'id, organization_id, date, venue, store_id, scenario, scenario_master_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, current_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, is_private_request, reservation_name, time_slot, venue_rental_fee'
  const { data: cancelOldSnapshot } = await supabase
    .from('schedule_events_staff_view')
    .select(SNAPSHOT_COLUMNS)
    .eq('id', event.event_id)
    .maybeSingle()

  const { error: eventUpdateError } = await supabase
    .from('schedule_events')
    .update({
      is_cancelled: true
    })
    .eq('id', event.event_id)

  if (eventUpdateError) {
    console.error('❌ イベント中止フラグ更新エラー:', eventUpdateError)
  } else {
    console.log('✅ イベント中止フラグ更新完了:', event.event_id)
  }

  // 5b. schedule_event_history に system 中止行を残す（失敗してもメインの中止処理は成功扱い）
  if (!eventUpdateError) {
    try {
      const { data: cancelNewSnapshot } = await supabase
        .from('schedule_events_staff_view')
        .select(SNAPSHOT_COLUMNS)
        .eq('id', event.event_id)
        .maybeSingle()
      const cellDate = String(cancelOldSnapshot?.date ?? event.date)
      const cellStoreId = (cancelOldSnapshot?.store_id as string | undefined) ?? null
      const cellTimeSlot = (cancelOldSnapshot?.time_slot as string | null | undefined) ?? null
      if (cellDate && cellStoreId) {
        const cancelReason = checkType === 'day_before'
          ? '人数未達による公演中止（前日判定）'
          : checkType === 'recruitment_deadline' ? '人数未達による公演中止（追加募集期限の判定）' : '人数未達による公演中止（4時間前判定）'
        const { error: historyError } = await supabase
          .from('schedule_event_history')
          .insert({
            schedule_event_id: event.event_id,
            organization_id: event.organization_id,
            event_date: cellDate,
            store_id: cellStoreId,
            time_slot: cellTimeSlot,
            changed_by_user_id: null,
            changed_by_staff_id: null,
            changed_by_name: 'システム（自動中止）',
            action_type: 'cancel',
            changes: { is_cancelled: { old: false, new: true } },
            old_values: cancelOldSnapshot ?? null,
            new_values: cancelNewSnapshot ?? null,
            notes: cancelReason,
          })
        if (historyError) {
          console.error('❌ schedule_event_history insert error:', historyError)
        } else {
          console.log('✅ schedule_event_history に自動中止行を記録:', event.event_id)
        }
      }
    } catch (historyErr) {
      console.error('❌ schedule_event_history 記録中の例外:', historyErr)
    }
  }

  // 6. Discord個別通知は廃止（サマリー通知に統一）
  // 以前: await sendDiscordCancellationNotification(supabase, event, checkType, reservations?.length || 0)

  // 7. ログを更新
  await supabase
    .from('performance_cancellation_logs')
    .update({
      notified_customers: reservations?.length || 0,
      notified_gms: event.gms || []
    })
    .eq('schedule_event_id', event.event_id)
    .eq('check_type', checkType)
}

/**
 * 中止メールを送信
 */
async function sendCancellationEmail(
  supabase: ReturnType<typeof createClient>,
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
  }
): Promise<void> {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  // テンプレート変数（基本変数セット - 全メール共通）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    
    // キャンセル関連
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants),
    cancellation_reason: '人数未達のため中止となりました',
    
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || ''
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = (template: string): string => {
    const htmlContent = template
      .split('\n')
      .map(line => `<p style="margin: 0.5em 0;">${line || '&nbsp;'}</p>`)
      .join('\n')
    
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="padding: 20px 30px;">
    ${htmlContent}
  </div>
</body>
</html>`
  }

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_cancellation_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>公演中止のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fef2f2; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #dc2626; margin-top: 0; font-size: 24px;">
      ⚠️ 公演中止のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #991b1b;">
      誠に申し訳ございませんが、ご予約いただいておりました公演は人数未達のため中止となりました。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">
      中止となった公演
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.scenario}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(event.date)}<br>
          ${formatTime(event.start_time)}〜
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      ご迷惑をおかけして誠に申し訳ございません。<br>
      またのご予約をお待ちしております。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    finalText = `
${customerName} 様

⚠️ 公演中止のお知らせ

誠に申し訳ございませんが、ご予約いただいておりました公演は人数未達のため中止となりました。

━━━━━━━━━━━━━━━━━━━━
中止となった公演
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}

━━━━━━━━━━━━━━━━━━━━

ご迷惑をおかけして誠に申し訳ございません。
またのご予約をお待ちしております。

${emailSettings.senderName}
    `
  }

  const emailSubject = `【公演中止のお知らせ】${event.scenario} - ${event.date}`
  const emailLogId = await insertEmailLog(supabase, {
    organization_id: event.organization_id ?? null,
    email_type:      'performance_cancellation',
    to_email:        customerEmail,
    subject:         emailSubject,
    body_html:       finalHtml,
    body_text:       finalText,
    status:          'queued',
  })

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${emailSettings.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
      to: [customerEmail],
      subject: emailSubject,
      html: finalHtml,
      text: finalText,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    await updateEmailLog(supabase, emailLogId, {
      status: 'failed',
      error_message: sanitizeErrorMessage(JSON.stringify(errorData)),
    })
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
  }

  const resendResult = await response.json()
  await updateEmailLog(supabase, emailLogId, {
    status: 'sent',
    provider_message_id: resendResult?.id ?? null,
    sent_at: new Date().toISOString(),
  })
}

/**
 * Discord に中止通知を送信（GMメンション付き）
 */
async function sendDiscordCancellationNotification(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail,
  checkType: string,
  customerCount: number
): Promise<void> {
  const discordSettings = await getDiscordSettings(supabase, event.organization_id)
  
  if (!discordSettings.webhookUrl) {
    console.log('Discord Webhook未設定、通知スキップ')
    return
  }

  // GMのDiscord IDを取得してメンション文字列を作成
  let gmMentions = ''
  if (event.gms && event.gms.length > 0) {
    const { data: staffList } = await supabase
      .from('staff')
      .select('name, discord_user_id')
      .in('name', event.gms)
      .eq('organization_id', event.organization_id)

    if (staffList && staffList.length > 0) {
      const mentions = staffList
        .filter(s => s.discord_user_id)
        .map(s => `<@${s.discord_user_id}>`)
      gmMentions = mentions.join(' ')
    }
  }

  const checkTypeLabel = checkType === 'day_before' ? '前日判定' : checkType === 'recruitment_deadline' ? '追加募集期限の判定' : '4時間前判定'

  const message = {
    content: gmMentions || undefined,
    embeds: [{
      title: '⚠️ 公演中止',
      color: 0xdc2626, // 赤
      fields: [
        {
          name: 'シナリオ',
          value: event.scenario || '未設定',
          inline: true
        },
        {
          name: '日時',
          value: `${event.date} ${event.start_time?.slice(0, 5) || ''}`,
          inline: true
        },
        {
          name: '会場',
          value: event.store_name || '未定',
          inline: true
        },
        {
          name: '参加者',
          value: `${event.current_participants}/${event.max_participants}名（人数未達）`,
          inline: true
        },
        {
          name: '判定',
          value: checkTypeLabel,
          inline: true
        },
        {
          name: '通知済み予約者',
          value: `${customerCount}名`,
          inline: true
        }
      ],
      footer: {
        text: 'MMQ 公演中止判定システム'
      },
      timestamp: new Date().toISOString()
    }]
  }

  // リトライ機能付きで送信
  const success = await sendDiscordNotificationWithRetry(
    supabase,
    discordSettings.webhookUrl,
    message,
    event.organization_id,
    'performance_cancel',
    event.event_id
  )
  
  if (success) {
    console.log('✅ Discord中止通知送信完了')
  } else {
    console.log('⚠️ Discord中止通知失敗、リトライキューに追加')
  }
}

/**
 * 募集延長通知を送信（メール + Discord）
 */
async function sendExtensionNotification(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail
): Promise<void> {
  console.log('📧 募集延長通知送信開始:', event.event_id)

  // 1. 予約者一覧を取得
  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_email, participant_count, reservation_number, total_price')
    .eq('schedule_event_id', event.event_id)
    .in('status', ['pending', 'confirmed', 'gm_confirmed'])

  if (resError) {
    console.error('予約取得エラー:', resError)
  }

  // 2. メール設定を取得
  const emailSettings = await getEmailSettings(supabase, event.organization_id)
  
  // 2.5. カスタムテンプレートを取得
  const storeEmailSettings = await getStoreEmailSettings(supabase, {
    organizationId: event.organization_id
  })
  const customTemplate = storeEmailSettings?.performance_extension_template

  // 2.6. スタッフテーブルを取得（メールアドレスがない予約者のフォールバック用）
  const { data: staffList } = await supabase
    .from('staff')
    .select('name, display_name, email')
    .eq('organization_id', event.organization_id)

  // 3. 各予約者にメール送信
  if (reservations && reservations.length > 0 && emailSettings.resendApiKey) {
    for (const reservation of reservations) {
      // メールアドレスを取得（customer_email → スタッフテーブルからの検索）
      let emailToSend = reservation.customer_email
      if (!emailToSend && reservation.customer_name && staffList) {
        const normalizedName = reservation.customer_name.replace(/様$/, '').trim()
        const matchedStaff = staffList.find(s => 
          s.name === normalizedName || s.display_name === normalizedName
        )
        if (matchedStaff?.email) {
          emailToSend = matchedStaff.email
          console.log('📧 スタッフテーブルからメール取得:', normalizedName)
        }
      }
      
      if (!emailToSend) continue

      try {
        await sendExtensionEmail(
          emailSettings,
          emailToSend,
          reservation.customer_name || 'お客様',
          event,
          customTemplate,
          {
            reservationNumber: reservation.reservation_number,
            participantCount: reservation.participant_count,
            totalPrice: reservation.total_price,
            companyPhone: storeEmailSettings?.company_phone || '',
            companyEmail: storeEmailSettings?.company_email || ''
          }
        )
        console.log('✅ 延長通知メール送信:', maskEmail(emailToSend))
      } catch (emailError) {
        console.error('❌ メール送信エラー:', maskEmail(emailToSend), emailError)
      }
    }
  }

  // 4. Discord個別通知は廃止（サマリー通知に統一）
  console.log('✅ 募集延長処理完了（Discord通知はサマリーで送信）')
}

/**
 * 募集延長メールを送信
 */
async function sendExtensionEmail(
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
  }
): Promise<void> {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const remainingSeats = event.max_participants - event.current_participants

  // テンプレート変数（基本変数セット対応）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    // キャンセル関連（延長時は空）
    cancellation_fee: '',
    cancellation_reason: '',
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || '',
    // 延長専用変数
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants),
    remaining_seats: String(remainingSeats),
    extension_deadline: '公演4時間前'
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = (template: string): string => {
    const htmlContent = template
      .split('\n')
      .map(line => `<p style="margin: 0.5em 0;">${line || '&nbsp;'}</p>`)
      .join('\n')
    
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="padding: 20px 30px;">
    ${htmlContent}
  </div>
</body>
</html>`
  }

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_extension_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>募集延長のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fef3c7; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #b45309; margin-top: 0; font-size: 24px;">
      ⏰ 募集延長のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #92400e;">
      ご予約いただいている公演は、現在満席ではないため、募集を公演4時間前まで延長いたします。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">
      公演情報
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.scenario}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(event.date)}<br>
          ${formatTime(event.start_time)}〜
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">現在の参加者</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.current_participants}/${event.max_participants}名（あと${remainingSeats}名）</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <p style="margin: 0; color: #1e40af; font-size: 14px;">
      <strong>ご案内</strong><br>
      公演4時間前までに最低開催人数に達した場合は、公演を開催いたします。<br>
      最低開催人数に達しない場合は、中止となりメールでお知らせいたします。
    </p>
  </div>

  <div style="background-color: #dcfce7; border-left: 4px solid #22c55e; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <p style="margin: 0; color: #166534; font-size: 14px;">
      <strong>キャンセルについて</strong><br>
      募集延長中の公演は、キャンセル料無料でキャンセルが可能です。<br>
      ご都合が悪くなった場合は、お気軽にご連絡ください。
    </p>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      お知り合いでご興味のある方がいらっしゃいましたら、ぜひお誘いください。<br>
      ご協力よろしくお願いいたします。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    finalText = `
${customerName} 様

⏰ 募集延長のお知らせ

ご予約いただいている公演は、現在満席ではないため、募集を公演4時間前まで延長いたします。

━━━━━━━━━━━━━━━━━━━━
公演情報
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}
現在の参加者: ${event.current_participants}/${event.max_participants}名（あと${remainingSeats}名）

━━━━━━━━━━━━━━━━━━━━

【ご案内】
公演4時間前までに最低開催人数に達した場合は、公演を開催いたします。
最低開催人数に達しない場合は、中止となりメールでお知らせいたします。

【キャンセルについて】
募集延長中の公演は、キャンセル料無料でキャンセルが可能です。
ご都合が悪くなった場合は、お気軽にご連絡ください。

お知り合いでご興味のある方がいらっしゃいましたら、ぜひお誘いください。
ご協力よろしくお願いいたします。

${emailSettings.senderName}
    `
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${emailSettings.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
      to: [customerEmail],
      subject: `【募集延長】${event.scenario} - ${event.date}`,
      html: finalHtml,
      text: finalText,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
  }
}

/**
 * 開催決定通知を送信（メール）
 */
async function sendConfirmationNotification(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail
): Promise<void> {
  console.log('📧 開催決定通知送信開始:', event.event_id)

  // 1. 予約者一覧を取得
  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_email, participant_count, reservation_number, total_price')
    .eq('schedule_event_id', event.event_id)
    .in('status', ['pending', 'confirmed', 'gm_confirmed'])

  if (resError) {
    console.error('予約取得エラー:', resError)
  }

  // 2. メール設定を取得
  const emailSettings = await getEmailSettings(supabase, event.organization_id)

  // 2.4. 店舗単位テンプレを引くため schedule_event から store_id を解決
  const { data: eventRow } = await supabase
    .from('schedule_events')
    .select('store_id')
    .eq('id', event.event_id)
    .maybeSingle()
  const eventStoreId = (eventRow as { store_id?: string | null } | null)?.store_id ?? undefined

  // 2.45. 重複送信ガード: 既に開催決定メールを送った予約者(to_email)を収集し再送を防ぐ
  //   実際に送信成功したステータス(sent 以降)のみを「送信済み」とみなす。
  //   queued/failed は未送信扱いにして再送対象に含める（queued 詰まりで永久スキップさせない・#323）。
  //   cron リトライ/手動再実行対策。
  const { data: existingConfirmationLogs } = await supabase
    .from('email_logs')
    .select('to_email')
    .eq('schedule_event_id', event.event_id)
    .eq('email_type', 'performance_confirmation')
    .in('status', ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'delivery_delayed'])
  const alreadyNotifiedEmails = new Set(
    (existingConfirmationLogs ?? [])
      .map((log) => (log as { to_email?: string | null }).to_email?.toLowerCase())
      .filter((email): email is string => !!email)
  )
  if (alreadyNotifiedEmails.size > 0) {
    console.log(`📧 開催決定メール送信済みスキップ対象: ${alreadyNotifiedEmails.size}件`, event.event_id)
  }

  // 2.5. カスタムテンプレートを取得（店舗設定を優先し、無ければ組織設定にフォールバック）
  const storeEmailSettings = await getStoreEmailSettings(supabase, {
    storeId: eventStoreId,
    organizationId: event.organization_id
  })
  const customTemplate = storeEmailSettings?.performance_confirmation_template

  // 2.6. スタッフテーブルを取得（メールアドレスがない予約者のフォールバック用）
  const { data: staffList } = await supabase
    .from('staff')
    .select('name, display_name, email')
    .eq('organization_id', event.organization_id)

  // 3. 各予約者にメール送信（送信済みガード: sendCancellationNotifications と同じ二重フォールバック）
  const resolvedResendApiKey = emailSettings.resendApiKey || Deno.env.get('RESEND_API_KEY') || null
  console.log('🔍 [DEBUG] 開催決定メール送信前チェック:', {
    eventId: event.event_id,
    reservationsCount: reservations?.length ?? 0,
    reservationsWithEmail: (reservations || []).filter(r => !!r.customer_email).length,
    resolvedResendApiKey: resolvedResendApiKey ? `set (len=${resolvedResendApiKey.length})` : 'NULL'
  })
  if (!resolvedResendApiKey) {
    console.error('❌ Resend API キー未設定のため開催決定メール送信をスキップ:', event.event_id)
  }
  if (reservations && reservations.length > 0 && resolvedResendApiKey) {
    const effectiveEmailSettings = { ...emailSettings, resendApiKey: resolvedResendApiKey }
    for (const reservation of reservations) {
      // メールアドレスを取得（customer_email → スタッフテーブルからの検索）
      let emailToSend = reservation.customer_email
      if (!emailToSend && reservation.customer_name && staffList) {
        const normalizedName = reservation.customer_name.replace(/様$/, '').trim()
        const matchedStaff = staffList.find(s =>
          s.name === normalizedName || s.display_name === normalizedName
        )
        if (matchedStaff?.email) {
          emailToSend = matchedStaff.email
          console.log('📧 スタッフテーブルからメール取得:', normalizedName)
        }
      }

      if (!emailToSend) continue

      // 重複送信ガード: 既に開催決定メールを送った宛先はスキップ
      if (alreadyNotifiedEmails.has(emailToSend.toLowerCase())) {
        console.log('📧 開催決定メール送信済みのためスキップ:', maskEmail(emailToSend))
        continue
      }

      try {
        await sendConfirmationEmail(
          supabase,
          effectiveEmailSettings,
          emailToSend,
          reservation.customer_name || 'お客様',
          event,
          customTemplate,
          {
            reservationNumber: reservation.reservation_number,
            participantCount: reservation.participant_count,
            totalPrice: reservation.total_price,
            companyPhone: storeEmailSettings?.company_phone || '',
            companyEmail: storeEmailSettings?.company_email || ''
          }
        )
        alreadyNotifiedEmails.add(emailToSend.toLowerCase())
        console.log('✅ 開催決定メール送信:', maskEmail(emailToSend))
      } catch (emailError) {
        console.error('❌ メール送信エラー:', maskEmail(emailToSend), emailError instanceof Error ? emailError.message : emailError)
      }
    }
  }

  console.log('✅ 開催決定処理完了:', event.event_id)
}

/**
 * 開催決定メールを送信
 */
async function sendConfirmationEmail(
  supabase: ReturnType<typeof createClient>,
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
  }
): Promise<void> {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  // テンプレート変数（基本変数セット - 全メール共通）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || '',
    // 開催決定関連
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants)
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = (template: string): string => {
    const htmlContent = template
      .split('\n')
      .map(line => `<p style="margin: 0.5em 0;">${line || '&nbsp;'}</p>`)
      .join('\n')

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="padding: 20px 30px;">
    ${htmlContent}
  </div>
</body>
</html>`
  }

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_confirmation_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>公演開催決定のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dcfce7; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #166534; margin-top: 0; font-size: 24px;">
      🎉 公演開催決定のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #15803d;">
      ご予約いただいている公演は、開催が決定いたしました。当日のご来場をお待ちしております。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">
      公演情報
    </h2>

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.scenario}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(event.date)}<br>
          ${formatTime(event.start_time)}〜
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      当日お会いできることを楽しみにしております。<br>
      お気をつけてお越しください。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    finalText = `
${customerName} 様

🎉 公演開催決定のお知らせ

ご予約いただいている公演は、開催が決定いたしました。当日のご来場をお待ちしております。

━━━━━━━━━━━━━━━━━━━━
公演情報
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}

━━━━━━━━━━━━━━━━━━━━

当日お会いできることを楽しみにしております。
お気をつけてお越しください。

${emailSettings.senderName}
    `
  }

  const emailSubject = `【公演開催決定のお知らせ】${event.scenario} - ${event.date}`

  // 送信前に DB で原子的に「送信権」を確保する（#327）。
  //   queued 行を1件 INSERT できた run だけが送信権を持つ。ユニーク制約(active 集合)に
  //   衝突して claim できなかった場合は既に別 run が送信中/送信済みなので送信しない。
  //   これにより同時実行時に Resend を二重に呼ぶこと自体を防ぐ。
  const { data: claimedId, error: claimError } = await supabase.rpc(
    'claim_performance_confirmation_email',
    {
      p_schedule_event_id: event.event_id,
      p_to_email:          customerEmail,
      p_organization_id:   event.organization_id ?? null,
      p_subject:           emailSubject,
      p_body_html:         finalHtml,
      p_body_text:         finalText,
    }
  )
  if (claimError) {
    // claim 呼び出し自体が失敗した場合は、二重送信を避けるため fail-closed で送信を中止する。
    // 行は作られないため、次回 cron で再 claim → 再送される。
    console.error('❌ 開催決定メール claim 失敗のため送信中止:', maskEmail(customerEmail), claimError.message)
    return
  }
  if (!claimedId) {
    // 別 run が送信中/送信済み。実際の Resend 送信はこの run では行わない。
    console.log('📧 開催決定メール 送信権を確保できずスキップ(claim):', maskEmail(customerEmail))
    return
  }
  const emailLogId = claimedId as string

  // fetch / response.json() が例外を投げた場合でも必ず failed を記録してから re-throw する。
  // これを怠ると status が queued のまま残り、重複ガードが「送信済み」と誤判定して
  // 未送信の予約者への再送が永久にスキップされる（#323）。
  // claim で送信権を確保済みなので、この UPDATE は自分の行の更新でありユニーク制約に衝突しない。
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${emailSettings.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
        to: [customerEmail],
        subject: emailSubject,
        html: finalHtml,
        text: finalText,
      }),
    })

    if (!response.ok) {
      let errorDetail: string
      try {
        errorDetail = JSON.stringify(await response.json())
      } catch {
        errorDetail = `HTTP ${response.status}`
      }
      throw new Error(`Resend API error: ${errorDetail}`)
    }

    const resendResult = await response.json()
    await updateEmailLog(supabase, emailLogId, {
      status: 'sent',
      provider_message_id: resendResult?.id ?? null,
      sent_at: new Date().toISOString(),
    })
  } catch (sendError) {
    await updateEmailLog(supabase, emailLogId, {
      status: 'failed',
      error_message: sanitizeErrorMessage(sendError instanceof Error ? sendError.message : String(sendError)),
    })
    throw sendError
  }
}

/**
 * 判定した公演だけ Discord に出す。貸切・全予定・延長中の再掲は載せない。
 * 予告 → #運営。中止判断・4時間前判断 → 業務連絡。
 */
async function sendBusinessSummaryNotification(
  supabase: ReturnType<typeof createClient>,
  checkType: string,
  result: {
    events_checked: number
    events_confirmed: number
    events_extended?: number
    events_cancelled: number
    details: EventDetail[]
  },
  isPreview = false
): Promise<void> {
  if (result.details.length === 0) {
    console.log('ℹ️ 判定した公演なし、Discord スキップ')
    return
  }

  console.log(isPreview ? '📢 予告を #運営 へ送信開始' : '📢 業務連絡へ判定結果を送信開始')

  const { data: previewOrg } = isPreview
    ? await supabase
        .from('organizations')
        .select('id')
        .eq('slug', PREVIEW_OPS_ORG_SLUG)
        .maybeSingle()
    : { data: null }

  if (isPreview && !previewOrg?.id) {
    console.error('❌ 予告送信先の組織が見つからない:', PREVIEW_OPS_ORG_SLUG)
    return
  }

  const settingsQuery = supabase
    .from('organization_settings')
    .select('organization_id, discord_webhook_url, discord_business_channel_id')

  const { data: orgSettings, error: orgError } = isPreview
    ? await settingsQuery.eq('organization_id', previewOrg!.id)
    : await settingsQuery.not('discord_business_channel_id', 'is', null)

  if (orgError || !orgSettings || orgSettings.length === 0) {
    console.log(isPreview ? '予告用の組織設定なし、通知スキップ' : '業務連絡チャンネル未設定、通知スキップ')
    return
  }

  const kindLabel = isPreview ? '予告' : checkType === 'recruitment_deadline' ? '追加募集の判断' : checkType === 'four_hours_before' ? '4時間前判断' : '中止判断'
  const now = new Date()
  const jstDate = now.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
  const jstTime = now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })

  const firstDate = result.details[0].date
  const targetDateStr = new Date(firstDate + 'T00:00:00+09:00').toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  })

  const getResultLabel = (event: EventDetail): string => {
    if (event.result === 'cancelled') return '【中止】'
    if (event.result === 'extended') return '【募集延長】'
    if (event.result === 'confirmed') {
      const cat = categoryShortName(event.category)
      return cat && event.category !== 'open' ? `【開催決定｜${cat}】` : '【開催決定】'
    }
    return '【不明】'
  }

  for (const org of orgSettings) {
    const channelId = isPreview ? PREVIEW_OPS_CHANNEL_ID : org.discord_business_channel_id
    if (!channelId) continue

    const orgEvents = result.details
      .filter(e => e.organization_id === org.organization_id)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    if (orgEvents.length === 0) {
      console.log(`ℹ️ 判定した公演なし: org=${org.organization_id}, 通知スキップ`)
      continue
    }

    try {
      const discordSettings = await getDiscordSettings(supabase, org.organization_id)
      const uniqueGMs = [...new Set(orgEvents.flatMap(e => e.gms || []))]
      const gmMentionMap: Record<string, string> = {}

      if (uniqueGMs.length > 0) {
        const { data: staffList } = await supabase
          .from('staff')
          .select('name, discord_user_id')
          .in('name', uniqueGMs)
          .eq('organization_id', org.organization_id)

        for (const staff of staffList || []) {
          if (staff.discord_user_id) gmMentionMap[staff.name] = `<@${staff.discord_user_id}>`
        }
      }

      const formatGMs = (gms: string[] | undefined): string => {
        if (!gms || gms.length === 0) return ''
        return gms.map(gm => gmMentionMap[gm] || gm).join(', ')
      }

      const lines: string[] = []
      if (isPreview) {
        lines.push(`📋 **${targetDateStr} 予告**`)
        lines.push('23:59 の中止判断と同じ計算です。まだ公演は変えていません。')
      } else {
        lines.push(`📋 **${targetDateStr} ${kindLabel}**`)
      }
      lines.push('')
      lines.push([
        `判定: ${orgEvents.length}件`,
        `開催決定: ${orgEvents.filter(e => e.result === 'confirmed').length}件`,
        `募集延長: ${orgEvents.filter(e => e.result === 'extended').length}件`,
        `中止: ${orgEvents.filter(e => e.result === 'cancelled').length}件`,
      ].join(' | '))
      lines.push('')

      for (const event of orgEvents) {
        const time = event.start_time?.slice(0, 5) || '??:??'
        const scenario = event.scenario || '未設定'
        const participants = `${event.current_participants}/${event.max_participants}名`
        const gms = formatGMs(event.gms)
        const store = event.store_name || ''
        let line = `${getResultLabel(event)} ${time} **${scenario}** (${participants})`
        if (store) line += ` @${store}`
        if (gms) line += ` GM: ${gms}`
        lines.push(line)
      }

      lines.push('')
      lines.push(`_実行時刻: ${jstDate} ${jstTime}_`)

      const plainMessage = {
        content: lines.join('\n'),
        username: 'MMQ 公演判定システム',
      }

      if (discordSettings.botToken) {
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${discordSettings.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(plainMessage),
        })

        if (response.ok) {
          console.log(`✅ ${kindLabel}通知完了: org=${org.organization_id}`)
        } else {
          console.error(`❌ ${kindLabel}通知失敗: org=${org.organization_id}`, response.status, await response.text())
        }
      } else if (isPreview) {
        console.error('❌ 予告は Bot 必須。Webhook へは落とさない')
      } else if (org.discord_webhook_url) {
        const success = await sendDiscordNotificationWithRetry(
          supabase,
          org.discord_webhook_url,
          plainMessage,
          org.organization_id,
          'performance_check_summary',
          undefined
        )
        console.log(success
          ? `✅ ${kindLabel}通知完了（Webhook）: org=${org.organization_id}`
          : `⚠️ ${kindLabel}通知失敗: org=${org.organization_id}`)
      }
    } catch (error) {
      console.error(`❌ ${kindLabel}通知エラー: org=${org.organization_id}`, error)
    }
  }
}


/** 募集開始と同じDBトランザクションで作られた通知を、リース付きで送信。 */
async function sendRecruitmentNotices(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { data: notices, error } = await supabase.rpc('claim_performance_recruitment_notices')
  if (error) throw new Error('追加募集メールの取得に失敗しました')
  let failed = false
  for (const notice of notices || []) {
    try {
      const settings = await getEmailSettings(supabase, notice.organization_id)
      if (!notice.customer_email || !settings.resendApiKey) throw new Error('追加募集メールの送信設定が不足しています')
      if (notice.kind === 'confirmed' || notice.kind === 'cancelled') {
        const { data: decision, error: decisionError } = await supabase.from('performance_recruitment_deadlines')
          .select('status,cycle').eq('schedule_event_id', notice.schedule_event_id)
          .eq('organization_id', notice.organization_id).single()
        if (decisionError) throw decisionError
        if (decision.status !== notice.kind || decision.cycle !== notice.cycle) {
          const { error: expireError } = await supabase.from('performance_recruitment_notices')
            .update({ status: 'expired', lease_until: null }).eq('id', notice.id).eq('organization_id', notice.organization_id)
          if (expireError) throw expireError
          continue
        }
      }
      // 取得後に開催決定・辞退済みとなった通知は送らない。
      if (notice.kind === 'extension') {
      const { data: current, error: currentError } = await supabase.rpc('respond_to_performance_recruitment', {
        p_token: notice.response_token, p_withdraw: false,
      })
      if (currentError) throw currentError
      if (!current?.can_withdraw) {
        const { error: expireError } = await supabase.from('performance_recruitment_notices')
          .update({ status: 'expired', lease_until: null }).eq('id', notice.id).eq('organization_id', notice.organization_id)
        if (expireError) throw expireError
        continue
      }
      }
      const content = recruitmentNotice(notice.snapshot, notice.response_token, notice.kind)
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.resendApiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `recruitment-${notice.id}` },
        body: JSON.stringify({ from: `${settings.senderName} <${settings.senderEmail}>`,
          to: [notice.customer_email], ...content }),
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`追加募集メール送信失敗: HTTP ${response.status}`)
      const { error: updateError } = await supabase.from('performance_recruitment_notices')
        .update({ status: 'sent', sent_at: new Date().toISOString(), lease_until: null })
        .eq('id', notice.id).eq('organization_id', notice.organization_id)
      if (updateError) throw updateError
    } catch {
      failed = true
      console.error('追加募集メール未送信。次回再試行:', notice.id)
      const { error: failureUpdateError } = await supabase.from('performance_recruitment_notices').update({ status: 'failed', lease_until: new Date(Date.now()+60000).toISOString() })
        .eq('id', notice.id).eq('organization_id', notice.organization_id)
      if (failureUpdateError) throw failureUpdateError
    }
  }
  // 初回失敗・復旧通知を、既存Discord送信処理へ直ちに渡す。再試行は既存キューに残る。
  const { error: discordError } = await supabase.functions.invoke('retry-discord-notifications', { body: { only_recruitment: true } })
  if (discordError) console.error('追加募集のDiscord通知は再試行待ちです')
  if (failed) throw new Error('追加募集メールに未送信があり、再試行待ちです')
}
