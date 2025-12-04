import { useState } from 'react'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuthorLicenseEmailPreview } from './AuthorLicenseEmailPreview'
import type { AuthorPerformance } from '../types'
import { generateEmailUrl } from '../utils/reportFormatters'
import { supabase } from '@/lib/supabase'

interface AuthorLicenseEmailDialogProps {
  isOpen: boolean
  onClose: () => void
  author: AuthorPerformance
  year: number
  month: number
  email: string
}

export function AuthorLicenseEmailDialog({
  isOpen,
  onClose,
  author,
  year,
  month,
  email
}: AuthorLicenseEmailDialogProps) {
  const [emailAddress, setEmailAddress] = useState(email)
  const [sending, setSending] = useState(false)
  const [sendMethod, setSendMethod] = useState<'resend' | 'gmail'>('resend')

  const handleSend = async () => {
    if (!emailAddress.trim()) {
      alert('メールアドレスを入力してください')
      return
    }

    if (sendMethod === 'gmail') {
      // Gmailで開く（従来の動作）
      const url = generateEmailUrl(author, year, month, emailAddress)
      window.open(url, '_blank')
      onClose()
      return
    }

    // Resendで送信
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-author-report', {
        body: {
          to: emailAddress.trim(),
          authorName: author.author,
          year,
          month,
          totalEvents: author.totalEvents,
          totalLicenseCost: author.totalLicenseCost,
          scenarios: author.scenarios.map(scenario => ({
            title: scenario.title,
            events: scenario.events,
            licenseAmountPerEvent: scenario.licenseAmountPerEvent,
            licenseCost: scenario.licenseCost,
            isGMTest: scenario.isGMTest
          }))
        }
      })

      if (error) {
        throw error
      }

      if (!data?.success) {
        throw new Error(data?.error || 'メール送信に失敗しました')
      }

      showToast.success('メールを送信しました')
      onClose()
    } catch (error: any) {
      logger.error('メール送信エラー:', error)
      alert(`メール送信に失敗しました: ${error?.message || '不明なエラー'}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>ライセンス料レポート送信</DialogTitle>
          <DialogDescription>
            送信内容を確認してください
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Tabs defaultValue="edit" className="w-full flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">編集</TabsTrigger>
              <TabsTrigger value="preview">プレビュー</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="space-y-4 py-4 overflow-y-auto flex-1">
              <div>
                <Label htmlFor="email-to">送信先メールアドレス</Label>
                <Input
                  id="email-to"
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="mt-1"
                  disabled={sending}
                />
              </div>

              <div>
                <Label>送信方法</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sendMethod"
                      value="resend"
                      checked={sendMethod === 'resend'}
                      onChange={(e) => setSendMethod(e.target.value as 'resend' | 'gmail')}
                      disabled={sending}
                    />
                    <span className="text-sm">Resendで送信（推奨）</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sendMethod"
                      value="gmail"
                      checked={sendMethod === 'gmail'}
                      onChange={(e) => setSendMethod(e.target.value as 'resend' | 'gmail')}
                      disabled={sending}
                    />
                    <span className="text-sm">Gmailで開く</span>
                  </label>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="text-sm">
                  <span className="">作者:</span> {author.author}
                </div>
                <div className="text-sm">
                  <span className="">対象月:</span> {year}年{month}月
                </div>
                <div className="text-sm">
                  <span className="">総公演数:</span> {author.totalEvents}回
                </div>
                <div className="text-sm">
                  <span className="">総ライセンス料:</span> ¥{author.totalLicenseCost.toLocaleString()}
                </div>
                <div className="text-sm">
                  <span className="">シナリオ数:</span> {author.scenarios.length}件
                </div>
              </div>
            </TabsContent>
            <TabsContent value="preview" className="py-4 overflow-y-auto flex-1">
              <AuthorLicenseEmailPreview
                author={author}
                year={year}
                month={month}
                email={emailAddress}
              />
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSend}
            disabled={!emailAddress.trim() || sending}
          >
            {sending ? '送信中...' : sendMethod === 'resend' ? 'メール送信' : 'Gmailで開く'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

