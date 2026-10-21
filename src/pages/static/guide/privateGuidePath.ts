/** 貸切の流れのページの URL。店舗の予約サイトから来たときは組織付き（/{org}/guide/private）にする */
export function privateGuidePath(organizationSlug?: string | null): string {
  return organizationSlug ? `/${organizationSlug}/guide/private` : '/guide/private'
}
