// date-fns v4 は root (`date-fns`) からの再exportが限定的なため、
// アプリ側ではこのファイル経由で import して型/ビルドを安定させる。

// date-fns v4 は ESM/CJS の解決差分が環境依存で出やすいので、
// サブパスを namespace import して、named/default の違いを吸収する。
// ここで最低限の型を付け、アプリ側は常に `@/lib/dateFns` から named import する。

type DateInput = Date | number
type Interval = { start: DateInput; end: DateInput }

import * as addDaysMod from 'date-fns/addDays'
import * as addMonthsMod from 'date-fns/addMonths'
import * as eachDayOfIntervalMod from 'date-fns/eachDayOfInterval'
import * as endOfMonthMod from 'date-fns/endOfMonth'
import * as formatMod from 'date-fns/format'
import * as formatDistanceToNowMod from 'date-fns/formatDistanceToNow'
import * as getDayMod from 'date-fns/getDay'
import * as isPastMod from 'date-fns/isPast'
import * as isTodayMod from 'date-fns/isToday'
import * as isWithinIntervalMod from 'date-fns/isWithinInterval'
import * as parseISOMod from 'date-fns/parseISO'
import * as startOfMonthMod from 'date-fns/startOfMonth'
import * as subMonthsMod from 'date-fns/subMonths'

type AnyFn = (...args: unknown[]) => unknown

function pickFn(mod: unknown, name: string): AnyFn {
  const m = mod as Record<string, unknown>
  const fn = (m[name] ?? m.default) as AnyFn | undefined
  if (!fn) throw new Error(`dateFns: failed to load ${name}`)
  return fn
}

export const addDays = pickFn(addDaysMod, 'addDays') as (date: DateInput, amount: number) => Date
export const addMonths = pickFn(addMonthsMod, 'addMonths') as (date: DateInput, amount: number) => Date
export const eachDayOfInterval = pickFn(eachDayOfIntervalMod, 'eachDayOfInterval') as (interval: Interval) => Date[]
export const endOfMonth = pickFn(endOfMonthMod, 'endOfMonth') as (date: DateInput) => Date
export const formatDistanceToNow = pickFn(formatDistanceToNowMod, 'formatDistanceToNow') as (date: DateInput, options?: unknown) => string
export const getDay = pickFn(getDayMod, 'getDay') as (date: DateInput) => number
export const isPast = pickFn(isPastMod, 'isPast') as (date: DateInput) => boolean
export const isToday = pickFn(isTodayMod, 'isToday') as (date: DateInput) => boolean
export const isWithinInterval = pickFn(isWithinIntervalMod, 'isWithinInterval') as (date: DateInput, interval: Interval) => boolean
export const parseISO = pickFn(parseISOMod, 'parseISO') as (isoString: string) => Date
export const startOfMonth = pickFn(startOfMonthMod, 'startOfMonth') as (date: DateInput) => Date
export const subMonths = pickFn(subMonthsMod, 'subMonths') as (date: DateInput, amount: number) => Date
export const format = pickFn(formatMod, 'format') as (date: DateInput, formatStr: string, options?: unknown) => string

