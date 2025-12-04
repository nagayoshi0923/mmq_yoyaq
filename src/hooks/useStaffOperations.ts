// スタッフ管理のCRUD操作を管理するカスタムフック

import { useState, useCallback } from 'react'
import { staffApi, storeApi, scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { inviteStaff, type InviteStaffRequest } from '@/lib/staffInviteApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import type { Staff, Store } from '@/types'

export function useStaffOperations() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [scenarios, setScenarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 編集モーダル用のstate
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)

  // 招待モーダル用のstate
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)

  // 紐付けモーダル用のstate
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [linkingStaff, setLinkingStaff] = useState<Staff | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkMethod, setLinkMethod] = useState<'existing' | 'invite'>('existing')

  // 削除確認ダイアログ用のstate
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null)

  // スタッフデータ読み込み
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
      logger.error('Error loading staff:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      setError('スタッフデータの読み込みに失敗しました: ' + message)
      setStaff([])
    } finally {
      setLoading(false)
    }
  }, [])

  // 店舗データ読み込み
  const loadStores = useCallback(async () => {
    try {
      const data = await storeApi.getAll()
      setStores(data)
    } catch (err: unknown) {
      logger.error('Error loading stores:', err)
    }
  }, [])

  // シナリオデータ読み込み
  const loadScenarios = useCallback(async () => {
    try {
      const data = await scenarioApi.getAll()
      setScenarios(data)
    } catch (err: unknown) {
      logger.error('Error loading scenarios:', err)
    }
  }, [])

  // スタッフ編集を開始
  const handleEditStaff = useCallback((staffMember: Staff) => {
    setEditingStaff(staffMember)
    setIsEditModalOpen(true)
  }, [])

  // スタッフ保存（編集・新規）
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
      setIsEditModalOpen(false)
      setEditingStaff(null)
    } catch (err: unknown) {
      logger.error('Error saving staff:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      setError('スタッフの保存に失敗しました: ' + message)
    }
  }, [staff, loadStaff])

  // 編集モーダルを閉じる
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false)
    setEditingStaff(null)
  }, [])

  // スタッフ招待
  const handleInviteStaff = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInviteLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      const email = formData.get('email') as string
      const name = formData.get('name') as string

      const inviteRequest: InviteStaffRequest = {
        email,
        name,
        role: 'staff'
      }

      await inviteStaff(inviteRequest)
      alert(`招待メールを ${email} に送信しました`)
      setIsInviteModalOpen(false)
      await loadStaff()
    } catch (err: unknown) {
      logger.error('Error inviting staff:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert('招待に失敗しました: ' + message)
    } finally {
      setInviteLoading(false)
    }
  }, [loadStaff])

  // 既存ユーザーを紐付け
  const handleLinkExistingUser = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLinkLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      const userId = formData.get('userId') as string

      if (!linkingStaff || !userId) {
        throw new Error('スタッフまたはユーザーIDが指定されていません')
      }

      await staffApi.update(linkingStaff.id, {
        ...linkingStaff,
        user_id: userId
      })

      alert('ユーザーとの紐付けが完了しました')
      setIsLinkModalOpen(false)
      setLinkingStaff(null)
      await loadStaff()
    } catch (err: unknown) {
      logger.error('Error linking user:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert('紐付けに失敗しました: ' + message)
    } finally {
      setLinkLoading(false)
    }
  }, [linkingStaff, loadStaff])

  // 招待して紐付け
  const handleLinkWithInvite = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLinkLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      const email = formData.get('email') as string

      if (!linkingStaff || !email) {
        throw new Error('スタッフまたはメールアドレスが指定されていません')
      }

      const inviteRequest: InviteStaffRequest = {
        email,
        name: linkingStaff.name,
        role: 'staff',
        staffId: linkingStaff.id
      }

      await inviteStaff(inviteRequest)
      alert(`招待メールを ${email} に送信しました`)
      setIsLinkModalOpen(false)
      setLinkingStaff(null)
      await loadStaff()
    } catch (err: unknown) {
      logger.error('Error inviting and linking:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert('招待に失敗しました: ' + message)
    } finally {
      setLinkLoading(false)
    }
  }, [linkingStaff, loadStaff])

  // 削除ダイアログを開く
  const openDeleteDialog = useCallback((member: Staff) => {
    setStaffToDelete(member)
    setDeleteDialogOpen(true)
  }, [])

  // スタッフ削除
  const handleDeleteStaff = useCallback(async () => {
    if (!staffToDelete) return

    try {
      setLoading(true)
      await staffApi.delete(staffToDelete.id)
      await loadStaff()
      setDeleteDialogOpen(false)
      setStaffToDelete(null)
    } catch (err: unknown) {
      logger.error('Error deleting staff:', err)
      const message = err instanceof Error ? err.message : '不明なエラー'
      setError('スタッフの削除に失敗しました: ' + message)
    } finally {
      setLoading(false)
    }
  }, [staffToDelete, loadStaff])

  // 紐付けモーダルを開く
  const openLinkModal = useCallback((member: Staff) => {
    setLinkingStaff(member)
    setIsLinkModalOpen(true)
    setLinkMethod('existing')
  }, [])

  // 紐付けモーダルを閉じる
  const closeLinkModal = useCallback(() => {
    setIsLinkModalOpen(false)
    setLinkingStaff(null)
    setLinkMethod('existing')
  }, [])

  return {
    // データ
    staff,
    stores,
    scenarios,
    loading,
    error,

    // 編集モーダル
    isEditModalOpen,
    editingStaff,
    handleEditStaff,
    handleSaveStaff,
    handleCloseEditModal,

    // 招待モーダル
    isInviteModalOpen,
    setIsInviteModalOpen,
    inviteLoading,
    handleInviteStaff,

    // 紐付けモーダル
    isLinkModalOpen,
    linkingStaff,
    linkLoading,
    linkMethod,
    setLinkMethod,
    openLinkModal,
    closeLinkModal,
    handleLinkExistingUser,
    handleLinkWithInvite,

    // 削除ダイアログ
    deleteDialogOpen,
    setDeleteDialogOpen,
    staffToDelete,
    openDeleteDialog,
    handleDeleteStaff,

    // データ読み込み
    loadStaff,
    loadStores,
    loadScenarios
  }
}

