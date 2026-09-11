// 貸切取消専用の永続キュー配送。予約情報は読まず、確定時のスナップショットを送る。
export async function deliverPrivateCancellations(db: any, getToken: (orgId: string) => Promise<string | null>, send: typeof fetch = fetch) {
  const now = new Date().toISOString()
  const { error: recoveryError } = await db.from('discord_notification_queue')
    .update({ status: 'pending', last_error: 'delivery_lease_expired' })
    .eq('notification_type', 'private_cancellation').eq('status', 'sending').lt('next_retry_at', now)
  if (recoveryError) throw recoveryError
  const { data: rows, error } = await db.from('discord_notification_queue').select('id,organization_id,message_payload,retry_count,max_retries,next_retry_at')
    .eq('notification_type', 'private_cancellation').eq('status', 'pending')
    .lte('next_retry_at', now).order('created_at', { ascending: true }).limit(20)
  if (error) throw error
  let succeeded = 0, failed = 0
  for (const row of rows || []) {
    const lease = new Date(Date.now() + 120_000).toISOString()
    const { data: claimed, error: claimError } = await db.from('discord_notification_queue')
      .update({ status: 'sending', next_retry_at: lease, updated_at: now })
      .eq('id', row.id).eq('organization_id', row.organization_id).eq('status', 'pending')
      .eq('retry_count', row.retry_count).eq('next_retry_at', row.next_retry_at).lte('next_retry_at', now)
      .select('id').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) continue
    try {
      const { data: event, error: eventError } = await db.from('schedule_events')
        .select('gm_cancel_epoch').eq('id', row.message_payload.event_id).eq('organization_id', row.organization_id).maybeSingle()
      if (eventError) throw eventError
      // 削除済みはスナップショットを配送する。復活して世代が変わった通知は送らない。
      if (event && event.gm_cancel_epoch !== row.message_payload.epoch) {
        const { error: supersedeError } = await db.from('discord_notification_queue')
          .update({ status: 'completed', last_error: 'superseded_by_restoration', updated_at: new Date().toISOString() })
          .eq('id', row.id).eq('organization_id', row.organization_id).eq('status', 'sending').eq('next_retry_at', lease)
        if (supersedeError) throw supersedeError
        continue
      }
      const { data: staff, error: staffError } = await db.from('staff')
        .select('discord_channel_id,discord_user_id').eq('id', row.message_payload.staff_id)
        .eq('organization_id', row.organization_id).maybeSingle()
      if (staffError) throw staffError
      if (!/^\d+$/.test(staff?.discord_channel_id?.trim() || '')) throw new Error('staff_discord_channel_missing')
      const token = await getToken(row.organization_id)
      if (!token) throw new Error('bot_token_not_configured')
      const userId = /^\d+$/.test(staff?.discord_user_id || '') ? staff.discord_user_id : null
      const payload = {
        content: `${userId ? `<@${userId}>\n` : ''}${row.message_payload.content}`.slice(0, 2000),
        allowed_mentions: { parse: [], users: userId ? [userId] : [] },
        nonce: row.id.replaceAll('-', '').slice(0, 25), enforce_nonce: true,
      }
      const response = await send(`https://discord.com/api/v10/channels/${staff.discord_channel_id.trim()}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bot ${token}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`discord_http_${response.status}`)
      const { error: saveError } = await db.from('discord_notification_queue')
        .update({ status: 'completed', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', row.id).eq('organization_id', row.organization_id).eq('status', 'sending').eq('next_retry_at', lease)
      if (saveError) throw saveError
      succeeded++
    } catch (error) {
      const attempts = row.retry_count + 1
      const { error: saveError } = await db.from('discord_notification_queue').update({
        status: attempts >= row.max_retries ? 'failed' : 'pending', retry_count: attempts,
        last_error: error instanceof Error ? error.message.slice(0, 200) : 'delivery_failed',
        next_retry_at: new Date(Date.now() + 300_000 * Math.pow(2, attempts - 1)).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('organization_id', row.organization_id).eq('status', 'sending').eq('next_retry_at', lease)
      if (saveError) throw saveError
      console.error('貸切取消通知の送信失敗', { queueId: row.id, attempts, exhausted: attempts >= row.max_retries })
      failed++
    }
  }
  return { succeeded, failed }
}
