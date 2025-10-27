import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface CostsPropsSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function CostsPropsSection({ formData, setFormData }: CostsPropsSectionProps) {
  const [newProductionItem, setNewProductionItem] = useState('')
  const [newProductionAmount, setNewProductionAmount] = useState(0)
  const [newRequiredPropItem, setNewRequiredPropItem] = useState('')
  const [newRequiredPropAmount, setNewRequiredPropAmount] = useState(0)
  const [newRequiredPropFrequency, setNewRequiredPropFrequency] = useState<'recurring' | 'one-time'>('recurring')

  const addProductionCost = () => {
    if (newProductionItem.trim() && newProductionAmount > 0) {
      setFormData(prev => ({
        ...prev,
        production_costs: [...prev.production_costs, { item: newProductionItem.trim(), amount: newProductionAmount }]
      }))
      setNewProductionItem('')
      setNewProductionAmount(0)
    }
  }

  const removeProductionCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      production_costs: prev.production_costs.filter((_, i) => i !== index)
    }))
  }

  const addRequiredProp = () => {
    if (newRequiredPropItem.trim() && newRequiredPropAmount > 0) {
      setFormData(prev => ({
        ...prev,
        required_props: [...prev.required_props, { 
          item: newRequiredPropItem.trim(), 
          amount: newRequiredPropAmount,
          frequency: newRequiredPropFrequency
        }]
      }))
      setNewRequiredPropItem('')
      setNewRequiredPropAmount(0)
      setNewRequiredPropFrequency('recurring')
    }
  }

  const removeRequiredProp = (index: number) => {
    setFormData(prev => {
      const newProps = prev.required_props.filter((prop, i) => i !== index && prop != null)
      return {
        ...prev,
        required_props: newProps
      }
    })
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">制作費・道具</h3>
      <div className="space-y-6">
        {/* 制作費 */}
        <div>
          <h4 className="text-sm font-medium mb-3">制作費</h4>
          <div className="space-y-3">
          {/* 既存の制作費 */}
          {formData.production_costs.map((cost, index) => (
            <div key={index} className="flex items-center gap-2 border rounded p-3">
              <div className="flex-1">
                <span className="font-medium">{cost.item}</span>
              </div>
              <div className="w-32 text-right">
                <span>{cost.amount.toLocaleString()}円</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProductionCost(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {formData.production_costs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              制作費が登録されていません
            </p>
          )}

          {/* 新規追加フォーム */}
          <div className="border-t pt-4">
            <Label className="mb-2 block">新規追加</Label>
            <div className="flex gap-2">
              <Input
                placeholder="項目名"
                value={newProductionItem}
                onChange={(e) => setNewProductionItem(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="金額"
                value={newProductionAmount || ''}
                onChange={(e) => setNewProductionAmount(parseInt(e.target.value) || 0)}
                className="w-32"
              />
              <Button type="button" onClick={addProductionCost}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          </div>
        </div>

        {/* 必要小道具 */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">必要小道具</h4>
          <div className="space-y-3">
          {/* 既存の小道具 */}
          {formData.required_props.filter(prop => prop != null).map((prop, index) => (
            <div key={index} className="flex items-center gap-2 border rounded p-3">
              <div className="flex-1">
                <span className="font-medium">{prop.item}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  ({prop.frequency === 'recurring' ? '毎回' : '初回のみ'})
                </span>
              </div>
              <div className="w-24 text-right">
                <span>×{prop.amount}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRequiredProp(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {formData.required_props.filter(prop => prop != null).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              必要小道具が登録されていません
            </p>
          )}

          {/* 新規追加フォーム */}
          <div className="border-t pt-4">
            <Label className="mb-2 block">新規追加</Label>
            <div className="flex gap-2">
              <Input
                placeholder="項目名"
                value={newRequiredPropItem}
                onChange={(e) => setNewRequiredPropItem(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="数量"
                value={newRequiredPropAmount || ''}
                onChange={(e) => setNewRequiredPropAmount(parseInt(e.target.value) || 0)}
                className="w-24"
              />
              <Select value={newRequiredPropFrequency} onValueChange={(v) => setNewRequiredPropFrequency(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recurring">毎回</SelectItem>
                  <SelectItem value="one-time">初回のみ</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" onClick={addRequiredProp}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

