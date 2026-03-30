export const ADMIN_OPERATION_CODE = '535389'
export const ADMIN_OPERATION_CODE_HEADER = 'x-admin-op-code'

export function isValidAdminOperationCode(code: string | null | undefined): boolean {
  return (code ?? '').trim() === ADMIN_OPERATION_CODE
}

export function readOpCodeFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }
  const raw = (body as Record<string, unknown>).opCode
  return typeof raw === 'string' ? raw : null
}
