/**
 * センシティブ内容セルフ診断の項目定義
 *
 * key は DB カラム（scenario_masters.sensitive_tags /
 * organization_scenarios.custom_sensitive_tags）に保存される値と一致させる。
 * key を変更・削除すると既存データの意味が変わるため、追加のみ行うこと。
 */
export interface SensitiveTopic {
  key: string
  label: string
}

export const SENSITIVE_TOPICS: SensitiveTopic[] = [
  { key: 'gore', label: '流血・残酷（ゴア）' },
  { key: 'suicide', label: '自殺・自傷' },
  { key: 'sexual', label: '性的描写・性暴力・ストーカー' },
  { key: 'child_domestic_abuse', label: '児童虐待・家庭内暴力' },
  { key: 'mental_illness', label: '精神疾患・依存症' },
  { key: 'discrimination', label: '差別（人種・民族・宗教・性別・障害など）' },
  { key: 'animal_harm', label: '動物の死・虐待' },
  { key: 'insects', label: '虫・昆虫' },
  { key: 'disaster', label: '災害・事故' },
  { key: 'pregnancy', label: '妊娠・出産など' },
  { key: 'bullying', label: 'いじめ・ハラスメント' },
  { key: 'religion_cult', label: '宗教・カルト' },
]

/** 診断結果に必ず添える免責文 */
export const SENSITIVITY_DISCLAIMER =
  'マーダーミステリーは複数の物語が複雑に絡み合う体験です。物語の展開や結末、他の参加者の言動まで含めたすべての表現を保証するものではありません。本診断は作品側が申告した要素に基づく参考情報であり、記載のない要素が登場しないことを保証するものではありません。'
