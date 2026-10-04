/**
 * 貸切リクエスト管理の確認ダイアログ（Discord 通知の再送・承認済みの内容変更・申込の完全削除）。index.tsx から見た目を変えずに切り出したもの。
 */
import { ConfirmDialog } from '@/components/patterns/modal'

export function RequestConfirmDialogs({ resendDiscordTarget, setResendDiscordTarget, runResendDiscordNotification, reapproveTarget, setReapproveTarget, runReapprove, deleteConfirmOpen, setDeleteConfirmOpen, runDelete }: {
  resendDiscordTarget: { scenario_title: string } | null
  setResendDiscordTarget: (v: null) => void
  runResendDiscordNotification: () => void | Promise<void>
  reapproveTarget: unknown
  setReapproveTarget: (v: null) => void
  runReapprove: () => void | Promise<void>
  deleteConfirmOpen: boolean
  setDeleteConfirmOpen: (open: boolean) => void
  runDelete: () => void | Promise<void>
}) {
  return (
    <>
    {/* Discord通知再送信 確認ダイアログ */}
    <ConfirmDialog
      open={resendDiscordTarget !== null}
      onOpenChange={(open) => { if (!open) setResendDiscordTarget(null) }}
      title={`「${resendDiscordTarget?.scenario_title ?? ''}」のDiscord通知を再送信しますか？`}
      description="担当GMに新しいボタン付きメッセージが送信されます。"
      confirmLabel="再送信する"
      variant="default"
      onConfirm={runResendDiscordNotification}
    />

    {/* 承認済み予約の内容変更 確認ダイアログ */}
    <ConfirmDialog
      open={reapproveTarget !== null}
      onOpenChange={(open) => { if (!open) setReapproveTarget(null) }}
      title="この予約は既に承認済みです。内容を変更しますか？"
      description="変更すると、お客様に再度確定メールが送信されます。"
      confirmLabel="変更する"
      variant="default"
      onConfirm={runReapprove}
    />

    {/* 申込の完全削除 確認ダイアログ */}
    <ConfirmDialog
      open={deleteConfirmOpen}
      onOpenChange={setDeleteConfirmOpen}
      title="この申込を完全に削除しますか？"
      description="この操作は取り消せません。関連するグループ、メッセージ、候補日程も削除されます。公演・支払・請求などの履歴がある申込は削除できません。履歴を残す場合は取消操作を利用してください。"
      confirmLabel="削除する"
      variant="destructive"
      onConfirm={runDelete}
    />
    </>
  )
}
