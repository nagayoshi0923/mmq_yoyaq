/**
 * 作品の基本情報を短い文字列にする共通の関数（作品ページ・貸切グループページで共用）。
 * 画面ごとに書き方がずれないよう、人数・所要時間・難易度・キャラクター画像の位置はここで作る。
 */
import type { CSSProperties } from 'react'

/** 「4〜6人」「6人」。どちらか欠けていれば null */
export function playerRangeText(min: number | null | undefined, max: number | null | undefined): string | null {
  if (!min || !max) return null
  return min === max ? `${min}人` : `${min}〜${max}人`
}

/** 「約5時間」「約4時間30分」「約50分」 */
export function durationText(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `約${m}分`
  return `約${h}時間${m ? `${m}分` : ''}`
}

/** 平日と土日祝の所要時間。土日祝が同じ・未設定なら平日だけ（「約4時間（土日祝 約5時間）」） */
export function durationWithWeekendText(duration: number | null | undefined, weekendDuration: number | null | undefined): string | null {
  const base = durationText(duration)
  const weekend = weekendDuration && weekendDuration !== duration ? durationText(weekendDuration) : null
  if (!base) return weekend ? `土日祝 ${weekend}` : null
  return weekend ? `${base}（土日祝 ${weekend}）` : base
}

/** 難易度（1〜5）の呼び名。作品ページの見出しと同じ言い方 */
export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '初心者向け',
  2: 'やや易しい',
  3: '普通',
  4: 'やや難しい',
  5: '上級者向け',
}

/** 「難易度 ★★★☆☆（普通）」。範囲外は null */
export function difficultyText(difficulty: number | null | undefined): string | null {
  if (!difficulty || !DIFFICULTY_LABELS[difficulty]) return null
  return `難易度 ${'★'.repeat(difficulty)}${'☆'.repeat(5 - difficulty)}`
}

/** キャラクター画像の位置・拡大（作品の編集画面で決めた「上・中央・下」や「x% y%」、拡大率 %） */
export function characterImageStyle(position: string | null | undefined, scale: number | null | undefined): CSSProperties {
  const objectPosition = position
    ? position.includes(' ')
      ? `${position.split(' ')[0]}% ${position.split(' ')[1]}%`
      : `center ${position}`
    : '50% 50%'
  return { objectPosition, transform: scale ? `scale(${scale / 100})` : undefined }
}
