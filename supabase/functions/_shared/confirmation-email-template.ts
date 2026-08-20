/**
 * 予約確定メール本文の解決。src/lib/confirmationEmailTemplate.ts と同じ優先順。
 * 優先: 公演上書き → 作品上書き → 店舗テンプレ。空文字は未設定。
 */

export type ConfirmationTemplateSource = 'event' | 'scenario' | 'store' | 'default'

function isSet(value?: string | null): boolean {
  return Boolean(value?.trim())
}

export function pickConfirmationEmailTemplate(input: {
  eventTemplate?: string | null
  scenarioTemplate?: string | null
  storeTemplate?: string | null
}): { template: string | null; source: ConfirmationTemplateSource } {
  if (isSet(input.eventTemplate)) {
    return { template: input.eventTemplate!.trim(), source: 'event' }
  }
  if (isSet(input.scenarioTemplate)) {
    return { template: input.scenarioTemplate!.trim(), source: 'scenario' }
  }
  if (isSet(input.storeTemplate)) {
    return { template: input.storeTemplate!.trim(), source: 'store' }
  }
  return { template: null, source: 'default' }
}
