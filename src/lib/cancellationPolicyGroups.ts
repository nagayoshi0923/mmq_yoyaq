/**
 * 公開キャンセルポリシーを「内容が同じ店舗」ごとにまとめる（点検 2026-10-11 の 21）。
 * 店舗の数だけ同じ規定を繰り返すと長くなるため、内容が同じ店舗は 1 回だけ出し「対象店舗」に並べる。
 * 比べるのは規定の中身だけ（店舗の id・名前・最終更新日は比べない）。
 */
import type { PublicCancellationPolicy } from '@/lib/publicCancellationPolicy'

export interface CancellationPolicyGroup {
  /** 代表の規定（最初の店舗のもの。最終更新日はまとめた中で一番新しい日） */
  policy: PublicCancellationPolicy
  storeNames: string[]
  storeIds: string[]
}

const IGNORED_KEYS = new Set<keyof PublicCancellationPolicy>([
  'store_id', 'store_name', 'store_short_name', 'policy_updated_at',
])

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** 規定の中身の比較用の文字列 */
export function policyContentKey(policy: PublicCancellationPolicy): string {
  const content: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(policy)) {
    if (!IGNORED_KEYS.has(key as keyof PublicCancellationPolicy)) content[key] = value
  }
  return stableStringify(content)
}

export function groupPoliciesByContent(policies: readonly PublicCancellationPolicy[]): CancellationPolicyGroup[] {
  const groups: CancellationPolicyGroup[] = []
  const byKey = new Map<string, CancellationPolicyGroup>()
  for (const policy of policies) {
    const key = policyContentKey(policy)
    const existing = byKey.get(key)
    if (!existing) {
      const group = { policy, storeNames: [policy.store_name], storeIds: [policy.store_id] }
      byKey.set(key, group)
      groups.push(group)
      continue
    }
    if (!existing.storeNames.includes(policy.store_name)) existing.storeNames.push(policy.store_name)
    existing.storeIds.push(policy.store_id)
    const latest = [existing.policy.policy_updated_at, policy.policy_updated_at].filter(Boolean).sort().pop() ?? null
    if (latest !== existing.policy.policy_updated_at) existing.policy = { ...existing.policy, policy_updated_at: latest }
  }
  return groups
}
