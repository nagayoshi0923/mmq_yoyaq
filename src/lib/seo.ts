/**
 * 公開サイト SEO の定数と組み立て。
 * 正規ドメインは本番の公開予約サイト mmq.game。
 */

export const SITE_ORIGIN = 'https://mmq.game'
export const SITE_NAME = 'MMQ'

export const DEFAULT_TITLE = 'マーダーミステリー（マダミス）公演予約 | MMQ'
export const DEFAULT_DESCRIPTION =
  'マーダーミステリー（マダミス）の公演検索・予約。全国の店舗から作品を探して、そのまま予約できます。'

export const ADMIN_PAGE_IDS = [
  'dashboard',
  'store-dashboard',
  'stores',
  'staff',
  'staff-profile',
  'scenarios',
  'scenarios-edit',
  'schedule',
  'shift-submission',
  'gm-availability',
  'private-booking-management',
  'private-booking-groups',
  'reservations',
  'accounts',
  'sales',
  'settings',
  'manual',
  'add-demo-participants',
  'scenario-matcher',
  'organizations',
  'external-reports',
  'license-reports',
  'license-management',
  'customer-management',
  'user-management',
  'coupons',
  'blog',
] as const

/** パスに関係なく noindex にする page id */
export const NOINDEX_PAGE_IDS = new Set<string>([
  'login',
  'signup',
  'reset-password',
  'set-password',
  'complete-profile',
  'coupon-present',
  'mypage',
  'my-page',
  'mypage-reservation-detail',
  'group-create',
  'group-invite',
  'group-manage',
  'accept-invitation',
  'author-dashboard',
  'author-login',
  'partner-report',
  'rental-report',
  'private-booking-request',
  'scenario-master-admin',
  'scenario-master-edit',
  'dev-design-preview',
  'dev-components',
  'dev-project-guide',
  'dev-learn',
])

const ADMIN_SUBPATHS = new Set<string>(ADMIN_PAGE_IDS)

/**
 * 管理URL・ログイン・マイページは noindex。
 * `/stores` は公開、`/{org}/stores` は管理、なので path で判定する。
 */
export function shouldNoindexPath(page: string, pathname: string): boolean {
  if (NOINDEX_PAGE_IDS.has(page)) return true
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === 'admin' || segments[0] === 'dev') return true
  if (segments.length >= 2 && ADMIN_SUBPATHS.has(segments[1])) {
    if (segments[1] === 'blog' && segments.length >= 3) return false
    return true
  }
  return false
}

/**
 * `/stores` は公開一覧。`/{org}/stores` は管理画面。
 * page id が同じ stores でも、ゲストをログインへ送ってよいかは path で分ける。
 */
export function isPublicStoresPath(page: string, pathname: string): boolean {
  if (page !== 'stores') return false
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 1 && segments[0] === 'stores'
}

/** sitemap に載せる組織: 公開予約できる実店舗が1つ以上ある */
export function orgHasPublicBookingStore(
  stores: Array<{ status?: string | null; ownership_type?: string | null }> | null | undefined,
): boolean {
  return (stores ?? []).some(
    (store) => store.status === 'active' && store.ownership_type !== 'office',
  )
}

export const STATIC_PUBLIC_META: Record<string, { title: string; description: string; path: string }> = {
  'platform-top': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
  },
  guide: {
    title: 'マーダーミステリーとは・予約の使い方 | MMQ',
    description:
      'マーダーミステリー（マダミス）の遊び方と、MMQでの公演の探し方・予約手順。初めての方向けガイドです。',
    path: '/guide',
  },
  faq: {
    title: 'よくある質問 | マーダーミステリー予約 MMQ',
    description: 'マーダーミステリー公演の予約・キャンセル・初めての参加について、よくある質問に答えます。',
    path: '/faq',
  },
  stores: {
    title: '参加店舗一覧 | マーダーミステリー MMQ',
    description: 'MMQで公演を予約できるマーダーミステリー店舗・団体の一覧です。',
    path: '/stores',
  },
  scenario: {
    title: 'シナリオを探す | マーダーミステリー予約 | MMQ',
    description: 'MMQで遊べるマーダーミステリー作品の一覧です。全国の店舗から探せます。',
    path: '/scenario',
  },
  about: {
    title: '運営会社 | MMQ',
    description: 'マーダーミステリー公演予約サービス MMQ の運営会社情報です。',
    path: '/about',
  },
  contact: {
    title: 'お問い合わせ | MMQ',
    description: 'MMQ（マーダーミステリー公演予約）へのお問い合わせはこちらから。',
    path: '/contact',
  },
  terms: {
    title: '利用規約 | MMQ',
    description: 'MMQ の利用規約です。',
    path: '/terms',
  },
  privacy: {
    title: 'プライバシーポリシー | MMQ',
    description: 'MMQ のプライバシーポリシーです。',
    path: '/privacy',
  },
  legal: {
    title: '特定商取引法に基づく表記 | MMQ',
    description: 'MMQ の特定商取引法に基づく表記です。',
    path: '/legal',
  },
  security: {
    title: 'セキュリティ | MMQ',
    description: 'MMQ のセキュリティに関する方針です。',
    path: '/security',
  },
  'cancel-policy': {
    title: 'キャンセルポリシー | MMQ',
    description: 'マーダーミステリー公演予約のキャンセル条件は店舗ごとに異なります。最新のポリシーをご確認ください。',
    path: '/cancel-policy',
  },
  company: {
    title: '運営会社 | MMQ',
    description: 'マーダーミステリー公演予約サービス MMQ の運営会社情報です。',
    path: '/company',
  },
  'for-business': {
    title: '店舗・団体向け | マーダーミステリー予約システム MMQ',
    description: 'マーダーミステリー店舗向けの公演管理・オンライン予約システム MMQ のご案内です。',
    path: '/for-business',
  },
  pricing: {
    title: '料金 | MMQ',
    description: 'MMQ の料金プランです。',
    path: '/pricing',
  },
  'getting-started': {
    title: '導入の流れ | MMQ',
    description: 'マーダーミステリー店舗が MMQ を導入する流れです。',
    path: '/getting-started',
  },
}

export function stripSeoQuery(pathWithSearch: string): string {
  const [path, query] = pathWithSearch.split('?')
  if (!query) return path || '/'
  const params = new URLSearchParams(query)
  params.delete('_v')
  const next = params.toString()
  return next ? `${path}?${next}` : (path || '/')
}

export function toCanonicalUrl(path: string): string {
  const cleaned = stripSeoQuery(path.startsWith('http') ? new URL(path).pathname + new URL(path).search : path)
  const normalized = cleaned.startsWith('/') ? cleaned : `/${cleaned}`
  if (normalized === '/') return `${SITE_ORIGIN}/`
  return `${SITE_ORIGIN}${normalized.replace(/\/+$/, '')}`
}

export function scenarioPageTitle(workTitle: string): string {
  return `${workTitle} | マーダーミステリー公演予約 | MMQ`
}

export function scenarioPageDescription(workTitle: string, synopsis?: string | null): string {
  const trimmed = (synopsis ?? '').replace(/\s+/g, ' ').trim()
  if (trimmed.length >= 40) {
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed
  }
  return `マーダーミステリー作品「${workTitle}」の公演日程・予約。MMQで全国の店舗から探せます。`
}

export function orgBookingTitle(organizationName: string): string {
  return `${organizationName} | マーダーミステリー予約 | MMQ`
}

export function orgBookingDescription(organizationName: string): string {
  return `${organizationName}のマーダーミステリー公演を検索・予約できます。`
}

export function blogPageTitle(articleTitle: string): string {
  return `${articleTitle} | MMQ`
}

export function slugifyScenarioTitle(title: string, fallbackId: string): string {
  const ascii = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii.length >= 2) return ascii
  const id = fallbackId.replace(/-/g, '').slice(0, 16)
  return `s-${id}`
}

export function buildWebsiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    description: DEFAULT_DESCRIPTION,
    inLanguage: 'ja',
  }
}

export function buildCreativeWorkJsonLd(input: {
  title: string
  description?: string | null
  author?: string | null
  image?: string | null
  canonicalPath: string
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: input.title,
    description: input.description || undefined,
    author: input.author ? { '@type': 'Person', name: input.author } : undefined,
    image: input.image || undefined,
    url: toCanonicalUrl(input.canonicalPath),
    inLanguage: 'ja',
  }
}

export function buildEventJsonLd(input: {
  workTitle: string
  canonicalPath: string
  events: Array<{
    date: string
    startTime?: string | null
    organizationName?: string | null
    storeName?: string | null
  }>
}): Record<string, unknown>[] {
  return input.events.slice(0, 10).map((event) => ({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${input.workTitle}（マーダーミステリー公演）`,
    url: toCanonicalUrl(input.canonicalPath),
    startDate: event.startTime ? `${event.date}T${event.startTime}+09:00` : event.date,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: event.storeName || event.organizationName || 'MMQ 参加店舗',
    },
    organizer: event.organizationName
      ? { '@type': 'Organization', name: event.organizationName }
      : undefined,
  }))
}

export function buildFaqJsonLd(items: Array<{ question: string; answer: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

export const MURDER_MYSTERY_FAQ = [
  {
    question: 'マーダーミステリー（マダミス）とは何ですか？',
    answer:
      'マーダーミステリー（通称マダミス）は、参加者が物語の登場人物になりきり、会話と推理で事件の真相を探る体験型ゲームです。一度きりの物語を、店舗の公演で楽しめます。',
  },
  {
    question: 'マダミスは初めてでも参加できますか？',
    answer:
      '参加できます。スタッフがルールを説明する公演がほとんどです。MMQの作品ページで人数・所要時間・公演日程を確認して予約できます。',
  },
  {
    question: 'MMQで何ができますか？',
    answer:
      '全国の参加店舗のマーダーミステリー公演を検索し、そのまま予約できます。作品名から探すことも、店舗から探すこともできます。',
  },
] as const
