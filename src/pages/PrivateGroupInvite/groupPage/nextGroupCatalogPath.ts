import { getOrganizationById } from '@/lib/organization'

/**
 * 「同じメンバーで次の貸切」の行き先（作品を選ぶカタログ）。組織の slug が分かればその組織のカタログ、
 * 作品情報からまだ分からない（直リンク・再読み込み）ときはグループの組織から引き、引けなければ全体のカタログ（/scenario）。
 * /catalog という画面は無い（2026-10-26 点検 F12: 404 になっていた）
 */
export async function nextGroupCatalogPath(orgSlug: string | null, organizationId: string | null | undefined): Promise<string> {
  const slug = orgSlug ?? (organizationId ? (await getOrganizationById(organizationId).catch(() => null))?.slug ?? null : null)
  return slug ? `/${slug}/catalog` : '/scenario'
}
