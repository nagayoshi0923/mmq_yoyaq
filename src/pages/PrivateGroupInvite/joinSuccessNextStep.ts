import type { PrivateGroupProgress } from '@/components/patterns/privateGroup/privateGroupScheduleRules'

/**
 * 参加完了画面の「次にやること」（グループの進み具合ごと。点検 58）。
 * 募集中で候補日があれば日程の回答、候補日がまだなら主催者を待つ、申込済みなら店舗の返事待ち、確定なら日時の確認。
 */
export function joinSuccessNextStep(progress: PrivateGroupProgress, hasCandidates: boolean): { title: string; lines: string[]; action: string } {
  if (progress === 'requested') {
    return {
      title: '次は、店舗の返事を待ちます',
      lines: ['このグループはすでに店舗へ申し込み済みです。', '店舗の返事をお待ちください。日程が決まるとご連絡いたします。'],
      action: 'グループページを見る',
    }
  }
  if (progress === 'confirmed') {
    return {
      title: '次は、日時と場所を確認しましょう',
      lines: ['このグループの予約はすでに確定しています。', '日時はグループページでご確認ください。'],
      action: '日時と場所を見る',
    }
  }
  if (!hasCandidates) {
    return {
      title: '次は、候補日が決まるのを待ちます',
      lines: ['主催者が候補日を出したら、都合（○△×）を回答してください。', '全員の回答がそろったら、主催者が店舗に申し込みます。'],
      action: 'グループページを見る',
    }
  }
  return {
    title: '次は、日程に回答しましょう',
    lines: ['グループページの「日程」で、候補日ごとに都合（○△×）を回答してください。', '全員の回答がそろったら、主催者が店舗に申し込みます。'],
    action: '日程に回答する',
  }
}
