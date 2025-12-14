import { useState, useCallback } from 'react'
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'

// モックデータ（エラー時のフォールバック）
const mockStaff: Staff[] = [
  {
    id: '1',
    name: '田中太郎',
    line_name: 'tanaka_taro',
    x_account: '@tanaka_gm',
    email: 'tanaka@example.com',
    phone: '090-1234-5678',
    role: ['GM', 'マネージャー'],
    stores: ['高田馬場店', '別館①'],
    status: 'active',
    experience: 3,
    availability: ['月', '火', '水', '木', '金'],
    ng_days: ['土', '日'],
    want_to_learn: [],
    available_scenarios: [],
    special_scenarios: ['人狼村の悲劇', '密室の謎', '学園ミステリー'],
    notes: 'ベテランGM。新人研修も担当。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
]

/**
 * スタッフのCRUD操作を管理するフック
 */
export function useStaffOperations() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  /**
   * スタッフデータを読み込む
   */
  const loadStaff = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const data = await staffApi.getAll()
      
      // 各スタッフの担当シナリオ情報をリレーションテーブルから取得
      const staffWithScenarios = await Promise.all(
        data.map(async (staffMember) => {
          try {
            // GM可能なシナリオを取得
            const gmAssignments = await assignmentApi.getStaffAssignments(staffMember.id)
            const gmScenarios = gmAssignments.map(a => a.scenarios?.id).filter(Boolean)
            
            // 体験済みシナリオを取得（GM不可）
            const experiencedAssignments = await assignmentApi.getStaffExperiencedScenarios(staffMember.id)
            const experiencedScenarios = experiencedAssignments.map(a => a.scenarios?.id).filter(Boolean)
            
            return {
              ...staffMember,
              special_scenarios: gmScenarios, // GM可能なシナリオ
              experienced_scenarios: experiencedScenarios // 体験済みシナリオ（GM不可）
            }
          } catch (error) {
            logger.error(`Error loading assignments for staff ${staffMember.id}:`, error)
            return {
              ...staffMember,
              special_scenarios: staffMember.special_scenarios || [], // エラー時は既存の値を使用
              experienced_scenarios: [] // 体験済みシナリオ
            }
          }
        })
      )
      
      logger.log('📥 読み込んだスタッフデータ（最初の1件）:', staffWithScenarios[0] ? {
        name: staffWithScenarios[0].name,
        avatar_color: staffWithScenarios[0].avatar_color,
        avatar_url: staffWithScenarios[0].avatar_url
      } : 'データなし')
      
      setStaff(staffWithScenarios)
    } catch (err: any) {
      logger.error('Error loading staff:', err)
      setError('スタッフデータの読み込みに失敗しました: ' + err.message)
      // エラー時はモックデータを使用
      setStaff(mockStaff)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * スタッフを保存（新規作成 or 更新）
   */
  const saveStaff = useCallback(async (staffData: Staff) => {
    try {
      if (staffData.id) {
        // 更新
        const originalStaff = staff.find(s => s.id === staffData.id)
        const specialScenariosChanged = JSON.stringify(originalStaff?.special_scenarios?.sort()) !== 
                                       JSON.stringify(staffData.special_scenarios?.sort())
        
        // まず基本情報を更新
        logger.log('💾 保存するスタッフデータ:', { 
          id: staffData.id, 
          avatar_color: staffData.avatar_color, 
          name: staffData.name 
        })
        await staffApi.update(staffData.id, staffData)
        
        // 担当シナリオが変更された場合、リレーションテーブルも更新
        if (specialScenariosChanged) {
          await assignmentApi.updateStaffAssignments(staffData.id, staffData.special_scenarios || [])
        }
      } else {
        // 新規作成
        const newStaff = await staffApi.create(staffData)
        
        // 新規作成時も担当シナリオがあればリレーションテーブルに追加
        if (staffData.special_scenarios && staffData.special_scenarios.length > 0) {
          await assignmentApi.updateStaffAssignments(newStaff.id, staffData.special_scenarios)
        }
      }
      
      // スタッフ保存後、担当シナリオ情報を含めてリストを再読み込み
      await loadStaff()
    } catch (err: any) {
      logger.error('Error saving staff:', err)
      throw new Error('スタッフの保存に失敗しました: ' + err.message)
    }
  }, [staff, loadStaff])

  /**
   * スタッフを削除
   */
  const deleteStaff = useCallback(async (staffId: string) => {
    try {
      await staffApi.delete(staffId)
      // 削除成功後、リストから除去
      setStaff(prev => prev.filter(s => s.id !== staffId))
    } catch (err: any) {
      logger.error('Error deleting staff:', err)
      throw new Error('スタッフの削除に失敗しました: ' + err.message)
    }
  }, [])

  return {
    staff,
    loading,
    error,
    setStaff,
    loadStaff,
    saveStaff,
    deleteStaff
  }
}

