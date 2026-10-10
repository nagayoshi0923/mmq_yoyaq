/**
 * 送る前に端末側で写真を縮小する（長辺 2,000px・JPEG 品質 0.85）。向き（EXIF）は画像の読み込み時に反映される。
 */
import { fitWithin } from './chatModel'

export const PHOTO_MAX_EDGE = 2000
export const PHOTO_JPEG_QUALITY = 0.85

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // HEIC など読めない形式は下の img で試す
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

export async function resizePhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await decode(file)
  try {
    const size = fitWithin(image.width, image.height, PHOTO_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('画像を処理できませんでした')
    // JPEG は透過を持てないので白で塗ってから描く
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(image.source, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY))
    if (!blob) throw new Error('画像を処理できませんでした')
    return { blob, ...size }
  } finally {
    image.close()
  }
}
