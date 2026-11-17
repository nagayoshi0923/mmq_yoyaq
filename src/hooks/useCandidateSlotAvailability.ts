// 貸切の候補日時の選択（空き判定は DB の private_booking_candidate_slot_availability 系）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { logger } from '@/utils/logger'
import {
  buildCandidateSlotAvailability,
  fetchCandidateSlotAvailability,
  type CandidateSlotAvailability,
  type CandidateSlotAvailabilityTarget,
} from '@/lib/candidateSlotAvailability'

const EMPTY: CandidateSlotAvailability = { slotsByDate: {}, unavailableReasons: {} }

/**
 * 読んだ空き状況を少しのあいだ覚えておく（月を行き来したとき・店舗を付け外ししたときに毎回待たせない）。
 * 2 分で捨てる。申込・候補日の保存は DB がその場で判定し直すので、ここで古い表示が残っても予約は壊れない。
 * 「再読み込み」は覚えたものを使わない。2026-11-18 えいきち報告「空き状況を読み込み中の時間が長い」
 */
const CACHE_TTL_MS = 2 * 60_000
const cache = new Map<string, { at: number; value: Promise<CandidateSlotAvailability> }>()

function targetKeyOf(target: CandidateSlotAvailabilityTarget): string {
  return target.kind === 'group'
    ? `group:${target.groupId}`
    : `scenario:${target.organizationId}:${target.scenarioId}:${[...target.storeIds].sort().join(',')}`
}

/**
 * DB の空き状況は一度に約2か月までしか読めない（それより長いと 400）。月ごとに分けて読み、月ごとに覚える。
 * 作品ページの貸切タブは日付を続けて並べ、下まで見ると1か月ずつ足すので、足した月だけを読む。
 */
function monthChunks(from: string, to: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  let start = from
  while (start <= to) {
    const [y, m] = start.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    const end = monthEnd < to ? monthEnd : to
    out.push([start, end])
    const next = new Date(Date.UTC(y, m, 1))
    start = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`
  }
  return out
}

function mergeAvailability(parts: CandidateSlotAvailability[]): CandidateSlotAvailability {
  const merged: CandidateSlotAvailability = { slotsByDate: {}, unavailableReasons: {} }
  for (const part of parts) {
    Object.assign(merged.slotsByDate, part.slotsByDate)
    Object.assign(merged.unavailableReasons, part.unavailableReasons)
  }
  return merged
}

/** 月ごとに分けて読む（覚えない。申込の確認・候補日の保存の画面用） */
function fetchByMonth(target: CandidateSlotAvailabilityTarget, from: string, to: string): Promise<CandidateSlotAvailability> {
  return Promise.all(monthChunks(from, to).map(([a, b]) => fetchCandidateSlotAvailability(target, a, b).then(buildCandidateSlotAvailability)))
    .then(mergeAvailability)
}

function loadChunk(target: CandidateSlotAvailabilityTarget, from: string, to: string, fresh: boolean): Promise<CandidateSlotAvailability> {
  const key = `${targetKeyOf(target)}|${from}|${to}`
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  const value = fetchCandidateSlotAvailability(target, from, to).then(buildCandidateSlotAvailability)
  cache.set(key, { at: Date.now(), value })
  value.then((v) => settled.set(value, v)).catch(() => { if (cache.get(key)?.value === value) cache.delete(key) })
  return value
}

function loadCached(target: CandidateSlotAvailabilityTarget, from: string, to: string, fresh = false): Promise<CandidateSlotAvailability> {
  return Promise.all(monthChunks(from, to).map(([a, b]) => loadChunk(target, a, b, fresh))).then(mergeAvailability)
}

/** すでに覚えていて新しいなら、その結果（同期で返す。初回の「読み込み中」を出さないため） */
const settled = new WeakMap<Promise<CandidateSlotAvailability>, CandidateSlotAvailability>()
function peekCached(target: CandidateSlotAvailabilityTarget, from: string, to: string): CandidateSlotAvailability | null {
  const parts: CandidateSlotAvailability[] = []
  for (const [a, b] of monthChunks(from, to)) {
    const hit = cache.get(`${targetKeyOf(target)}|${a}|${b}`)
    if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) return null
    const v = settled.get(hit.value)
    if (!v) return null
    parts.push(v)
  }
  return mergeAvailability(parts)
}

/** 次に見そうな範囲（次の月など）を先に読んでおく。失敗しても何もしない */
export function prefetchCandidateSlotAvailability(target: CandidateSlotAvailabilityTarget | null, dates: readonly string[]): void {
  if (!target || dates.length === 0) return
  const from = dates.reduce((a, b) => (a < b ? a : b))
  const to = dates.reduce((a, b) => (a > b ? a : b))
  loadCached(target, from, to).catch(() => {})
}

/** テスト用: 覚えた空き状況を消す */
export function clearCandidateSlotAvailabilityCache(): void {
  cache.clear()
}

/**
 * 表示中の日付（dates）の空き状況を DB から読む。target が null・dates が空なら読まない。
 * 画面側で空きを計算しない（判定は DB と一本化）。
 */
export function useCandidateSlotAvailability(
  target: CandidateSlotAvailabilityTarget | null,
  dates: string[],
  /** cache: 2 分以内に読んだ結果を使う（作品ページの貸切タブで空きを眺めるときだけ。申込の確認・候補日の保存の画面は毎回読む） */
  options: { cache?: boolean } = {},
) {
  const useCache = options.cache === true
  const [availability, setAvailability] = useState<CandidateSlotAvailability>(EMPTY)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const from = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null
  const to = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null
  const targetKey = target ? targetKeyOf(target) : null
  const requestKey = targetKey && from && to ? `${targetKey}|${from}|${to}|${reloadToken}` : null

  useEffect(() => {
    if (!requestKey || !target || !from || !to) {
      setAvailability(EMPTY)
      setLoadedKey(null)
      setError(null)
      return
    }
    let cancelled = false
    setError(null)
    // 覚えている結果があればすぐ出す（「読み込み中」を挟まない）。再読み込みのときは使わない
    const peek = useCache && reloadToken === 0 ? peekCached(target, from, to) : null
    if (peek) {
      setAvailability(peek)
      setLoadedKey(requestKey)
      return
    }
    const p = useCache
      ? loadCached(target, from, to, reloadToken > 0)
      : fetchByMonth(target, from, to)
    p
      .then(value => {
        if (cancelled) return
        setAvailability(value)
        setLoadedKey(requestKey)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        logger.error('Failed to load candidate slot availability', err)
        setAvailability(EMPTY)
        setLoadedKey(requestKey)
        setError('空き状況を読み込めませんでした。通信を確認して再読み込みしてください。')
      })
    return () => {
      cancelled = true
    }
    // target は targetKey で比較する（呼出側の再生成で読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const reload = useCallback(() => setReloadToken(n => n + 1), [])
  const loading = requestKey !== null && loadedKey !== requestKey
  const ready = requestKey !== null && loadedKey === requestKey && !error

  return useMemo(() => ({ availability, loading, ready, error, reload }), [availability, loading, ready, error, reload])
}

/**
 * 作品ページの貸切タブ: 枠ごとに「どの店舗で空いているか」（例: 19:00 馬場・大久保）。
 * 店舗ごとに同じ DB 判定（private_booking_candidate_slot_availability を店舗1つで）を読んで合わせるだけ。
 * 返り値は `${date}-${label}` → 空いている店舗 id（選んだ店舗の並び順）。読み終わるまでは空。
 * 2026-11-18 えいきち「表示内容がこれじゃない」（見本は「13:00 馬場 空きあり」の形）
 */
export function useCandidateSlotStores(
  target: CandidateSlotAvailabilityTarget | null,
  dates: string[],
): Record<string, string[]> {
  const [byKey, setByKey] = useState<Record<string, string[]>>({})
  const from = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null
  const to = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null
  const scenario = target?.kind === 'scenario' ? target : null
  const requestKey = scenario && from && to ? `${scenario.organizationId}:${scenario.scenarioId}:${scenario.storeIds.join(',')}|${from}|${to}` : null

  useEffect(() => {
    if (!scenario || !from || !to) {
      setByKey({})
      return
    }
    let cancelled = false
    const perStore = scenario.storeIds.map((storeId) => {
      const one: CandidateSlotAvailabilityTarget = { ...scenario, storeIds: [storeId] }
      const peek = peekCached(one, from, to)
      if (peek) return Promise.resolve({ storeId, value: peek })
      return loadCached(one, from, to).then((value) => ({ storeId, value }))
    })
    Promise.allSettled(perStore).then((results) => {
      if (cancelled) return
      const next: Record<string, string[]> = {}
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        const { storeId, value } = r.value
        for (const [date, slots] of Object.entries(value.slotsByDate)) {
          for (const slot of slots) {
            const key = `${date}-${slot.label}`
            if (value.unavailableReasons[key] || !slot.startTime) continue
            ;(next[key] ??= []).push(storeId)
          }
        }
      }
      setByKey(next)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  return byKey
}

/** 次の月の店舗ごとの空きも先に読んでおく */
export function prefetchCandidateSlotStores(target: CandidateSlotAvailabilityTarget | null, dates: readonly string[]): void {
  if (!target || target.kind !== 'scenario' || target.storeIds.length < 2) return
  for (const storeId of target.storeIds) prefetchCandidateSlotAvailability({ ...target, storeIds: [storeId] }, dates)
}
