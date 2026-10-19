import { expect, it } from 'vitest'
import { eventInviteShareText, groupInviteShareText } from './shareTexts'

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

it('誘いの文に絵文字を入れない', () => {
  const group = groupInviteShareText('ファクター', 8)
  expect(group).toContain('作品: ファクター')
  expect(group).toContain('人数: 最大8名まで')
  expect(group).not.toMatch(EMOJI)
  expect(groupInviteShareText('ファクター')).not.toContain('人数')
  const event = eventInviteShareText({ scenarioTitle: 'ファクター', eventDate: '10/30(金)', eventTime: '19:00', storeName: '大塚店' })
  expect(event).toContain('日時: 10/30(金) 19:00〜')
  expect(event).toContain('会場: 大塚店')
  expect(event).not.toMatch(EMOJI)
  expect(eventInviteShareText({ scenarioTitle: 'ファクター' })).not.toContain('会場')
})
