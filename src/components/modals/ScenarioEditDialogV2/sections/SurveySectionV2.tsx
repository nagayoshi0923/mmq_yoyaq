import { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  GripVertical,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  Search,
  MessageSquare
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import type { ScenarioFormData, SurveyQuestionFormData } from '@/components/modals/ScenarioEditModal/types'

const labelStyle = "text-xs font-medium mb-0.5 block"
const hintStyle = "text-[11px] text-muted-foreground mt-0.5"
const inputStyle = "h-8 text-sm"

interface SurveySectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

const QUESTION_TYPES = [
  { value: 'text', label: '自由記述' },
  { value: 'single_choice', label: '単一選択' },
  { value: 'multiple_choice', label: '複数選択' },
  { value: 'character_selection', label: 'キャラクター選択' },
  { value: 'rating', label: '5段階評価' },
] as const

export function SurveySectionV2({ formData, setFormData }: SurveySectionV2Props) {
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const questions = formData.survey_questions || []

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setFormData(prev => {
      const items = prev.survey_questions || []
      const oldIndex = items.findIndex(q => q.id === active.id)
      const newIndex = items.findIndex(q => q.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const reordered = arrayMove(items, oldIndex, newIndex)
      return {
        ...prev,
        survey_questions: reordered.map((q, i) => ({ ...q, order_num: i + 1 })),
      }
    })
  }, [setFormData])

  const handleImportQuestions = useCallback((importedQuestions: SurveyQuestionFormData[]) => {
    setFormData(prev => {
      const existing = prev.survey_questions || []
      const newQuestions = importedQuestions.map((q, i) => ({
        ...q,
        id: crypto.randomUUID(),
        order_num: existing.length + i + 1,
      }))
      return {
        ...prev,
        survey_questions: [...existing, ...newQuestions],
      }
    })
    setImportDialogOpen(false)
    showToast.success(`${importedQuestions.length}件の質問を追加しました`)
  }, [setFormData])

  const addQuestion = useCallback(() => {
    const newQuestion: SurveyQuestionFormData = {
      id: crypto.randomUUID(),
      question_text: '',
      question_type: 'text',
      options: [],
      is_required: false,
      order_num: questions.length + 1,
    }
    setFormData(prev => ({
      ...prev,
      survey_questions: [...(prev.survey_questions || []), newQuestion]
    }))
    setExpandedQuestionId(newQuestion.id)
  }, [questions.length, setFormData])

  const updateQuestion = useCallback((id: string, updates: Partial<SurveyQuestionFormData>) => {
    setFormData(prev => ({
      ...prev,
      survey_questions: (prev.survey_questions || []).map(q =>
        q.id === id ? { ...q, ...updates } : q
      )
    }))
  }, [setFormData])

  const removeQuestion = useCallback((id: string) => {
    setFormData(prev => ({
      ...prev,
      survey_questions: (prev.survey_questions || [])
        .filter(q => q.id !== id)
        .map((q, index) => ({ ...q, order_num: index + 1 }))
    }))
  }, [setFormData])

  const duplicateQuestion = useCallback((id: string) => {
    setFormData(prev => {
      const questions = prev.survey_questions || []
      const source = questions.find(q => q.id === id)
      if (!source) return prev
      const sourceIndex = questions.findIndex(q => q.id === id)
      const newQuestion: SurveyQuestionFormData = {
        ...source,
        id: crypto.randomUUID(),
        question_text: source.question_text ? `${source.question_text}（コピー）` : '',
        options: source.options.map(o => ({ ...o })),
      }
      const updated = [...questions]
      updated.splice(sourceIndex + 1, 0, newQuestion)
      return {
        ...prev,
        survey_questions: updated.map((q, i) => ({ ...q, order_num: i + 1 }))
      }
    })
  }, [setFormData])

  const addOption = useCallback((questionId: string) => {
    setFormData(prev => ({
      ...prev,
      survey_questions: (prev.survey_questions || []).map(q => {
        if (q.id !== questionId) return q
        const newOptionNum = q.options.length + 1
        return {
          ...q,
          options: [...q.options, { value: `option_${newOptionNum}`, label: `選択肢${newOptionNum}` }]
        }
      })
    }))
  }, [setFormData])

  const updateOption = useCallback((questionId: string, optionIndex: number, label: string) => {
    setFormData(prev => ({
      ...prev,
      survey_questions: (prev.survey_questions || []).map(q => {
        if (q.id !== questionId) return q
        const newOptions = [...q.options]
        newOptions[optionIndex] = { ...newOptions[optionIndex], label }
        return { ...q, options: newOptions }
      })
    }))
  }, [setFormData])

  const removeOption = useCallback((questionId: string, optionIndex: number) => {
    setFormData(prev => ({
      ...prev,
      survey_questions: (prev.survey_questions || []).map(q => {
        if (q.id !== questionId) return q
        return {
          ...q,
          options: q.options.filter((_, i) => i !== optionIndex)
        }
      })
    }))
  }, [setFormData])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            公演前アンケート
          </CardTitle>
          <CardDescription className="text-xs">
            貸切リクエストのお客様へ公演前に回答いただくアンケートを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="survey_enabled"
              checked={formData.survey_enabled || false}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, survey_enabled: checked }))}
            />
            <Label htmlFor="survey_enabled" className="font-medium cursor-pointer">
              アンケートを有効にする
            </Label>
          </div>
          
          {formData.survey_enabled && (
            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <Label className={labelStyle}>回答期限（公演の何日前まで）</Label>
                <Select
                  value={String(formData.survey_deadline_days ?? 1)}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    survey_deadline_days: parseInt(value, 10) 
                  }))}
                >
                  <SelectTrigger className={inputStyle + " w-48"}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">当日まで</SelectItem>
                    <SelectItem value="1">前日まで</SelectItem>
                    <SelectItem value="2">2日前まで</SelectItem>
                    <SelectItem value="3">3日前まで</SelectItem>
                    <SelectItem value="5">5日前まで</SelectItem>
                    <SelectItem value="7">7日前まで</SelectItem>
                  </SelectContent>
                </Select>
                <p className={hintStyle}>
                  日程確定後、この期限までお客様は回答できます
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className={labelStyle}>質問項目</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setImportDialogOpen(true)}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      他シナリオから読込
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={addQuestion}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      追加
                    </Button>
                  </div>
                </div>

                {questions.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      質問がありません
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={addQuestion}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      最初の質問を追加
                    </Button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={questions.map(q => q.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {questions.map((question, index) => (
                          <SortableQuestionCard
                            key={question.id}
                            question={question}
                            index={index}
                            isExpanded={expandedQuestionId === question.id}
                            onToggleExpand={() => setExpandedQuestionId(
                              expandedQuestionId === question.id ? null : question.id
                            )}
                            onUpdate={(updates) => updateQuestion(question.id, updates)}
                            onRemove={() => removeQuestion(question.id)}
                            onDuplicate={() => duplicateQuestion(question.id)}
                            onAddOption={() => addOption(question.id)}
                            onUpdateOption={(optionIndex, label) => updateOption(question.id, optionIndex, label)}
                            onRemoveOption={(optionIndex) => removeOption(question.id, optionIndex)}
                            hasCharacters={(formData.characters?.length || 0) > 0}
                            characters={formData.characters}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            個別お知らせ定型文
          </CardTitle>
          <CardDescription className="text-xs">
            アンケート回答確認時に、メンバーへ個別お知らせを送る際に添付できる定型文です
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <Textarea
            value={formData.individual_notice_template || ''}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              individual_notice_template: e.target.value || null,
            }))}
            placeholder="例: アンケートの回答ありがとうございます。以下の資料を公演前にご確認ください。"
            rows={3}
            className="text-sm resize-none"
          />
          <p className={hintStyle}>
            資料URLと一緒にこの定型文をメッセージに添付できます。メッセージ本文とは別に送信されます。
          </p>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4">
          <p className="text-sm text-amber-800">
            <span className="font-medium">💡 公演後アンケートについて</span>
            <br />
            公演後のアンケート（満足度調査など）は、設定 &gt; 組織情報 で組織全体に共通のURLを設定できます。
          </p>
        </CardContent>
      </Card>

      <ImportQuestionsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportQuestions}
        currentScenarioMasterId={formData.scenario_master_id}
      />
    </div>
  )
}

function SortableQuestionCard(props: QuestionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.question.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <QuestionCard {...props} dragListeners={listeners} />
    </div>
  )
}

interface QuestionCardProps {
  question: SurveyQuestionFormData
  index: number
  isExpanded: boolean
  onToggleExpand: () => void
  onUpdate: (updates: Partial<SurveyQuestionFormData>) => void
  onRemove: () => void
  onDuplicate: () => void
  onAddOption: () => void
  onUpdateOption: (optionIndex: number, label: string) => void
  onRemoveOption: (optionIndex: number) => void
  hasCharacters: boolean
  characters?: Array<{ id: string; name: string }>
  dragListeners?: Record<string, unknown>
}

function QuestionCard({
  question,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onDuplicate,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  hasCharacters,
  characters = [],
  dragListeners,
}: QuestionCardProps) {
  const needsOptions = question.question_type === 'single_choice' || question.question_type === 'multiple_choice'
  const isCharacterSelection = question.question_type === 'character_selection'
  const isRating = question.question_type === 'rating'

  return (
    <div className="border rounded-lg bg-background">
      <div className="flex items-center gap-1 p-2 sm:p-3">
        {/* ドラッグハンドル */}
        <div
          className="cursor-grab active:cursor-grabbing p-0.5 touch-none text-muted-foreground hover:text-foreground"
          {...(dragListeners || {})}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:bg-accent/50 rounded px-1 py-1"
          onClick={onToggleExpand}
        >
          <span className="text-sm font-medium text-muted-foreground w-6 shrink-0">
            Q{index + 1}
          </span>
          <span className="text-sm flex-1 truncate">
            {question.question_text || '（質問文を入力）'}
          </span>
          {question.is_required && (
            <span className="text-xs text-red-600 font-medium shrink-0">必須</span>
          )}
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded shrink-0">
            {QUESTION_TYPES.find(t => t.value === question.question_type)?.label}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 pt-0 space-y-3 border-t">
          <div className="space-y-2">
            <Label className={labelStyle}>質問文</Label>
            <Textarea
              value={question.question_text}
              onChange={(e) => onUpdate({ question_text: e.target.value })}
              placeholder="例: 希望のキャラクターを教えてください"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className={labelStyle}>回答形式</Label>
              <Select
                value={question.question_type}
                onValueChange={(value: SurveyQuestionFormData['question_type']) => {
                  const updates: Partial<SurveyQuestionFormData> = { question_type: value }
                  if (value === 'text' || value === 'character_selection' || value === 'rating') {
                    updates.options = []
                  } else if ((value === 'single_choice' || value === 'multiple_choice') && question.options.length === 0) {
                    updates.options = [
                      { value: 'option_1', label: '選択肢1' },
                      { value: 'option_2', label: '選択肢2' },
                    ]
                  }
                  onUpdate(updates)
                }}
              >
                <SelectTrigger className={inputStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map(type => (
                    <SelectItem 
                      key={type.value} 
                      value={type.value}
                      disabled={type.value === 'character_selection' && !hasCharacters}
                    >
                      {type.label}
                      {type.value === 'character_selection' && !hasCharacters && (
                        <span className="text-muted-foreground ml-1">（キャラクター未設定）</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  id={`required_${question.id}`}
                  checked={question.is_required}
                  onCheckedChange={(checked) => onUpdate({ is_required: checked })}
                />
                <Label htmlFor={`required_${question.id}`} className="text-xs cursor-pointer">
                  必須
                </Label>
              </div>
            </div>
          </div>

          {isCharacterSelection && (
            <div className="p-3 bg-purple-50 rounded-lg space-y-2">
              <p className="text-xs text-purple-700">
                💡 「キャラクター」タブで設定したキャラクター一覧から選択できます
              </p>
              {hasCharacters && characters && characters.length > 0 && (
                <div className="text-xs text-purple-600">
                  <span className="font-medium">設定済み: </span>
                  {characters.map(c => c.name).join('、')}
                </div>
              )}
            </div>
          )}

          {isRating && (
            <div className="p-3 bg-amber-50 rounded-lg space-y-2">
              <p className="text-xs text-amber-700">プレビュー</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <span key={n} className="w-8 h-8 flex items-center justify-center rounded-full border border-amber-300 text-sm text-amber-600 bg-white">
                    {n}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-amber-600">1（低い）〜 5（高い）の5段階で回答</p>
            </div>
          )}

          {needsOptions && (
            <div className="space-y-2">
              <Label className={labelStyle}>選択肢</Label>
              <div className="space-y-2">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">
                      {optionIndex + 1}.
                    </span>
                    <Input
                      value={option.label}
                      onChange={(e) => onUpdateOption(optionIndex, e.target.value)}
                      placeholder={`選択肢${optionIndex + 1}`}
                      className={inputStyle + " flex-1"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveOption(optionIndex)}
                      disabled={question.options.length <= 1}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onAddOption}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  選択肢を追加
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onDuplicate}
            >
              <Copy className="w-3 h-3 mr-1" />
              複製
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              削除
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// 他シナリオからアンケート質問を読み込むダイアログ
interface ImportQuestionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (questions: SurveyQuestionFormData[]) => void
  currentScenarioMasterId?: string
}

interface ScenarioWithSurvey {
  id: string
  title: string
  org_scenario_id: string
  questionCount: number
}

function ImportQuestionsDialog({ open, onOpenChange, onImport, currentScenarioMasterId }: ImportQuestionsDialogProps) {
  const [scenarios, setScenarios] = useState<ScenarioWithSurvey[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewQuestions, setPreviewQuestions] = useState<SurveyQuestionFormData[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!open) return
    loadScenarios()
  }, [open])

  const loadScenarios = async () => {
    setLoading(true)
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return

      const { data: orgScenarios } = await supabase
        .from('organization_scenarios')
        .select('id, scenario_master_id, survey_enabled, scenario_masters(title)')
        .eq('organization_id', orgId)
        .eq('survey_enabled', true)

      if (!orgScenarios || orgScenarios.length === 0) {
        setScenarios([])
        setLoading(false)
        return
      }

      const orgScenarioIds = orgScenarios.map(os => os.id)
      const { data: questionCounts } = await supabase
        .from('org_scenario_survey_questions')
        .select('org_scenario_id')
        .in('org_scenario_id', orgScenarioIds)

      const countMap = new Map<string, number>()
      questionCounts?.forEach(q => {
        countMap.set(q.org_scenario_id, (countMap.get(q.org_scenario_id) || 0) + 1)
      })

      const result: ScenarioWithSurvey[] = orgScenarios
        .filter(os => {
          const count = countMap.get(os.id) || 0
          if (count === 0) return false
          if (os.scenario_master_id === currentScenarioMasterId) return false
          return true
        })
        .map(os => ({
          id: os.scenario_master_id,
          title: (os.scenario_masters as any)?.title || '不明なシナリオ',
          org_scenario_id: os.id,
          questionCount: countMap.get(os.id) || 0,
        }))
        .sort((a, b) => a.title.localeCompare(b.title))

      setScenarios(result)
    } catch (err) {
      logger.error('シナリオ一覧取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadPreview = async (orgScenarioId: string) => {
    setSelectedId(orgScenarioId)
    setLoadingPreview(true)
    try {
      const { data } = await supabase
        .from('org_scenario_survey_questions')
        .select('question_text, question_type, options, is_required, order_num')
        .eq('org_scenario_id', orgScenarioId)
        .order('order_num', { ascending: true })

      if (data) {
        setPreviewQuestions(data.map(q => ({
          id: crypto.randomUUID(),
          question_text: q.question_text,
          question_type: q.question_type as SurveyQuestionFormData['question_type'],
          options: q.options || [],
          is_required: q.is_required,
          order_num: q.order_num,
        })))
      }
    } catch (err) {
      logger.error('質問プレビュー取得エラー:', err)
    } finally {
      setLoadingPreview(false)
    }
  }

  const filteredScenarios = searchTerm
    ? scenarios.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()))
    : scenarios

  const getTypeLabel = (type: string) =>
    QUESTION_TYPES.find(t => t.value === type)?.label || type

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">他のシナリオからアンケート質問を読み込む</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : scenarios.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">アンケートが設定されたシナリオがありません</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {scenarios.length > 5 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="シナリオ名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {filteredScenarios.map(scenario => (
                <button
                  key={scenario.org_scenario_id}
                  type="button"
                  onClick={() => loadPreview(scenario.org_scenario_id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors text-sm ${
                    selectedId === scenario.org_scenario_id
                      ? 'border-purple-300 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{scenario.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {scenario.questionCount}問
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {selectedId && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">プレビュー</p>
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {previewQuestions.map((q, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-gray-50 rounded">
                          <span className="text-muted-foreground w-6 shrink-0">Q{i + 1}</span>
                          <span className="flex-1 truncate">{q.question_text || '（質問文なし）'}</span>
                          <span className="text-muted-foreground px-1.5 py-0.5 bg-white rounded shrink-0">
                            {getTypeLabel(q.question_type)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      size="sm"
                      onClick={() => onImport(previewQuestions)}
                      disabled={previewQuestions.length === 0}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      {previewQuestions.length}件の質問を追加
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
