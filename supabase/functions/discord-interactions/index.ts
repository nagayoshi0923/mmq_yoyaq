// Discord インタラクション処理（署名検証付き + Deferred Response対応）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, checkRateLimit, getClientIP, rateLimitResponse, getServiceRoleKey } from '../_shared/security.ts'

const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY_V2') || Deno.env.get('DISCORD_PUBLIC_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function timeToMinutes(time: string): number {
  const [h, m] = (time || '').split(':')
  return (parseInt(h || '0', 10) * 60) + parseInt(m || '0', 10)
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  const aS = timeToMinutes(startA)
  const aE = timeToMinutes(endA)
  const bS = timeToMinutes(startB)
  const bE = timeToMinutes(endB)
  return aS < bE && aE > bS
}

async function computeConflictCandidateIndexes(
  requestId: string,
  gmName: string
): Promise<Set<number>> {
  const { data: reservation } = await supabase
    .from('reservations')
    .select('candidate_datetimes, organization_id')
    .eq('id', requestId)
    .single()

  const orgId = reservation?.organization_id
  const candidates = reservation?.candidate_datetimes?.candidates || []
  if (!orgId || !candidates.length) return new Set()

  const dates = Array.from(new Set(candidates.map((c: any) => c.date).filter(Boolean)))
  if (!dates.length) return new Set()

  const { data: events } = await supabase
    .from('schedule_events')
    .select('date, start_time, end_time, gms')
    .eq('organization_id', orgId)
    .eq('is_cancelled', false)
    .in('date', dates)
    .contains('gms', [gmName])

  const conflictIdx = new Set<number>()
  candidates.forEach((c: any, idx: number) => {
    const cStart = (c.startTime || '').substring(0, 5)
    const cEnd = (c.endTime || '').substring(0, 5)
    if (!c.date || !cStart || !cEnd) return

    const dateEvents = (events || []).filter((e: any) => e.date === c.date)
    const has = dateEvents.some((e: any) => {
      const eStart = (e.start_time || '').substring(0, 5)
      const eEnd = (e.end_time || '').substring(0, 5)
      if (!eStart || !eEnd) return false
      return overlaps(cStart, cEnd, eStart, eEnd)
    })
    if (has) conflictIdx.add(idx)
  })

  return conflictIdx
}

// Discord署名検証
async function verifySignature(
  request: Request,
  body: string
): Promise<boolean> {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  
  if (!signature || !timestamp) {
    console.log('Missing signature or timestamp')
    return false
  }

  const encoder = new TextEncoder()
  const message = encoder.encode(timestamp + body)
  const sig = hexToUint8Array(signature)
  const key = hexToUint8Array(DISCORD_PUBLIC_KEY)

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      sig,
      message
    )
    
    console.log('Signature verification:', isValid)
    return isValid
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
}

// Note: Discord署名検証リクエストはDiscordサーバーから来るため、
// CORS制限を適用しつつDiscord署名ヘッダーも許可

// 全て不可処理をバックグラウンドで実行
async function processUnavailable(interaction: any, requestId: string) {
  try {
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select('candidate_datetimes, title, organization_id, customer_name, participant_count, created_at')
      .eq('id', requestId)
      .single()
    
    if (error) throw error
    
    const organizationId = reservation.organization_id
    const candidates = reservation.candidate_datetimes?.candidates || []
    const scenarioTitle = reservation.title || '貸切予約'
    
    const gmUserId = interaction.member?.user?.id
    const gmUserName = interaction.member?.nick || interaction.member?.user?.global_name || interaction.member?.user?.username || 'Unknown GM'
    
    let staffId = null
    let staffNameForConflict: string | null = null
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, name')
      .eq('discord_user_id', gmUserId)
      .single()
    
    if (staffData) {
      staffId = staffData.id
      staffNameForConflict = staffData.name || null
    }

    if (!staffId) {
      console.error('❌ Staff not found for Discord user ID:', gmUserId)
      const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
      await fetch(webhookUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'エラー: スタッフが見つかりません。Discord IDの設定を確認してください。' })
      }).catch(e => console.error('Failed to send error message:', e))
      return
    }
    
    // 全て不可として保存
    await supabase
      .from('gm_availability_responses')
      .upsert({
        organization_id: organizationId,
        reservation_id: requestId,
        staff_id: staffId,
        gm_discord_id: gmUserId,
        gm_name: gmUserName,
        response_type: 'unavailable',
        selected_candidate_index: null,
        response_datetime: new Date().toISOString(),
        notes: 'Discord経由で回答: 全て出勤不可',
        response_status: 'all_unavailable',
        available_candidates: [],
        response_history: [{ timestamp: new Date().toISOString(), action: 'all_unavailable' }],
        responded_at: new Date().toISOString()
      }, {
        onConflict: 'reservation_id,staff_id'
      })
    
    await supabase
      .from('reservations')
      .update({ status: 'pending_store' })
      .eq('id', requestId)
      .in('status', ['pending', 'pending_gm'])
    
    // メッセージとボタンを作成（全て緑に戻す）
    const candidateCount = candidates.length
    const createdDate = new Date(reservation.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    
    let responseMessage = `**【貸切希望】${scenarioTitle}（候補${candidateCount}件）を受け付けました。**\n`
    responseMessage += `出勤可能な日程を選択してください。\n\n`
    responseMessage += `**予約受付日：** ${createdDate}\n`
    responseMessage += `**シナリオ：** ${scenarioTitle}\n`
    responseMessage += `**参加人数：** ${reservation.participant_count}名\n`
    responseMessage += `**予約者：** ${reservation.customer_name || '名前不明'}\n\n`
    responseMessage += `【現在の選択】\n全て不可と回答しました。`
    
    const timeSlotMap = { '朝': '朝', '昼': '昼', '夜': '夜', 'morning': '朝', 'afternoon': '昼', 'evening': '夜' }
    const responseComponents = []
    
    for (let i = 0; i < Math.min(candidates.length, 6); i++) {
      const candidate = candidates[i]
      const dm = candidate.date.match(/\d{4}-(\d{2})-(\d{2})/)
      const dateStr = dm ? `${parseInt(dm[1])}/${parseInt(dm[2])}` : candidate.date
      const timeSlot = timeSlotMap[candidate.timeSlot] || candidate.timeSlot
      
      if (i % 5 === 0) {
        responseComponents.push({ type: 1, components: [] })
      }
      
      responseComponents[responseComponents.length - 1].components.push({
        type: 2,
        style: 3, // 緑色
        label: `候補${i + 1}: ${dateStr} ${timeSlot} ${candidate.startTime}-${candidate.endTime}`,
        custom_id: `date_${i + 1}_${requestId}`
      })
    }
    
    responseComponents.push({
      type: 1,
      components: [{
        type: 2,
        style: 4,
        label: '全て不可',
        custom_id: `gm_unavailable_${requestId}`
      }]
    })
    
    const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
    await fetch(webhookUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: responseMessage, components: responseComponents })
    })
  } catch (error) {
    console.error('Error processing unavailable:', error)
  }
}

// 日程選択処理をバックグラウンドで実行
async function processDateSelection(interaction: any, dateIndex: number, requestId: string) {
  try {
    // Supabaseから候補日程を取得
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select('candidate_datetimes, title, organization_id, customer_name, participant_count, created_at')
      .eq('id', requestId)
      .single()
    
    if (error) {
      console.error('❌ Error fetching reservation:', error)
      throw error
    }
    
    const organizationId = reservation.organization_id
    const candidates = reservation.candidate_datetimes?.candidates || []
    const selectedCandidate = candidates[dateIndex]
    
    if (!selectedCandidate) {
      throw new Error('Selected candidate not found')
    }
    
    const dateMatch = selectedCandidate.date.match(/\d{4}-(\d{2})-(\d{2})/)
    const dateStr = dateMatch ? `${parseInt(dateMatch[1])}/${parseInt(dateMatch[2])}` : selectedCandidate.date
    const timeSlotMap = {
      '朝': '朝',
      '昼': '昼', 
      '夜': '夜',
      'morning': '朝',
      'afternoon': '昼',
      'evening': '夜'
    }
    const timeSlot = timeSlotMap[selectedCandidate.timeSlot] || selectedCandidate.timeSlot
    const selectedDate = `${dateStr} ${timeSlot} ${selectedCandidate.startTime}-${selectedCandidate.endTime}`
    
    // GMの回答をデータベースに保存
    const gmUserId = interaction.member?.user?.id
    const gmUserName = interaction.member?.nick || interaction.member?.user?.global_name || interaction.member?.user?.username || 'Unknown GM'
    
    console.log('👤 GM User:', { id: gmUserId, name: gmUserName })
    
    // Discord IDからstaff_idを取得
    let staffId = null
    let staffNameForConflict: string | null = null
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, name')
      .eq('discord_user_id', gmUserId)
      .single()
    
    if (staffError || !staffData) {
      console.error('❌ Staff not found for Discord user ID:', gmUserId, staffError)
      const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
      await fetch(webhookUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'エラー: スタッフが見つかりません。Discord IDの設定を確認してください。' })
      }).catch(e => console.error('Failed to send error message:', e))
      return
    }
    
    staffId = staffData.id
    staffNameForConflict = staffData.name || null
    console.log('✅ Found staff_id:', staffId)
    
    // 既存の回答を取得して、複数日程を追加する形にする
    const { data: existingResponse } = await supabase
      .from('gm_availability_responses')
      .select('available_candidates, response_history')
      .eq('reservation_id', requestId)
      .eq('staff_id', staffId)
      .single()
    
    // 既存の選択済み日程を取得
    let availableCandidates = existingResponse?.available_candidates || []
    
    // 既に選択されているかチェック
    const isAlreadySelected = availableCandidates.includes(dateIndex)
    
    if (isAlreadySelected) {
      // 既に選択済みの場合は削除（トグル動作）
      availableCandidates = availableCandidates.filter(idx => idx !== dateIndex)
      console.log(`🔄 Toggling off date index ${dateIndex}`)
    } else {
      // 新しく追加
      availableCandidates = [...availableCandidates, dateIndex]
      console.log(`➕ Adding date index ${dateIndex}`)
    }
    
    // 履歴レコードを作成
    const historyEntry = {
      timestamp: new Date().toISOString(),
      action: isAlreadySelected ? 'removed' : 'added',
      date_index: dateIndex,
      date_string: selectedDate
    }
    
    // 既存の履歴を取得して追加
    const responseHistory = existingResponse?.response_history || []
    responseHistory.push(historyEntry)
    
    // 日程情報を組み立て
    const selectedDates = availableCandidates.map(idx => {
      const c = candidates[idx]
      const dm = c.date.match(/\d{4}-(\d{2})-(\d{2})/)
      const ds = dm ? `${parseInt(dm[1])}/${parseInt(dm[2])}` : c.date
      const ts = timeSlotMap[c.timeSlot] || c.timeSlot
      return `${ds} ${ts} ${c.startTime}-${c.endTime}`
    })
    
    // response_typeを決定
    let responseType = 'available'
    let responseStatus = 'available'
    if (availableCandidates.length === 0) {
      responseType = 'unavailable'
      responseStatus = 'all_unavailable'
    }
    
    // gm_availability_responsesテーブルに保存 (upsert)
    const { data: gmResponse, error: gmError } = await supabase
      .from('gm_availability_responses')
      .upsert({
        organization_id: organizationId,
        reservation_id: requestId,
        staff_id: staffId,
        gm_discord_id: gmUserId,
        gm_name: gmUserName,
        response_type: responseType,
        selected_candidate_index: availableCandidates.length > 0 ? availableCandidates[0] : null,
        response_datetime: new Date().toISOString(),
        notes: availableCandidates.length > 0 
          ? `Discord経由で回答: ${selectedDates.join(', ')}` 
          : 'Discord経由で回答: 全て出勤不可',
        response_status: responseStatus,
        available_candidates: availableCandidates,
        response_history: responseHistory,
        responded_at: new Date().toISOString()
      }, {
        onConflict: 'reservation_id,staff_id'
      })
    
    if (gmError) {
      console.error('❌ Error saving GM response:', gmError)
      throw gmError
    } else {
      console.log('✅ GM response saved to database:', gmResponse)
      
      // GMが1人でも回答したら、リクエストのステータスを「店舗確認待ち」に更新
      const { error: updateError } = await supabase
        .from('reservations')
        .update({ status: 'pending_store' })
        .eq('id', requestId)
        .in('status', ['pending', 'pending_gm'])  // pending または pending_gm の場合に更新
      
      if (updateError) {
        console.error('❌ Error updating reservation status:', updateError)
      } else {
        console.log('✅ Reservation status updated to pending_store')
      }
    }
    
    // レスポンスメッセージを作成
    const scenarioTitle = reservation.title || '貸切予約'
    const candidateCount = candidates.length
    const createdDate = new Date(reservation.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    
    let responseMessage = `**【貸切希望】${scenarioTitle}（候補${candidateCount}件）を受け付けました。**\n`
    responseMessage += `出勤可能な日程を選択してください。\n\n`
    responseMessage += `**予約受付日：** ${createdDate}\n`
    responseMessage += `**シナリオ：** ${scenarioTitle}\n`
    responseMessage += `**参加人数：** ${reservation.participant_count}名\n`
    responseMessage += `**予約者：** ${reservation.customer_name || '名前不明'}`
    
    // 【現在の選択】を追加
    if (availableCandidates.length > 0) {
      responseMessage += `\n\n【現在の選択】\n${selectedDates.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
    } else {
      responseMessage += `\n\n【現在の選択】\nなし`
    }
    
    // 候補日程ボタンを再表示（選択/解除を続けられるように）
    const responseComponents = []
    for (let i = 0; i < Math.min(candidates.length, 6); i++) {
      const candidate = candidates[i]
      const dm2 = candidate.date.match(/\d{4}-(\d{2})-(\d{2})/)
      const dateStr = dm2 ? `${parseInt(dm2[1])}/${parseInt(dm2[2])}` : candidate.date
      const timeSlotMap = {
        '朝': '朝',
        '昼': '昼', 
        '夜': '夜',
        'morning': '朝',
        'afternoon': '昼',
        'evening': '夜'
      }
      const timeSlot = timeSlotMap[candidate.timeSlot] || candidate.timeSlot
      const isSelected = availableCandidates.includes(i)
      
      if (i % 5 === 0) {
        responseComponents.push({
          type: 1,
          components: []
        })
      }
      
      responseComponents[responseComponents.length - 1].components.push({
        type: 2,
        style: isSelected ? 1 : 3, // 1=青（選択済み）、3=緑（未選択）
        label: `${isSelected ? '✓ ' : ''}候補${i + 1}: ${dateStr} ${timeSlot} ${candidate.startTime}-${candidate.endTime}`,
        custom_id: `date_${i + 1}_${requestId}`
      })
    }
    
    // 「全て不可」ボタンを追加
    responseComponents.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 4, // 赤色
          label: '全て不可',
          custom_id: `gm_unavailable_${requestId}`
        }
      ]
    })
    
    // Discord Webhook APIを使ってメッセージを更新
    const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
    
    const webhookResponse = await fetch(webhookUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: responseMessage,
        components: responseComponents
      })
    })
    
    if (!webhookResponse.ok) {
      console.error('❌ Failed to update message:', await webhookResponse.text())
    } else {
      console.log('✅ Message updated successfully')
    }
    
    console.log('📅 Date selection recorded and saved:', selectedDates)
    
  } catch (error) {
    console.error('🚨 Error processing date selection:', error)
    
    // エラー時もWebhook APIで更新
    const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
    
    await fetch(webhookUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'エラー: 日程の記録に失敗しました'
      })
    }).catch(e => console.error('Failed to send error message:', e))
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)
  // Discord署名ヘッダーを追加
  corsHeaders['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp'

  console.log('🚀 Discord interactions function called!')
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const body = await req.text()
  // 🔒 レート制限（Discordボタン連打/DoS対策）
  const clientIP = getClientIP(req)
  const rateLimit = await checkRateLimit(supabase, clientIP, 'discord-interactions', 120, 60)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfter, corsHeaders)
  }
  
  // 署名検証
  console.log('🔐 Starting signature verification...')
  const isValid = await verifySignature(req, body)
  console.log('🔐 Signature verification result:', isValid)
  
  if (!isValid) {
    console.log('❌ Invalid signature - rejecting request')
    return new Response('Invalid signature', { 
      status: 401,
      headers: corsHeaders 
    })
  }
  
  console.log('✅ Signature verification passed')

  const interaction = JSON.parse(body)
  // 🔒 冪等化（Discord再送/リプレイ対策）
  const interactionId = interaction?.id
  if (typeof interactionId === 'string' && interactionId.length > 0) {
    const { data: dedupeRow } = await supabase
      .from('discord_interaction_dedupe')
      .upsert(
        { interaction_id: interactionId, handler: 'discord-interactions' },
        { onConflict: 'interaction_id', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle()

    if (!dedupeRow?.id) {
      // 既に処理済み
      return new Response(
        JSON.stringify({ type: 6 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // PING に対して PONG を返す
  if (interaction.type === 1) {
    console.log('✅ Responding with PONG')
    return new Response(
      JSON.stringify({ type: 1 }),
      { 
        status: 200,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        }
      }
    )
  }

  // ボタンクリック（MESSAGE_COMPONENT）
  if (interaction.type === 3) {
    if (!interaction.data || !interaction.data.custom_id) {
      console.log('⚠️ Missing custom_id in interaction data')
      return new Response('Missing custom_id', { 
        status: 400,
        headers: corsHeaders 
      })
    }

    console.log('Button clicked:', interaction.data.custom_id)
    
    // 全て出勤不可ボタンの処理
    if (interaction.data.custom_id.startsWith('gm_unavailable_')) {
      console.log('❌ Processing gm_unavailable button')
      
      const requestId = interaction.data.custom_id.replace('gm_unavailable_', '')
      console.log('📋 Request ID:', requestId)
      if (!isUuidLike(requestId)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: 'エラー: 無効なIDです', flags: 64 } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // 即座にDEFERRED応答を返す
      const deferredResponse = new Response(
        JSON.stringify({ type: 6 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
      processUnavailable(interaction, requestId).catch(err => {
        console.error('❌ Background processing error:', err)
      })
      
      return deferredResponse
    }
    
    // 以下の古いコードは削除
    if (false && interaction.data.custom_id.startsWith('gm_unavailable_OLD_')) {
      
      try {
        // GMの回答をデータベースに保存
        const gmUserId = interaction.member?.user?.id
        const gmUserName = interaction.member?.nick || interaction.member?.user?.global_name || interaction.member?.user?.username || 'Unknown GM'
        
        console.log('👤 GM User:', { id: gmUserId, name: gmUserName })
        
        // Discord IDからstaff_idを取得
        let staffId = null
        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('id')
          .eq('discord_user_id', gmUserId)
          .single()
        
        if (staffError) {
          console.log('⚠️ Staff not found for Discord ID:', gmUserId, staffError)
        } else {
          staffId = staffData.id
          console.log('✅ Found staff_id:', staffId)
        }
        
        // gm_availability_responsesテーブルに保存 (upsert)
        const { data: gmResponse, error: gmError } = await supabase
          .from('gm_availability_responses')
          .upsert({
            reservation_id: requestId,
            staff_id: staffId,
            gm_discord_id: gmUserId,
            gm_name: gmUserName,
            response_type: 'unavailable',
            selected_candidate_index: null,
            response_datetime: new Date().toISOString(),
            notes: 'Discord経由で回答: 全て出勤不可',
            response_status: 'all_unavailable',
            available_candidates: [],
            response_history: [{ timestamp: new Date().toISOString(), action: 'all_unavailable' }],
            responded_at: new Date().toISOString()
          }, {
            onConflict: 'reservation_id,staff_id'
          })
        
        if (gmError) {
          console.error('❌ Error saving GM response:', gmError)
        } else {
          console.log('✅ GM unavailable response saved to database:', gmResponse)
          
          // GMが1人でも回答したら、リクエストのステータスを「店舗確認待ち」に更新
          const { error: updateError } = await supabase
            .from('reservations')
            .update({ status: 'pending_store' })
            .eq('id', requestId)
            .in('status', ['pending', 'pending_gm'])
          
          if (updateError) {
            console.error('❌ Error updating reservation status:', updateError)
          } else {
            console.log('✅ Reservation status updated to pending_store')
          }
        }
        
        const response = new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: '❌ 全て出勤不可として記録しました。\n管理画面で確認できます。'
            }
          }),
          { 
            status: 200,
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json' 
            }
          }
        )
        console.log('❌ GM unavailable response recorded and saved')
        return response
        
      } catch (error) {
        console.error('🚨 Error processing gm_unavailable:', error)
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: 'エラー: 回答の記録に失敗しました'
            }
          }),
          { 
            status: 200,
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json' 
            }
          }
        )
      }
    }
    
    // 日程選択ボタンの処理
    if (interaction.data.custom_id.startsWith('date_')) {
      console.log('📅 Processing date selection:', interaction.data.custom_id)
      
      // custom_idから情報を抽出: date_1_requestId
      const parts = interaction.data.custom_id.split('_')
      const dateIndex = parseInt(parts[1]) - 1 // 0-based index
      const requestId = parts.slice(2).join('_')
      
      console.log('📋 Date index:', dateIndex, 'Request ID:', requestId)
      if (!isUuidLike(requestId) || !Number.isFinite(dateIndex) || dateIndex < 0) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: 'エラー: 無効なパラメータです', flags: 64 } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // 即座にDEFERRED応答を返す（3秒タイムアウト回避）
      const deferredResponse = new Response(
        JSON.stringify({ type: 6 }), // DEFERRED_UPDATE_MESSAGE
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
      
      // バックグラウンドで処理を続行（応答は返さない）
      processDateSelection(interaction, dateIndex, requestId).catch(err => {
        console.error('❌ Background processing error:', err)
      })
      
      return deferredResponse
    }
    
    console.log('⚠️ Unknown button clicked:', interaction.data.custom_id)
    return new Response(
      JSON.stringify({
        type: 4,
        data: {
          content: 'エラー: 不明なボタンです'
        }
      }),
      { 
        status: 200,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        }
      }
    )
  }

  // その他の未対応インタラクション
  console.log('⚠️ Unsupported interaction type:', interaction.type)
  return new Response('Unsupported interaction', { 
    status: 400,
    headers: corsHeaders 
  })
})

