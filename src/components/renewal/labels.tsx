import type { ReactNode } from 'react'

/**
 * 残席の色の段階（2026-11-19 えいきち「あと3席などの表示、カラーで優先度つけて」）。
 * あと1席=赤（いちばん急ぐ）／あと2〜3席=オレンジ／あと4席以上=灰（目立たせない）／満席=灰。
 * 「あと N 席」を出す画面はすべてこれを使い、画面ごとに色を変えない。
 */
export type SeatTone = 'last' | 'few' | 'plenty' | 'full'
export function seatTone(available: number): SeatTone {
  if (available <= 0) return 'full'
  if (available === 1) return 'last'
  return available <= 3 ? 'few' : 'plenty'
}
const SEAT_TONE_CLASS: Record<SeatTone, string> = {
  last: 'font-bold text-red-600',
  few: 'font-bold text-orange-600',
  plenty: 'font-normal text-muted-foreground',
  full: 'font-normal text-muted-foreground',
}
export function seatToneClass(available: number): string {
  return SEAT_TONE_CLASS[seatTone(available)]
}

/** 残席の表示（あと N 席。色は seatTone。3 席以下は黒丸を付けて目立たせる） */
export function seatsLabel(available: number): ReactNode {
  const tone = seatTone(available)
  const text = tone === 'full' ? '満席' : tone === 'plenty' ? `あと${available}席` : `● あと${available}席`
  return <span className={SEAT_TONE_CLASS[tone]} data-seat-tone={tone}>{text}</span>
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
