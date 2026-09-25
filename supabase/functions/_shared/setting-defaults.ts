import type { SettingValue } from './settings-inheritance.ts'

export const SETTING_DEFAULTS: Record<string, SettingValue> = {
  "cancellation_policy": "",
  "cancellation_policy_items": [
    {
      "id": "1",
      "content": "キャンセルの際は必ず事前にご連絡ください"
    },
    {
      "id": "2",
      "content": "キャンセル料は下記の計算基準と料率に基づき算出されます"
    },
    {
      "id": "3",
      "content": "無断キャンセルの場合は100%のキャンセル料が発生します"
    }
  ],
  "cancellation_deadline_hours": 48,
  "cancellation_fees": [
    {
      "hours_before": 48,
      "fee_percentage": 50,
      "description": "前日より50%"
    },
    {
      "hours_before": 24,
      "fee_percentage": 100,
      "description": "当日より100%"
    },
    {
      "hours_before": -1,
      "fee_percentage": 100,
      "description": "公演開始後・無断100%"
    }
  ],
  "cancellation_fee_basis": "participant_total",
  "private_cancellation_policy": "",
  "private_cancellation_policy_items": [
    {
      "id": "1",
      "content": "貸切予約には下記の貸切公演ポリシーが適用されます"
    },
    {
      "id": "2",
      "content": "キャンセル料は下記の計算基準と料率に基づき算出されます"
    },
    {
      "id": "3",
      "content": "日程変更は空き状況により可能な場合があります"
    }
  ],
  "private_cancellation_deadline_hours": 720,
  "private_cancellation_fees": [
    {
      "hours_before": 168,
      "fee_percentage": 50,
      "description": "7日前より公演価格全額の50%"
    },
    {
      "hours_before": 72,
      "fee_percentage": 100,
      "description": "3日前より公演価格全額の100%"
    },
    {
      "hours_before": -1,
      "fee_percentage": 100,
      "description": "公演開始後・無断キャンセル100%"
    }
  ],
  "private_cancellation_fee_basis": "performance_total",
  "organizer_cancel_reasons": [
    {
      "id": "1",
      "content": "最少催行人数に満たない場合"
    },
    {
      "id": "2",
      "content": "自然災害、感染症の流行など不可抗力の場合"
    },
    {
      "id": "3",
      "content": "店舗の都合によるやむを得ない事情がある場合"
    }
  ],
  "organizer_cancel_refund_note": "参加料金は全額返金いたします。",
  "cancellation_judgment_rules": [
    {
      "id": "1",
      "timing": "前日 23:59",
      "condition": "定員の過半数に満たない場合",
      "result": "中止"
    },
    {
      "id": "2",
      "timing": "前日 23:59",
      "condition": "過半数以上だが最低開催人数に満たない場合",
      "result": "公演ごとの開催判断期限まで募集を延長"
    },
    {
      "id": "3",
      "timing": "前日 23:59",
      "condition": "最低開催人数に達した場合",
      "result": "開催確定"
    },
    {
      "id": "4",
      "timing": "公演ごとの開催判断期限（延長された場合）",
      "condition": "最低開催人数に満たない場合",
      "result": "中止"
    }
  ],
  "cancellation_notice_note": "中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。",
  "reservation_change_deadline_hours": 24,
  "reservation_change_note": "参加人数の変更は、マイページに表示された変更期限まで行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。",
  "private_reservation_change_deadline_hours": 168,
  "private_reservation_change_note": "貸切予約の変更は、表示された変更期限まで可能です。日程変更は空き状況によります。",
  "refund_method_note": "当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。",
  "payment_method_label": "現地決済",
  "payment_method_description": "ご来店時にお支払いください",
  "preparation_minutes": 60,
  "judgment_minutes_before": 240,
  "survey_enabled": false,
  "survey_deadline_days": 1,
  "survey_url": ""
}
