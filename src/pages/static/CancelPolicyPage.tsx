/**
 * キャンセルポリシーページ
 * @path /cancel-policy
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { AlertTriangle, ChevronRight, Clock, Info } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import {
  DEFAULT_OPEN_CANCELLATION_FEES,
  DEFAULT_PRIVATE_CANCELLATION_FEES,
} from '@/constants/cancellationPolicyDefaults'

interface CancellationFee {
  hours_before: number
  fee_percentage: number
  description: string
}

interface OrganizerCancelReason {
  id: string
  content: string
}

interface CancellationJudgmentRule {
  id: string
  timing: string
  condition: string
  result: string
}

interface PolicyData {
  cancellation_fees: CancellationFee[]
  private_cancellation_fees: CancellationFee[]
  organizer_cancel_reasons: OrganizerCancelReason[]
  organizer_cancel_refund_note: string
  cancellation_judgment_rules: CancellationJudgmentRule[]
  cancellation_notice_note: string
  reservation_change_deadline_hours: number
  reservation_change_note: string
  private_reservation_change_deadline_hours: number
  private_reservation_change_note: string
  refund_method_note: string
  policy_updated_at: string
}

// デフォルト値（DB 未設定時・マイグレーションと同一）
const DEFAULT_POLICY: PolicyData = {
  cancellation_fees: DEFAULT_OPEN_CANCELLATION_FEES,
  private_cancellation_fees: DEFAULT_PRIVATE_CANCELLATION_FEES,
  organizer_cancel_reasons: [
    { id: '1', content: '最少催行人数に満たない場合' },
    { id: '2', content: '自然災害、感染症の流行など不可抗力の場合' },
    { id: '3', content: '店舗の都合によるやむを得ない事情がある場合' }
  ],
  organizer_cancel_refund_note: '参加料金は全額返金いたします。',
  cancellation_judgment_rules: [
    { id: '1', timing: '前日 23:59', condition: '定員の過半数に満たない場合', result: '中止' },
    { id: '2', timing: '前日 23:59', condition: '過半数以上だが満席でない場合', result: '公演4時間前まで募集を延長' },
    { id: '3', timing: '前日 23:59', condition: '満席の場合', result: '開催確定' },
    { id: '4', timing: '公演4時間前（延長された場合）', condition: '満席でない場合', result: '中止' }
  ],
  cancellation_notice_note: '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
  reservation_change_deadline_hours: 24,
  reservation_change_note: '参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。',
  private_reservation_change_deadline_hours: 168,
  private_reservation_change_note: '貸切予約の変更は、公演開始1週間前まで可能です。日程変更は空き状況によります。',
  refund_method_note: '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
  policy_updated_at: new Date().toISOString().split('T')[0]
}

// キャンセル料を表示用にフォーマット（amountLabel: オープン=参加料金、貸切=公演価格全額 など）
function formatCancellationFees(
  fees: CancellationFee[],
  amountLabel = '参加料金'
): Array<{ timing: string; fee: string; color: string }> {
  const sorted = [...fees].sort((a, b) => b.hours_before - a.hours_before)
  return sorted.map((fee, index) => {
    let timing = ''
    if (fee.hours_before < 0) {
      timing = '公演開始後・無断キャンセル'
    } else if (fee.hours_before === 0) {
      // 直前の時間を見て範囲を表示
      const prevFee = sorted[index - 1]
      if (prevFee) {
        timing = `公演開始${formatHours(prevFee.hours_before)}前〜当日`
      } else {
        timing = '当日'
      }
    } else {
      timing = `公演開始${formatHours(fee.hours_before)}前まで`
    }

    let color = 'text-gray-600'
    if (fee.fee_percentage === 0) {
      color = 'text-green-600'
    } else if (fee.fee_percentage < 100) {
      color = 'text-amber-600'
    } else {
      color = 'text-red-600'
    }

    const feeText =
      fee.fee_percentage === 0 ? '無料' : `${amountLabel}の${fee.fee_percentage}%`

    return { timing, fee: feeText, color }
  })
}

function formatHours(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    return `${hours / 24}日`
  } else if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}日${remainingHours}時間`
  }
  return `${hours}時間`
}

export function CancelPolicyPage() {
  const { organizationSlug } = useParams<{ organizationSlug: string }>()
  const [policy, setPolicy] = useState<PolicyData>(DEFAULT_POLICY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        // organization_slugから組織IDを取得
        let orgId: string | null = null
        if (organizationSlug) {
          const orgData = await resolveOrganizationFromPathSegment(organizationSlug, {
            requireActive: true,
          })
          if (orgData) {
            orgId = orgData.id
          }
        }

        // 店舗IDを取得
        let storeId: string | null = null
        
        if (orgId) {
          // 組織に属する店舗の設定を取得
          const { data: storeData } = await supabase
            .from('stores')
            .select('id')
            .eq('organization_id', orgId)
            .eq('status', 'active')
            .limit(1)
            .single()

          if (storeData) {
            storeId = storeData.id
          }
        } else {
          // organizationSlugがない場合は最初のアクティブな店舗を取得
          const { data: storeData } = await supabase
            .from('stores')
            .select('id')
            .eq('status', 'active')
            .limit(1)
            .single()

          if (storeData) {
            storeId = storeData.id
          }
        }

        // 店舗の設定を取得
        if (!storeId) {
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('reservation_settings')
          .select(`
            cancellation_fees,
            private_cancellation_fees,
            organizer_cancel_reasons,
            organizer_cancel_refund_note,
            cancellation_judgment_rules,
            cancellation_notice_note,
            reservation_change_deadline_hours,
            reservation_change_note,
            private_reservation_change_deadline_hours,
            private_reservation_change_note,
            refund_method_note,
            policy_updated_at
          `)
          .eq('store_id', storeId)
          .maybeSingle()

        if (!error && data) {
          setPolicy({
            cancellation_fees: data.cancellation_fees || DEFAULT_POLICY.cancellation_fees,
            private_cancellation_fees: data.private_cancellation_fees || DEFAULT_POLICY.private_cancellation_fees,
            organizer_cancel_reasons: data.organizer_cancel_reasons || DEFAULT_POLICY.organizer_cancel_reasons,
            organizer_cancel_refund_note: data.organizer_cancel_refund_note || DEFAULT_POLICY.organizer_cancel_refund_note,
            cancellation_judgment_rules: data.cancellation_judgment_rules || DEFAULT_POLICY.cancellation_judgment_rules,
            cancellation_notice_note: data.cancellation_notice_note || DEFAULT_POLICY.cancellation_notice_note,
            reservation_change_deadline_hours: data.reservation_change_deadline_hours || DEFAULT_POLICY.reservation_change_deadline_hours,
            reservation_change_note: data.reservation_change_note || DEFAULT_POLICY.reservation_change_note,
            private_reservation_change_deadline_hours: data.private_reservation_change_deadline_hours || DEFAULT_POLICY.private_reservation_change_deadline_hours,
            private_reservation_change_note: data.private_reservation_change_note || DEFAULT_POLICY.private_reservation_change_note,
            refund_method_note: data.refund_method_note || DEFAULT_POLICY.refund_method_note,
            policy_updated_at: data.policy_updated_at || DEFAULT_POLICY.policy_updated_at
          })
        }
      } catch (error) {
        console.error('キャンセルポリシー取得エラー:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPolicy()
  }, [organizationSlug])

  const formattedOpenFees = formatCancellationFees(policy.cancellation_fees, '参加料金')
  const formattedPrivateFees = formatCancellationFees(
    policy.private_cancellation_fees,
    '公演価格全額'
  )
  const formattedDate = policy.policy_updated_at 
    ? new Date(policy.policy_updated_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  // ルールをタイミングでグループ化
  const rulesByTiming = policy.cancellation_judgment_rules.reduce((acc, rule) => {
    if (!acc[rule.timing]) {
      acc[rule.timing] = []
    }
    acc[rule.timing].push(rule)
    return acc
  }, {} as Record<string, CancellationJudgmentRule[]>)

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
            <span>キャンセルポリシー</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <AlertTriangle className="w-8 h-8" />
            キャンセルポリシー
          </h1>
        </div>
      </section>

      {/* コンテンツ */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : (
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 mb-8">
              最終更新日: {formattedDate}
            </p>

            <div className="space-y-8">
              {/* お客様都合のキャンセル */}
              <article>
                <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                  お客様都合によるキャンセル
                </h2>
                <div className="text-gray-700 space-y-3">
                  <p>
                    ご予約のキャンセルは、マイページから行うことができます。
                    公演の種類に応じて、キャンセル時期によって以下のキャンセル料が発生します。
                  </p>

                  <div className="space-y-6">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-2">オープン公演</h3>
                      <p className="text-sm text-gray-700 mb-2">
                        1日前よりお支払い対象額（参加料金）の50%、当日は100%です。
                      </p>
                      <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-semibold">キャンセル時期</th>
                              <th className="text-right py-2 font-semibold">キャンセル料</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formattedOpenFees.map((item, index) => (
                              <tr
                                key={index}
                                className={index < formattedOpenFees.length - 1 ? 'border-b' : ''}
                              >
                                <td className="py-2">{item.timing}</td>
                                <td className={`text-right py-2 font-medium ${item.color}`}>{item.fee}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-gray-900 mb-2">貸切公演</h3>
                      <p className="text-sm text-gray-700 mb-2">
                        公演価格の全額を基準とし、7日前より50%、3日前より100%です。
                      </p>
                      <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-semibold">キャンセル時期</th>
                              <th className="text-right py-2 font-semibold">キャンセル料</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formattedPrivateFees.map((item, index) => (
                              <tr
                                key={index}
                                className={index < formattedPrivateFees.length - 1 ? 'border-b' : ''}
                              >
                                <td className="py-2">{item.timing}</td>
                                <td className={`text-right py-2 font-medium ${item.color}`}>{item.fee}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              {/* 店舗都合のキャンセル */}
              <article>
                <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                  店舗都合によるキャンセル
                </h2>
                <div className="text-gray-700 space-y-3">
                  <p>
                    以下の場合、店舗側の判断により公演がキャンセルとなることがあります：
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    {policy.organizer_cancel_reasons.map((reason) => (
                      <li key={reason.id}>{reason.content}</li>
                    ))}
                  </ul>
                  <p className="mt-4">
                    {policy.organizer_cancel_refund_note}
                  </p>
                </div>

                {/* 中止判定タイミング */}
                {Object.keys(rulesByTiming).length > 0 && (
                  <div className="mt-6 bg-amber-50 border border-amber-200 p-4 rounded-lg">
                    <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      中止判定のタイミング
                    </h4>
                    <div className="text-amber-800 space-y-3 text-sm">
                      {Object.entries(rulesByTiming).map(([timing, rules]) => (
                        <div key={timing}>
                          <p><strong>■ {timing}時点での判定</strong></p>
                          <ul className="list-disc pl-6 space-y-1">
                            {rules.map((rule) => (
                              <li key={rule.id}>
                                {rule.condition} → <span className={rule.result === '中止' ? 'font-medium text-red-700' : ''}>{rule.result}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 中止連絡 */}
                {policy.cancellation_notice_note && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                      <Info className="w-5 h-5" />
                      中止時のご連絡
                    </h4>
                    <div className="text-blue-800 text-sm">
                      {policy.cancellation_notice_note.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </article>

              {/* 予約変更 */}
              <article>
                <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                  予約内容の変更
                </h2>
                
                {/* 通常公演 */}
                <div className="mb-6">
                  <h3 className="font-bold text-gray-800 mb-2">通常公演</h3>
                  <div className="text-gray-700 space-y-2 pl-4">
                    {policy.reservation_change_note.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>

                {/* 貸切公演 */}
                <div>
                  <h3 className="font-bold text-gray-800 mb-2">貸切公演</h3>
                  <div className="text-gray-700 space-y-2 pl-4">
                    {policy.private_reservation_change_note.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              </article>

              {/* 返金方法 */}
              <article>
                <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                  返金について
                </h2>
                <div className="text-gray-700 space-y-3">
                  {policy.refund_method_note.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </article>

              {/* お問い合わせ */}
              <article>
                <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                  お問い合わせ
                </h2>
                <div className="text-gray-700 space-y-3">
                  <p>
                    キャンセルに関するご質問・ご相談は、
                    <Link to="/contact" className="text-blue-600 hover:underline">お問い合わせフォーム</Link>
                    よりご連絡ください。
                  </p>
                </div>
              </article>
            </div>
          </div>
        )}
      </section>
    </PublicLayout>
  )
}
