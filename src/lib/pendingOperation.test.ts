// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { beforeEach, expect, it } from 'vitest'
import { pendingOperation } from './pendingOperation'
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true})
beforeEach(()=>sessionStorage.clear())
it('retains the UUID for equivalent request bodies without storing their content',async()=>{
 const first=await pendingOperation('org:user',{email:'private@example.invalid',a:1,b:{y:2,x:1}})
 const retry=await pendingOperation('org:user',{b:{x:1,y:2},a:1,email:'private@example.invalid'})
 expect(retry.id).toBe(first.id)
 expect(JSON.stringify({...sessionStorage})).not.toContain('private@example.invalid')
 expect((await pendingOperation('org:other-user',{email:'private@example.invalid',a:1,b:{x:1,y:2}})).id).not.toBe(first.id)
 first.complete()
 expect((await pendingOperation('org:user',{email:'private@example.invalid',a:1,b:{x:1,y:2}})).id).not.toBe(first.id)
})
