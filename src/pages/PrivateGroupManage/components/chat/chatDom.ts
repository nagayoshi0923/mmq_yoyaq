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

/**
 * 写真をまとめて端末に保存する（思い出タブの「まとめて保存」、段階 4）。
 * スマホは 1 回の共有シートに全部渡す（「画像を保存」で写真に入る）。使えなければ 1 枚ずつ順にダウンロードする。
 */
export async function savePhotos(items: ReadonlyArray<{ url: string; name: string }>, onProgress?: (done: number) => void): Promise<number> {
  const files: File[] = []
  for (const item of items) {
    try {
      const res = await fetch(item.url)
      if (!res.ok) continue
      files.push(new File([await res.blob()], item.name, { type: 'image/jpeg' }))
      onProgress?.(files.length)
    } catch {
      // 読めなかった写真は飛ばす
    }
  }
  if (files.length === 0) return 0
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files }) && window.matchMedia?.('(pointer: coarse)').matches) {
    try {
      await nav.share({ files })
      return files.length
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 0
    }
  }
  for (const file of files) {
    const href = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = href
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    // ブラウザが連続のダウンロードを止めないよう少し間をあける
    await new Promise(resolve => window.setTimeout(resolve, 250))
  }
  return files.length
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
