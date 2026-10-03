import type { GmScenarioMode } from '@/lib/gmScenarioMode'

/** GM回答の横に出す担当区分（作品の担当設定のメイン・サブ）。担当の設定が無い人は「担当未設定」 */
export function gmRoleLabel(mode: GmScenarioMode | 'none' | undefined): string {
  switch (mode) {
    case 'main_and_sub': return 'メイン・サブ'
    case 'main_only': return 'メイン'
    case 'sub_only': return 'サブ'
    default: return '担当未設定'
  }
}
