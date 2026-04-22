import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_OPERATION_CODE_HEADER } from './admin-op-code-header'
import { isValidAdminOperationCode, readOpCodeFromBody } from './admin-op-code'

export function assertAdminOpCode(
  request: NextRequest,
  body?: unknown
): { ok: true; code: string } | { ok: false; response: NextResponse } {
  const headerCode = request.headers.get(ADMIN_OPERATION_CODE_HEADER)
  const queryCode = new URL(request.url).searchParams.get('opCode')
  const bodyCode = readOpCodeFromBody(body)
  const code = headerCode ?? bodyCode ?? queryCode

  if (!isValidAdminOperationCode(code)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: '操作驗證碼錯誤或缺少驗證碼' },
        { status: 403 }
      ),
    }
  }

  return { ok: true, code: code!.trim() }
}
