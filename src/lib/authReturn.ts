/**
 * ログイン・新規登録の「戻り先」をまとめて扱う（点検 2026-10-11 の 1・3・25）。
 *
 * 決まり:
 * - 戻り先は URL（/login?redirect=… や確認メールのリンクの ?next=…）に載せる。
 *   タブ内の記憶（sessionStorage）だけに頼ると、メールのリンクを別のタブで開いたときに消える。
 * - sessionStorage の returnUrl は Google ログイン（画面の外へ出て戻ってくる）のためだけに残す。
 *   ログイン画面を戻り先なしで開いたら古い値は消す（前に押した別ページへ飛ぶのを防ぐ）。
 * - 「何を予約しようとしているか」の短い説明（作品名・日時）は同じタブの中だけで使う。
 */
import { safeRedirectAfterProfileCompletion } from '@/lib/utils'

export const RETURN_URL_STORAGE_KEY = 'returnUrl'
const AUTH_INTENT_STORAGE_KEY = 'authIntent'

/** 戻り先として使ってよい URL に直す。使えない・トップだけのときは null */
export function normalizeReturnTo(url: string | null | undefined): string | null {
  const safe = safeRedirectAfterProfileCompletion(url, '')
  if (!safe || safe === '/') return null
  return safe
}

/** /login?redirect=… または /signup?redirect=…（戻り先が無ければ素の URL） */
export function buildAuthUrl(kind: 'login' | 'signup', returnTo?: string | null): string {
  const base = kind === 'signup' ? '/signup' : '/login'
  const safe = normalizeReturnTo(returnTo)
  return safe ? `${base}?redirect=${encodeURIComponent(safe)}` : base
}

/** URL の ?redirect=（無ければ ?next=）から戻り先を読む */
export function readReturnToFromSearch(search: string): string | null {
  const params = new URLSearchParams(search)
  return normalizeReturnTo(params.get('redirect') ?? params.get('next'))
}

/** プロフィール登録画面の URL（登録後に戻る先を ?next= に載せる） */
export function buildCompleteProfilePath(next?: string | null): string {
  const safe = normalizeReturnTo(next)
  return safe ? `/complete-profile?next=${encodeURIComponent(safe)}` : '/complete-profile'
}

/** 確認メールのリンクの行き先（emailRedirectTo）。戻り先をリンク自体に載せる */
export function buildSignupEmailRedirectTo(origin: string, returnTo?: string | null): string {
  return `${origin}${buildCompleteProfilePath(returnTo)}`
}

/** 今いる画面（パス＋クエリ） */
export function currentPathWithSearch(): string {
  return `${window.location.pathname}${window.location.search}`
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Google ログインから戻ったとき用に、タブ内にも戻り先を覚える */
export function rememberReturnUrl(returnTo: string | null): void {
  const storage = safeSessionStorage()
  if (!storage) return
  const safe = normalizeReturnTo(returnTo)
  if (safe) storage.setItem(RETURN_URL_STORAGE_KEY, safe)
  else storage.removeItem(RETURN_URL_STORAGE_KEY)
}

export function forgetReturnUrl(): void {
  safeSessionStorage()?.removeItem(RETURN_URL_STORAGE_KEY)
}

export type AuthIntent = {
  /** この説明が当てはまる戻り先 */
  returnTo: string
  /** 例: 「〇〇」10月12日(日) 14:00〜 */
  label: string
}

/** ログイン・新規登録画面に「何を予約しようとしているか」を出すための説明を覚える */
export function rememberAuthIntent(intent: AuthIntent): void {
  const storage = safeSessionStorage()
  const safe = normalizeReturnTo(intent.returnTo)
  if (!storage || !safe) return
  storage.setItem(AUTH_INTENT_STORAGE_KEY, JSON.stringify({ returnTo: safe, label: intent.label }))
}

/** 戻り先が一致するときだけ説明を返す（別の画面の説明を出さない） */
export function readAuthIntent(returnTo: string | null): AuthIntent | null {
  if (!returnTo) return null
  const raw = safeSessionStorage()?.getItem(AUTH_INTENT_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AuthIntent>
    if (typeof parsed.label !== 'string' || typeof parsed.returnTo !== 'string') return null
    return parsed.returnTo === returnTo ? { returnTo: parsed.returnTo, label: parsed.label } : null
  } catch {
    return null
  }
}

/** ログインへ送る（戻り先と、あれば「何を予約しようとしているか」を付けて） */
export function loginUrlWithIntent(
  kind: 'login' | 'signup',
  returnTo: string,
  label?: string | null,
): string {
  if (label) rememberAuthIntent({ returnTo, label })
  return buildAuthUrl(kind, returnTo)
}
