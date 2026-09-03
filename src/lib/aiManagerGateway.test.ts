import { describe, expect, it } from 'vitest'
import {
  createAiManagerDirectReadPlan,
  createAiManagerFingerprint,
  getAiManagerOperation,
  hashAiManagerToken,
  parseAllowedOperations,
  tokenHashMatches,
  validateAiManagerRequest,
} from '../../api/_lib/aiManagerGateway.js'

describe('AI Manager gateway contract', () => {
  it('平文を保存せずSHA-256ハッシュを定数時間比較する', () => {
    const hash = hashAiManagerToken('qwai_test_secret')
    expect(hash).toHaveLength(64)
    expect(tokenHashMatches('qwai_test_secret', hash)).toBe(true)
    expect(tokenHashMatches('wrong', hash)).toBe(false)
  })

  it('fingerprintはキー順に依存しない', () => {
    const left = createAiManagerFingerprint({
      operationId: 'schedule.notes.update', query: { id: 'event-1' }, body: { notes: '確認済み' },
    })
    const right = createAiManagerFingerprint({
      operationId: 'schedule.notes.update', body: { notes: '確認済み' }, query: { id: 'event-1' },
    })
    expect(left).toBe(right)
  })

  it('許可された読み取りだけを通す', () => {
    const result = validateAiManagerRequest({
      operationId: 'schedule.read',
      method: 'GET',
      query: { type: 'by-date-range', start: '2026-08-01', end: '2026-08-31', include_cancelled: 'true' },
      allowedOperations: parseAllowedOperations('schedule.read'),
    })
    expect(result.errors).toEqual([])
  })

  it('org指定の差し込みと未許可操作を拒否する', () => {
    const result = validateAiManagerRequest({
      operationId: 'schedule.read',
      method: 'GET',
      query: { type: 'by-date-range', start: '2026-08-01', end: '2026-08-31', org_id: 'other' },
      allowedOperations: new Set(),
    })
    expect(result.errors).toContain('OPERATION_NOT_ALLOWED')
    expect(result.errors).toContain('QUERY_KEYS_NOT_ALLOWED:org_id')
  })

  it('公演更新はnotes以外を初期許可しない', () => {
    const result = validateAiManagerRequest({
      operationId: 'schedule.notes.update',
      method: 'PATCH',
      query: { id: 'event-1' },
      body: { notes: '確認済み', is_cancelled: true, gms: ['someone'] },
      allowedOperations: parseAllowedOperations('schedule.notes.update'),
    })
    expect(result.errors).toContain('BODY_KEYS_NOT_ALLOWED:gms,is_cancelled')
  })

  it('作品メモ更新はupdatesラッパーを検査する', () => {
    const result = validateAiManagerRequest({
      operationId: 'scenario.notes.update',
      method: 'PATCH',
      query: { id: 'scenario-1', action: 'update' },
      body: { updates: { notes: '契約確認済み' } },
      allowedOperations: parseAllowedOperations('scenario.notes.update'),
    })
    expect(result.errors).toEqual([])
  })

  it('担当作品の読み取りは組織IDを外部入力させずgateway側で固定する', () => {
    const operation = getAiManagerOperation('staff-scenario-assignments.read')
    expect(operation).not.toBeNull()
    const validation = validateAiManagerRequest({
      operationId: 'staff-scenario-assignments.read',
      method: 'GET',
      query: {},
      allowedOperations: parseAllowedOperations('staff-scenario-assignments.read'),
    })
    expect(validation.errors).toEqual([])

    const plan = createAiManagerDirectReadPlan({
      operation: operation!,
      organizationId: 'org-queens-waltz',
    })
    expect(plan?.table).toBe('staff_scenario_assignments')
    expect(plan?.filters).toEqual([
      { column: 'organization_id', value: 'org-queens-waltz' },
    ])
    expect(plan?.select).not.toContain('notes')
    expect(plan?.pageSize).toBe(1_000)
    expect(plan?.maxRows).toBe(50_000)
  })

  it('GM回答は固定した予約UUIDだけを同一組織内で読む', () => {
    const reservationId = '123e4567-e89b-42d3-a456-426614174000'
    const operation = getAiManagerOperation('gm-availability-responses.read')
    expect(operation).not.toBeNull()
    const validation = validateAiManagerRequest({
      operationId: 'gm-availability-responses.read',
      method: 'GET',
      query: { reservation_id: reservationId },
      allowedOperations: parseAllowedOperations('gm-availability-responses.read'),
    })
    expect(validation.errors).toEqual([])

    const plan = createAiManagerDirectReadPlan({
      operation: operation!,
      organizationId: 'org-queens-waltz',
      query: { reservation_id: reservationId },
    })
    expect(plan?.filters).toEqual([
      { column: 'organization_id', value: 'org-queens-waltz' },
      { column: 'reservation_id', value: reservationId },
    ])
    expect(plan?.select).not.toContain('notes')
    expect(plan?.select).not.toContain('gm_discord_id')
  })

  it('GM回答の予約ID欠落・不正形式・組織ID差し込みを拒否する', () => {
    const allowedOperations = parseAllowedOperations('gm-availability-responses.read')
    const missing = validateAiManagerRequest({
      operationId: 'gm-availability-responses.read', method: 'GET', query: {}, allowedOperations,
    })
    expect(missing.errors).toContain('QUERY_KEY_REQUIRED:reservation_id')

    const invalid = validateAiManagerRequest({
      operationId: 'gm-availability-responses.read', method: 'GET',
      query: { reservation_id: 'all', organization_id: 'other' }, allowedOperations,
    })
    expect(invalid.errors).toContain('QUERY_UUID_REQUIRED:reservation_id')
    expect(invalid.errors).toContain('QUERY_KEYS_NOT_ALLOWED:organization_id')
  })
})
