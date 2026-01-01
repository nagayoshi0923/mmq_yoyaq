/**
 * React Query を使用したシナリオデータ管理
 * 
 * - 自動キャッシュ・再取得
 * - 楽観的更新（Optimistic Update）
 * - エラーハンドリングの一元化
 * - ページネーション対応
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Scenario } from '@/types'
import { logger } from '@/utils/logger'

// Query Keys
export const scenarioKeys = {
  all: ['scenarios'] as const,
  paginated: (pageSize: number) => ['scenarios', 'paginated', pageSize] as const,
  detail: (id: string) => ['scenarios', id] as const,
  stats: ['scenarios', 'stats'] as const,
}

/**
 * シナリオデータの取得（自動キャッシュ）
 * @deprecated ページネーション対応版（useScenariosInfiniteQuery）の使用を推奨
 */
export function useScenariosQuery() {
  return useQuery({
    queryKey: scenarioKeys.all,
    queryFn: async () => {
      logger.log('📖 シナリオデータ取得開始')
      const data = await scenarioApi.getAll()
      
      // GM情報と体験済みスタッフを一括取得（N+1問題を回避）
      const scenarioIds = data.map(s => s.id)
      const assignmentMap = await assignmentApi.getBatchScenarioAssignments(scenarioIds)
      
      // シナリオにGM情報と体験済みスタッフをマージ
      const scenariosWithAssignments = data.map(scenario => {
        const assignments = assignmentMap.get(scenario.id)
        return {
          ...scenario,
          available_gms: assignments?.gmStaff || scenario.available_gms || [],
          experienced_staff: assignments?.experiencedStaff || []
        }
      })
      
      logger.log('✅ シナリオデータ取得完了:', scenariosWithAssignments.length)
      return scenariosWithAssignments
    },
    staleTime: 30 * 60 * 1000, // 30分間キャッシュ（マスターデータ）
  })
}

/**
 * 全シナリオの統計情報を一括取得（リスト表示用）
 */
export function useAllScenarioStatsQuery() {
  return useQuery({
    queryKey: scenarioKeys.stats,
    queryFn: async () => {
      logger.log('📊 シナリオ統計一括取得開始')
      try {
        const data = await scenarioApi.getAllScenarioStats()
        logger.log('✅ シナリオ統計取得完了:', Object.keys(data).length, '件')
        return data
      } catch (error) {
        logger.error('❌ シナリオ統計取得エラー:', error)
        throw error
      }
    },
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
  })
}

/**
 * シナリオデータの無限スクロール対応取得
 */
export function useScenariosInfiniteQuery(pageSize: number = 20) {
  return useInfiniteQuery({
    queryKey: scenarioKeys.paginated(pageSize),
    queryFn: async ({ pageParam = 0 }) => {
      logger.log(`📖 シナリオデータ取得開始 (ページ: ${pageParam})`)
      const response = await scenarioApi.getPaginated(pageParam, pageSize)
      
      // GM情報を一括取得（N+1問題を回避）
      const scenarioIds = response.data.map(s => s.id)
      const gmMap = await assignmentApi.getBatchScenarioAssignments(scenarioIds)
      
      // シナリオにGM情報をマージ
      const scenariosWithGMs = response.data.map(scenario => ({
        ...scenario,
        available_gms: gmMap.get(scenario.id) || scenario.available_gms || []
      }))
      
      logger.log(`✅ シナリオデータ取得完了 (ページ: ${pageParam}, 件数: ${scenariosWithGMs.length})`)
      
      return {
        data: scenariosWithGMs,
        count: response.count,
        hasMore: response.hasMore,
        nextPage: response.hasMore ? pageParam + 1 : undefined
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 30 * 60 * 1000, // 30分間キャッシュ（マスターデータ）
  })
}

/**
 * シナリオ作成・更新
 */
export function useScenarioMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ scenario, isEdit }: { scenario: Scenario; isEdit: boolean }) => {
      // そのまま保存（production_costs と required_props を含む）
      if (isEdit) {
        return await scenarioApi.update(scenario.id, scenario)
      } else {
        return await scenarioApi.create(scenario)
      }
    },
    onMutate: async ({ scenario, isEdit }) => {
      // 進行中のクエリをキャンセル
      await queryClient.cancelQueries({ queryKey: scenarioKeys.all })
      
      // 以前のデータを保存（ロールバック用）
      const previousScenarios = queryClient.getQueryData<Scenario[]>(scenarioKeys.all)
      
      // 楽観的更新: 即座にキャッシュを更新
      queryClient.setQueryData<Scenario[]>(scenarioKeys.all, (old = []) => {
        if (isEdit) {
          // 更新: 既存のシナリオを置き換え
          return old.map(s => s.id === scenario.id ? scenario : s)
        } else {
          // 新規作成: リストの先頭に追加（一時的なID）
          return [{ ...scenario, id: `temp-${Date.now()}` }, ...old]
        }
      })
      
      logger.log('⚡ 楽観的更新: 画面を即座に更新')
      
      return { previousScenarios }
    },
    onError: (err, variables, context) => {
      // エラー時はロールバック
      if (context?.previousScenarios) {
        queryClient.setQueryData(scenarioKeys.all, context.previousScenarios)
        logger.error('❌ エラー発生: ロールバック実行', err)
      }
    },
    onSettled: () => {
      // 成功・失敗に関わらず最終的に最新データを取得
      // すべてのシナリオ関連クエリを無効化（all、paginated、detail）
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
      logger.log('🔄 最新データを再取得')
    },
  })
}

/**
 * シナリオ削除
 */
export function useDeleteScenarioMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scenarioId: string) => {
      return await scenarioApi.delete(scenarioId)
    },
    onMutate: async (scenarioId) => {
      // 進行中のクエリをキャンセル
      await queryClient.cancelQueries({ queryKey: scenarioKeys.all })
      
      // 以前のデータを保存
      const previousScenarios = queryClient.getQueryData<Scenario[]>(scenarioKeys.all)
      
      // 楽観的更新: 即座にキャッシュから削除
      queryClient.setQueryData<Scenario[]>(scenarioKeys.all, (old = []) => {
        return old.filter(s => s.id !== scenarioId)
      })
      
      logger.log('⚡ 楽観的削除: 画面から即座に削除')
      
      return { previousScenarios }
    },
    onError: (err, scenarioId, context) => {
      // エラー時はロールバック
      if (context?.previousScenarios) {
        queryClient.setQueryData(scenarioKeys.all, context.previousScenarios)
        logger.error('❌ 削除エラー: ロールバック実行', err)
      }
    },
    onSettled: () => {
      // 最終的に最新データを取得
      // すべてのシナリオ関連クエリを無効化（all、paginated、detail）
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
      logger.log('🔄 最新データを再取得')
    },
  })
}

/**
 * CSVインポート
 */
export function useImportScenariosMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      const lines = text.split('\n')
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
          license_amount: 0,
          gm_test_license_amount: 0,
          license_rewards: [],
          participation_costs: [{ time_slot: '通常', amount: parseInt(participationFee) || 3000, type: 'fixed', status: 'active' }],
          production_cost: 0,
          has_pre_reading: false
        }
        
        await scenarioApi.create(newScenario as Omit<Scenario, 'id' | 'created_at' | 'updated_at'>)
      }
      
      return { count: dataLines.length }
    },
    onSuccess: (data) => {
      // インポート成功後、キャッシュを無効化して再取得
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all })
      logger.log(`✅ CSV インポート完了: ${data.count}件`)
    },
    onError: (err) => {
      logger.error('❌ CSV インポートエラー:', err)
    },
  })
}

