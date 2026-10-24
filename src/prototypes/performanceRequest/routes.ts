/**
 * 開催リクエスト試作のルート。ログイン無しで開ける（架空データだけを使い、実 API に触れない）。
 * 本番ビルドでは AppRoot.tsx 側の PROTOTYPES_ENABLED が定数 false になり、この判定ごと取り除かれる。
 */
export const PERFORMANCE_REQUEST_PROTOTYPE_BASE = '/prototype/performance-request'

export type PrototypeView =
  | { view: 'customer' }
  | { view: 'admin' }
  | { view: 'notifications' }
  | { view: 'event'; performanceId: string }
  | { view: 'login-return' }

export function resolvePrototypeView(pathname: string, enabled: boolean): PrototypeView | null {
  if (!enabled) return null
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (path === PERFORMANCE_REQUEST_PROTOTYPE_BASE) return { view: 'customer' }
  if (!path.startsWith(`${PERFORMANCE_REQUEST_PROTOTYPE_BASE}/`)) return null
  const rest = path.slice(PERFORMANCE_REQUEST_PROTOTYPE_BASE.length + 1).split('/')
  if (rest.length === 1 && rest[0] === 'admin') return { view: 'admin' }
  if (rest.length === 1 && rest[0] === 'notifications') return { view: 'notifications' }
  if (rest.length === 1 && rest[0] === 'login-return') return { view: 'login-return' }
  if (rest.length === 2 && rest[0] === 'event' && rest[1]) return { view: 'event', performanceId: decodeURIComponent(rest[1]) }
  return null
}

export const protoPaths = {
  customer: (scenarioId?: string) => `${PERFORMANCE_REQUEST_PROTOTYPE_BASE}${scenarioId ? `?scenario=${encodeURIComponent(scenarioId)}` : ''}`,
  admin: () => `${PERFORMANCE_REQUEST_PROTOTYPE_BASE}/admin`,
  notifications: () => `${PERFORMANCE_REQUEST_PROTOTYPE_BASE}/notifications`,
  loginReturn: (returnTo: string) => `${PERFORMANCE_REQUEST_PROTOTYPE_BASE}/login-return?redirect=${encodeURIComponent(returnTo)}`,
}
