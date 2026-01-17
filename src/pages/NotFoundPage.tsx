/**
 * 404 Not Found ページ
 * @page NotFoundPage
 * @path /* (存在しないパス)
 * @purpose 存在しないURLにアクセスした場合のエラーページ
 * @access 公開
 */
import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { Home, Search, ArrowLeft, HelpCircle } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

export function NotFoundPage() {
  return (
    <PublicLayout hideNavigation>
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          {/* 404 イラスト風表示 */}
          <div 
            className="text-8xl font-bold mb-4"
            style={{ color: THEME.primary }}
          >
            404
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            ページが見つかりません
          </h1>
          
          <p className="text-gray-600 mb-8 leading-relaxed">
            お探しのページは存在しないか、<br />
            移動または削除された可能性があります。
          </p>
          
          {/* アクションボタン */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Link to="/">
              <Button 
                size="lg"
                className="w-full sm:w-auto"
                style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
              >
                <Home className="w-4 h-4 mr-2" />
                トップページへ
              </Button>
            </Link>
            <Link to="/scenario">
              <Button 
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                style={{ borderRadius: 0 }}
              >
                <Search className="w-4 h-4 mr-2" />
                シナリオを探す
              </Button>
            </Link>
          </div>
          
          {/* ヘルプリンク */}
          <div className="text-sm text-gray-500 space-y-2">
            <p>お困りの場合は</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link 
                to="/faq" 
                className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                よくある質問
              </Link>
              <Link 
                to="/contact" 
                className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
              >
                お問い合わせ
              </Link>
            </div>
          </div>
          
          {/* 戻るリンク */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              前のページに戻る
            </button>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}

export default NotFoundPage

