/**
 * 貸切の色の組（マイページの貸切カードとグループ画面の「いまの状態」の箱で共通）。
 */
import type { PrivateBookingTone } from './privateBookingModel'

/** 色の組（改善案 Main.dc.html の各カードの指定に合わせる） */
export const PRIVATE_BOOKING_TONE: Record<PrivateBookingTone, { card: string; header: string; chip: string; sub: string; done: string; current: string; primary: string }> = {
  purple: {
    card: 'border-violet-200',
    header: 'bg-violet-50',
    chip: 'bg-violet-600 text-white',
    sub: 'text-violet-800',
    done: 'bg-violet-600 text-white border-violet-600',
    current: 'border-violet-600 text-violet-800 font-bold',
    primary: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
  green: {
    card: 'border-green-200',
    header: 'bg-green-50',
    chip: 'bg-green-700 text-white',
    sub: 'text-green-800',
    done: 'bg-green-700 text-white border-green-700',
    current: 'border-green-700 text-green-800 font-bold',
    primary: 'bg-green-700 hover:bg-green-800 text-white',
  },
  amber: {
    card: 'border-amber-200',
    header: 'bg-amber-50',
    chip: 'bg-amber-700 text-white',
    sub: 'text-amber-800',
    done: 'bg-amber-700 text-white border-amber-700',
    current: 'border-amber-700 text-amber-800 font-bold',
    primary: 'bg-amber-700 hover:bg-amber-800 text-white',
  },
  gray: {
    card: 'border-border',
    header: 'bg-muted',
    chip: 'bg-zinc-600 text-white',
    sub: 'text-muted-foreground',
    done: 'bg-zinc-600 text-white border-zinc-600',
    current: 'border-zinc-600 text-foreground font-bold',
    primary: 'bg-zinc-700 hover:bg-zinc-800 text-white',
  },
}
