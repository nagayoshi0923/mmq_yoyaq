import { createClient } from '@supabase/supabase-js'
import { isVerboseDebug } from '@/utils/logger'

// 環境変数のバリデーション
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Supabaseの新API Keys対応:
// - publishable key: sb_publishable_... ← Legacy API Keysが無効な環境ではこちらを使用
// - legacy anon key (JWT): eyJ...
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '⚠️ Supabase環境変数が設定されていません。\n' +
    'VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY（推奨）または VITE_SUPABASE_ANON_KEY を .env.local ファイルに設定してください。\n' +
    '詳細は env.example を参照してください。'
  )
}

// 環境変数をエクスポート（他のモジュールでAPI呼び出しに使用）
// URLの末尾スラッシュを除去して正規化
export const SUPABASE_URL = supabaseUrl.replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = supabaseKey

// キー種別ログは VITE_DEBUG=true の開発時のみ（起動のコンソールノイズ削減）
try {
  if (isVerboseDebug) {
    const key = String(supabaseKey || '')
    const kind = key.startsWith('sb_publishable_')
      ? 'publishable'
      : key.startsWith('eyJ')
        ? 'legacy_jwt'
        : 'unknown'
    const prefix = key ? `${key.slice(0, 12)}…` : 'null'
    console.info('[supabase] api key kind:', { kind, prefix, len: key.length })
    if (kind === 'legacy_jwt') {
      console.warn(
        '[supabase] Legacy JWT key is configured. If Supabase Legacy API keys are disabled, login/REST will fail. Use sb_publishable_...'
      )
    }
  }
} catch {
  // noop
}

// Safari ITP対策: IndexedDBを使用したカスタムストレージ
// localStorageはSafariのITPにより消される可能性があるため、
// IndexedDBにフォールバックしてセッションを永続化
const createCustomStorage = () => {
  const DB_NAME = 'mmq-auth-storage'
  const STORE_NAME = 'auth'
  const STORAGE_KEY = 'mmq-supabase-auth'
  
  let dbPromise: Promise<IDBDatabase> | null = null
  
  const getDb = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise
    
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
    })
    
    return dbPromise
  }
  
  return {
    getItem: async (key: string): Promise<string | null> => {
      // まずlocalStorageを試す（高速）
      try {
        const localValue = localStorage.getItem(key)
        if (localValue) return localValue
      } catch {}
      
      // IndexedDBにフォールバック
      try {
        const db = await getDb()
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly')
          const store = tx.objectStore(STORE_NAME)
          const request = store.get(key)
          request.onsuccess = () => resolve(request.result || null)
          request.onerror = () => resolve(null)
        })
      } catch {
        return null
      }
    },
    
    setItem: async (key: string, value: string): Promise<void> => {
      // 両方に保存（冗長性確保）
      try {
        localStorage.setItem(key, value)
      } catch {}
      
      try {
        const db = await getDb()
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite')
          const store = tx.objectStore(STORE_NAME)
          const request = store.put(value, key)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      } catch {}
    },
    
    removeItem: async (key: string): Promise<void> => {
      try {
        localStorage.removeItem(key)
      } catch {}
      
      try {
        const db = await getDb()
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite')
          const store = tx.objectStore(STORE_NAME)
          const request = store.delete(key)
          request.onsuccess = () => resolve()
          request.onerror = () => resolve()
        })
      } catch {}
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // セッションを永続化
    persistSession: true,
    // トークンの自動リフレッシュを有効化
    autoRefreshToken: true,
    // 非同期でセッションを検出（パフォーマンス向上）
    detectSessionInUrl: true,
    // ストレージキーを明示的に設定
    storageKey: 'mmq-supabase-auth',
    // implicit フロー: Magic Link 使用時は別ブラウザでも動作
    flowType: 'implicit',
    // Safari ITP対策: IndexedDBを使用したカスタムストレージ
    storage: createCustomStorage(),
  },
})

// 認証状態の型定義
export type AuthUser = {
  id: string
  email: string
  name?: string
  staffName?: string
  customerName?: string  // 顧客テーブルから取得した名前（顧客ロール用）
  role: 'admin' | 'staff' | 'customer' | 'license_admin'
  created_at?: string  // ユーザー登録日
}

// ログイン関数
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  
  if (error) throw error
  return data
}

// ログアウト関数
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// 現在のユーザー情報を取得
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null
  
  // ユーザーのロール情報を取得（実際のテーブル構造に応じて調整）
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  
  return {
    id: user.id,
    email: user.email!,
    role: profile?.role || 'customer'
  }
}
