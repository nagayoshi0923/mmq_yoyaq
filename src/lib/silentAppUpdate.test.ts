// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetSilentAppUpdateForTest,
  hasUnsavedInput,
  installSilentAppUpdate,
  isInProgressPath,
  isStaffPath,
  isUpdatePending,
  markUpdateAvailable,
} from './silentAppUpdate'

const reload = vi.fn()
const assign = vi.fn()

beforeEach(() => {
  reload.mockReset()
  assign.mockReset()
  document.body.innerHTML = ''
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  __resetSilentAppUpdateForTest({ reload, assign })
  installSilentAppUpdate()
})

describe('isInProgressPath', () => {
  it('予約・貸切申込・グループなどは途中のページとして扱う', () => {
    expect(isInProgressPath('/queens-waltz/scenario/abc')).toBe(true)
    expect(isInProgressPath('/queens-waltz/private-booking-request')).toBe(true)
    expect(isInProgressPath('/complete-profile')).toBe(true)
    expect(isInProgressPath('/group/manage/1')).toBe(true)
    expect(isInProgressPath('/mypage')).toBe(true)
  })
  it('トップや一覧は安全なページ', () => {
    expect(isInProgressPath('/')).toBe(false)
    expect(isInProgressPath('/queens-waltz')).toBe(false)
    expect(isInProgressPath('/scenario')).toBe(false)
  })
})

describe('isStaffPath', () => {
  it('管理画面はスタッフ用', () => {
    expect(isStaffPath('/queens-waltz/schedule')).toBe(true)
    expect(isStaffPath('/schedule')).toBe(true)
    expect(isStaffPath('/queens-waltz/dashboard')).toBe(true)
    expect(isStaffPath('/queens-waltz/scenarios/edit/1')).toBe(true)
    expect(isStaffPath('/admin/scenario-masters')).toBe(true)
  })
  it('お客様向けのページはスタッフ用ではない', () => {
    expect(isStaffPath('/')).toBe(false)
    expect(isStaffPath('/queens-waltz')).toBe(false)
    expect(isStaffPath('/stores')).toBe(false)
    expect(isStaffPath('/mypage')).toBe(false)
  })
})

describe('hasUnsavedInput', () => {
  it('値の入った入力欄があれば true', () => {
    document.body.innerHTML = '<form><input type="text" value=""><textarea>こんにちは</textarea></form>'
    expect(hasUnsavedInput()).toBe(true)
  })
  it('空欄・チェックボックス・読み取り専用だけなら false', () => {
    document.body.innerHTML = '<input type="text"><input type="checkbox" value="on"><input readonly value="x">'
    expect(hasUnsavedInput()).toBe(false)
  })
  it('ダイアログが開いていれば true', () => {
    document.body.innerHTML = '<div role="dialog"></div>'
    expect(hasUnsavedInput()).toBe(true)
  })
})

describe('自動切り替え', () => {
  it('安全なページで何も入力していなければ、すぐに読み込み直す', () => {
    markUpdateAvailable('NEW')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('入力中はその場で読み込まず、次の遷移で遷移先を読み込む', () => {
    document.body.innerHTML = '<textarea>書きかけ</textarea>'
    markUpdateAvailable('NEW')
    expect(reload).not.toHaveBeenCalled()
    expect(isUpdatePending()).toBe(true)

    window.history.pushState({ usr: null, key: 'k', idx: 1 }, '', '/mypage')
    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/mypage`)
  })

  it('途中のページではその場で読み込まない', () => {
    window.history.replaceState(null, '', '/group/manage/1')
    markUpdateAvailable('NEW')
    expect(reload).not.toHaveBeenCalled()
  })

  it('スタッフ用の画面は入力が無くてもその場では読み込まず、タブに戻っても待ち、遷移で切り替える', () => {
    window.history.replaceState(null, '', '/queens-waltz/schedule')
    markUpdateAvailable('NEW')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(reload).not.toHaveBeenCalled()
    window.history.pushState({ usr: null, key: 'k', idx: 1 }, '', '/queens-waltz/reservations')
    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/queens-waltz/reservations`)
  })

  it('画面間で値を渡す遷移は通常どおり進める', () => {
    window.history.replaceState(null, '', '/group/manage/1')
    markUpdateAvailable('NEW')
    window.history.pushState({ usr: { from: 'x' }, key: 'k', idx: 1 }, '', '/mypage')
    expect(assign).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/mypage')
  })

  it('新しい版が無ければ遷移は通常どおり', () => {
    window.history.pushState({ usr: null, key: 'k', idx: 1 }, '', '/scenario')
    expect(assign).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/scenario')
  })
})

describe('同じ版への自動切り替えは 1 回だけ（起動をまたぐ）', () => {
  /** 読み込み直した後の起動を模す（同じタブの保存領域は残り、モジュールの状態は初期化） */
  const reboot = () => __resetSilentAppUpdateForTest({ reload, assign })

  it('同じ版へ切り替えた後も古い版で起動したら、もう自動では読み込まない', () => {
    markUpdateAvailable('NEW')
    reboot()
    markUpdateAvailable('NEW')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(isUpdatePending()).toBe(false)
  })

  it('遷移での切り替えも同じ版へは 1 回だけで、2 回目は通常の遷移にする', () => {
    window.history.replaceState(null, '', '/queens-waltz/settings')
    markUpdateAvailable('NEW')
    window.history.pushState({ usr: null, key: 'k', idx: 1 }, '', '/queens-waltz/schedule')
    reboot()
    window.history.replaceState(null, '', '/queens-waltz/settings')
    markUpdateAvailable('NEW')
    window.history.pushState({ usr: null, key: 'k', idx: 1 }, '', '/queens-waltz/schedule')
    expect(assign).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/queens-waltz/schedule')
  })

  it('さらに新しい版が出たら、改めて 1 回だけ切り替える', () => {
    markUpdateAvailable('NEW')
    reboot()
    markUpdateAvailable('NEWER')
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('保存領域が使えないときは回数を数えられないので、自動では読み込まず遷移も通常どおり', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      markUpdateAvailable('NEW')
      reboot()
      markUpdateAvailable('NEW')
      window.history.pushState({ usr: null, key: 'k', idx: 1 }, '', '/scenario')
      expect(reload).not.toHaveBeenCalled()
      expect(assign).not.toHaveBeenCalled()
      expect(window.location.pathname).toBe('/scenario')
    } finally {
      get.mockRestore()
      set.mockRestore()
    }
  })
})
