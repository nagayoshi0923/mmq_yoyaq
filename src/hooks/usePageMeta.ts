import { useEffect } from 'react'
import { SITE_NAME, toCanonicalUrl } from '@/lib/seo'

export type PageMetaInput = {
  title: string
  description?: string
  canonicalPath?: string
  noindex?: boolean
  image?: string | null
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

/**
 * 公開・管理ページの title / description / canonical / robots を document.head に反映する。
 */
export function usePageMeta(meta: PageMetaInput) {
  const { title, description, canonicalPath, noindex, image } = meta

  useEffect(() => {
    document.title = title

    if (description) {
      upsertMeta('name', 'description', description)
    }

    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')

    const path = canonicalPath ?? `${window.location.pathname}${window.location.search}`
    const canonical = toCanonicalUrl(path)
    upsertCanonical(canonical)

    upsertMeta('property', 'og:title', title)
    if (description) upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', canonical)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:locale', 'ja_JP')
    upsertMeta('property', 'og:site_name', SITE_NAME)
    if (image) upsertMeta('property', 'og:image', image)

    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
    upsertMeta('name', 'twitter:title', title)
    if (description) upsertMeta('name', 'twitter:description', description)
  }, [title, description, canonicalPath, noindex, image])
}
