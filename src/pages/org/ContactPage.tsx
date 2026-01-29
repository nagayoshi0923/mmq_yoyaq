/**
 * 組織別お問い合わせページ
 * @page OrganizationContactPage
 * @path /org/:slug/contact
 * @purpose 予約サイトを見て解消できなかった疑問を組織に送信
 * @access 公開（ログイン不要）
 */
import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Mail, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useAuth } from '@/contexts/AuthContext'

const INQUIRY_TYPES = [
  { value: 'booking', label: '予約について' },
  { value: 'cancel', label: 'キャンセルについて' },
  { value: 'scenario', label: 'シナリオについて' },
  { value: 'private', label: '貸切について' },
  { value: 'other', label: 'その他' },
]

interface Organization {
  id: string
  name: string
  slug: string
  contact_email: string | null
  contact_name: string | null
}

export function OrganizationContactPage() {
  const location = useLocation()
  const { user } = useAuth()
  // /org/{slug}/contact からslugを抽出
  const slug = location.pathname.split('/')[2]
  
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    type: '',
    subject: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  // ログイン中のユーザー情報を自動入力
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: prev.name || user.name || '',
        email: prev.email || user.email || '',
      }))
    }
  }, [user])

  // 組織情報を取得
  useEffect(() => {
    async function fetchOrganization() {
      if (!slug) {
        setError('組織が指定されていません')
        setLoading(false)
        return
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('organizations')
          .select('id, name, slug, contact_email, contact_name')
          .eq('slug', slug)
          .eq('is_active', true)
          .single()

        if (fetchError || !data) {
          setError('組織が見つかりません')
          return
        }

        if (!data.contact_email) {
          setError('この組織はお問い合わせを受け付けていません')
          return
        }

        setOrganization(data)
      } catch (err) {
        logger.error('組織情報取得エラー:', err)
        setError('組織情報の取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    fetchOrganization()
  }, [slug])

  const handleSubmitClick = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.email || !formData.type || !formData.message) {
      toast.error('必須項目を入力してください')
      return
    }

    if (formData.message.length < 10) {
      toast.error('お問い合わせ内容を10文字以上で入力してください')
      return
    }

    // 確認ダイアログを表示
    setShowConfirmDialog(true)
  }

  const handleConfirmSubmit = async () => {
    setShowConfirmDialog(false)
    setIsSubmitting(true)
    
    try {
      const { data, error } = await supabase.functions.invoke('send-contact-inquiry', {
        body: {
          organizationId: organization?.id,
          organizationName: organization?.name,
          contactEmail: organization?.contact_email,
          name: formData.name,
          email: formData.email,
          type: formData.type,
          subject: formData.subject,
          message: formData.message,
        }
      })

      if (error || (data && !data.success)) {
        logger.error('お問い合わせ送信エラー:', error || data?.error)
        throw new Error(data?.error || '送信に失敗しました')
      }

      setIsSubmitted(true)
      toast.success('お問い合わせを送信しました')
    } catch (err) {
      logger.error('お問い合わせ処理エラー:', err)
      toast.error('送信に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ローディング中
  if (loading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    )
  }

  // エラー
  if (error || !organization) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">お問い合わせページが見つかりません</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-3">
            {slug && (
              <Link to={`/${slug}`}>
                <Button variant="outline">予約サイトへ戻る</Button>
              </Link>
            )}
            <Link to="/">
              <Button>MMQトップへ</Button>
            </Link>
          </div>
        </div>
      </PublicLayout>
    )
  }

  // 送信完了
  if (isSubmitted) {
    return (
      <PublicLayout organizationSlug={slug} organizationName={organization.name}>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-800 mb-2">送信完了</h2>
            <p className="text-green-700 mb-6">
              お問い合わせを受け付けました。<br />
              {organization.name}より返信いたしますので、しばらくお待ちください。
            </p>
            <Link to={`/${slug}`}>
              <Button variant="outline">{organization.name}のトップへ戻る</Button>
            </Link>
          </div>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">お問い合わせ</h1>
          <p className="text-muted-foreground">
            {organization.name}へのお問い合わせ
          </p>
        </div>

        {/* 注意書き */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <strong>ご注意：</strong>このフォームからのお問い合わせは「{organization.name}」宛に送信されます。
            他の店舗へのお問い合わせは、各店舗のページからお願いいたします。
          </p>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmitClick} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              お名前 <span className="text-red-500">*</span>
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="山田太郎"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="example@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              お問い合わせ種別 <span className="text-red-500">*</span>
            </label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {INQUIRY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              件名（任意）
            </label>
            <Input
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="件名を入力"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              お問い合わせ内容 <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="お問い合わせ内容を入力してください"
              rows={6}
              required
              className={
                formData.message.length > 0 && formData.message.length < 10
                  ? 'border-red-500 focus-visible:ring-red-500'
                  : ''
              }
            />
            <div className="flex items-center justify-between mt-1">
              <p className={`text-xs ${
                formData.message.length > 0 && formData.message.length < 10
                  ? 'text-red-500 font-medium'
                  : 'text-muted-foreground'
              }`}>
                {formData.message.length > 0 && formData.message.length < 10 ? (
                  <>⚠️ あと{10 - formData.message.length}文字必要です</>
                ) : (
                  '10文字以上で入力してください'
                )}
              </p>
              <p className={`text-xs ${
                formData.message.length >= 10
                  ? 'text-green-600 font-medium'
                  : formData.message.length > 0
                  ? 'text-red-500'
                  : 'text-muted-foreground'
              }`}>
                {formData.message.length >= 10 && '✓ '}
                {formData.message.length}文字
              </p>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isSubmitting || !formData.name || !formData.email || !formData.type || formData.message.length < 10}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                送信中...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                送信する
              </>
            )}
          </Button>
        </form>
      </div>

      {/* 確認ダイアログ */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>送信先の確認</DialogTitle>
            <DialogDescription>
              お問い合わせの送信先をご確認ください。
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-muted/50 rounded-lg p-4 my-4">
            <p className="text-sm text-muted-foreground text-center mb-1">送信先</p>
            <p className="font-medium text-center text-lg">
              {organization.name}
            </p>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            ※ 他の団体へのお問い合わせの場合は、<br />
            キャンセルして送信先を変更してください。
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConfirmSubmit}>
              送信する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  )
}

