/**
 * 公演報告作成ダイアログ
 */
import { logger } from '@/utils/logger'
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Calendar, FileText, Users, MapPin } from 'lucide-react'
import { createExternalReport, getManagedScenarios } from '@/lib/api/externalReportsApi'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface ReportCreateDialogProps {
  isOpen: boolean
  onClose: () => void
  organizationId: string
  staffId: string
  onSuccess: () => void
}

interface ManagedScenario {
  id: string
  title: string
  author: string
  license_amount: number
}

export function ReportCreateDialog({
  isOpen,
  onClose,
  organizationId,
  staffId,
  onSuccess,
}: ReportCreateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [scenarios, setScenarios] = useState<ManagedScenario[]>([])
  const [isScenariosLoading, setIsScenariosLoading] = useState(true)
  const [formData, setFormData] = useState({
    scenario_id: '',
    performance_date: format(new Date(), 'yyyy-MM-dd'),
    performance_count: 1,
    participant_count: '',
    venue_name: '',
    notes: '',
  })

  // 管理シナリオ一覧を取得
  useEffect(() => {
    async function fetchScenarios() {
      try {
        setIsScenariosLoading(true)
        const data = await getManagedScenarios()
        setScenarios(data)
      } catch (error) {
        logger.error('Failed to fetch managed scenarios:', error)
        toast.error('シナリオ一覧の取得に失敗しました')
      } finally {
        setIsScenariosLoading(false)
      }
    }
    if (isOpen) {
      fetchScenarios()
    }
  }, [isOpen])

  const selectedScenario = scenarios.find(s => s.id === formData.scenario_id)

  const handleSubmit = async () => {
    if (!formData.scenario_id) {
      toast.error('シナリオを選択してください')
      return
    }
    if (!formData.performance_date) {
      toast.error('公演日を入力してください')
      return
    }
    if (formData.performance_count < 1) {
      toast.error('公演回数は1以上を入力してください')
      return
    }

    setIsLoading(true)
    try {
      await createExternalReport({
        scenario_id: formData.scenario_id,
        organization_id: organizationId,
        reported_by: staffId,
        performance_date: formData.performance_date,
        performance_count: formData.performance_count,
        participant_count: formData.participant_count ? parseInt(formData.participant_count) : null,
        venue_name: formData.venue_name.trim() || null,
        notes: formData.notes.trim() || null,
      })

      toast.success('公演報告を送信しました')
      onSuccess()
      // フォームをリセット
      setFormData({
        scenario_id: '',
        performance_date: format(new Date(), 'yyyy-MM-dd'),
        performance_count: 1,
        participant_count: '',
        venue_name: '',
        notes: '',
      })
    } catch (error) {
      logger.error('Failed to create report:', error)
      toast.error('公演報告の送信に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>公演報告を作成</DialogTitle>
          <DialogDescription>
            管理シナリオの公演実績を報告してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* シナリオ選択 */}
          <div className="space-y-2">
            <Label htmlFor="scenario">シナリオ *</Label>
            {isScenariosLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                読み込み中...
              </div>
            ) : (
              <Select
                value={formData.scenario_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, scenario_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="シナリオを選択" />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>
                      {scenario.title} ({scenario.author})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedScenario && (
              <p className="text-xs text-muted-foreground">
                ライセンス料: ¥{selectedScenario.license_amount.toLocaleString()}/回
              </p>
            )}
          </div>

          {/* 公演日 */}
          <div className="space-y-2">
            <Label htmlFor="performance_date">公演日 *</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="performance_date"
                type="date"
                value={formData.performance_date}
                onChange={(e) => setFormData(prev => ({ ...prev, performance_date: e.target.value }))}
                className="pl-10"
              />
            </div>
          </div>

          {/* 公演回数 */}
          <div className="space-y-2">
            <Label htmlFor="performance_count">公演回数 *</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="performance_count"
                type="number"
                min={1}
                value={formData.performance_count}
                onChange={(e) => setFormData(prev => ({ ...prev, performance_count: parseInt(e.target.value) || 1 }))}
                className="pl-10"
              />
            </div>
          </div>

          {/* 参加者数（オプション） */}
          <div className="space-y-2">
            <Label htmlFor="participant_count">参加者数（任意）</Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="participant_count"
                type="number"
                min={1}
                value={formData.participant_count}
                onChange={(e) => setFormData(prev => ({ ...prev, participant_count: e.target.value }))}
                placeholder="参加者の合計人数"
                className="pl-10"
              />
            </div>
          </div>

          {/* 会場名（オプション） */}
          <div className="space-y-2">
            <Label htmlFor="venue_name">会場名（任意）</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="venue_name"
                value={formData.venue_name}
                onChange={(e) => setFormData(prev => ({ ...prev, venue_name: e.target.value }))}
                placeholder="公演会場の名前"
                className="pl-10"
              />
            </div>
          </div>

          {/* メモ（オプション） */}
          <div className="space-y-2">
            <Label htmlFor="notes">メモ（任意）</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="補足情報があれば入力してください"
              rows={3}
            />
          </div>

          {/* ライセンス料の目安 */}
          {selectedScenario && formData.performance_count > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">ライセンス料（目安）</div>
              <div className="text-xl font-bold">
                ¥{(selectedScenario.license_amount * formData.performance_count).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || isScenariosLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            報告を送信
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

