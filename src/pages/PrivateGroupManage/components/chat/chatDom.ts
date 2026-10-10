/**
 * チャットの画面操作の小道具（写真の保存・発言への移動）。
 */
import { toast } from 'sonner'

/** 写真を端末に保存する（署名付き URL は別のドメインなので、いったん読み込んでから保存する） */
export async function savePhoto(url: string, name: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const file = new File([blob], name, { type: 'image/jpeg' })
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
    // スマホは共有シート（「画像を保存」）を使う
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) && window.matchMedia?.('(pointer: coarse)').matches) {
      await nav.share({ files: [file] })
      return
    }
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return
    toast.error('写真を保存できませんでした')
  }
}

/** 発言へ移動して少しの間目立たせる */
export function jumpToMessage(messageId: string) {
  const el = document.getElementById(`chat-msg-${messageId}`)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('bg-purple-50')
  window.setTimeout(() => el.classList.remove('bg-purple-50'), 1500)
  return true
}
