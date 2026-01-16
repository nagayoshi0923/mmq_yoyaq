import { useMemo } from 'react'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

export interface GmStatsItem {
  staffId: string
  staffName: string
  working: number    // 出勤（main/sub/reception）
  cancelled: number  // 中止
  participant: number // 参加（staff）
  observer: number   // 見学（observer）
  total: number      // 合計
}

export interface GmStatsData {
  byGm: GmStatsItem[]
  totals: {
    working: number
    cancelled: number
    participant: number
    observer: number
  }
}

/**
 * GMの出勤統計を計算するフック
 * 
 * 分類:
 * - 出勤: main/sub/receptionとして担当（中止でない）
 * - 中止: 担当イベントが中止
 * - 参加: staffとしてイベントに参加
 * - 見学: observerとしてイベントに参加
 */
export function useGmStats(events: ScheduleEvent[], gmList: Staff[]): GmStatsData {
  return useMemo(() => {
    // GMリストからマップを作成（ID→名前、名前→ID）
    const staffIdToName = new Map<string, string>()
    const staffNameToId = new Map<string, string>()
    gmList.forEach(gm => {
      const name = gm.display_name || gm.name
      staffIdToName.set(gm.id, name)
      staffNameToId.set(name, gm.id)
    })
    
    // GMごとの統計を集計
    const statsMap = new Map<string, GmStatsItem>()
    
    // 初期化（全GMを対象）
    gmList.forEach(gm => {
      const name = gm.display_name || gm.name
      statsMap.set(gm.id, {
        staffId: gm.id,
        staffName: name,
        working: 0,
        cancelled: 0,
        participant: 0,
        observer: 0,
        total: 0
      })
    })
    
    // イベントを走査して集計
    events.forEach(event => {
      if (!event.gms || event.gms.length === 0) return
      
      const gmRoles = event.gm_roles || {}
      const isCancelled = event.is_cancelled
      
      event.gms.forEach(gm => {
        // GMがIDか名前かを判定
        let staffId = gm
        let staffName = gm
        
        if (staffIdToName.has(gm)) {
          // gmがIDの場合
          staffId = gm
          staffName = staffIdToName.get(gm) || gm
        } else if (staffNameToId.has(gm)) {
          // gmが名前の場合
          staffId = staffNameToId.get(gm) || gm
          staffName = gm
        } else {
          // マッチしない場合はスキップ（または未登録GMとして追加も可）
          return
        }
        
        // 統計データを取得（なければ作成）
        if (!statsMap.has(staffId)) {
          statsMap.set(staffId, {
            staffId,
            staffName,
            working: 0,
            cancelled: 0,
            participant: 0,
            observer: 0,
            total: 0
          })
        }
        const stats = statsMap.get(staffId)!
        
        // 役割を取得（GM名またはID両方でチェック）
        const role = gmRoles[staffName] || gmRoles[staffId] || gmRoles[gm] || 'main'
        
        if (isCancelled) {
          // 中止イベント
          stats.cancelled++
        } else if (role === 'observer') {
          // 見学
          stats.observer++
        } else if (role === 'staff') {
          // 参加
          stats.participant++
        } else {
          // 出勤（main/sub/reception）
          stats.working++
        }
        
        stats.total++
      })
    })
    
    // 合計を計算
    const totals = {
      working: 0,
      cancelled: 0,
      participant: 0,
      observer: 0
    }
    
    const byGm = Array.from(statsMap.values())
      .filter(stats => stats.total > 0) // 参加なしのGMは除外
      .sort((a, b) => b.total - a.total) // 合計が多い順
    
    byGm.forEach(stats => {
      totals.working += stats.working
      totals.cancelled += stats.cancelled
      totals.participant += stats.participant
      totals.observer += stats.observer
    })
    
    return { byGm, totals }
  }, [events, gmList])
}

