import { useMemo } from 'react'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

export interface GmStatsItem {
  staffId: string
  staffName: string
  // カテゴリ別出勤数
  openWorking: number      // オープン公演
  privateWorking: number   // 貸切公演
  gmtestWorking: number    // GMテスト
  otherWorking: number     // その他（trip, testplay, venue_rental等）
  // 役割別
  cancelled: number        // 中止
  participant: number      // 参加（staff）
  observer: number         // 見学（observer）
  total: number            // 合計
}

export interface GmStatsData {
  byGm: GmStatsItem[]
  totals: {
    openWorking: number
    privateWorking: number
    gmtestWorking: number
    otherWorking: number
    cancelled: number
    participant: number
    observer: number
  }
}

/**
 * GMの出勤統計を計算するフック
 * 
 * 分類:
 * - オープン: open公演でmain/sub/receptionとして担当
 * - 貸切: private公演でmain/sub/receptionとして担当
 * - GMテスト: gmtest公演でmain/sub/receptionとして担当
 * - その他: 上記以外の公演でmain/sub/receptionとして担当
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
        openWorking: 0,
        privateWorking: 0,
        gmtestWorking: 0,
        otherWorking: 0,
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
      const category = event.category || 'open'
      
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
            openWorking: 0,
            privateWorking: 0,
            gmtestWorking: 0,
            otherWorking: 0,
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
          // 出勤（main/sub/reception）- カテゴリ別に振り分け
          switch (category) {
            case 'open':
              stats.openWorking++
              break
            case 'private':
              stats.privateWorking++
              break
            case 'gmtest':
              stats.gmtestWorking++
              break
            default:
              // trip, testplay, venue_rental, venue_rental_free, package等
              stats.otherWorking++
              break
          }
        }
        
        stats.total++
      })
    })
    
    // 合計を計算
    const totals = {
      openWorking: 0,
      privateWorking: 0,
      gmtestWorking: 0,
      otherWorking: 0,
      cancelled: 0,
      participant: 0,
      observer: 0
    }
    
    const byGm = Array.from(statsMap.values())
      .filter(stats => stats.total > 0) // 参加なしのGMは除外
      .sort((a, b) => b.total - a.total) // 合計が多い順
    
    byGm.forEach(stats => {
      totals.openWorking += stats.openWorking
      totals.privateWorking += stats.privateWorking
      totals.gmtestWorking += stats.gmtestWorking
      totals.otherWorking += stats.otherWorking
      totals.cancelled += stats.cancelled
      totals.participant += stats.participant
      totals.observer += stats.observer
    })
    
    return { byGm, totals }
  }, [events, gmList])
}

