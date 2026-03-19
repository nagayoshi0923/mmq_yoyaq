/**
 * 組織固有のFAQ設定
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Save, Loader2, HelpCircle, Plus, Trash2, ChevronUp, ChevronDown, Globe, Building2 } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { COMMON_FAQ_DATA } from '@/pages/static/FAQPage'
import type { FAQItem } from '@/types'

export function FAQSettings() {
  const { organization, isLicenseManager, isLoading, refetch: refetchOrg } = useOrganization()
  const [faqItems, setFaqItems] = useState<FAQItem[]>([])
  const [commonFaqItems, setCommonFaqItems] = useState<FAQItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (organization?.faq_items) {
      setFaqItems(organization.faq_items)
    }
    if (isLicenseManager) {
      if (organization?.common_faq_items && organization.common_faq_items.length > 0) {
        setCommonFaqItems(organization.common_faq_items)
      } else {
        setCommonFaqItems(COMMON_FAQ_DATA)
      }
    }
  }, [organization, isLicenseManager])

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

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === faqItems.length - 1) return
    const newItems = [...faqItems]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    ;[newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]]
    setFaqItems(newItems)
  }

  const addCommonItem = () => {
    setCommonFaqItems([...commonFaqItems, { question: '', answer: '', category: '' }])
  }

  const removeCommonItem = (index: number) => {
    setCommonFaqItems(commonFaqItems.filter((_, i) => i !== index))
  }

  const updateCommonItem = (index: number, field: keyof FAQItem, value: string) => {
    const newItems = [...commonFaqItems]
    newItems[index] = { ...newItems[index], [field]: value }
    setCommonFaqItems(newItems)
  }

  const moveCommonItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === commonFaqItems.length - 1) return
    const newItems = [...commonFaqItems]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    ;[newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]]
    setCommonFaqItems(newItems)
  }

  const handleSave = async () => {
    if (!organization) return

    const validItems = faqItems.filter(item => item.question.trim() && item.answer.trim())
    const validCommonItems = commonFaqItems.filter(item => item.question.trim() && item.answer.trim())

    setSaving(true)
    try {
      const updates: Record<string, unknown> = {
        faq_items: validItems.length > 0 ? validItems : null
      }
      if (isLicenseManager) {
        updates.common_faq_items = validCommonItems.length > 0 ? validCommonItems : null
      }
      const result = await updateOrganization(organization.id, updates)
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
            予約サイトのFAQページに表示される質問と回答を設定します。
            {isLicenseManager && 'MMQ共通FAQと組織固有FAQの両方を編集できます。'}
          </p>
        </CardContent>
      </Card>

      {/* ライセンス管理者のみ：MMQ共通FAQ編集 */}
      {isLicenseManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              MMQ共通FAQ
              <Badge variant="secondary" className="ml-2">全組織共通</Badge>
            </CardTitle>
            <CardDescription>
              全ての組織のFAQページに表示される共通の質問と回答です。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {commonFaqItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>共通FAQ項目がありません</p>
              </div>
            ) : (
              <div className="space-y-4">
                {commonFaqItems.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3 bg-blue-50/50">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveCommonItem(index, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveCommonItem(index, 'down')}
                          disabled={index === commonFaqItems.length - 1}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-700">カテゴリ（任意）</label>
                          <Input
                            value={item.category || ''}
                            onChange={(e) => updateCommonItem(index, 'category', e.target.value)}
                            placeholder="例: 予約について、参加について"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">質問 <span className="text-red-500">*</span></label>
                          <Input
                            value={item.question}
                            onChange={(e) => updateCommonItem(index, 'question', e.target.value)}
                            placeholder="例: 予約はいつまでにすればいいですか？"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">回答 <span className="text-red-500">*</span></label>
                          <Textarea
                            value={item.answer}
                            onChange={(e) => updateCommonItem(index, 'answer', e.target.value)}
                            placeholder="回答を入力"
                            className="mt-1"
                            rows={3}
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCommonItem(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" onClick={addCommonItem} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              共通FAQ項目を追加
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 組織固有FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            組織固有FAQ
            <Badge variant="outline" className="ml-2">{organization?.name}</Badge>
          </CardTitle>
          <CardDescription>
            この組織のFAQページにのみ表示される質問と回答です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {faqItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>組織固有のFAQ項目がありません</p>
              <p className="text-sm">「項目を追加」ボタンで追加してください</p>
            </div>
          ) : (
            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3 bg-gray-50">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === faqItems.length - 1}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
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

      {/* MMQ共通FAQの参照表示（ライセンス管理者以外） */}
      {!isLicenseManager && (
        <Card className="border-gray-200 bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-600">
              <Globe className="h-5 w-5" />
              MMQ共通FAQ
              <Badge variant="secondary" className="ml-2">参照のみ</Badge>
            </CardTitle>
            <CardDescription>
              全ての組織のFAQページに自動で表示される共通の質問です（編集不可）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {COMMON_FAQ_DATA.map((item, index) => (
                <div key={index} className="p-3 bg-white rounded border text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    {item.category && (
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                    )}
                  </div>
                  <p className="font-medium text-gray-900">Q. {item.question}</p>
                  <p className="text-gray-600 mt-1">A. {item.answer}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
