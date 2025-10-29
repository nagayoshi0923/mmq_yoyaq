import { useState, useCallback } from 'react'
import type { Staff } from '@/types'

/**
 * モーダルの状態を管理するフック
 */
export function useStaffModals() {
  // 編集モーダル
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  
  // 招待モーダル
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  
  // 紐付けモーダル
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [linkingStaff, setLinkingStaff] = useState<Staff | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkMethod, setLinkMethod] = useState<'existing' | 'invite'>('existing')
  
  // ユーザー検索状態
  const [searchEmail, setSearchEmail] = useState('')
  const [searchedUser, setSearchedUser] = useState<{ id: string; email: string; role: string } | null>(null)
  
  // 削除確認ダイアログ
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null)

  /**
   * 編集モーダルを開く
   */
  const openEditModal = useCallback((staffMember: Staff) => {
    setEditingStaff(staffMember)
    setIsEditModalOpen(true)
  }, [])

  /**
   * 編集モーダルを閉じる
   */
  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false)
    setEditingStaff(null)
  }, [])

  /**
   * 招待モーダルを開く
   */
  const openInviteModal = useCallback(() => {
    setIsInviteModalOpen(true)
  }, [])

  /**
   * 招待モーダルを閉じる
   */
  const closeInviteModal = useCallback(() => {
    setIsInviteModalOpen(false)
    setInviteLoading(false)
  }, [])

  /**
   * 紐付けモーダルを開く
   */
  const openLinkModal = useCallback((staffMember: Staff) => {
    setLinkingStaff(staffMember)
    setIsLinkModalOpen(true)
    setLinkMethod('existing')
  }, [])

  /**
   * 紐付けモーダルを閉じる
   */
  const closeLinkModal = useCallback(() => {
    setIsLinkModalOpen(false)
    setLinkingStaff(null)
    setLinkLoading(false)
    setLinkMethod('existing')
    setSearchEmail('')
    setSearchedUser(null)
  }, [])

  /**
   * 削除確認ダイアログを開く
   */
  const openDeleteDialog = useCallback((staffMember: Staff) => {
    setStaffToDelete(staffMember)
    setDeleteDialogOpen(true)
  }, [])

  /**
   * 削除確認ダイアログを閉じる
   */
  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false)
    setStaffToDelete(null)
  }, [])

  return {
    // 編集モーダル
    isEditModalOpen,
    editingStaff,
    openEditModal,
    closeEditModal,
    
    // 招待モーダル
    isInviteModalOpen,
    inviteLoading,
    setInviteLoading,
    openInviteModal,
    closeInviteModal,
    
    // 紐付けモーダル
    isLinkModalOpen,
    linkingStaff,
    linkLoading,
    linkMethod,
    setLinkLoading,
    setLinkMethod,
    openLinkModal,
    closeLinkModal,
    
    // ユーザー検索状態
    searchEmail,
    setSearchEmail,
    searchedUser,
    setSearchedUser,
    
    // 削除確認ダイアログ
    deleteDialogOpen,
    staffToDelete,
    openDeleteDialog,
    closeDeleteDialog
  }
}

