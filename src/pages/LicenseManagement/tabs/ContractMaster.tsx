import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, FilePenLine, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { licenseContractsApi } from '@/lib/api/licenseContractsApi'
import { showToast } from '@/utils/toast'
import type {
  LicenseBillingStatus,
  LicenseContractInput,
  LicenseManagerType,
  StoreScenarioLicenseContract,
} from '@/types'

const contractKeys = {
  all: ['license-contracts'] as const,
  options: ['license-contracts', 'options'] as const,
}

const managerLabels: Record<LicenseManagerType, string> = {
  qw_managed: 'クインズ管理',
  external_rights_holder: '外部権利者',
  buyout: '買い切り',
  in_house: '自社制作',
}

const billingLabels: Record<LicenseBillingStatus, string> = {
  billable: '請求対象',
  not_billable: '請求不要',
  exempt: '免除',
  pending_confirmation: '確認中',
}

const billingVariants: Record<LicenseBillingStatus, 'success' | 'gray' | 'secondary' | 'warning'> = {
  billable: 'success',
  not_billable: 'gray',
  exempt: 'secondary',
  pending_confirmation: 'warning',
}

const emptyForm: LicenseContractInput = {
  store_id: '',
  scenario_master_id: '',
  license_manager_type: 'qw_managed',
  standard_license_amount: 0,
  contracted_count: 1,
  contract_start_date: '',
  contract_end_date: '',
  billing_status: 'billable',
  notes: '',
}

type ContractMasterProps = {
  canEdit: boolean
}

export function ContractMaster({ canEdit }: ContractMasterProps) {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<StoreScenarioLicenseContract | null>(null)
  const [form, setForm] = useState<LicenseContractInput>(emptyForm)

  const { data: contracts = [], isLoading: contractsLoading } = useQuery({
    queryKey: contractKeys.all,
    queryFn: licenseContractsApi.list,
  })

  const { data: options, isLoading: optionsLoading } = useQuery({
    queryKey: contractKeys.options,
    queryFn: licenseContractsApi.options,
  })

  const createMutation = useMutation({
    mutationFn: licenseContractsApi.create,
    onSuccess: async () => {
      showToast.success('契約マスタを登録しました')
      setIsDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
    onError: (error) => {
      showToast.error(error instanceof Error ? error.message : '契約マスタの登録に失敗しました')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: LicenseContractInput }) =>
      licenseContractsApi.update(id, input),
    onSuccess: async () => {
      showToast.success('契約マスタを更新しました')
      setIsDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
    onError: (error) => {
      showToast.error(error instanceof Error ? error.message : '契約マスタの更新に失敗しました')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: licenseContractsApi.delete,
    onSuccess: async () => {
      showToast.success('契約マスタを削除しました')
      await queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
    onError: (error) => {
      showToast.error(error instanceof Error ? error.message : '契約マスタの削除に失敗しました')
    },
  })

  const scenarioAmountMap = useMemo(() => {
    return new Map((options?.scenarios ?? []).map(scenario => [scenario.id, scenario.license_amount ?? 0]))
  }, [options?.scenarios])

  useEffect(() => {
    if (!form.scenario_master_id || editingContract) return
    const amount = scenarioAmountMap.get(form.scenario_master_id)
    if (amount == null) return
    setForm(current => ({ ...current, standard_license_amount: amount }))
  }, [editingContract, form.scenario_master_id, scenarioAmountMap])

  const openCreateDialog = () => {
    setEditingContract(null)
    setForm(emptyForm)
    setIsDialogOpen(true)
  }

  const openEditDialog = (contract: StoreScenarioLicenseContract) => {
    setEditingContract(contract)
    setForm({
      store_id: contract.store_id,
      scenario_master_id: contract.scenario_master_id,
      license_manager_type: contract.license_manager_type,
      standard_license_amount: contract.standard_license_amount,
      contracted_count: contract.contracted_count,
      contract_start_date: contract.contract_start_date ?? '',
      contract_end_date: contract.contract_end_date ?? '',
      billing_status: contract.billing_status,
      notes: contract.notes ?? '',
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = () => {
    if (!form.store_id || !form.scenario_master_id) {
      showToast.warning('店舗とシナリオを選択してください')
      return
    }
    if (editingContract) {
      updateMutation.mutate({ id: editingContract.id, input: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (contractsLoading || optionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4" />
          契約マスタの編集は管理者のみ可能です。
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">店舗別シナリオ契約</CardTitle>
          {canEdit && (
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              追加
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              契約マスタはまだ登録されていません。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>店舗</TableHead>
                  <TableHead>シナリオ</TableHead>
                  <TableHead>管理者</TableHead>
                  <TableHead className="text-right">標準金額</TableHead>
                  <TableHead className="text-right">契約本数</TableHead>
                  <TableHead>契約期間</TableHead>
                  <TableHead>請求区分</TableHead>
                  {canEdit && <TableHead className="w-[96px] text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map(contract => (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      {contract.stores?.short_name || contract.stores?.name || '不明な店舗'}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{contract.scenario_masters?.title || '不明なシナリオ'}</div>
                      {contract.scenario_masters?.author && (
                        <div className="text-xs text-muted-foreground">{contract.scenario_masters.author}</div>
                      )}
                    </TableCell>
                    <TableCell>{managerLabels[contract.license_manager_type]}</TableCell>
                    <TableCell className="text-right">
                      ¥{contract.standard_license_amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">{contract.contracted_count}</TableCell>
                    <TableCell>
                      {formatPeriod(contract.contract_start_date, contract.contract_end_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={billingVariants[contract.billing_status]}>
                        {billingLabels[contract.billing_status]}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(contract)}>
                            <FilePenLine className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              // eslint-disable-next-line no-alert
                              if (window.confirm('この契約マスタを削除しますか？')) {
                                deleteMutation.mutate(contract.id)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingContract ? '契約マスタを編集' : '契約マスタを追加'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>店舗</Label>
              <Select value={form.store_id} onValueChange={value => setForm({ ...form, store_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="店舗を選択" />
                </SelectTrigger>
                <SelectContent>
                  {(options?.stores ?? []).map(store => (
                    <SelectItem key={store.id} value={store.id}>{store.short_name || store.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>シナリオ</Label>
              <Select value={form.scenario_master_id} onValueChange={value => setForm({ ...form, scenario_master_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="シナリオを選択" />
                </SelectTrigger>
                <SelectContent>
                  {(options?.scenarios ?? []).map(scenario => (
                    <SelectItem key={scenario.id} value={scenario.id}>{scenario.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>ライセンス管理者</Label>
              <Select
                value={form.license_manager_type}
                onValueChange={value => setForm({ ...form, license_manager_type: value as LicenseManagerType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(managerLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>請求区分</Label>
              <Select
                value={form.billing_status}
                onValueChange={value => setForm({ ...form, billing_status: value as LicenseBillingStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(billingLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>標準ライセンス金額</Label>
              <Input
                type="number"
                min={0}
                value={form.standard_license_amount}
                onChange={event => setForm({ ...form, standard_license_amount: Number(event.target.value || 0) })}
              />
            </div>

            <div className="space-y-2">
              <Label>契約本数</Label>
              <Input
                type="number"
                min={0}
                value={form.contracted_count}
                onChange={event => setForm({ ...form, contracted_count: Number(event.target.value || 0) })}
              />
            </div>

            <div className="space-y-2">
              <Label>契約開始日</Label>
              <Input
                type="date"
                value={form.contract_start_date ?? ''}
                onChange={event => setForm({ ...form, contract_start_date: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>契約終了日</Label>
              <Input
                type="date"
                value={form.contract_end_date ?? ''}
                onChange={event => setForm({ ...form, contract_end_date: event.target.value })}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>メモ</Label>
              <Textarea
                value={form.notes ?? ''}
                onChange={event => setForm({ ...form, notes: event.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return '指定なし'
  return `${start || '未設定'} - ${end || '未設定'}`
}
