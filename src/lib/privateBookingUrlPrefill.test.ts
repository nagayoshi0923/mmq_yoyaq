import { describe, expect, it } from 'vitest'
import {
  resolvePrivateBookingUrlPrefillSlot,
  slotParamToKey,
} from './privateBookingUrlPrefill'

describe('slotParamToKey', () => {
  it('英語・日本語キーを正規化する', () => {
    expect(slotParamToKey('morning')).toBe('morning')
    expect(slotParamToKey('afternoon')).toBe('afternoon')
    expect(slotParamToKey('evening')).toBe('evening')
    expect(slotParamToKey('午前')).toBe('morning')
    expect(slotParamToKey('午後')).toBe('afternoon')
    expect(slotParamToKey('夜')).toBe('evening')
  })

  it('未知の値は null', () => {
    expect(slotParamToKey('')).toBeNull()
    expect(slotParamToKey('night')).toBeNull()
    expect(slotParamToKey('constructor')).toBeNull()
    expect(slotParamToKey('__proto__')).toBeNull()
  })
})

describe('resolvePrivateBookingUrlPrefillSlot', () => {
  const computed = [
    {
      key: 'afternoon',
      label: '午後',
      startTime: '13:30',
      endTime: '16:30',
    },
  ]

  it('compute 結果があればそれを優先する', () => {
    expect(
      resolvePrivateBookingUrlPrefillSlot({
        slotParam: 'afternoon',
        timeParam: '14:00',
        computedSlots: computed,
      })
    ).toEqual({
      label: '午後',
      startTime: '13:30',
      endTime: '16:30',
    })
  })

  it('compute で枠が無くても time があれば候補を落とさない', () => {
    expect(
      resolvePrivateBookingUrlPrefillSlot({
        slotParam: 'evening',
        timeParam: '19:30',
        computedSlots: computed,
      })
    ).toEqual({
      label: '夜',
      startTime: '19:30',
      endTime: '19:30',
    })
  })

  it('compute も time も無いときデフォルト開始時刻で引き継ぐ', () => {
    expect(
      resolvePrivateBookingUrlPrefillSlot({
        slotParam: 'morning',
        timeParam: '',
        computedSlots: [],
      })
    ).toEqual({
      label: '午前',
      startTime: '09:00',
      endTime: '09:00',
    })
  })

  it('不正な slot は null', () => {
    expect(
      resolvePrivateBookingUrlPrefillSlot({
        slotParam: 'invalid',
        timeParam: '10:00',
        computedSlots: computed,
      })
    ).toBeNull()
  })

  it.each(['not-a-time', '24:00', '99:99', '12:60', '12:30:60'])('不正な time %s はデフォルト開始時刻にフォールバックする', (time) => {
    expect(
      resolvePrivateBookingUrlPrefillSlot({
        slotParam: 'afternoon',
        timeParam: time,
        computedSlots: [],
      })
    ).toEqual({
      label: '午後',
      startTime: '14:00',
      endTime: '14:00',
    })
  })
})
