import { describe, expect, it } from 'vitest'
import { blockedResponseBody, decideOutbound, isStagingEmailEvent, isStagingEnvironment, stagingIdempotencyKey, tagStagingEmailBody } from '../../supabase/functions/_shared/outbound-guard-core'

const staging = { supabaseUrl: 'https://lavutzztfqbdndjiwluc.supabase.co' }
const production = { supabaseUrl: 'https://cznpcewciwywcqcxktba.supabase.co' }
const resend = (body: unknown) => ({ url: 'https://api.resend.com/emails', method: 'POST', body: JSON.stringify(body) })

describe('検証環境から外部へ送らない守り（#1281）', () => {
  it('ステージングのURLか APP_ENV=staging で検証環境とみなす', () => {
    expect(isStagingEnvironment(staging)).toBe(true)
    expect(isStagingEnvironment({ appEnv: 'staging' })).toBe(true)
    expect(isStagingEnvironment(production)).toBe(false)
    expect(isStagingEnvironment({})).toBe(false)
  })

  it('本番では何も止めない', () => {
    expect(decideOutbound(resend({ to: 'real@gmail.com' }), production)).toEqual({ action: 'allow' })
    expect(decideOutbound({ url: 'https://discord.com/api/v10/channels/123456789012345678/messages', method: 'POST' }, production)).toEqual({ action: 'allow' })
  })

  it('検証環境では実在の宛先へのメールを止め、伏せた宛先だけ送る', () => {
    expect(decideOutbound(resend({ to: 'real@gmail.com' }), staging).action).toBe('block')
    expect(decideOutbound(resend({ to: ['masked+abc@example.invalid', 'real@gmail.com'] }), staging).action).toBe('block')
    expect(decideOutbound(resend({ to: 'masked+abc@example.invalid', bcc: 'Real <real@gmail.com>' }), staging).action).toBe('block')
    expect(decideOutbound(resend({ to: 'テスト <masked+abc@example.invalid>' }), staging)).toEqual({ action: 'allow' })
  })

  it('許可リストのアドレスだけは検証環境でも送る', () => {
    const env = { ...staging, emailAllowlist: 'qa@example.com, Other@Example.com' }
    expect(decideOutbound(resend({ to: 'QA@example.com' }), env)).toEqual({ action: 'allow' })
    expect(decideOutbound(resend({ to: ['qa@example.com', 'x@gmail.com'] }), env).action).toBe('block')
  })

  it('まとめ送信も1件でも実在の宛先があれば止め、件数分の成功を返す', () => {
    const decision = decideOutbound(
      { url: 'https://api.resend.com/emails/batch', method: 'POST', body: JSON.stringify([{ to: 'a@example.invalid' }, { to: 'b@gmail.com' }]) },
      staging,
    )
    expect(decision).toMatchObject({ action: 'block', channel: 'email', batch: 2 })
    if (decision.action === 'block') expect((blockedResponseBody(decision).data as unknown[]).length).toBe(2)
  })

  it('本文が読めないメールは送らない。読み取り（GET）は通す', () => {
    expect(decideOutbound({ url: 'https://api.resend.com/emails', method: 'POST', body: '{' }, staging).action).toBe('block')
    expect(decideOutbound({ url: 'https://api.resend.com/emails/abc', method: 'GET' }, staging)).toEqual({ action: 'allow' })
  })

  it('Discord は書き込みを止め、読み取り・ボタン操作への返信・許可リストのチャンネルは通す', () => {
    const post = (path: string) => ({ url: `https://discord.com/api/v10${path}`, method: 'POST', body: '{}' })
    expect(decideOutbound(post('/channels/123456789012345678/messages'), staging).action).toBe('block')
    expect(decideOutbound({ url: 'https://discord.com/api/webhooks/111111111111111111/tok', method: 'POST' }, staging).action).toBe('block')
    expect(decideOutbound(post('/guilds/123456789012345678/channels'), staging).action).toBe('block')
    expect(decideOutbound({ url: 'https://discord.com/api/v10/users/@me', method: 'GET' }, staging)).toEqual({ action: 'allow' })
    expect(decideOutbound(post('/interactions/123456789012345678/token/callback'), staging)).toEqual({ action: 'allow' })
    expect(decideOutbound(post('/webhooks/999999999999999999/tok/messages/@original'), { ...staging, discordApplicationId: '999999999999999999' })).toEqual({ action: 'allow' })
    expect(decideOutbound(post('/channels/123456789012345678/messages'), { ...staging, discordAllowlist: '123456789012345678' })).toEqual({ action: 'allow' })
  })

  it('環境変数が無くてもボタン操作への返信（interaction token の webhook）は通す', () => {
    expect(decideOutbound({ url: 'https://discord.com/api/v10/webhooks/999999999999999999/aW50ZXJhY3Rpb246MTIz/messages/@original', method: 'PATCH', body: '{}' }, staging)).toEqual({ action: 'allow' })
    expect(decideOutbound({ url: 'https://discord.com/api/webhooks/111111111111111111/abcdefg', method: 'POST', body: '{}' }, staging).action).toBe('block')
  })

  it('止めた Discord の書き込みには、招待の code など呼び出し側が読む項目を返す', () => {
    const decision = decideOutbound({ url: 'https://discord.com/api/v10/channels/123456789012345678/invites', method: 'POST', body: '{}' }, staging)
    expect(decision.action).toBe('block')
    if (decision.action === 'block') expect(blockedResponseBody(decision)).toMatchObject({ id: '0', code: 'staging-blocked' })
  })

  it('止めた作成で返した仮の ID（0）への後続の読み取りも本物へ送らない', () => {
    const decision = decideOutbound({ url: 'https://discord.com/api/v10/channels/0', method: 'GET' }, staging)
    expect(decision).toMatchObject({ action: 'block', reason: 'staging_placeholder_id' })
    if (decision.action === 'block') expect(blockedResponseBody(decision)).toMatchObject({ permission_overwrites: [] })
    expect(decideOutbound({ url: 'https://discord.com/api/v10/channels/0', method: 'GET' }, production)).toEqual({ action: 'allow' })
    expect(decideOutbound({ url: 'https://discord.com/api/v10/channels/123456789012345678', method: 'GET' }, staging)).toEqual({ action: 'allow' })
  })

  it('X への投稿も止める', () => {
    expect(decideOutbound({ url: 'https://api.twitter.com/2/tweets', method: 'POST', body: '{}' }, staging).action).toBe('block')
  })

  it('ほかの宛先（Supabase など）は触らない', () => {
    expect(decideOutbound({ url: 'https://lavutzztfqbdndjiwluc.supabase.co/rest/v1/x', method: 'POST' }, staging)).toEqual({ action: 'allow' })
  })

  it('検証環境の Resend 重複防止キーは本番と重ならないよう前置きを付ける（二重に付けない）', () => {
    expect(stagingIdempotencyKey('private-rejection/abc')).toBe('mmq-staging/private-rejection/abc')
    expect(stagingIdempotencyKey('mmq-staging/private-rejection/abc')).toBe('mmq-staging/private-rejection/abc')
  })

  it('検証環境の送信に目印タグを付ける（まとめ送信も、二重に付けない）', () => {
    const one = JSON.parse(tagStagingEmailBody(JSON.stringify({ to: ['a@example.invalid'], tags: [{ name: 'mmq_delivery', value: 'x' }] }))!)
    expect(one.tags).toEqual([{ name: 'mmq_delivery', value: 'x' }, { name: 'mmq_env', value: 'staging' }])
    const again = JSON.parse(tagStagingEmailBody(JSON.stringify(one))!)
    expect(again.tags).toHaveLength(2)
    const batch = JSON.parse(tagStagingEmailBody(JSON.stringify([{ to: ['a@example.invalid'] }, { to: ['b@example.invalid'] }]))!)
    expect(batch.every((m: { tags: unknown[] }) => m.tags.length === 1)).toBe(true)
    expect(tagStagingEmailBody('not json')).toBe('not json')
  })

  it('本番の Webhook は検証環境の送信のイベントを見分ける', () => {
    expect(isStagingEmailEvent({ to: ['x@gmail.com'], tags: [{ name: 'mmq_env', value: 'staging' }] })).toBe(true)
    expect(isStagingEmailEvent({ to: ['x@gmail.com'], tags: { mmq_env: 'staging' } })).toBe(true)
    expect(isStagingEmailEvent({ to: ['masked+abc@example.invalid'] })).toBe(true)
    expect(isStagingEmailEvent({ to: 'Name <masked+abc@example.invalid>' })).toBe(true)
    expect(isStagingEmailEvent({ to: ['x@gmail.com'], tags: [{ name: 'mmq_delivery', value: 'y' }] })).toBe(false)
    expect(isStagingEmailEvent({ to: ['masked+abc@example.invalid', 'x@gmail.com'] })).toBe(false)
    expect(isStagingEmailEvent({})).toBe(false)
  })
})
