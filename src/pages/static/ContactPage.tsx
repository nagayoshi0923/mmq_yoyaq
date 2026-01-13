/**
 * お問い合わせページ
 * @path /contact
 */
import { useState } from 'react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Mail, ChevronRight, Send, Clock, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

const INQUIRY_TYPES = [
  { value: 'reservation', label: '予約について' },
  { value: 'cancel', label: 'キャンセルについて' },
  { value: 'account', label: 'アカウントについて' },
  { value: 'store', label: '店舗について' },
  { value: 'bug', label: '不具合の報告' },
  { value: 'suggestion', label: 'ご意見・ご要望' },
  { value: 'other', label: 'その他' },
]

export function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    type: '',
    subject: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.email || !formData.type || !formData.message) {
      toast.error('必須項目を入力してください')
      return
    }

    setIsSubmitting(true)
    
    try {
      // お問い合わせ専用のEdge Functionを呼び出し（認証不要）
      const { data, error } = await supabase.functions.invoke('send-contact-inquiry', {
        body: {
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
    } catch (error) {
      logger.error('お問い合わせ処理エラー:', error)
      toast.error('送信に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <PublicLayout>
        <section className="max-w-2xl mx-auto px-4 py-24">
          <div className="text-center">
            <div 
              className="w-20 h-20 mx-auto mb-6 flex items-center justify-center"
              style={{ backgroundColor: THEME.accent, borderRadius: '50%' }}
            >
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              お問い合わせを受け付けました
            </h1>
            <p className="text-gray-600 mb-8">
              ご連絡いただきありがとうございます。<br />
              内容を確認の上、2〜3営業日以内にメールにてご返信いたします。
            </p>
            <Link to="/">
              <Button 
                size="lg"
                style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
              >
                トップページへ戻る
              </Button>
            </Link>
          </div>
        </section>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      {/* ヒーロー */}
      <section 
        className="relative overflow-hidden py-12"
        style={{ backgroundColor: THEME.primary }}
      >
        <div 
          className="absolute top-0 right-0 w-48 h-48 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div className="max-w-4xl mx-auto px-4 relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>お問い合わせ</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Mail className="w-8 h-8" />
            お問い合わせ
          </h1>
        </div>
      </section>

      {/* コンテンツ */}
      <section className="max-w-2xl mx-auto px-4 py-12">
        {/* 注意事項 */}
        <div className="bg-amber-50 border border-amber-200 p-4 mb-8">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">ご返信について</h3>
              <p className="text-sm text-amber-800">
                お問い合わせへの返信は、2〜3営業日以内にメールにてお送りいたします。<br />
                土日祝日は対応しておりませんので、あらかじめご了承ください。
              </p>
            </div>
          </div>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                お名前 <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="山田 太郎"
                className="h-12"
                style={{ borderRadius: 0 }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                メールアドレス <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="example@email.com"
                className="h-12"
                style={{ borderRadius: 0 }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              お問い合わせ種別 <span className="text-red-500">*</span>
            </label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger className="h-12" style={{ borderRadius: 0 }}>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              件名
            </label>
            <Input
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="お問い合わせの件名"
              className="h-12"
              style={{ borderRadius: 0 }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              お問い合わせ内容 <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="お問い合わせ内容をご記入ください"
              rows={8}
              style={{ borderRadius: 0 }}
            />
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-semibold"
              style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  送信中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  送信する
                </span>
              )}
            </Button>
          </div>
        </form>

        {/* FAQ誘導 */}
        <div className="mt-12 p-6 bg-gray-50 border border-gray-200 text-center">
          <p className="text-gray-600 mb-4">
            よくある質問は FAQ をご確認ください
          </p>
          <Link to="/faq">
            <Button variant="outline" style={{ borderRadius: 0 }}>
              FAQを見る
            </Button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}

