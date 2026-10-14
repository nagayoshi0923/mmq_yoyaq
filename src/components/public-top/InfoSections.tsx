import { Link } from 'react-router-dom'
import { TopSection } from './TopSection'

const outlineButton = 'inline-flex items-center justify-center rounded-md border border-input bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted'

/** はじめての方へ（既存のガイドと FAQ へ） */
export function FirstTimeSection({ faqPath, extraText }: { faqPath: string; extraText?: string }) {
  return (
    <TopSection id="first-time" title="はじめての方へ">
      <p className="text-sm">
        マーダーミステリーは、配られた役になりきって事件の真相を探る体験型ゲームです。1 作品 1 回きり、ネタバレ厳禁。{extraText}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link to="/guide" className={outlineButton}>遊び方を見る</Link>
        <Link to={faqPath} className={outlineButton}>よくある質問</Link>
      </div>
    </TopSection>
  )
}

interface PrivateBookingSectionProps {
  text: string
  /** 貸切できる作品の一覧（店舗トップのみ） */
  scenariosPath?: string
  /** 貸切の流れのページ（店舗トップは組織付き /{org}/guide/private） */
  guidePath?: string
  /** MMQ 全体トップ: 貸切は店舗ごとなので「参加店舗から選ぶ」（貸切を始めるページへ）を出す */
  chooseStorePath?: string
  primaryColor: string
}

/** 友だちと貸切で遊ぶ（貸切できる作品と貸切の流れのページへ） */
export function PrivateBookingSection({ text, scenariosPath, guidePath = '/guide/private', chooseStorePath, primaryColor }: PrivateBookingSectionProps) {
  const hasPrimary = !!scenariosPath || !!chooseStorePath
  return (
    <TopSection id="private-booking" title="友だちと貸切で遊ぶ" tone="accent">
      <p className="text-sm">{text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {scenariosPath && (
          <Link to={scenariosPath} className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-bold text-white hover:opacity-90" style={{ backgroundColor: primaryColor }}>
            貸切できる作品を見る
          </Link>
        )}
        {chooseStorePath && (
          <Link to={chooseStorePath} className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-bold text-white hover:opacity-90" style={{ backgroundColor: primaryColor }}>
            参加店舗から選ぶ
          </Link>
        )}
        <Link
          to={guidePath}
          className={hasPrimary ? outlineButton : 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-bold text-white hover:opacity-90'}
          style={hasPrimary ? undefined : { backgroundColor: primaryColor }}
        >
          {hasPrimary ? '貸切の流れ' : '貸切の流れを見る'}
        </Link>
      </div>
    </TopSection>
  )
}
