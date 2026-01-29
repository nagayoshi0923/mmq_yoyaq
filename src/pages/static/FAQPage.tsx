/**
 * よくある質問（FAQ）ページ
 * @path /faq
 */
import { useState } from 'react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { HelpCircle, ChevronRight, ChevronDown, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface FAQItem {
  question: string
  answer: string
  category: string
}

const FAQ_DATA: FAQItem[] = [
  // 予約について
  {
    category: '予約について',
    question: '予約はいつまでにすればいいですか？',
    answer: '公演開始の24時間前まで予約可能です。ただし、満席の場合は締め切りとなりますので、お早めのご予約をおすすめします。',
  },
  {
    category: '予約について',
    question: '予約の変更はできますか？',
    answer: 'マイページから予約の変更が可能です。ただし、空き状況によっては希望の日時に変更できない場合があります。',
  },
  {
    category: '予約について',
    question: '何人から予約できますか？',
    answer: '1名様からご予約いただけます。シナリオによって最少催行人数が設定されている場合がありますので、各シナリオの詳細をご確認ください。',
  },
  {
    category: '予約について',
    question: '友達と一緒に参加したい場合はどうすればいいですか？',
    answer: '予約時に参加人数を入力していただくか、別々にご予約いただき同じ公演を選択していただければ大丈夫です。',
  },
  // キャンセルについて
  {
    category: 'キャンセルについて',
    question: 'キャンセル料はかかりますか？',
    answer: 'キャンセル料は各店舗のポリシーに従います。一般的に、公演3日前までは無料、前日は50%、当日は100%のキャンセル料が発生することが多いです。詳しくはキャンセルポリシーをご確認ください。',
  },
  {
    category: 'キャンセルについて',
    question: 'キャンセル方法を教えてください',
    answer: 'マイページの予約一覧から該当の予約を選択し、「キャンセル」ボタンを押してください。',
  },
  // 参加について
  {
    category: '参加について',
    question: '初めてでも参加できますか？',
    answer: 'もちろん参加できます！スタッフが丁寧にルール説明を行いますので、初めての方でも安心してお楽しみいただけます。',
  },
  {
    category: '参加について',
    question: '何を持っていけばいいですか？',
    answer: '特に必要な持ち物はありません。筆記用具は店舗でご用意しています。事前読み物があるシナリオは、事前にお読みいただくか、店舗で読む時間を設けます。',
  },
  {
    category: '参加について',
    question: '何分前に到着すればいいですか？',
    answer: '開始時刻の10〜15分前にご到着ください。初めての方は受付手続きがありますので、少し余裕を持ってお越しください。',
  },
  {
    category: '参加について',
    question: '途中参加・途中退出はできますか？',
    answer: 'マーダーミステリーは参加者全員で物語を進めるため、途中参加・途中退出はできません。公演時間を確認の上、最後まで参加できる日程でご予約ください。',
  },
  // 貸切について
  {
    category: '貸切について',
    question: '貸切とは何ですか？',
    answer: '知らない人と一緒ではなく、お友達やグループだけでシナリオを体験できるプランです。',
  },
  {
    category: '貸切について',
    question: '貸切の料金はどうなりますか？',
    answer: '貸切の場合、シナリオの最大人数分の参加料金がベースとなります。詳細は各店舗にお問い合わせください。',
  },
  // その他
  {
    category: 'その他',
    question: '年齢制限はありますか？',
    answer: 'シナリオによって推奨年齢が異なります。一般的には中学生以上を推奨しています。成人向けのシナリオもありますので、各シナリオの詳細をご確認ください。',
  },
  {
    category: 'その他',
    question: '車で行けますか？',
    answer: '駐車場の有無は店舗によって異なります。各店舗の詳細ページでアクセス情報をご確認ください。',
  },
]

export function FAQPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [openItems, setOpenItems] = useState<Set<number>>(new Set())

  // カテゴリーでグループ化
  const categories = Array.from(new Set(FAQ_DATA.map(item => item.category)))

  // 検索フィルター
  const filteredFAQ = FAQ_DATA.filter(item =>
    item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleItem = (index: number) => {
    const newOpenItems = new Set(openItems)
    if (newOpenItems.has(index)) {
      newOpenItems.delete(index)
    } else {
      newOpenItems.add(index)
    }
    setOpenItems(newOpenItems)
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
            <span>よくある質問</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <HelpCircle className="w-8 h-8" />
            よくある質問
          </h1>
          <p className="text-white/80 mt-2">
            お問い合わせ前にこちらをご確認ください
          </p>
        </div>
      </section>

      {/* 検索 */}
      <section className="max-w-4xl mx-auto px-4 py-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="質問を検索..."
            className="pl-12 h-14 text-lg"
            style={{ borderRadius: 0 }}
          />
        </div>
      </section>

      {/* FAQ リスト */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        {searchTerm ? (
          // 検索結果
          <div className="space-y-3">
            {filteredFAQ.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                該当する質問が見つかりませんでした
              </div>
            ) : (
              filteredFAQ.map((item, index) => (
                <FAQAccordionItem
                  key={index}
                  item={item}
                  isOpen={openItems.has(index)}
                  onToggle={() => toggleItem(index)}
                />
              ))
            )}
          </div>
        ) : (
          // カテゴリー別表示
          <div className="space-y-8">
            {categories.map((category) => (
              <div key={category}>
                <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b flex items-center gap-2">
                  <span 
                    className="w-1 h-6"
                    style={{ backgroundColor: THEME.primary }}
                  />
                  {category}
                </h2>
                <div className="space-y-3">
                  {FAQ_DATA.filter(item => item.category === category).map((item, index) => {
                    const globalIndex = FAQ_DATA.findIndex(f => f === item)
                    return (
                      <FAQAccordionItem
                        key={index}
                        item={item}
                        isOpen={openItems.has(globalIndex)}
                        onToggle={() => toggleItem(globalIndex)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* お問い合わせ誘導 */}
        <div className="mt-16 p-8 bg-gray-50 border border-gray-200 text-center">
          <HelpCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            解決しませんでしたか？
          </h3>
          <p className="text-gray-600 mb-6">
            お探しの回答が見つからない場合は、お気軽にお問い合わせください。
          </p>
          <Link to="/contact">
            <button
              className="px-8 py-3 text-white font-semibold transition-colors hover:opacity-90"
              style={{ backgroundColor: THEME.primary }}
            >
              お問い合わせ
            </button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}

// アコーディオンアイテム
function FAQAccordionItem({ 
  item, 
  isOpen, 
  onToggle 
}: { 
  item: FAQItem
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-start justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900 pr-4">
          Q. {item.question}
        </span>
        <ChevronDown 
          className={cn(
            "w-5 h-5 text-gray-400 flex-shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div 
        className={cn(
          "overflow-hidden transition-all duration-300",
          isOpen ? "max-h-96" : "max-h-0"
        )}
      >
        <div className="px-6 pb-4 text-gray-600 border-t border-gray-100 pt-4">
          A. {item.answer}
        </div>
      </div>
    </div>
  )
}




