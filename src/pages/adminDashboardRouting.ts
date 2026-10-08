/**
 * 管理画面・公開ページの URL から表示するページを決める（AdminDashboard.tsx から規則を変えずに移した純粋な関数）。
 */
// 管理ページのパス一覧
export const ADMIN_PATHS = [
  'dashboard', 'store-dashboard', 'stores', 'staff', 'staff-profile', 'scenarios', 'scenarios-edit',
  'schedule', 'shift-submission', 'gm-availability', 'private-booking-management', 'private-booking-groups',
  'reservations', 'accounts', 'sales', 'settings', 'manual', 'add-demo-participants',
  'scenario-matcher', 'organizations', 'external-reports', 'license-reports', 'license-management',
  'customer-management', 'user-management', 'coupons', 'blog'
]

// パスを解析してページ情報を返す
export function parsePath(pathname: string): { page: string, scenarioId: string | null, organizationSlug: string | null } {
  // 先頭のスラッシュを除去
  const path = pathname.startsWith('/') ? pathname.substring(1) : pathname
  const segments = path.split('/')
  
  // 認証トークンがパスに含まれている場合（Supabase リダイレクトの問題対応）
  // implicit フローで #access_token ではなく /access_token になることがある
  if (path.includes('access_token=') || segments[0]?.startsWith('access_token=')) {
    return { page: 'complete-profile', scenarioId: null, organizationSlug: null }
  }
  
  // 空パスはプラットフォームトップ
  if (!path || path === '') {
    return { page: 'platform-top', scenarioId: null, organizationSlug: null }
  }
  
  // /dev/design-preview - 開発用デザインプレビュー
  if (segments[0] === 'dev' && segments[1] === 'design-preview') {
    return { page: 'dev-design-preview', scenarioId: null, organizationSlug: null }
  }
  
  // /dev/components - UIコンポーネントギャラリー
  if (segments[0] === 'dev' && segments[1] === 'components') {
    return { page: 'dev-components', scenarioId: null, organizationSlug: null }
  }

  // /dev/project-guide - プロジェクト理解ガイド（運営管理者専用）
  if (segments[0] === 'dev' && segments[1] === 'project-guide') {
    return { page: 'dev-project-guide', scenarioId: null, organizationSlug: null }
  }

  // /dev/learn - このシステムで学ぶプログラミング＆システム設計（運営管理者専用）
  if (segments[0] === 'dev' && segments[1] === 'learn') {
    return { page: 'dev-learn', scenarioId: null, organizationSlug: null }
  }
  
  // /mypage/reservation/{reservationId} - マイページ予約詳細
  if (segments[0] === 'mypage' && segments[1] === 'reservation' && segments[2]) {
    return { page: 'mypage-reservation-detail', scenarioId: segments[2], organizationSlug: null }
  }
  
  // /group/create - 貸切グループ作成
  if (segments[0] === 'group' && segments[1] === 'create') {
    return { page: 'group-create', scenarioId: null, organizationSlug: null }
  }
  
  // /group/invite/{code} - 貸切グループ招待
  if (segments[0] === 'group' && segments[1] === 'invite' && segments[2]) {
    return { page: 'group-invite', scenarioId: segments[2], organizationSlug: null }
  }

  // /partner-report/{token} - 契約店舗の月次報告フォーム
  if (segments[0] === 'partner-report' && segments[1]) {
    return { page: 'partner-report', scenarioId: segments[1], organizationSlug: null }
  }
  
  // /group/manage/{id} - 貸切グループ管理
  if (segments[0] === 'group' && segments[1] === 'manage' && segments[2]) {
    return { page: 'group-manage', scenarioId: segments[2], organizationSlug: null }
  }
  
  // 特殊ページのチェック（組織スラッグなし）
  const specialPages = ['login', 'signup', 'reset-password', 'set-password', 'complete-profile', 'coupon-present', 'register', 'start', 'about',
    'accept-invitation', 'author-dashboard', 'author-login', 'mypage', 'my-page', 'scenario',
    // 静的ページ
    'terms', 'privacy', 'security', 'legal', 'contact', 'faq', 'guide', 'cancel-policy', 'stores', 'company',
    // 組織向けページ
    'for-business', 'pricing', 'getting-started',
    // ランディングページ
    'lp']
  if (segments.length === 1 && specialPages.includes(segments[0])) {
    return { page: segments[0], scenarioId: null, organizationSlug: null }
  }
  
  // /scenario/{slug} - シナリオ共通詳細ページ（組織を跨いで公演情報を表示）
  if (segments[0] === 'scenario' && segments[1]) {
    return { page: 'scenario-detail-global', scenarioId: segments[1], organizationSlug: null }
  }
  
  // /blog/{slug} - ブログ記事詳細ページ
  if (segments[0] === 'blog' && segments[1]) {
    return { page: 'blog-detail', scenarioId: segments[1], organizationSlug: null }
  }
  
  // /admin/scenario-masters - シナリオマスタ管理
  if (segments[0] === 'admin' && segments[1] === 'scenario-masters') {
    if (segments[2]) {
      return { page: 'scenario-master-edit', scenarioId: segments[2], organizationSlug: null }
    }
    return { page: 'scenario-master-admin', scenarioId: null, organizationSlug: null }
  }
  
  // /org/{slug}/contact - 組織別お問い合わせページ
  if (segments[0] === 'org' && segments[1] && segments[2] === 'contact') {
    return { page: 'org-contact', scenarioId: null, organizationSlug: segments[1] }
  }
  
  // 2セグメント以上の場合、最初のセグメントを組織スラッグとして扱う
  if (segments.length >= 2) {
    const orgSlug = segments[0]
    const subPage = segments[1]
    
    // /{slug}/scenario/{scenarioId} - 予約サイトのシナリオ詳細
    if (subPage === 'scenario' && segments[2]) {
      return { page: 'booking', scenarioId: segments[2], organizationSlug: orgSlug }
    }

    // /{org}/blog/{article-slug} - ブログ記事詳細（組織プレフィックス付きURL）
    // ※ /{org}/blog の2セグメントは ADMIN_PATHS の blog 管理画面へ
    if (subPage === 'blog' && segments[2]) {
      return { page: 'blog-detail', scenarioId: segments[2], organizationSlug: orgSlug }
    }
    
    // /{slug}/{admin-path} - 組織付き管理ページ
    if (ADMIN_PATHS.includes(subPage)) {
      // /{slug}/scenarios/edit/{scenarioId}
      if (subPage === 'scenarios' && segments[2] === 'edit') {
        return { page: 'scenarios-edit', scenarioId: segments[3] || null, organizationSlug: orgSlug }
      }
      return { page: subPage, scenarioId: null, organizationSlug: orgSlug }
    }
    
    // /{slug}/calendar, /{slug}/list, /{slug}/private-booking など - 予約サイトのサブページ
    if (subPage === 'calendar' || subPage === 'list' || subPage === 'private-booking') {
      return { page: 'booking', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'catalog') {
      return { page: 'catalog', scenarioId: null, organizationSlug: orgSlug }
    }
    // /{slug}/faq - 組織固有FAQページ
    if (subPage === 'faq') {
      return { page: 'org-faq', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'cancel-policy') {
      return { page: 'cancel-policy', scenarioId: null, organizationSlug: orgSlug }
    }
    // /{slug}/guide - ご予約ガイド（共通ページ。組織付き URL でも 404 にしない）
    if (subPage === 'guide') {
      return { page: 'guide', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'private-booking-select') {
      return { page: 'private-booking-select', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'private-booking-request') {
      return { page: 'private-booking-request', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'rental-report') {
      return { page: 'rental-report', scenarioId: null, organizationSlug: orgSlug }
    }
  }
  
  // /{slug} - 予約サイトトップ（1セグメントで管理パス以外）
  if (segments.length === 1 && !ADMIN_PATHS.includes(segments[0])) {
    return { page: 'booking', scenarioId: null, organizationSlug: segments[0] }
  }
  
  // 旧形式の管理ページ（後方互換）
  if (ADMIN_PATHS.includes(segments[0])) {
    return { page: segments[0], scenarioId: null, organizationSlug: null }
  }
  
  // /scenarios/edit/{scenarioId}（旧形式）
  if (segments[0] === 'scenarios' && segments[1] === 'edit') {
    return { page: 'scenarios-edit', scenarioId: segments[2] || null, organizationSlug: null }
  }
  
  // デフォルト
  return { page: segments[0] || 'dashboard', scenarioId: null, organizationSlug: null }
}
