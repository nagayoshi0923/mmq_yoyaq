/**
 * MMQ ランディングページ
 * @page LandingPage
 * @path #landing または /
 * @purpose サービス紹介・機能説明・登録誘導
 * @access 全員（未ログイン向け）
 * @organization なし
 */
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Calendar,
  Users,
  Clock,
  BarChart3,
  Smartphone,
  Globe,
  CheckCircle,
  ArrowRight,
  Sparkles,
  Building2,
  BookOpen,
  Bell,
  Shield,
  Zap
} from 'lucide-react'

export default function LandingPage() {
  const features = [
    {
      icon: Calendar,
      title: 'スケジュール管理',
      description: '公演スケジュールを一元管理。複数店舗・複数シナリオを見やすく表示。',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      icon: Globe,
      title: 'オンライン予約',
      description: '24時間対応の予約サイト。顧客は好きな時間に予約・変更が可能。',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      icon: Users,
      title: 'GM・スタッフ管理',
      description: 'シフト提出から配置決定まで。GM確認機能で調整もスムーズ。',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      icon: BookOpen,
      title: 'シナリオ管理',
      description: '所有シナリオを一覧管理。制作費・ライセンス情報も記録。',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    },
    {
      icon: BarChart3,
      title: '売上・分析',
      description: '公演ごとの売上を自動集計。シナリオ別・期間別の分析も。',
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10'
    },
    {
      icon: Bell,
      title: '通知連携',
      description: 'Discord連携で予約・シフト通知。リマインドメールも自動送信。',
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10'
    }
  ]

  const benefits = [
    {
      icon: Clock,
      title: '業務時間を大幅削減',
      description: '予約受付・スケジュール調整・シフト管理を自動化。運営にかかる時間を最大70%削減。'
    },
    {
      icon: Smartphone,
      title: 'どこからでもアクセス',
      description: 'スマホ・タブレット・PCに完全対応。外出先からでも予約状況を確認。'
    },
    {
      icon: Shield,
      title: 'データを安全に管理',
      description: '顧客情報・予約履歴を安全に保管。組織ごとにデータを完全分離。'
    },
    {
      icon: Zap,
      title: 'すぐに始められる',
      description: '登録から稼働まで最短30分。難しい設定は不要、直感的に使えるUI。'
    }
  ]

  const plans = [
    {
      name: 'Free',
      price: '¥0',
      period: '/月',
      description: 'まずは試してみたい方に',
      features: [
        '店舗1つまで',
        'スタッフ5人まで',
        '予約サイト（基本）',
        'スケジュール管理'
      ],
      buttonText: '無料で始める',
      buttonVariant: 'outline' as const,
      popular: false
    },
    {
      name: 'Basic',
      price: '¥4,980',
      period: '/月',
      description: '本格運用を始める方に',
      features: [
        '店舗3つまで',
        'スタッフ20人まで',
        'Discord通知',
        'メール自動送信',
        '売上レポート'
      ],
      buttonText: 'Basicで始める',
      buttonVariant: 'default' as const,
      popular: true
    },
    {
      name: 'Pro',
      price: '¥9,980',
      period: '/月',
      description: '複数店舗を運営する方に',
      features: [
        '店舗無制限',
        'スタッフ無制限',
        'API連携',
        '優先サポート',
        'カスタムドメイン'
      ],
      buttonText: 'Proで始める',
      buttonVariant: 'default' as const,
      popular: false
    }
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">M</span>
            </div>
            <span className="font-bold text-xl">MMQ</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">
              機能
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">
              料金
            </a>
            <Button variant="ghost" size="sm" onClick={() => window.location.hash = 'login'}>
              ログイン
            </Button>
            <Button size="sm" onClick={() => window.location.hash = 'register'}>
              無料で始める
            </Button>
          </div>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)]" />
        
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              <Sparkles className="w-3 h-3 mr-1" />
              マーダーミステリー専用
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              公演運営を、
              <br />
              <span className="text-primary">もっとスマート</span>に
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              予約受付・スケジュール管理・GM配置・売上分析まで。
              <br className="hidden sm:block" />
              マーダーミステリー店舗の運営を一元管理するSaaS。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => window.location.hash = 'register'} className="gap-2">
                無料で始める
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => window.location.hash = 'booking/queens-waltz'}>
                デモを見る
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              クレジットカード不要 • 30秒で登録完了
            </p>
          </div>
        </div>
      </section>

      {/* 機能紹介 */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">イチオシ機能</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              マーダーミステリー店舗の運営に必要な機能をすべて搭載
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-lg ${feature.bgColor} flex items-center justify-center mb-4`}>
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* メリット */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">MMQを使うメリット</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <benefit.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{benefit.title}</h3>
                  <p className="text-muted-foreground text-sm">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 料金プラン */}
      <section id="pricing" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">シンプルな料金体系</h2>
            <p className="text-muted-foreground">
              まずは無料プランでお試しください
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <Card 
                key={plan.name} 
                className={`relative ${plan.popular ? 'border-primary shadow-lg' : 'border-border'}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">人気</Badge>
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className="w-full" 
                    variant={plan.buttonVariant}
                    onClick={() => window.location.hash = 'register'}
                  >
                    {plan.buttonText}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-6 opacity-90" />
              <h2 className="text-3xl font-bold mb-4">
                今すぐMMQを始めましょう
              </h2>
              <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
                登録は無料。クレジットカードも不要です。
                <br />
                まずはFreeプランで、MMQの便利さを体験してください。
              </p>
              <Button 
                size="lg" 
                variant="secondary"
                onClick={() => window.location.hash = 'register'}
                className="gap-2"
              >
                無料で始める
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">M</span>
              </div>
              <span className="font-semibold">MMQ</span>
              <span className="text-muted-foreground text-sm">- Murder Mystery Queue</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#terms" className="hover:text-foreground">利用規約</a>
              <a href="#privacy" className="hover:text-foreground">プライバシーポリシー</a>
              <a href="#contact" className="hover:text-foreground">お問い合わせ</a>
            </div>
          </div>
          <div className="text-center text-sm text-muted-foreground mt-8">
            © 2024 MMQ. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

