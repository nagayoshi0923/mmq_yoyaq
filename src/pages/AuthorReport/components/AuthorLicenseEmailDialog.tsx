import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuthorLicenseEmailPreview } from './AuthorLicenseEmailPreview'
import type { AuthorPerformance } from '../types'
import { generateEmailUrl } from '../utils/reportFormatters'

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

  const handleSend = () => {
    const url = generateEmailUrl(author, year, month, emailAddress)
    window.open(url, '_blank')
    onClose()
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
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="text-sm">
                  <span className="font-medium">作者:</span> {author.author}
                </div>
                <div className="text-sm">
                  <span className="font-medium">対象月:</span> {year}年{month}月
                </div>
                <div className="text-sm">
                  <span className="font-medium">総公演数:</span> {author.totalEvents}回
                </div>
                <div className="text-sm">
                  <span className="font-medium">総ライセンス料:</span> ¥{author.totalLicenseCost.toLocaleString()}
                </div>
                <div className="text-sm">
                  <span className="font-medium">シナリオ数:</span> {author.scenarios.length}件
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
            disabled={!emailAddress.trim()}
          >
            Gmailで送信
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

