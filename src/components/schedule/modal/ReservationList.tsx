import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Mail, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useReservationListData } from './reservationList/useReservationListData'
import { useReservationListActions } from './reservationList/useReservationListActions'
import { CancelReservationDialog } from './reservationList/dialogs/CancelReservationDialog'
import { DeleteEventDialog } from './reservationList/dialogs/DeleteEventDialog'
import { EmailConfirmDialog } from './reservationList/dialogs/EmailConfirmDialog'
import { SendEmailDialog } from './reservationList/dialogs/SendEmailDialog'
import { AddParticipantSection } from './reservationList/AddParticipantSection'
import { ReservationRow } from './reservationList/ReservationRow'
import type { NewParticipant } from './reservationList/newParticipant'
import { EMPTY_CANCELLATION_EMAIL_STATE, type ReservationCancellationEmailState } from './reservationList/cancellationEmailState'
import { showToast } from '@/utils/toast'
import { TemplateEditButton } from '@/components/settings/TemplateEditButton'
import type { Staff as StaffType, Scenario, Store, Reservation } from '@/types'
import { ScheduleEvent, EventFormData } from '@/types/schedule'

interface ReservationListProps {
  event: ScheduleEvent | null
  currentEventData: EventFormData
  mode: 'add' | 'edit'
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  onParticipantChange?: (eventId: string, newCount: number) => void
  // モーダル内バッジのみ更新（スケジュールカードへは伝播しない）
  onLocalParticipantUpdate?: (count: number) => void
  onGmsChange?: (gms: string[], gmRoles: Record<string, string>) => void
  // 予約データから取得したスタッフ参加者を親に通知（DBの情報を直接反映）
  onStaffParticipantsChange?: (staffParticipants: string[]) => void
  // add モードで「+ 参加者を追加」した時のバッファ (event 未保存のため INSERT できない)
  pendingParticipants?: Array<{ name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }>
  onPendingAdd?: (p: { name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }) => void
  onPendingRemove?: (idx: number) => void
  // GM タブで「スタッフ参加」役割を付けたが DB 予約として未登録の名前 (公演情報タブ ⇔ 予約者タブの双方向同期用)
  pendingStaffGmNames?: string[]
  onPendingStaffGmRemove?: (name: string) => void
  // イベント削除時のコールバック（貸切参加者全員キャンセル時）
  onDeleteEvent?: () => Promise<void>
}

export function ReservationList({
  event,
  currentEventData,
  mode,
  stores,
  scenarios,
  staff,
  onParticipantChange,
  onLocalParticipantUpdate,
  onGmsChange,
  onStaffParticipantsChange,
  pendingParticipants = [],
  onPendingAdd,
  onPendingRemove,
  pendingStaffGmNames = [],
  onPendingStaffGmRemove,
  onDeleteEvent
}: ReservationListProps) {
  // データ層（取得・realtime購読・顧客名）はフックへ分離
  const { reservations, setReservations, loadingReservations, customerNames } = useReservationListData({
    event,
    mode,
    onParticipantChange,
    onLocalParticipantUpdate,
  })
  const [expandedReservation, setExpandedReservation] = useState<string | null>(null)
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set())
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isEmailConfirmOpen, setIsEmailConfirmOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [shouldSendEmail, setShouldSendEmail] = useState(true) // メール送信するかどうか
  const [isDeleteEventDialogOpen, setIsDeleteEventDialogOpen] = useState(false) // イベント削除確認ダイアログ
  const [isDeletingEvent, setIsDeletingEvent] = useState(false) // イベント削除中フラグ
  const [emailContent, setEmailContent] = useState<ReservationCancellationEmailState>(EMPTY_CANCELLATION_EMAIL_STATE)
  
  // メール本文の生成は共通モジュール（lib/cancellationEmail）に移動。
  // 公演の中止・削除フロー（DeleteEventCancelDialog）と同じロジックを共有する
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [newParticipant, setNewParticipant] = useState<NewParticipant>({
    customer_name: '',
    participant_count: 1,
    payment_method: 'onsite',
    notes: ''
  })
  const cancellationTemplateStoreId =
    currentEventData.venue ||
    (event?.venue ? stores.find(s => s.id === event.venue || s.name === event.venue)?.id : null)


  // 参加者名が変更された時にスタッフ名と一致するかチェック
  useEffect(() => {
    if (newParticipant.customer_name.trim()) {
      const isStaff = staff.some(s => s.name === newParticipant.customer_name.trim())
      if (isStaff && newParticipant.payment_method !== 'staff') {
        setNewParticipant(prev => ({ ...prev, payment_method: 'staff' }))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParticipant.customer_name, staff])

  // 予約データからスタッフ参加者を抽出して親に通知（DBをシングルソースとする）
  useEffect(() => {
    if (onStaffParticipantsChange) {
      const staffParticipants = reservations
        .filter(r => 
          r.payment_method === 'staff' && 
          r.status !== 'cancelled' &&
          r.participant_names?.length
        )
        .flatMap(r => r.participant_names || [])

      // 重複除去（同一スタッフが複数予約に入る/名前配列が重複するケース対策）
      onStaffParticipantsChange(Array.from(new Set(staffParticipants)))
    }
  }, [reservations, onStaffParticipantsChange])

  // 予約ステータスを更新する関数
  const {
    handleUpdateReservationStatus,
    handleConfirmCancelFromDialog,
    handleExecuteCancel,
    handleAddParticipant,
    handleConfirmDeleteEvent,
    closeEmailConfirm,
    handleSendBulkEmail,
  } = useReservationListActions({
    event,
    currentEventData,
    stores,
    scenarios,
    staff,
    onDeleteEvent,
    onParticipantChange,
    onGmsChange,
    reservations,
    cancellingReservation,
    emailContent,
    newParticipant,
    selectedReservations,
    emailSubject,
    emailBody,
    isCancelling,
    expandedReservation,
    onPendingAdd,
    setReservations,
    setCancellingReservation,
    setEmailContent,
    setEmailSubject,
    setEmailBody,
    setExpandedReservation,
    setIsAddingParticipant,
    setIsCancelDialogOpen,
    setIsCancelling,
    setIsDeleteEventDialogOpen,
    setIsDeletingEvent,
    setIsEmailConfirmOpen,
    setIsEmailModalOpen,
    setNewParticipant,
    setSelectedReservations,
    setSendingEmail,
    setShouldSendEmail,
  })

  return (
    <>
      {loadingReservations ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex gap-2 mt-1">
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {/* 公演中止バナー */}
          {event?.is_cancelled && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <span className="text-red-600 font-semibold text-xs">公演中止済み</span>
              <span className="text-red-500 text-xs">— 下記の予約は公演中止によりキャンセルまたは無効です</span>
            </div>
          )}
          <div className="mb-4">
            <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-2">
              <span className="text-xs font-medium text-muted-foreground mr-1">関連テンプレ:</span>
              <TemplateEditButton
                templateKey="reservation_confirmation_template"
                storeId={cancellationTemplateStoreId}
                label="予約確認"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="booking_change_template"
                storeId={cancellationTemplateStoreId}
                label="予約変更"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="cancellation_template"
                storeId={cancellationTemplateStoreId}
                label="お客様キャンセル"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="reminder_template"
                storeId={cancellationTemplateStoreId}
                label="リマインド"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="waitlist_notify_template"
                storeId={cancellationTemplateStoreId}
                label="キャンセル待ち通知"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="waitlist_registration_template"
                storeId={cancellationTemplateStoreId}
                label="キャンセル待ち登録"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="performance_cancellation_template"
                storeId={cancellationTemplateStoreId}
                label="人数未達中止"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="event_cancellation_template"
                storeId={cancellationTemplateStoreId}
                label="公演中止"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
              <TemplateEditButton
                templateKey="performance_extension_template"
                storeId={cancellationTemplateStoreId}
                label="募集延長"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
              />
            </div>
            <AddParticipantSection
              event={event}
              scenarios={scenarios}
              stores={stores}
              staff={staff}
              currentEventData={currentEventData}
              isAddingParticipant={isAddingParticipant}
              setIsAddingParticipant={setIsAddingParticipant}
              newParticipant={newParticipant}
              setNewParticipant={setNewParticipant}
              handleAddParticipant={handleAddParticipant}
              customerNames={customerNames}
              onParticipantChange={onParticipantChange}
              setReservations={setReservations}
            />
          </div>

          {/* 保存後追加予定 (add モードでバッファされた参加者 + GM タブの staff 役割で未保存) */}
          {(pendingParticipants.length > 0 || pendingStaffGmNames.length > 0) && (
            <div className="mb-3 space-y-1.5">
              <p className="text-[11px] font-medium text-amber-700">
                保存後に追加されます ({pendingParticipants.length + pendingStaffGmNames.length}件)
              </p>
              {pendingStaffGmNames.map((name) => (
                <div key={`staff-${name}`} className="flex items-center justify-between gap-2 p-2 rounded border border-dashed border-amber-300 bg-amber-50/60">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">追加予定</span>
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">×1</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">スタッフ (GMタブから)</span>
                  </div>
                  {onPendingStaffGmRemove && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onPendingStaffGmRemove(name)} title="GM タブからも完全に削除します">
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              {pendingParticipants.map((p, idx) => (
                <div key={`buf-${idx}`} className="flex items-center justify-between gap-2 p-2 rounded border border-dashed border-amber-300 bg-amber-50/60">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">追加予定</span>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">×{p.count}</span>
                    {p.paymentMethod === 'staff' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">スタッフ</span>
                    )}
                  </div>
                  {onPendingRemove && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onPendingRemove(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {reservations.length === 0 && pendingParticipants.length === 0 && pendingStaffGmNames.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              予約はありません
            </div>
          ) : reservations.length === 0 ? null : (
            <div>
              {selectedReservations.size > 0 && (
                <div className="mb-3 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedReservations.size}件選択中
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      const selectedEmails = reservations
                        .filter(r => selectedReservations.has(r.id))
                        .map(r => r.customer_id)
                        .filter(Boolean)
                      if (selectedEmails.length > 0) {
                        setIsEmailModalOpen(true)
                      } else {
                        showToast.warning('選択した予約にメールアドレスが設定されていません')
                      }
                    }}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    メール送信
                  </Button>
                </div>
              )}
              <div>
                <div className="hidden sm:flex border rounded-t-lg bg-muted/30 p-3 h-[50px] items-center justify-between font-medium text-xs">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-[40px] flex items-center justify-center">
                      <Checkbox
                        checked={selectedReservations.size === reservations.length && reservations.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedReservations(new Set(reservations.map(r => r.id)))
                          } else {
                            setSelectedReservations(new Set())
                          }
                        }}
                      />
                    </div>
                    <span className="flex-1">顧客名</span>
                    <span className="w-[60px]">人数</span>
                    <span className="w-[100px]">予約日時</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="w-[80px]">ステータス</span>
                    <span className="w-[80px]"></span>
                  </div>
                </div>
                <div className="sm:hidden border rounded-t-lg bg-muted/30 p-3 flex items-center justify-between font-medium text-xs">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedReservations.size === reservations.length && reservations.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedReservations(new Set(reservations.map(r => r.id)))
                        } else {
                          setSelectedReservations(new Set())
                        }
                      }}
                    />
                    <span>予約一覧</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {reservations.length}件
                  </span>
                </div>
                
                <div className="border-l border-r border-b rounded-b-lg">
                  {reservations.map((reservation, index) => (
                    <ReservationRow
                      key={reservation.id}
                      reservation={reservation}
                      index={index}
                      reservations={reservations}
                      setReservations={setReservations}
                      expandedReservation={expandedReservation}
                      setExpandedReservation={setExpandedReservation}
                      selectedReservations={selectedReservations}
                      setSelectedReservations={setSelectedReservations}
                      staff={staff}
                      stores={stores}
                      scenarios={scenarios}
                      event={event}
                      handleUpdateReservationStatus={handleUpdateReservationStatus}
                      onParticipantChange={onParticipantChange}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <SendEmailDialog
        open={isEmailModalOpen}
        onOpenChange={setIsEmailModalOpen}
        recipientCount={selectedReservations.size}
        recipients={reservations.filter(r => selectedReservations.has(r.id))}
        subject={emailSubject}
        setSubject={setEmailSubject}
        body={emailBody}
        setBody={setEmailBody}
        sending={sendingEmail}
        onClose={() => {
          setIsEmailModalOpen(false)
          setEmailSubject('')
          setEmailBody('')
        }}
        onSend={handleSendBulkEmail}
      />

      <CancelReservationDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        reservation={cancellingReservation}
        onClose={() => {
          setIsCancelDialogOpen(false)
          setCancellingReservation(null)
        }}
        isCancelling={isCancelling}
        onConfirm={handleConfirmCancelFromDialog}
      />

      <EmailConfirmDialog
        open={isEmailConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCancellingReservation(null)
          }
          setIsEmailConfirmOpen(open)
        }}
        emailContent={emailContent}
        setEmailContent={setEmailContent}
        shouldSendEmail={shouldSendEmail}
        setShouldSendEmail={setShouldSendEmail}
        isCancelling={isCancelling}
        cancellationTemplateStoreId={cancellationTemplateStoreId}
        onClose={closeEmailConfirm}
        onConfirm={() => handleExecuteCancel(shouldSendEmail)}
      />

      {/* 貸切イベント削除確認ダイアログ */}
      <DeleteEventDialog
        open={isDeleteEventDialogOpen}
        onOpenChange={setIsDeleteEventDialogOpen}
        onClose={() => setIsDeleteEventDialogOpen(false)}
        isDeleting={isDeletingEvent}
        onConfirm={handleConfirmDeleteEvent}
      />
    </>
  )
}
