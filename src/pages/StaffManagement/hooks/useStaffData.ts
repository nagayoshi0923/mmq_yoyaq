import { useState, useCallback } from 'react'
import { staffApi, storeApi, scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Staff, Store } from '@/types'
import { logger } from '@/utils/logger'

interface UseStaffDataReturn {
  staff: Staff[]
  stores: Store[]
  scenarios: Array<{ id: string; title: string }>
  loading: boolean
  error: string
  loadStaff: () => Promise<void>
  loadStores: () => Promise<void>
  loadScenarios: () => Promise<void>
  handleSaveStaff: (staffData: Staff) => Promise<void>
  handleDeleteStaff: (staffId: string) => Promise<void>
  setStaff: React.Dispatch<React.SetStateAction<Staff[]>>
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string>>
}

/**
 * スタッフデータの取得と管理
 */
export const useStaffData = (): UseStaffDataReturn => {
  const [staff, setStaff] = useState<Staff[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [scenarios, setScenarios] = useState<Array<{ id: string; title: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
            const gmScenarios = gmAssignments.map(a => a.scenarios?.id).filter(Boolean) as string[]

            // 体験済みシナリオを取得（GM不可）
            const experiencedAssignments = await assignmentApi.getStaffExperiencedScenarios(staffMember.id)
            const experiencedScenarios = experiencedAssignments.map(a => a.scenarios?.id).filter(Boolean) as string[]

            return {
              ...staffMember,
              special_scenarios: gmScenarios,
              experienced_scenarios: experiencedScenarios
            }
          } catch (error) {
            logger.error(`Error loading assignments for staff ${staffMember.id}:`, error)
            return {
              ...staffMember,
              special_scenarios: staffMember.special_scenarios || [],
              experienced_scenarios: []
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      logger.error('Error loading staff:', err)
      setError('スタッフデータの読み込みに失敗しました: ' + message)
      setStaff([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStores = useCallback(async () => {
    try {
      const data = await storeApi.getAll()
      setStores(data)
    } catch (err: unknown) {
      logger.error('Error loading stores:', err)
    }
  }, [])

  const loadScenarios = useCallback(async () => {
    try {
      const data = await scenarioApi.getAll()
      setScenarios(data)
    } catch (err: unknown) {
      logger.error('Error loading scenarios:', err)
    }
  }, [])

  const handleSaveStaff = useCallback(async (staffData: Staff) => {
    try {
      if (staffData.id) {
        // 更新
        const originalStaff = staff.find(s => s.id === staffData.id)
        const specialScenariosChanged = JSON.stringify(originalStaff?.special_scenarios?.sort()) !== JSON.stringify(staffData.special_scenarios?.sort())

        // まず基本情報を更新
        logger.log('💾 保存するスタッフデータ:', { id: staffData.id, avatar_color: staffData.avatar_color, name: staffData.name })
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      logger.error('Error saving staff:', err)
      alert('スタッフの保存に失敗しました: ' + message)
    }
  }, [staff, loadStaff])

  const handleDeleteStaff = useCallback(async (staffId: string) => {
    try {
      await staffApi.delete(staffId)
      await loadStaff()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      logger.error('Error deleting staff:', err)
      alert('スタッフの削除に失敗しました: ' + message)
    }
  }, [loadStaff])

  return {
    staff,
    stores,
    scenarios,
    loading,
    error,
    loadStaff,
    loadStores,
    loadScenarios,
    handleSaveStaff,
    handleDeleteStaff,
    setStaff,
    setLoading,
    setError
  }
}

