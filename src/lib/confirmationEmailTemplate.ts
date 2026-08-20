/**
 * 予約確定メール本文の解決。
 * 優先: 公演上書き → 作品上書き → 店舗テンプレ。空文字は未設定。
 */

export type ConfirmationTemplateSource = 'event' | 'scenario' | 'store' | 'default'

export function isConfirmationTemplateSet(value?: string | null): boolean {
  return Boolean(value?.trim())
}

export function pickConfirmationEmailTemplate(input: {
  eventTemplate?: string | null
  scenarioTemplate?: string | null
  storeTemplate?: string | null
}): { template: string | null; source: ConfirmationTemplateSource } {
  if (isConfirmationTemplateSet(input.eventTemplate)) {
    return { template: input.eventTemplate!.trim(), source: 'event' }
  }
  if (isConfirmationTemplateSet(input.scenarioTemplate)) {
    return { template: input.scenarioTemplate!.trim(), source: 'scenario' }
  }
  if (isConfirmationTemplateSet(input.storeTemplate)) {
    return { template: input.storeTemplate!.trim(), source: 'store' }
  }
  return { template: null, source: 'default' }
}

export const CONFIRMATION_TEMPLATE_SOURCE_LABEL: Record<ConfirmationTemplateSource, string> = {
  event: 'この公演の上書き',
  scenario: 'この作品の上書き',
  store: '店舗の予約確認テンプレ',
  default: 'システムの既定文面',
}
