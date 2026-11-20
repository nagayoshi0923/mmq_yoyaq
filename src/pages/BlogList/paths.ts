/** 特集・お知らせの一覧（QW-20261116-001）。組織トップから来たときは ?org= でその組織の記事だけ */
export const BLOG_LIST_PATH = '/features'

export function blogListPath(organizationSlug?: string | null): string {
  return organizationSlug ? `${BLOG_LIST_PATH}?org=${encodeURIComponent(organizationSlug)}` : BLOG_LIST_PATH
}
