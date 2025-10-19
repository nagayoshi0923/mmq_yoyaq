import { useState, useEffect, useCallback } from 'react'
import { scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Scenario } from '@/types'
import { logger } from '@/utils/logger'

/**
 * シナリオデータの取得・CRUD操作を管理するフック
 */
export function useScenarioData() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [error, setError] = useState('')

  // データ読み込み
  const loadScenarios = useCallback(async (preserveScroll = false) => {
    try {
      // 初回ロードのみローディング表示
      if (!preserveScroll) {
        setLoading(true)
      }
      setError('')
      const data = await scenarioApi.getAll()
      
      // 各シナリオの担当GM情報をリレーションテーブルから取得
      const scenariosWithGMs = await Promise.all(
        data.map(async (scenario) => {
          try {
            const assignments = await assignmentApi.getScenarioAssignments(scenario.id)
            const assignedGMs = assignments.map(a => a.staff?.name).filter(Boolean)
            return {
              ...scenario,
              available_gms: assignedGMs // リレーションテーブルから取得した担当GM名を設定
            }
          } catch (error) {
            logger.error(`Error loading assignments for scenario ${scenario.id}:`, error)
            return {
              ...scenario,
              available_gms: scenario.available_gms || [] // エラー時は既存の値を使用
            }
          }
        })
      )
      
      setScenarios(scenariosWithGMs)
    } catch (err: unknown) {
      logger.error('Error loading scenarios:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      setError('シナリオデータの読み込みに失敗しました: ' + message)
      setScenarios([])
    } finally {
      if (!preserveScroll) {
        setLoading(false)
      }
    }
  }, [])

  // シナリオの保存
  const saveScenario = useCallback(async (scenario: Scenario, isEdit: boolean) => {
    try {
      // データベースに送信する前にproduction_costsフィールドを除外
      const { production_costs, ...scenarioForDB } = scenario as any
      
      if (isEdit) {
        await scenarioApi.update(scenarioForDB.id, scenarioForDB)
      } else {
        await scenarioApi.create(scenarioForDB)
      }
      
      // リロード
      await loadScenarios(true)
      return { success: true }
    } catch (err: unknown) {
      logger.error('Error saving scenario:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      throw new Error(`シナリオの保存に失敗しました: ${message}`)
    }
  }, [loadScenarios])

  // シナリオの削除
  const deleteScenario = useCallback(async (scenarioId: string) => {
    try {
      await scenarioApi.delete(scenarioId)
      await loadScenarios(true)
      return { success: true }
    } catch (err: unknown) {
      logger.error('Error deleting scenario:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      throw new Error(`シナリオの削除に失敗しました: ${message}`)
    }
  }, [loadScenarios])

  // CSVインポート
  const importFromCSV = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const lines = text.split('\n')
      
      // ヘッダー行をスキップ
      const dataLines = lines.slice(1).filter(line => line.trim())
      
      for (const line of dataLines) {
        const columns = line.split(',').map(col => col.trim())
        if (columns.length < 8) continue
        
        const [title, author, description, duration, playerMin, playerMax, difficulty, participationFee] = columns
        
        const newScenario = {
          title,
          author,
          description: description || '',
          duration: parseInt(duration) || 180,
          player_count_min: parseInt(playerMin) || 1,
          player_count_max: parseInt(playerMax) || 8,
          difficulty: parseInt(difficulty) || 3,
          participation_fee: parseInt(participationFee) || 3000,
          status: 'available' as const,
          genre: [],
          available_gms: [],
          play_count: 0,
          required_props: [],
          gm_costs: [{ role: 'main', reward: 2000, status: 'active' }],
          license_amount: 1500,
          gm_test_license_amount: 0,
          license_rewards: [],
          participation_costs: [{ time_slot: '通常', amount: parseInt(participationFee) || 3000, type: 'fixed', status: 'active' }],
          production_cost: 0,
          has_pre_reading: false
        }
        
        await scenarioApi.create(newScenario)
      }
      
      await loadScenarios(true)
      return { success: true, count: dataLines.length }
    } catch (err: unknown) {
      logger.error('Error importing CSV:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      throw new Error(`CSVのインポートに失敗しました: ${message}`)
    }
  }, [loadScenarios])

  // CSVエクスポート
  const exportToCSV = useCallback(() => {
    const headers = ['タイトル', '作者', '説明', '所要時間(分)', '最小人数', '最大人数', '難易度', '参加費']
    const rows = scenarios.map(s => [
      s.title,
      s.author,
      s.description || '',
      s.duration.toString(),
      s.player_count_min.toString(),
      s.player_count_max?.toString() || s.player_count_min.toString(),
      s.difficulty?.toString() || '3',
      s.participation_fee?.toString() || '3000'
    ])
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `scenarios_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    
    return { success: true }
  }, [scenarios])

  // 初回ロード
  useEffect(() => {
    loadScenarios()
  }, [loadScenarios])

  return {
    scenarios,
    loading,
    initialLoadComplete,
    setInitialLoadComplete,
    error,
    loadScenarios,
    saveScenario,
    deleteScenario,
    importFromCSV,
    exportToCSV
  }
}

