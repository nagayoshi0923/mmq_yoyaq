/**
 * 組織固有のFAQ設定
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Save, Loader2, HelpCircle, Plus, Trash2, GripVertical } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import type { FAQItem } from '@/types'

export function FAQSettings() {
  const { organization, isLoading, refetch: refetchOrg } = useOrganization()
  const [faqItems, setFaqItems] = useState<FAQItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (organization?.faq_items) {
      setFaqItems(organization.faq_items)
    }
  }, [organization])

  const addItem = () => {
    setFaqItems([...faqItems, { question: '', answer: '', category: '' }])
  }

  const removeItem = (index: number) => {
    setFaqItems(faqItems.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof FAQItem, value: string) => {
    const newItems = [...faqItems]
    newItems[index] = { ...newItems[index], [field]: value }
    setFaqItems(newItems)
  }

  const handleSave = async () => {
    if (!organization) return

    const validItems = faqItems.filter(item => item.question.trim() && item.answer.trim())

    setSaving(true)
    try {
      const result = await updateOrganization(organization.id, {
        faq_items: validItems.length > 0 ? validItems : null
      })
      if (result) {
        showToast.success('FAQ設定を保存しました')
        refetchOrg()
      } else {
        showToast.error('保存に失敗しました')
      }
    } catch (error) {
      logger.error('FAQ設定保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <p className="text-sm text-blue-800">
            <strong>このページでできること：</strong>
            予約サイトのFAQページに表示される、組織固有の質問と回答を設定します。
            店舗のアクセス方法、独自のルールなどを追加できます。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            FAQ項目
          </CardTitle>
          <CardDescription>
            よくある質問と回答を設定します。空の項目は保存時に無視されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {faqItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>FAQ項目がありません</p>
              <p className="text-sm">「項目を追加」ボタンで追加してください</p>
            </div>
          ) : (
            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3 bg-gray-50">
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-5 h-5 text-gray-400 mt-2 cursor-grab" />
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700">カテゴリ（任意）</label>
                        <Input
                          value={item.category || ''}
                          onChange={(e) => updateItem(index, 'category', e.target.value)}
                          placeholder="例: アクセス、料金、予約方法"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">質問 <span className="text-red-500">*</span></label>
                        <Input
                          value={item.question}
                          onChange={(e) => updateItem(index, 'question', e.target.value)}
                          placeholder="例: 店舗へのアクセス方法を教えてください"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">回答 <span className="text-red-500">*</span></label>
                        <Textarea
                          value={item.answer}
                          onChange={(e) => updateItem(index, 'answer', e.target.value)}
                          placeholder="例: 最寄り駅から徒歩5分です。詳しくはアクセスページをご覧ください。"
                          className="mt-1"
                          rows={3}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" onClick={addItem} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            項目を追加
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          保存
        </Button>
      </div>
    </div>
  )
}
