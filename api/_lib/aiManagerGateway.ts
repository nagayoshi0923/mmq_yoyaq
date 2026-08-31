import { createHash, timingSafeEqual } from 'node:crypto'

export type AiManagerOperation = {
  id: string
  method: 'GET' | 'POST' | 'PATCH'
  pathname: string
  write: boolean
  risk: 'low' | 'medium' | 'high'
  allowedQueryKeys: readonly string[]
  allowedBodyKeys?: readonly string[]
  requiredQuery?: Readonly<Record<string, string>>
}

const OPERATIONS: Readonly<Record<string, AiManagerOperation>> = Object.freeze({
  'schedule.read': operation({
    id: 'schedule.read', method: 'GET', pathname: '/api/schedule', write: false, risk: 'low',
    allowedQueryKeys: ['type', 'start', 'end', 'include_cancelled'],
    requiredQuery: { type: 'by-date-range' },
  }),
  'sales.read': operation({
    id: 'sales.read', method: 'GET', pathname: '/api/sales', write: false, risk: 'low',
    allowedQueryKeys: ['type', 'start', 'end'],
    requiredQuery: { type: 'by-period' },
  }),
  'scenarios.read': operation({
    id: 'scenarios.read', method: 'GET', pathname: '/api/scenarios', write: false, risk: 'low',
    allowedQueryKeys: [],
  }),
  'license-contracts.read': operation({
    id: 'license-contracts.read', method: 'GET', pathname: '/api/license-contracts', write: false, risk: 'low',
    allowedQueryKeys: [],
  }),
  'external-reports.read': operation({
    id: 'external-reports.read', method: 'GET', pathname: '/api/external-reports', write: false, risk: 'low',
    allowedQueryKeys: ['type', 'status', 'startDate', 'endDate'],
    requiredQuery: { type: 'all', status: 'approved' },
  }),
  'license-partner-reports.read': operation({
    id: 'license-partner-reports.read', method: 'GET', pathname: '/api/license-partner-reports', write: false, risk: 'low',
    allowedQueryKeys: ['scope', 'year', 'month'],
    requiredQuery: { scope: 'staff' },
  }),
  'manager.work-store.read': operation({
    id: 'manager.work-store.read', method: 'GET', pathname: '/api/ai-manager-work-store', write: false, risk: 'low',
    allowedQueryKeys: [],
  }),
  'schedule.notes.update': operation({
    id: 'schedule.notes.update', method: 'PATCH', pathname: '/api/schedule', write: true, risk: 'medium',
    allowedQueryKeys: ['id', 'expected_updated_at'],
    allowedBodyKeys: ['notes'],
  }),
  'scenario.notes.update': operation({
    id: 'scenario.notes.update', method: 'PATCH', pathname: '/api/scenarios', write: true, risk: 'medium',
    allowedQueryKeys: ['id', 'action'],
    allowedBodyKeys: ['notes'],
    requiredQuery: { action: 'update' },
  }),
  'license-contract.update': operation({
    id: 'license-contract.update', method: 'PATCH', pathname: '/api/license-contracts', write: true, risk: 'high',
    allowedQueryKeys: ['id'],
    allowedBodyKeys: [
      'store_id', 'scenario_master_id', 'license_manager_type', 'standard_license_amount',
      'contracted_count', 'contract_start_date', 'contract_end_date', 'billing_status', 'notes',
    ],
  }),
  'external-report.update': operation({
    id: 'external-report.update', method: 'PATCH', pathname: '/api/external-reports', write: true, risk: 'medium',
    allowedQueryKeys: ['id', 'action'],
    allowedBodyKeys: ['performance_date', 'performance_count', 'participant_count', 'venue_name', 'notes'],
    requiredQuery: { action: 'update' },
  }),
  'manager.work-store.update': operation({
    id: 'manager.work-store.update', method: 'PATCH', pathname: '/api/ai-manager-work-store', write: true, risk: 'low',
    allowedQueryKeys: ['id'],
    allowedBodyKeys: ['expected_revision', 'store'],
    requiredQuery: { id: 'singleton' },
  }),
})

export function getAiManagerOperation(operationId: string): AiManagerOperation | null {
  return OPERATIONS[operationId] ?? null
}

export function listAiManagerOperationIds(): string[] {
  return Object.keys(OPERATIONS)
}

export function hashAiManagerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenHashMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashAiManagerToken(token), 'hex')
  const expected = Buffer.from(String(expectedHash || '').trim().toLowerCase(), 'hex')
  return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected)
}

export function createAiManagerFingerprint({
  operationId,
  query = {},
  body = null,
}: {
  operationId: string
  query?: Record<string, unknown>
  body?: unknown
}): string {
  return createHash('sha256')
    .update(stableStringify({ operationId, query: normalizeQuery(query), body: body ?? null }))
    .digest('hex')
}

export function validateAiManagerRequest({
  operationId,
  method,
  query = {},
  body = null,
  allowedOperations,
}: {
  operationId: string
  method: string
  query?: Record<string, unknown>
  body?: unknown
  allowedOperations: ReadonlySet<string>
}): { operation: AiManagerOperation | null; errors: string[] } {
  const operation = getAiManagerOperation(operationId)
  const errors: string[] = []
  if (!operation) return { operation: null, errors: ['OPERATION_NOT_REGISTERED'] }
  if (!allowedOperations.has(operationId)) errors.push('OPERATION_NOT_ALLOWED')
  if (method !== operation.method) errors.push('METHOD_MISMATCH')

  const normalizedQuery = normalizeQuery(query)
  const disallowedQuery = Object.keys(normalizedQuery)
    .filter((key) => !operation.allowedQueryKeys.includes(key))
  if (disallowedQuery.length > 0) errors.push(`QUERY_KEYS_NOT_ALLOWED:${disallowedQuery.sort().join(',')}`)
  for (const [key, requiredValue] of Object.entries(operation.requiredQuery ?? {})) {
    if (normalizedQuery[key] !== requiredValue) errors.push(`QUERY_VALUE_REQUIRED:${key}=${requiredValue}`)
  }
  if (operation.write && !cleanString(normalizedQuery.id)) errors.push('TARGET_ID_REQUIRED')

  if (operation.write) {
    const payload = unwrapBody(body)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      errors.push('BODY_OBJECT_REQUIRED')
    } else {
      const disallowedBody = Object.keys(payload)
        .filter((key) => !(operation.allowedBodyKeys ?? []).includes(key))
      if (disallowedBody.length > 0) errors.push(`BODY_KEYS_NOT_ALLOWED:${disallowedBody.sort().join(',')}`)
      if (Object.keys(payload).length === 0) errors.push('BODY_FIELDS_REQUIRED')
    }
  }
  return { operation, errors }
}

export function parseAllowedOperations(value: string | undefined): Set<string> {
  return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean))
}

function operation(value: AiManagerOperation): AiManagerOperation {
  return Object.freeze({
    ...value,
    allowedQueryKeys: Object.freeze([...value.allowedQueryKeys]),
    allowedBodyKeys: value.allowedBodyKeys ? Object.freeze([...value.allowedBodyKeys]) : undefined,
    requiredQuery: value.requiredQuery ? Object.freeze({ ...value.requiredQuery }) : undefined,
  })
}

function unwrapBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (record.updates && typeof record.updates === 'object' && !Array.isArray(record.updates)) {
    const extraKeys = Object.keys(record).filter((key) => key !== 'updates')
    if (extraKeys.length > 0) return record
    return record.updates as Record<string, unknown>
  }
  return record
}

function normalizeQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]))
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortValue(record[key])]))
  }
  return value
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
