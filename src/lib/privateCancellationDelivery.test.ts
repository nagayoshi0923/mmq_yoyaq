import { describe, expect, it, vi } from 'vitest'
import { deliverPrivateCancellations } from '../../supabase/functions/_shared/private-cancellation-delivery'

function fixture(options: { channel?: string, retry?: number, status?: string, restored?: boolean } = {}) {
  const row = { id: '11111111-1111-1111-1111-111111111111', organization_id: 'org1', notification_type: 'private_cancellation',
    message_payload: { staff_id: 's1', event_id: 'e1', epoch: 'epoch1', content: '貸切取消' }, status: options.status || 'pending',
    retry_count: options.retry || 0, max_retries: 3, next_retry_at: '2000-01-01T00:00:00Z' }
  const staff = [ { id: 's1', organization_id: 'org2', discord_channel_id: '999', discord_user_id: '999' },
    { id: 's1', organization_id: 'org1', discord_channel_id: options.channel ?? '123', discord_user_id: '456' } ]
  const db = { from: (table: string) => {
    let change: Record<string, unknown> | undefined
    const filters: ((r: Record<string, any>) => boolean)[] = []
    const q: any = {
      update: (v: Record<string, unknown>) => { change = v; return q }, select: () => q, order: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q },
      lt: (k: string, v: string) => { filters.push(r => r[k] < v); return q },
      lte: (k: string, v: string) => { filters.push(r => r[k] <= v); return q },
      then: (resolve: (r: unknown) => unknown) => {
        const rows = (table === 'staff' ? staff : table === 'schedule_events' ? [{id:'e1',organization_id:'org1',gm_cancel_epoch:options.restored ? 'epoch2':'epoch1'}] : [row]).filter(r => filters.every(f => f(r)))
        if (change) rows.forEach(r => Object.assign(r, change))
        return Promise.resolve(resolve({ data: rows.map(r => ({ ...r })), error: null }))
      },
      maybeSingle: async () => { const result = await q; return { data: result.data[0] ?? null, error: null } },
    }
    return q
  } }
  return { row, db }
}
describe('貸切取消通知の永続キュー配送', () => {
  it('担当者と同じ組織の送信先へ送信し完了を記録する', async () => {
    const { db, row } = fixture(); const send = vi.fn().mockResolvedValue({ ok: true })
    expect(await deliverPrivateCancellations(db, async () => 'test-token', send)).toEqual({ succeeded: 1, failed: 0 })
    expect(send.mock.calls[0][0]).toContain('/channels/123/messages')
    const payload = JSON.parse(send.mock.calls[0][1].body)
    expect(payload.allowed_mentions).toEqual({ parse: [], users: ['456'] })
    expect(payload.enforce_nonce).toBe(true); expect(payload.staff_id).toBeUndefined()
    expect(row.status).toBe('completed')
  })
  it('二重起動でも1つのワーカーだけが配送する', async () => {
    const { db } = fixture(); const send = vi.fn().mockResolvedValue({ ok: true })
    await Promise.all([deliverPrivateCancellations(db, async () => 'token', send), deliverPrivateCancellations(db, async () => 'token', send)])
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('HTTP失敗は再送待ちになり、上限到達時には失敗が残る', async () => {
    for (const retry of [0, 2]) {
      const { db, row } = fixture({ retry }); const send = vi.fn().mockResolvedValue({ ok: false, status: 503 })
      await deliverPrivateCancellations(db, async () => 'token', send)
      expect(row.status).toBe(retry === 2 ? 'failed' : 'pending'); expect(row.retry_count).toBe(retry + 1)
      expect(new Date(row.next_retry_at).getTime()).toBeGreaterThan(Date.now())
    }
  })
  it('通信切断・設定不足を成功扱いせず記録する', async () => {
    const { db, row } = fixture({ channel: '' }); const send = vi.fn()
    await deliverPrivateCancellations(db, async () => 'token', send)
    expect(send).not.toHaveBeenCalled(); expect(row.status).toBe('pending'); expect(row.retry_count).toBe(1)
    const other = fixture()
    await deliverPrivateCancellations(other.db, async () => 'token', vi.fn().mockRejectedValue(new Error('network_error')))
    expect(other.row.status).toBe('pending')
  })
  it('取消後に復活した公演の古い通知は送らない', async () => {
    const { db, row } = fixture({ restored: true }); const send = vi.fn()
    await deliverPrivateCancellations(db, async () => 'token', send)
    expect(send).not.toHaveBeenCalled(); expect(row.status).toBe('completed')
  })
  it('配送中に停止した処理を期限後に回収する', async () => {
    const { db, row } = fixture({ status: 'sending' }); const send = vi.fn().mockResolvedValue({ ok: true })
    await deliverPrivateCancellations(db, async () => 'token', send)
    expect(send).toHaveBeenCalledTimes(1); expect(row.status).toBe('completed')
  })
})
