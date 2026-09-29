import {expect,it} from 'vitest'
import {gmCandidateVersion,gmCandidateButtons} from '../../supabase/functions/_shared/gmCandidateVersion'
it('日時・年・順序の変更を区別し、表示メタデータには左右されない',async()=>{
 const a={date:'2027-01-01',timeSlot:'夜',startTime:'19:00',endTime:'22:00'}
 const b={...a,date:'2027-02-01'}
 const hash=await gmCandidateVersion([a,b])
 expect(await gmCandidateVersion([b,a])).not.toBe(hash)
 expect(await gmCandidateVersion([{...a,date:'2028-01-01'},b])).not.toBe(hash)
 expect(await gmCandidateVersion([{...a,order:99,status:'confirmed'},b])).toBe(hash)
 const rows=gmCandidateButtons([a,b],'00000000-0000-0000-0000-000000000001',hash)
 expect(rows.flatMap(r=>r.components).every(b=>b.custom_id.endsWith(hash)&&b.custom_id.length<=100)).toBe(true)
})
