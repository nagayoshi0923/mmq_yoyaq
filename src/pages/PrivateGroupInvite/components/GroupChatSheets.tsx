import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import React, { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/patterns/modal'
import { logger } from '@/utils/logger'
import type { NavigateFunction } from 'react-router-dom'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import type { usePrivateGroup } from '@/hooks/usePrivateGroup'
import type { useAuth } from '@/contexts/AuthContext'
import type { DateResponse } from '@/types'
import { BookingSheet, DatesSheet, InviteSheet, SettingsSheet, StoreEditSheet } from './GroupChatSheetPanels'
type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
type GroupMember = NonNullable<GroupType['members']>[number]
type ResponseValue = DateResponse | null

export interface GroupChatSheetsProps {
  // 表示状態
  showMobileDates: boolean
  showInviteSheet: boolean
  showSettingsSheet: boolean
  showStoreEditSheet: boolean
  showBookingDialog: boolean
  // グループ・シナリオ・メンバー
  group: GroupType
  scenario: {
    id?: string
    slug?: string
    title?: string
    key_visual_url?: string
    player_count_min?: number
    player_count_max?: number
    effective_player_count_min?: number
    effective_player_count_max?: number
    characters?: unknown[]
  } | undefined
  joinedMembers: GroupMember[]
  organizerMember: GroupMember | undefined
  memberCount: number
  inviteMemberCap: number | null
  user: ReturnType<typeof useAuth>['user']
  code: string | null
  existingMemberId: string | null
  responses: Record<string, ResponseValue>
  // 権限・状態フラグ
  isOrganizer: boolean | null
  isFilteredByScenario: boolean
  isScheduleConfirmedUi: boolean
  allMembersResponded: boolean
  canMutateScheduleBeforeStoreReply: boolean
  actionLoading: boolean
  copied: boolean
  isSubmittingBooking: boolean
  loadingStoresForEdit: boolean
  savingStores: boolean
  // フォーム値
  bookingNotes: string
  bookingPhone: string
  bookingSelectedDates: Set<string>
  selectedStoreIds: string[]
  preferredStoreNames: Array<{ id: string; name: string }>
  allStores: Array<{ id: string; name: string; short_name: string }>
  MAX_BOOKING_DATES: number
  // setter
  setBookingNotes: React.Dispatch<React.SetStateAction<string>>
  setBookingPhone: React.Dispatch<React.SetStateAction<string>>
  setExistingMemberId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedStoreIds: React.Dispatch<React.SetStateAction<string[]>>
  // ナビ・データ
  navigate: NavigateFunction
  refetch: ReturnType<typeof usePrivateGroupByInviteCode>['refetch']
  leaveGroup: ReturnType<typeof usePrivateGroup>['leaveGroup']
  // ハンドラ
  formatDateJaMd: (dateStr: string) => string
  getInviteUrl: () => string
  closeSheet: () => void
  closeSheetReplace: () => void
  openStoreEditSheet: () => void
  clearGuestSession: () => void
  toggleBookingDate: (dateId: string) => void
  handleResponseChange: (candidateDateId: string, response: DateResponse) => void
  handleRemoveMember: (memberId: string) => Promise<void>
  handleSavePreferredStores: () => Promise<void>
  handleSubmitBooking: () => Promise<void>
  handleShareLine: () => void
  handleCopyUrl: () => Promise<void>
  handleOpenBookingDialog: () => Promise<void>
  handleSubmit: (options?: { skipSuccessPage?: boolean }) => Promise<void>
  /** 店舗への問い合わせ（共通部品）を開く */
  onOpenInquiry: () => void
  /** 「申込内容」の箱（日程・進捗シートに出す） */
  bookingSummary: React.ReactNode
}

export function GroupChatSheets(props: GroupChatSheetsProps) {
  const {
    showMobileDates, showInviteSheet, showSettingsSheet, showStoreEditSheet, showBookingDialog, group, user, existingMemberId, isOrganizer, setExistingMemberId, navigate, refetch, leaveGroup, closeSheetReplace, clearGuestSession,
  } = props
  // 確認ダイアログ（グループから退出）。グループを閉じる・取り下げ・キャンセルは「操作」メニュー（usePrivateBookingActions）へまとめた
  const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false)

  const handleConfirmLeaveGroup = async () => {
    try {
      if (existingMemberId) {
        const { error: deleteError } = await privateGroupMemberAction(group.id, existingMemberId, 'leave')
        if (deleteError) throw deleteError
        toast.success('グループから抜けました')
        setExistingMemberId(null)
        clearGuestSession()
        closeSheetReplace()
        refetch()
      } else if (user && group) {
        await leaveGroup(group.id)
        toast.success('グループから抜けました')
        navigate('/mypage')
      }
    } catch (err) {
      logger.error('Failed to leave group', err)
      toast.error('退出に失敗しました')
    }
  }

  return (
    <>
        {showMobileDates && (
          <DatesSheet {...props} />
        )}

        {/* メンバー招待シート */}
        {showInviteSheet && isOrganizer && (
          <InviteSheet {...props} />
        )}

        {/* グループ設定シート */}
        {showSettingsSheet && (
          <SettingsSheet {...props} setShowLeaveGroupConfirm={setShowLeaveGroupConfirm} />
        )}

        {/* 希望店舗編集シート */}
        {showStoreEditSheet && isOrganizer && (
          <StoreEditSheet {...props} />
        )}

        {/* 予約申請シート（日程選択 + 送信） */}
        {showBookingDialog && isOrganizer && (
          <BookingSheet {...props} />
        )}

        <ConfirmDialog
          open={showLeaveGroupConfirm}
          onOpenChange={setShowLeaveGroupConfirm}
          title="グループから抜けますか？"
          message="抜けると、このグループのチャットや日程は見られなくなり、あなたの日程の回答も消えます。"
          confirmLabel="グループから抜ける"
          variant="destructive"
          onConfirm={handleConfirmLeaveGroup}
        />
    </>
  )
}
