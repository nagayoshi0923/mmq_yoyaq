import { expect, it } from 'vitest'
import { validateCustomerContact } from './customerContactValidation'
it.each(['', 'bad', 'a@b', 'a b@example.test', 'a@b@c.test'])('不正メール %s を保存前に拒否する', email => {
  expect(() => validateCustomerContact(email, '09000000011')).toThrow('メールアドレス')
})
it.each(['123', '', '090abcdef00', '000000000000'])('不正電話 %s を保存前に拒否する', phone => {
  expect(() => validateCustomerContact('fixture@example.test', phone)).toThrow('電話番号')
})
it('通常のメールと電話の区切りを受け付ける', () => {
  expect(() => validateCustomerContact('fixture@example.test', '090-0000-0011')).not.toThrow()
})
