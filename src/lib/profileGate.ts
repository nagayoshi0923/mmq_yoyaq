/**
 * プロフィール登録（お名前・電話など）が済んでいないお客様を、どの画面で登録へ送るか（点検 2026-10-11 の 9）。
 *
 * 見るだけのページ（トップ・作品ページ・作品一覧・店舗一覧・案内ページ）はそのまま見せ、
 * 予約の確認・貸切の申込・グループ作成・マイページなど「操作する画面」に入るとき、
 * または作品ページの予約ボタン・貸切申込・グループ参加を押したときに登録を求める。
 */
import { parsePath } from '@/pages/adminDashboardRouting'
import { completeProfileReadApi } from '@/lib/api/completeProfileReadApi'
import { isCustomerProfileComplete } from '@/utils/customerProfileGate'

/** parsePath の page のうち、見るだけのページ */
const BROWSE_ONLY_PAGES = new Set([
  'platform-top',
  'booking', // 店舗トップ・作品ページ（予約確認の段階を除く）
  'catalog',
  'scenario-detail-global',
  'scenario',
  'blog-detail',
  'org-faq',
  'cancel-policy',
  'guide',
  'private-booking-select',
  'terms',
  'privacy',
  'security',
  'legal',
  'contact',
  'org-contact',
  'faq',
  'stores',
  'company',
  'about',
  'for-business',
  'pricing',
  'getting-started',
  'lp',
])

/** 作品ページの予約確認の段階（?step=confirm）。この URL は予約の操作なので登録を求める */
export const BOOKING_CONFIRM_STEP = 'confirm'

export function isBrowseOnlyPage(pathname: string, search: string): boolean {
  const { page } = parsePath(pathname)
  if (!BROWSE_ONLY_PAGES.has(page)) return false
  if (page === 'booking' && new URLSearchParams(search).get('step') === BOOKING_CONFIRM_STEP) return false
  return true
}

/**
 * ログイン中のお客様のプロフィールが揃っているか。
 * 読み取りに失敗したときは揃っていると確定できないため false（AppRoot と同じ安全側）。
 */
export async function fetchIsCustomerProfileComplete(
  userId: string,
  sessionEmail: string | null | undefined,
): Promise<boolean> {
  try {
    const { data, error } = await completeProfileReadApi.listOwnCustomersLatestFirst(userId)
    if (error) return false
    return isCustomerProfileComplete(data?.[0] ?? null, sessionEmail)
  } catch {
    return false
  }
}
