import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
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
  showContactForm: boolean
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
  isDeleting: boolean
  isSubmittingBooking: boolean
  isSubmittingContact: boolean
  loadingStoresForEdit: boolean
  savingStores: boolean
  // フォーム値
  bookingNotes: string
  bookingPhone: string
  contactMessage: string
  bookingSelectedDates: Set<string>
  selectedStoreIds: string[]
  preferredStoreNames: Array<{ id: string; name: string }>
  allStores: Array<{ id: string; name: string; short_name: string }>
  MAX_BOOKING_DATES: number
  // setter
  setBookingNotes: React.Dispatch<React.SetStateAction<string>>
  setBookingPhone: React.Dispatch<React.SetStateAction<string>>
  setContactMessage: React.Dispatch<React.SetStateAction<string>>
  setExistingMemberId: React.Dispatch<React.SetStateAction<string | null>>
  setIsSubmittingContact: React.Dispatch<React.SetStateAction<boolean>>
  setSelectedStoreIds: React.Dispatch<React.SetStateAction<string[]>>
  setShowContactForm: React.Dispatch<React.SetStateAction<boolean>>
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
  handleCancelGroup: () => Promise<void>
  cancelling: boolean
  handleDeleteGroup: () => Promise<void>
  handleOpenBookingDialog: () => Promise<void>
  handleSubmit: (options?: { skipSuccessPage?: boolean }) => Promise<void>
}

export function GroupChatSheets(props: GroupChatSheetsProps) {
  const {
    showMobileDates, showInviteSheet, showSettingsSheet, showStoreEditSheet, showBookingDialog, group, memberCount, user, existingMemberId, isOrganizer, isDeleting, setExistingMemberId, navigate, refetch, leaveGroup, closeSheetReplace, clearGuestSession, handleDeleteGroup,
  } = props
  // 確認ダイアログ（グループ削除 / グループから退出）
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false)
  const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false)

  const handleConfirmLeaveGroup = async () => {
    try {
      if (existingMemberId) {
        const { error: deleteError } = await privateGroupMemberAction(group.id, existingMemberId, 'leave')
        if (deleteError) throw deleteError
        toast.success('グループから退出しました')
        setExistingMemberId(null)
        clearGuestSession()
        closeSheetReplace()
        refetch()
      } else if (user && group) {
        await leaveGroup(group.id)
        toast.success('グループから退出しました')
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
          <SettingsSheet {...props} setShowDeleteGroupConfirm={setShowDeleteGroupConfirm} setShowLeaveGroupConfirm={setShowLeaveGroupConfirm} />
        )}

        {/* 希望店舗編集シート */}
        {showStoreEditSheet && isOrganizer && (
          <StoreEditSheet {...props} />
        )}

        {/* 予約申請シート（日程選択 + 送信） */}
        {showBookingDialog && isOrganizer && (
          <BookingSheet {...props} />
        )}

        <DeleteGroupConfirmDialog
          open={showDeleteGroupConfirm}
          onOpenChange={setShowDeleteGroupConfirm}
          memberCount={group.members?.length ?? 0}
          candidateDateCount={group.candidate_dates?.length ?? 0}
          isDeleting={isDeleting}
          onConfirm={handleDeleteGroup}
        />
        <ConfirmDialog
          open={showLeaveGroupConfirm}
          onOpenChange={setShowLeaveGroupConfirm}
          title="このグループから退出しますか？"
          message="本当にこのグループから退出しますか？"
          confirmLabel="退出する"
          variant="destructive"
          onConfirm={handleConfirmLeaveGroup}
        />
    </>
  )
}

/**
 * D-5d: 貸切グループ削除の2ステップ確認ダイアログ（手本: DeleteEventCancelDialog の step 方式）
 * step1 = 影響サマリー（メンバー数／候補日数）の確認、step2 = 取り消せない旨の最終確認。
 * 赤い実行ボタンは最終ステップの1個だけ。
 *
 * 注記: メッセージ件数はロード済み state（usePrivateGroupByInviteCode の group）に存在しないため、
 * 追加 fetch はせずメンバー数／候補日数の2種で表示する（仕様の「追加fetch禁止」を優先）。
 */
interface DeleteGroupConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberCount: number
  candidateDateCount: number
  isDeleting: boolean
  onConfirm: () => Promise<void>
}

function DeleteGroupConfirmDialog({
  open,
  onOpenChange,
  memberCount,
  candidateDateCount,
  isDeleting,
  onConfirm,
}: DeleteGroupConfirmDialogProps) {
  const [step, setStep] = useState<'summary' | 'final'>('summary')

  useEffect(() => {
    if (open) setStep('summary')
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (isDeleting) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        {step === 'summary' ? (
          <>
            <DialogHeader>
              <DialogTitle>このグループを削除しますか？</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <p className="text-sm">
                このグループには以下のデータがあります。
              </p>
              <ul className="text-sm space-y-1 rounded-md border bg-muted/50 p-2">
                <li>・メンバー <span className="font-bold">{memberCount} 人</span></li>
                <li>・候補日 <span className="font-bold">{candidateDateCount} 件</span></li>
              </ul>
              <p className="text-xs text-muted-foreground">
                ※ まだ削除は実行されません。
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button onClick={() => setStep('final')}>
                次へ
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>本当に削除しますか？</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <p className="text-sm">
                この操作は取り消せません。グループのすべてのデータ（メンバー、候補日、メッセージ）が削除されます。
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setStep('summary')} disabled={isDeleting}>
                戻る
              </Button>
              <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
                {isDeleting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    削除中...
                  </span>
                ) : '削除する'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

