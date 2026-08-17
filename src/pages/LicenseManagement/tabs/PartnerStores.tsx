import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/patterns/modal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { licensePartnerStoresApi } from '@/lib/api/licensePartnerStoresApi'
import { showToast } from '@/utils/toast'
import type { LicensePartnerContractInput, LicensePartnerStore } from '@/types'

const partnerKeys = {
  all: ['license-partner-stores'] as const,
  options: ['license-partner-stores', 'options'] as const,
  detail: (id: string) => ['license-partner-stores', 'detail', id] as const,
}

type PartnerStoresProps = {
  canEdit: boolean
}

function reportUrl(token: string) {
  return `${window.location.origin}/partner-report/${token}`
}

export function PartnerStores({ canEdit }: PartnerStoresProps) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LicensePartnerStore | null>(null)
  const [rotateTarget, setRotateTarget] = useState<LicensePartnerStore | null>(null)

  const { data: stores = [], isLoading } = useQuery({
    queryKey: partnerKeys.all,
    queryFn: licensePartnerStoresApi.list,
  })

  const createMutation = useMutation({
    mutationFn: licensePartnerStoresApi.create,
    onSuccess: async (store) => {
      showToast.success('契約店舗を追加しました')
      setIsCreateOpen(false)
      setCreateName('')
      await queryClient.invalidateQueries({ queryKey: partnerKeys.all, refetchType: 'all' })
      setEditingId(store.id)
    },
    onError: (error) => {
      showToast.error(error instanceof Error ? error.message : '契約店舗の追加に失敗しました')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: licensePartnerStoresApi.delete,
    onSuccess: async () => {
      showToast.success('契約店舗を削除しました')
      setDeleteTarget(null)
      await queryClient.invalidateQueries({ queryKey: partnerKeys.all, refetchType: 'all' })
    },
    onError: (error) => {
      showToast.error(error instanceof Error ? error.message : '契約店舗の削除に失敗しました')
    },
  })

  const copyUrl = async (token: string) => {
    try {
      await navigator.clipboard.writeText(reportUrl(token))
      showToast.success('報告用URLをコピーしました')
    } catch {
      showToast.error('URLのコピーに失敗しました')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">契約店舗</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              アナーキー様など、管理作品を契約している他社店舗です。自店舗の契約マスタとは別です。
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              店舗を追加
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              契約店舗はまだ登録されていません。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>店舗</TableHead>
                  <TableHead>Discordチャンネル</TableHead>
                  <TableHead className="text-right">契約作品</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead className="w-[220px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map(store => (
                  <TableRow key={store.id}>
                    <TableCell className="font-medium">{store.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {store.discord_channel_id || '未設定'}
                    </TableCell>
                    <TableCell className="text-right">{store.contract_count ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={store.is_active ? 'success' : 'gray'}>
                        {store.is_active ? '有効' : '停止'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => void copyUrl(store.report_token)}>
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          URL
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingId(store.id)}>
                          {canEdit ? '編集' : '詳細'}
                        </Button>
                        {canEdit && (
                          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(store)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>契約店舗を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="partner-store-name">店舗名</Label>
              <Input
                id="partner-store-name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="アナーキー様"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>キャンセル</Button>
            <Button
              disabled={!createName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: createName.trim() })}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingId && (
        <PartnerStoreEditDialog
          storeId={editingId}
          canEdit={canEdit}
          onClose={() => setEditingId(null)}
          onRotateRequest={(store) => setRotateTarget(store)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="契約店舗を削除しますか？"
        description={deleteTarget ? `${deleteTarget.name} の契約と月次報告も削除されます。` : undefined}
        confirmLabel="削除する"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />

      <ConfirmDialog
        open={Boolean(rotateTarget)}
        onOpenChange={(open) => { if (!open) setRotateTarget(null) }}
        title="報告用URLを再発行しますか？"
        description="以前のURLは使えなくなります。新しいURLを店舗へ送り直してください。"
        confirmLabel="再発行する"
        variant="warning"
        onConfirm={async () => {
          if (!rotateTarget) return
          try {
            const updated = await licensePartnerStoresApi.rotateToken(rotateTarget.id)
            showToast.success('報告用URLを再発行しました')
            setRotateTarget(null)
            await queryClient.invalidateQueries({ queryKey: partnerKeys.all, refetchType: 'all' })
            await queryClient.invalidateQueries({ queryKey: partnerKeys.detail(updated.id), refetchType: 'all' })
          } catch (error) {
            showToast.error(error instanceof Error ? error.message : '再発行に失敗しました')
          }
        }}
      />
    </div>
  )
}

function PartnerStoreEditDialog({
  storeId,
  canEdit,
  onClose,
  onRotateRequest,
}: {
  storeId: string
  canEdit: boolean
  onClose: () => void
  onRotateRequest: (store: LicensePartnerStore) => void
}) {
  const queryClient = useQueryClient()
  const { data: detail, isLoading } = useQuery({
    queryKey: partnerKeys.detail(storeId),
    queryFn: () => licensePartnerStoresApi.get(storeId),
  })
  const { data: options } = useQuery({
    queryKey: partnerKeys.options,
    queryFn: licensePartnerStoresApi.options,
  })

  const [name, setName] = useState('')
  const [discordChannelId, setDiscordChannelId] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selected, setSelected] = useState<Record<string, { checked: boolean; amount: string }>>({})

  useEffect(() => {
    if (!detail) return
    setName(detail.name)
    setDiscordChannelId(detail.discord_channel_id ?? '')
    setNotes(detail.notes ?? '')
    setIsActive(detail.is_active)
    const next: Record<string, { checked: boolean; amount: string }> = {}
    for (const contract of detail.contracts) {
      next[contract.scenario_master_id] = {
        checked: true,
        amount: contract.license_amount != null ? String(contract.license_amount) : '',
      }
    }
    setSelected(next)
  }, [detail])

  const scenarios = options?.scenarios ?? []

  const saveMutation = useMutation({
    mutationFn: async () => {
      await licensePartnerStoresApi.update(storeId, {
        name: name.trim(),
        discord_channel_id: discordChannelId.trim() || null,
        notes: notes.trim() || null,
        is_active: isActive,
      })
      const contracts: LicensePartnerContractInput[] = Object.entries(selected)
        .filter(([, value]) => value.checked)
        .map(([scenarioId, value]) => ({
          scenario_master_id: scenarioId,
          license_amount: value.amount.trim() === '' ? null : Number(value.amount),
        }))
      return licensePartnerStoresApi.replaceContracts(storeId, contracts)
    },
    onSuccess: async () => {
      showToast.success('契約店舗を保存しました')
      await queryClient.invalidateQueries({ queryKey: partnerKeys.all, refetchType: 'all' })
      await queryClient.invalidateQueries({ queryKey: partnerKeys.detail(storeId), refetchType: 'all' })
      onClose()
    },
    onError: (error) => {
      showToast.error(error instanceof Error ? error.message : '保存に失敗しました')
    },
  })

  const copyUrl = async () => {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(reportUrl(detail.report_token))
      showToast.success('報告用URLをコピーしました')
    } catch {
      showToast.error('URLのコピーに失敗しました')
    }
  }

  const selectedCount = useMemo(
    () => Object.values(selected).filter(value => value.checked).length,
    [selected]
  )

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{canEdit ? '契約店舗を編集' : '契約店舗の詳細'}</DialogTitle>
        </DialogHeader>
        {isLoading || !detail ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-partner-name">店舗名</Label>
                <Input
                  id="edit-partner-name"
                  value={name}
                  disabled={!canEdit}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-partner-discord">Discord チャンネルID</Label>
                <Input
                  id="edit-partner-discord"
                  value={discordChannelId}
                  disabled={!canEdit}
                  onChange={(event) => setDiscordChannelId(event.target.value)}
                  placeholder="数字のチャンネルID"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-partner-notes">メモ</Label>
              <Textarea
                id="edit-partner-notes"
                value={notes}
                disabled={!canEdit}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">有効</p>
                <p className="text-xs text-muted-foreground">停止すると報告フォームとリマインド対象外になります</p>
              </div>
              <Switch checked={isActive} disabled={!canEdit} onCheckedChange={setIsActive} />
            </div>
            <div className="space-y-2">
              <Label>報告用URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={reportUrl(detail.report_token)} />
                <Button type="button" variant="outline" onClick={() => void copyUrl()}>
                  <Copy className="h-4 w-4" />
                </Button>
                {canEdit && (
                  <Button type="button" variant="outline" onClick={() => onRotateRequest(detail)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>契約している管理作品（既定単価は店舗が支払う額）</Label>
                <span className="text-xs text-muted-foreground">{selectedCount}作品</span>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
                {scenarios.map(scenario => {
                  const current = selected[scenario.id] ?? { checked: false, amount: '' }
                  return (
                    <div key={scenario.id} className="flex items-center gap-3">
                      <Checkbox
                        checked={current.checked}
                        disabled={!canEdit}
                        onCheckedChange={(checked) => {
                          setSelected(prev => ({
                            ...prev,
                            [scenario.id]: { ...current, checked: checked === true },
                          }))
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{scenario.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {scenario.author || '作者未設定'} / 支払額 ¥{scenario.license_amount.toLocaleString()}
                        </p>
                      </div>
                      <Input
                        className="w-28"
                        inputMode="numeric"
                        disabled={!canEdit || !current.checked}
                        placeholder="既定"
                        value={current.amount}
                        onChange={(event) => {
                          setSelected(prev => ({
                            ...prev,
                            [scenario.id]: { ...current, amount: event.target.value },
                          }))
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          {canEdit && (
            <Button disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
