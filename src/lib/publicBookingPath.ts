/**
 * 予約サイトの公開URL用 organization slug を、現在のパスから推測する。
 * 管理画面（/scenarios 等）や SSR 環境では null を返す。
 */
export function getOrganizationSlugFromPath(): string | null {
  if (typeof window === 'undefined') return null
  const pathname = window.location.pathname
  const match = pathname.match(/^\/([^/]+)/)
  if (match) {
    const adminPaths = [
      'dashboard',
      'stores',
      'staff',
      'scenarios',
      'schedule',
      'shift-submission',
      'gm-availability',
      'private-booking-management',
      'reservations',
      'accounts',
      'sales',
      'settings',
      'manual',
      'login',
      'signup',
      'reset-password',
      'set-password',
      'complete-profile',
      'coupon-present',
      'license-management',
      'staff-profile',
      'mypage',
      'author',
      'external-reports',
      'accept-invitation',
      'organization-register',
      'terms',
      'privacy',
      'security',
      'legal',
      'contact',
      'faq',
      'guide',
      'cancel-policy',
      'company',
      'about',
      'blog',
    ]
    if (!adminPaths.includes(match[1])) {
      return match[1]
    }
  }
  return null
}
