/**
 * ログインのあと、利用者情報（役割・所属・組織の URL）を読んで行き先を決める（2026-10-26 本番ログイン障害）。
 * 以前は LoginForm の中で読み取りを期限なしに待ち、応答が止まると「ログイン成功！リダイレクト中...」のまま進まなかった。
 * 読み取りの失敗も「情報なし」と扱い、お客様向けの行き先へ決め打ちしていた。
 * - 読み取りが失敗したら投げる（役割・所属を決め打ちしない）。全体に期限をつけるのは呼び出し側（withLoginProfileTimeout）
 * - 行き先の決め方（店舗代表・スタッフ・お客様・戻り先）は従来どおり
 */
import { loginProfileReadApi, organizationReadApi } from '@/lib/api/organizationReadApi'
import { logger } from '@/utils/logger'
import { validateRedirectUrl } from '@/lib/utils'

/** 利用者情報の読み取り全体の期限 */
export const LOGIN_PROFILE_TIMEOUT_MS = 10_000
export const LOGIN_PROFILE_TIMEOUT = 'LOGIN_PROFILE_TIMEOUT'

export interface LoginDestination {
  path: string
  /** 行き先を決めるのに使った戻り先（sessionStorage の returnUrl）を、遷移のときに消すか */
  clearReturnUrl: boolean
}

function must<T>(result: { data: T; error: unknown }, label: string): T {
  if (result.error) {
    logger.warn(`Login redirect: ${label} failed`, result.error)
    throw result.error instanceof Error ? result.error : new Error(`${label} failed`)
  }
  return result.data
}

export async function resolveLoginDestination(
  userId: string,
  context: { returnUrl: string | null; pathSlug: string | null },
): Promise<LoginDestination> {
  const profileData = must(await loginProfileReadApi.findUserProfile(userId), 'users profile')
  let profileOrgSlug: string | undefined
  if (profileData?.organization_id) {
    profileOrgSlug = must(await organizationReadApi.findSlugById(profileData.organization_id), 'organization slug')?.slug
  }

  let staffData: { organization_id: string | null; role: string | null } | null = null
  let orgSlug: string | undefined
  const nested = await loginProfileReadApi.findStaffWithOrganizationSlug(userId)
  if (nested.error) {
    logger.warn('Login redirect: staff+org nested select failed, falling back', nested.error)
    const staffOnly = must(await loginProfileReadApi.findStaffOnly(userId), 'staff')
    staffData = staffOnly
    if (staffOnly?.organization_id) {
      orgSlug = must(await organizationReadApi.findSlugById(staffOnly.organization_id), 'staff organization slug')?.slug
    }
  } else if (nested.data) {
    const orgRaw = nested.data.organizations as unknown
    const orgOne = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { slug?: string } | null | undefined
    staffData = { organization_id: nested.data.organization_id, role: nested.data.role }
    orgSlug = orgOne && typeof orgOne === 'object' && typeof orgOne.slug === 'string' ? orgOne.slug : undefined
  }

  const organizationId = profileData?.organization_id ?? staffData?.organization_id
  const role = profileData?.role ?? staffData?.role
  // 見ている組織（users.organization_id）の URL を優先する。マスターが切り替え中でも本部へ戻さない
  const slug = profileOrgSlug || orgSlug || ''

  if (organizationId) {
    if (profileData?.is_store_representative === true && role !== 'customer') {
      return { path: slug ? `/${slug}/store-dashboard` : '/store-dashboard', clearReturnUrl: true }
    }
    if (role === 'admin' || role === 'staff' || role === 'license_admin') {
      return { path: slug ? `/${slug}/schedule` : '/dashboard', clearReturnUrl: true }
    }
    if (context.returnUrl) return { path: validateRedirectUrl(context.returnUrl), clearReturnUrl: true }
    return { path: `/${slug}`, clearReturnUrl: false }
  }
  if (context.returnUrl) return { path: validateRedirectUrl(context.returnUrl), clearReturnUrl: true }
  // /{org}/login から入ったお客様は、その予約サイトのトップへ戻す（MMQ 全体トップへ飛ばさない）
  return { path: context.pathSlug ? `/${context.pathSlug}` : '/', clearReturnUrl: false }
}

/** 期限つき（期限を過ぎたら LOGIN_PROFILE_TIMEOUT で投げる。遅れて届いた結果は呼び出し側で捨てる） */
export function withLoginProfileTimeout<T>(promise: Promise<T>, ms = LOGIN_PROFILE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(LOGIN_PROFILE_TIMEOUT)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer) })
}
