/**
 * 訪問先組織のテーマプリセットを取得するフック
 *
 * 設計:
 *   テーマカラーは「顧客が訪問先の組織サイトを識別するための色」 であり、
 *   ログインしているスタッフ所属組織の色ではない。
 *   したがって常に URL の slug ベースで組織を取得して色を返す。
 *
 *   - 引数 slug は呼び出し側で URL から取り出して渡す
 *   - localStorage[slug] からキャッシュを同期的に取って初回レンダで即時返す
 *     (リロード時のチラつき防止)
 *   - 同時に getOrganizationBySlug で fetch し、 最新値で上書き + キャッシュ更新
 *   - slug が無い場合 (管理画面等) は DEFAULT_PRESET を返す
 */
import { useEffect, useState } from 'react'
import { getOrganizationBySlug } from '@/lib/organization'
import { findPresetByPrimary, DEFAULT_PRESET, type ThemePreset } from '@/lib/themePresets'

const CACHE_PREFIX = 'mmq_theme_color_'

function readCachedHex(slug?: string | null): string | null {
  if (typeof window === 'undefined') return null
  if (!slug) return null
  try {
    return window.localStorage.getItem(`${CACHE_PREFIX}${slug}`)
  } catch {
    return null
  }
}

function writeCachedHex(slug: string | null | undefined, hex: string): void {
  if (typeof window === 'undefined') return
  if (!slug) return
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${slug}`, hex)
  } catch {
    // localStorage 不可 (Safari private 等) — 無視
  }
}

function presetFromHex(hex: string | null | undefined): ThemePreset | null {
  if (!hex) return null
  const matched = findPresetByPrimary(hex)
  if (matched) return matched
  return { ...DEFAULT_PRESET, key: 'custom', label: 'カスタム', primary: hex }
}

/** URL のパス先頭セグメントから組織 slug を取得 (管理系パスは除外) */
function getSlugFromCurrentPath(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/([^/]+)/)
  if (!match) return null
  const exclude = ['dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission',
    'gm-availability', 'private-booking-management', 'private-booking-groups', 'reservations', 'accounts', 'sales',
    'settings', 'manual', 'login', 'signup', 'reset-password', 'set-password', 'license-management',
    'staff-profile', 'mypage', 'my-page', 'author', 'external-reports', 'accept-invitation',
    'organization-register', 'author-dashboard', 'author-login', 'register', 'about', 'scenario',
    'organizations', 'coupons', 'blog', 'user-management', 'scenario-masters', 'scenario-matcher',
    'license-reports', 'customer-management']
  return exclude.includes(match[1]) ? null : match[1]
}

export function useOrgThemePreset(slug?: string | null): ThemePreset {
  // 引数 slug が無い時は URL から自動取得 (booking-shell 側の wrapper 経由を想定)
  const effectiveSlug = slug ?? getSlugFromCurrentPath()

  // 初回レンダ前に localStorage を同期的に読んでセット (チラつき防止)
  const [cachedHex, setCachedHex] = useState<string | null>(() => readCachedHex(effectiveSlug))
  const [fetchedHex, setFetchedHex] = useState<string | null>(null)

  // slug が変わったらキャッシュを読み直す (組織間遷移対応)
  useEffect(() => {
    setCachedHex(readCachedHex(effectiveSlug))
    setFetchedHex(null)
  }, [effectiveSlug])

  // 訪問先組織を取得して theme_color を反映 + キャッシュ更新
  useEffect(() => {
    if (!effectiveSlug) return
    let cancelled = false
    ;(async () => {
      try {
        const org = await getOrganizationBySlug(effectiveSlug)
        if (cancelled) return
        if (org?.theme_color) {
          writeCachedHex(effectiveSlug, org.theme_color)
          setFetchedHex(org.theme_color)
        }
      } catch {
        // 取得失敗は無視 (キャッシュ or デフォルトで継続)
      }
    })()
    return () => { cancelled = true }
  }, [effectiveSlug])

  const hex = fetchedHex ?? cachedHex
  return presetFromHex(hex) ?? DEFAULT_PRESET
}
