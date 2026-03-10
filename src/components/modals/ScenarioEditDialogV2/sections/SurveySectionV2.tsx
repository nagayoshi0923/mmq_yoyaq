import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  GripVertical,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
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
] as const

export function SurveySectionV2({ formData, setFormData }: SurveySectionV2Props) {
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)

  const questions = formData.survey_questions || []

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

  const moveQuestion = useCallback((id: string, direction: 'up' | 'down') => {
    setFormData(prev => {
      const questions = [...(prev.survey_questions || [])]
      const index = questions.findIndex(q => q.id === id)
      if (index === -1) return prev
      
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= questions.length) return prev
      
      [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]]
      
      return {
        ...prev,
        survey_questions: questions.map((q, i) => ({ ...q, order_num: i + 1 }))
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
            貸切グループのお客様へ公演前に回答いただくアンケートを設定します
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addQuestion}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    質問を追加
                  </Button>
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
                  <div className="space-y-2">
                    {questions.map((question, index) => (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        index={index}
                        isExpanded={expandedQuestionId === question.id}
                        onToggleExpand={() => setExpandedQuestionId(
                          expandedQuestionId === question.id ? null : question.id
                        )}
                        onUpdate={(updates) => updateQuestion(question.id, updates)}
                        onRemove={() => removeQuestion(question.id)}
                        onMoveUp={() => moveQuestion(question.id, 'up')}
                        onMoveDown={() => moveQuestion(question.id, 'down')}
                        onAddOption={() => addOption(question.id)}
                        onUpdateOption={(optionIndex, label) => updateOption(question.id, optionIndex, label)}
                        onRemoveOption={(optionIndex) => removeOption(question.id, optionIndex)}
                        isFirst={index === 0}
                        isLast={index === questions.length - 1}
                        hasCharacters={(formData.characters?.length || 0) > 0}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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
  onMoveUp: () => void
  onMoveDown: () => void
  onAddOption: () => void
  onUpdateOption: (optionIndex: number, label: string) => void
  onRemoveOption: (optionIndex: number) => void
  isFirst: boolean
  isLast: boolean
  hasCharacters: boolean
}

function QuestionCard({
  question,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  isFirst,
  isLast,
  hasCharacters,
}: QuestionCardProps) {
  const needsOptions = question.question_type === 'single_choice' || question.question_type === 'multiple_choice'
  const isCharacterSelection = question.question_type === 'character_selection'

  return (
    <div className="border rounded-lg bg-background">
      <div 
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50"
        onClick={onToggleExpand}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground w-6">
          Q{index + 1}
        </span>
        <span className="text-sm flex-1 truncate">
          {question.question_text || '（質問文を入力）'}
        </span>
        {question.is_required && (
          <span className="text-xs text-red-600 font-medium">必須</span>
        )}
        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
          {QUESTION_TYPES.find(t => t.value === question.question_type)?.label}
        </span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
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
                  if (value === 'text' || value === 'character_selection') {
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
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-700">
                💡 「キャラクター」タブで設定したキャラクター一覧から選択できます
              </p>
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
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMoveUp}
                disabled={isFirst}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMoveDown}
                disabled={isLast}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
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
