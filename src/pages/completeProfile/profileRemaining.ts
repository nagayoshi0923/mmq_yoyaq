/** 必須項目のうち、まだ入っていない数（点検 10。必須は減らさない） */
export function countRemainingRequired(fields: {
  name: string
  phone: string
  prefecture: string
  birthDate: string
  isOAuthUser: boolean
  password: string
  confirmPassword: string
  acceptTerms: boolean
}): { remaining: number; total: number } {
  const checks = [
    fields.name.trim().length > 0,
    /^\d{10,11}$/.test(fields.phone.replace(/[-\s]/g, '')),
    fields.prefecture.length > 0,
    /^\d{4}\/\d{2}\/\d{2}$/.test(fields.birthDate),
    ...(fields.isOAuthUser
      ? []
      : [fields.password.length >= 6, fields.confirmPassword.length > 0 && fields.confirmPassword === fields.password]),
    fields.acceptTerms,
  ]
  return { remaining: checks.filter((ok) => !ok).length, total: checks.length }
}
