import type { ReactNode } from 'react'

/** 残席の表示（あと N 席。3 席以下は黒丸を付けて目立たせる） */
export function seatsLabel(available: number): ReactNode {
  if (available <= 0) return '満席'
  return available <= 3 ? <>● あと{available}席</> : <span className="font-normal text-muted-foreground">あと{available}席</span>
}

/** 人数（6人 / 4〜6人） */
export function playersLabel(min: number, max: number): string {
  return min === max ? `${max}人` : `${min}〜${max}人`
}

/** 時間（3時間 / 3時間30分） */
export function durationLabel(minutes: number | null | undefined): string | null {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  return m ? `${h}時間${m}分` : `${h}時間`
}
