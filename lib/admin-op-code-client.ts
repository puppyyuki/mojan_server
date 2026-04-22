'use client'

import { ADMIN_OPERATION_CODE_HEADER } from './admin-op-code-header'

function requestHiddenOpCodeInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center px-4'

    const modal = document.createElement('div')
    modal.className = 'w-full max-w-sm bg-white rounded-xl shadow-xl p-5'

    const title = document.createElement('h3')
    title.className = 'text-base font-semibold text-gray-900'
    title.textContent = '請輸入操作驗證碼'

    const input = document.createElement('input')
    input.type = 'password'
    input.placeholder = '操作驗證碼'
    input.className =
      'mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

    const actions = document.createElement('div')
    actions.className = 'mt-4 flex justify-end gap-2'

    const cancelButton = document.createElement('button')
    cancelButton.type = 'button'
    cancelButton.className = 'px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50'
    cancelButton.textContent = '取消'

    const confirmButton = document.createElement('button')
    confirmButton.type = 'button'
    confirmButton.className = 'px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700'
    confirmButton.textContent = '確認'

    const cleanup = (result: string | null) => {
      document.removeEventListener('keydown', onKeydown)
      overlay.remove()
      resolve(result)
    }

    const onCancel = () => cleanup(null)
    const onConfirm = () => cleanup(input.value.trim() || null)
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      if (event.key === 'Enter') onConfirm()
    }

    cancelButton.addEventListener('click', onCancel)
    confirmButton.addEventListener('click', onConfirm)
    document.addEventListener('keydown', onKeydown)

    actions.append(cancelButton, confirmButton)
    modal.append(title, input, actions)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)
    input.focus()
  })
}

export async function requestAdminOpCode(confirmMessage: string): Promise<string | null> {
  if (!window.confirm(confirmMessage)) {
    return null
  }

  const value = await requestHiddenOpCodeInput()
  if (!value) {
    window.alert('已取消操作')
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
