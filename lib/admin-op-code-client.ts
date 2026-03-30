'use client'

import { ADMIN_OPERATION_CODE, ADMIN_OPERATION_CODE_HEADER } from './admin-op-code'

export function requestAdminOpCode(confirmMessage: string): string | null {
  if (!window.confirm(confirmMessage)) {
    return null
  }
  const value = window.prompt('請輸入操作驗證碼 535389')?.trim()
  if (!value) {
    window.alert('已取消操作')
    return null
  }
  if (value !== ADMIN_OPERATION_CODE) {
    window.alert('驗證碼錯誤')
    return null
  }
  return value
}

export function withAdminOpCodeHeader(opCode: string, headers: HeadersInit = {}): HeadersInit {
  return {
    ...headers,
    [ADMIN_OPERATION_CODE_HEADER]: opCode,
  }
}
