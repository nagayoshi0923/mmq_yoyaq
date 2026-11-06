/**
 * 組織（マルチテナント）関連の React フック
 * 
 * React Queryでキャッシュし、ページ遷移で再取得しないよう最適化
 */
import { logger } from '@/utils/logger'
import { useCallback, useState, useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { staffSettingsReadApi } from '@/lib/api/settingsReadApi'
import { Sentry } from '@/lib/sentry'
import type { Organization, Staff } from '@/types'
import {
  QUEENS_WALTZ_ORG_ID,
  fetchOrganizationForStaffSession,
  getCurrentOrganizationId,
  getOrganizations,
} from '@/lib/organization'

interface UseOrganizationResult {
  organization: Organization | null
  staff: Staff | null
  organizationId: string | null
  /** この組織情報を取ったときの利用者 ID。利用者が替わった直後は、前の利用者の値が残っていることがある */
  userId: string | null
  isLicenseManager: boolean
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

// Query Keys（キャッシュキー）
export const organizationKeys = {
  current: ['organization', 'current'] as const,
}

type OrganizationData = { organization: Organization | null; staff: Staff | null; organizationId: string | null; userId: string | null }
const GUEST: OrganizationData = { organization: null, staff: null, organizationId: null, userId: null }

// 取得の失敗の種類（報告の tag）と補足。種類と補足はここに置く
const failureInfo = new WeakMap<object, { kind: string; extra?: Record<string, unknown> }>()
const KEPT_FIELDS = ['code', 'status', 'hint'] as const
// PostgREST は失敗を普通のオブジェクト（{ message, code, details, hint }）で返す。Error に包み直しても message・code・status・hint は残す
// （再試行の判断と報告で使う）。details は行の値を含み得るので報告には載せない
function toError(error: unknown, kind: string): Error {
  if (error instanceof Error) return error
  const o = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>
  const e = new Error(typeof o.message === 'string' && o.message ? o.message : `useOrganization: ${kind}`)
  if (typeof o.name === 'string' && o.name) e.name = o.name
  for (const k of KEPT_FIELDS) if (o[k] !== undefined) (e as unknown as Record<string, unknown>)[k] = o[k]
  return e
}
function failWith(error: unknown, kind: string, extra?: Record<string, unknown>): never {
  const e = toError(error, kind)
  failureInfo.set(e, { kind, extra })
  throw e
}

/**
 * 組織情報を取得する関数（React Query用）
 * - 手元にログインの記録が無い（未ログイン）のは通常の状態: 通信も報告もせず、未ログインの結果を返す
 * - ログインの記録があるのに認証・スタッフ情報の取得が失敗したら、エラーとして投げる（未ログインの成功に置き換えない）。
 *   報告は useOrganization の retry で、1 回の取得の最後の失敗につき 1 回だけ行う
 */
async function fetchOrganizationData(): Promise<OrganizationData> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) failWith(sessionError, 'auth-session-error')
  if (!session) return GUEST

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  // ログインの記録があるのに利用者を確かめられない（サーバー側で接続が無い・認証の異常・通信の失敗）は本当の失敗
  if (authError || !user) failWith(authError ?? new Error('getUser: user が無い'), 'auth-error')

  // 見ている組織はサーバー・DB と同じく users.organization_id を正とする。
  // スタッフ行の所属で決めると、マスターが別組織へ切り替えたときに本部のデータが混ざる。
  const [currentOrgId, staffResult] = await Promise.all([
    getCurrentOrganizationId(),
    staffSettingsReadApi.listByUserId(user.id),
  ])
  const { data: staffRows, error: staffError } = staffResult

  if (staffError) failWith(staffError, 'staff-query-error', { userId: user.id })

  const staffData = staffRows?.find(row => row.organization_id === currentOrgId) ?? staffRows?.[0] ?? null
  if (!staffData) {
    return { organization: null, staff: null, organizationId: null, userId: user.id }
  }

  const organizationId = currentOrgId ?? staffData.organization_id
  if (!organizationId) {
    logger.warn('useOrganization: staff.organization_id が未設定です', { userId: user.id })
    return { organization: null, staff: staffData as Staff, organizationId: null, userId: user.id }
  }

  // 組織情報を取得（DBのマイグレーションが古くてもコア列までフォールバック）
  const orgData = await fetchOrganizationForStaffSession(organizationId)

  return {
    organization: orgData,
    staff: staffData as Staff,
    organizationId,
    userId: user.id,
  }
}

// 再試行しない失敗（権限の拒否・認証の 4xx）。通信・DB の一時的な異常だけ 1 回だけ再試行する
function isRetryableFailure(error: unknown): boolean {
  const e = error as { code?: unknown; status?: unknown; name?: unknown } | null
  if (e?.code === '42501') return false
  if (e?.name === 'AuthSessionMissingError') return false
  const status = typeof e?.status === 'number' ? e.status : null
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) return false
  return true
}

// ブラウザの通信の失敗の文言（全体の除外 src/lib/sentry.ts の ignoreErrors・beforeSend に当たる）。
// この取得の最後の失敗は本当の通信の異常として残すため、除外に当たらない文言の Error に包み直して 1 件だけ送る（全体の除外は変えない）
const NETWORK_FAILURE = [
  { re: /Failed to fetch/, label: 'fetch-failed' },
  { re: /Load failed/, label: 'load-failed' },
  { re: /NetworkError/, label: 'network-error' },
]
// Sentry SDK の Dedupe（既定の動き）は、直前の event と同じ中身の event を落とす。本人の明示の取り直しなどで起きた
// 「同じ中身の新しい失敗」まで落ちないよう、この取得の報告だけ、直前の報告と同じ中身のときは文言に「（同じ失敗の再発）」を付けて別の 1 件にする。
// Dedupe 全体・報告のまとめ方（指紋）は変えない。stack は元のまま（まとまり方は変わらない）
// 直前の報告は Sentry の client ごとに覚える（Dedupe の状態も client ごと。初期化し直せば空に戻る）
const lastReportByClient = new WeakMap<object, { signature: string; repeated: boolean }>()
const NO_CLIENT = {}
function distinctFromPrevious(reported: unknown, signature: string): unknown {
  const key = (typeof Sentry.getClient === 'function' ? Sentry.getClient() : undefined) ?? NO_CLIENT
  const last = lastReportByClient.get(key)
  const repeat = last?.signature === signature && !last.repeated
  lastReportByClient.set(key, { signature, repeated: repeat })
  if (!repeat || !(reported instanceof Error)) return reported
  const copy = new Error(`${reported.message}（同じ失敗の再発）`)
  copy.name = reported.name
  if (reported.stack) copy.stack = reported.stack.replace(reported.message, copy.message)
  for (const k of KEPT_FIELDS) if ((reported as unknown as Record<string, unknown>)[k] !== undefined) (copy as unknown as Record<string, unknown>)[k] = (reported as unknown as Record<string, unknown>)[k]
  return copy
}

function reportOrganizationLoadFailure(error: unknown): void {
  const info = error && typeof error === 'object' ? failureInfo.get(error) : undefined
  const kind = info?.kind ?? 'unknown'
  const fields = Object.fromEntries(KEPT_FIELDS.map(k => [k, (error as Record<string, unknown> | null)?.[k]]).filter(([, v]) => v !== undefined && v !== ''))
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? '')
  const network = NETWORK_FAILURE.find(n => n.re.test(message))
  const reported = network ? Object.assign(new Error(`useOrganization ${kind}: 通信の失敗（${network.label}）`), { name: 'OrganizationLoadConnectionFailure' }) : error
  const signature = [kind, reported instanceof Error ? reported.name : '', reported instanceof Error ? reported.message : message, String(fields.code ?? '')].join('|')
  Sentry.captureException(distinctFromPrevious(reported, signature), {
    level: 'warning',
    tags: { source: 'useOrganization', kind, ...(network ? { network: network.label } : {}), ...(typeof fields.code === 'string' ? { code: fields.code } : {}) },
    extra: { ...(info?.extra ?? {}), ...fields, ...(network ? { originalName: (error as { name?: unknown } | null)?.name ?? null } : {}) },
  })
}

// 利用者が替わったら（別の利用者でログイン・ログアウト）、前の利用者の組織をすぐ捨てて取り直す。
// 途中の取得は取り消す（取り消しは失敗として報告しない）。同じ利用者のまま（トークンの更新・タブの復帰）では取り直さない。
// 1 つの QueryClient につき購読は 1 回だけ（部品の数だけ増やさない）。
const authSyncedClients = new WeakSet<QueryClient>()
function syncOrganizationWithAuth(queryClient: QueryClient): void {
  if (authSyncedClients.has(queryClient)) return
  authSyncedClients.add(queryClient)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED') return
    const nextUserId = event === 'SIGNED_OUT' ? null : session?.user?.id ?? null
    const state = queryClient.getQueryState<OrganizationData>(organizationKeys.current)
    if (!state) return
    if (state.status === 'success' && state.fetchStatus === 'idle' && (state.data?.userId ?? null) === nextUserId) return
    // 認証の通知の中で Supabase の呼出しを待たない（auth-js の注意）。次の順番で捨てて取り直す
    setTimeout(() => { void queryClient.resetQueries({ queryKey: organizationKeys.current, exact: true }) }, 0)
  })
}

/**
 * 現在のユーザーの組織情報を取得するフック
 * 
 * React Queryでキャッシュされるため、ページ遷移時に再取得しない
 * - staleTime: 10分（この間は再取得しない）
 * - gcTime: 30分（メモリに保持）
 */
export function useOrganization(): UseOrganizationResult {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: organizationKeys.current,
    queryFn: fetchOrganizationData,
    staleTime: 10 * 60 * 1000, // 10分間はfreshとみなす（再取得しない）
    gcTime: 30 * 60 * 1000, // 30分間メモリに保持
    // 通常はキャッシュを使う。前回の取得が失敗したときだけ、部品の付け直し（ページ遷移）で取り直して回復の機会を作る。
    // 未ログイン・スタッフでない利用者の正常な結果は付け直しのたびには取り直さない（利用者の切り替えは syncOrganizationWithAuth が扱う）
    refetchOnMount: (query) => query.state.status === 'error',
    refetchOnWindowFocus: false, // タブ復帰時も再取得しない
    // 一時的な異常だけ 1 回再試行。最後の失敗のときに 1 回だけ報告する（部品の数・再試行の回数だけ重ねない）
    retry: (failureCount, error) => {
      const again = failureCount < 1 && isRetryableFailure(error)
      if (!again) reportOrganizationLoadFailure(error)
      return again
    },
  })

  useEffect(() => { syncOrganizationWithAuth(queryClient) }, [queryClient])

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: organizationKeys.current })
  }, [queryClient])

  return {
    organization: data?.organization ?? null,
    staff: data?.staff ?? null,
    organizationId: data?.organizationId ?? null,
    userId: data?.userId ?? null,
    isLicenseManager: data?.organization?.is_license_manager ?? false,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

interface UseOrganizationsResult {
  organizations: Organization[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * 組織一覧を取得するフック（管理者用）
 */
export function useOrganizations(): UseOrganizationsResult {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOrganizations = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await getOrganizations()
      setOrganizations(data)
    } catch (err) {
      logger.error('Failed to fetch organizations:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  return {
    organizations,
    isLoading,
    error,
    refetch: fetchOrganizations,
  }
}

/**
 * クインズワルツの組織IDかどうかを判定
 */
export function isQueensWaltz(organizationId: string | null): boolean {
  return organizationId === QUEENS_WALTZ_ORG_ID
}

/**
 * ライセンス管理者権限を持つかを判定
 * DB側の is_license_admin() と同等のロジック:
 *   role='license_admin' OR (role='admin' AND organization_id=QW)
 */
export function checkIsLicenseAdmin(
  role: string | undefined | null,
  organizationId: string | undefined | null
): boolean {
  if (role === 'license_admin') return true
  if (role === 'admin' && organizationId === QUEENS_WALTZ_ORG_ID) return true
  return false
}


