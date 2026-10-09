/**
 * 貸切グループの希望店舗の編集（選べる店舗の読み込み・選択・保存）。index.tsx から中身を変えずに移したもの。
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { savePrivateGroupPreferredStores } from '@/lib/privateGroupPreferredStores'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>

export function usePreferredStoreEditor({ group, canMutateScheduleBeforeStoreReply, openSheet, closeSheetReplace, refetch }: {
  group: GroupType | null
  canMutateScheduleBeforeStoreReply: boolean
  openSheet: (name: string) => void
  closeSheetReplace: () => void
  refetch: () => void
}) {
  const [allStores, setAllStores] = useState<Array<{ id: string; name: string; short_name: string }>>([])
  const [isFilteredByScenario, setIsFilteredByScenario] = useState(false)
  const [loadingStoresForEdit, setLoadingStoresForEdit] = useState(false)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [expectedStoreIds, setExpectedStoreIds] = useState<string[]>([])
  const [savingStores, setSavingStores] = useState(false)

  // 店舗編集用: シナリオの available_stores に基づいて選択可能な店舗を取得
  const fetchAllStores = async () => {
    if (!group?.organization_id) {
      setAllStores([])
      return
    }

    const mapRow = (s: { id: string; name: string; short_name: string | null }) => ({
      id: s.id,
      name: s.name,
      short_name: s.short_name || s.name,
    })

    try {
      // シナリオの available_stores を取得
      let scenarioAvailableStores: string[] = []
      if (group.scenario_master_id) {
        const { data: scenarioData, error: scenarioError } = await privateGroupPageReadApi.findScenarioAvailableStores(group.scenario_master_id, group.organization_id)
        if (scenarioError) throw scenarioError
        if (!scenarioData) throw new Error('組織内の作品設定を確認できません')
        scenarioAvailableStores = scenarioData.available_stores || []
      }

      const { data, error } = await privateGroupPageReadApi.listActiveStoresOfOrganization(group.organization_id)

      if (error) throw error

      let storeList: ReturnType<typeof mapRow>[]

      if (scenarioAvailableStores.length > 0) {
        // シナリオに対応店舗が設定されている場合: その店舗のみ（is_temporary 問わず、オフィス除外）
        storeList = (data || [])
          .filter(s => s.ownership_type !== 'office' && scenarioAvailableStores.includes(s.id))
          .map(mapRow)
      } else {
        // 未設定の場合: オフィス・臨時を除外（従来動作）
        storeList = (data || [])
          .filter(s => s.ownership_type !== 'office' && !s.is_temporary)
          .map(mapRow)
      }

      // 既に希望に入っている店舗も選択肢に残す（同じフィルタ条件を適用）
      const missingIds = (group.preferred_store_ids || []).filter(
        (id) => !storeList.some((s) => s.id === id)
      )
      if (missingIds.length > 0) {
        const { data: extra, error: err2 } = await privateGroupPageReadApi.listActiveStoresByIdsInOrganization(missingIds, group.organization_id)
        if (err2) throw err2
        if (extra?.length) {
          const validExtra = scenarioAvailableStores.length > 0
            ? extra.filter(s => s.ownership_type !== 'office' && scenarioAvailableStores.includes(s.id))
            : extra.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
          storeList = [...storeList, ...validExtra.map(mapRow)]
        }
      }

      setAllStores(storeList)
      setIsFilteredByScenario(scenarioAvailableStores.length > 0)
    } catch (err) {
      logger.error('全店舗取得エラー:', err)
      setAllStores([])
      setIsFilteredByScenario(false)
      toast.error('店舗一覧の取得に失敗しました')
    }
  }

  // 希望店舗を保存
  const handleSavePreferredStores = async () => {
    if (!group) return
    if (!canMutateScheduleBeforeStoreReply) {
      toast.error('店舗の返答待ちのため、希望店舗を変更できません')
      return
    }

    setSavingStores(true)
    try {
      const removed = await savePrivateGroupPreferredStores(group.id, selectedStoreIds, expectedStoreIds)
      if (removed > 0) {
        toast.warning(`希望店舗を更新しました（空き枠のない候補日 ${removed} 件を削除しました）`)
      } else {
        toast.success('希望店舗を更新しました')
      }

      closeSheetReplace()
      refetch()
    } catch (err) {
      logger.error('希望店舗保存エラー:', err)
      toast.error(err && typeof err === 'object' && 'message' in err ? String(err.message) : '保存に失敗しました')
    } finally {
      setSavingStores(false)
    }
  }

  // 店舗編集シートの中身を用意する（選択中の店舗・選べる店舗の読み込み）。変更できないときは false
  const prepareStoreEdit = (): boolean => {
    if (!canMutateScheduleBeforeStoreReply) {
      toast.error('店舗の返答待ちのため、希望店舗を変更できません')
      return false
    }
    setSelectedStoreIds(group?.preferred_store_ids || [])
    setExpectedStoreIds([...(group?.preferred_store_ids || [])])
    setLoadingStoresForEdit(true)
    void (async () => {
      try {
        await fetchAllStores()
      } finally {
        setLoadingStoresForEdit(false)
      }
    })()
    return true
  }

  // 店舗編集シートを開く
  const openStoreEditSheet = () => {
    if (prepareStoreEdit()) openSheet('store-edit')
  }

  return {
    prepareStoreEdit,
    allStores,
    setAllStores,
    isFilteredByScenario,
    setIsFilteredByScenario,
    loadingStoresForEdit,
    setLoadingStoresForEdit,
    selectedStoreIds,
    setSelectedStoreIds,
    expectedStoreIds,
    setExpectedStoreIds,
    savingStores,
    setSavingStores,
    fetchAllStores,
    handleSavePreferredStores,
    openStoreEditSheet,
  }
}
