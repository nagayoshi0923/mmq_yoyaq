import { del as idbDel } from 'idb-keyval'
import { logger } from '@/utils/logger'

/** 公演データを端末（IndexedDB）に保存するときのキー。組織の区別は持たない。 */
export const PERSISTED_QUERY_CACHE_KEY = 'mmq-schedule-idb-cache'

/**
 * 端末に保存した公演データを消す。組織を切り替えたときやログアウトしたときに呼び、
 * 次に開いた画面で前の組織・前の利用者の公演が一瞬でも出ないようにする。
 */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await idbDel(PERSISTED_QUERY_CACHE_KEY)
  } catch (error) {
    logger.warn('端末に保存した公演データを消せませんでした', error)
  }
}
