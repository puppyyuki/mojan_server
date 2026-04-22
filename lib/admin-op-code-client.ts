'use client'

import { ADMIN_OPERATION_CODE_HEADER } from './admin-op-code-header'

function requestHiddenOpCodeInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      background: 'rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    })

    const modal = document.createElement('div')
    Object.assign(modal.style, {
      width: '100%',
      maxWidth: '380px',
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
      padding: '20px',
      boxSizing: 'border-box',
    })

    const title = document.createElement('h3')
    title.textContent = '請輸入操作驗證碼'
    Object.assign(title.style, {
      margin: '0',
      color: '#111827',
      fontSize: '16px',
      fontWeight: '600',
    })

    const input = document.createElement('input')
    input.type = 'password'
    input.placeholder = '操作驗證碼'
    Object.assign(input.style, {
      marginTop: '12px',
      width: '100%',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      padding: '10px 12px',
      fontSize: '14px',
      color: '#111827',
      boxSizing: 'border-box',
      outline: 'none',
    })
    input.addEventListener('focus', () => {
      input.style.border = '1px solid #3b82f6'
      input.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)'
    })
    input.addEventListener('blur', () => {
      input.style.border = '1px solid #d1d5db'
      input.style.boxShadow = 'none'
    })

    const actions = document.createElement('div')
    Object.assign(actions.style, {
      marginTop: '16px',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
    })

    const cancelButton = document.createElement('button')
    cancelButton.type = 'button'
    cancelButton.textContent = '取消'
    Object.assign(cancelButton.style, {
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      background: '#ffffff',
      color: '#374151',
      fontSize: '14px',
      padding: '8px 14px',
      cursor: 'pointer',
    })

    const confirmButton = document.createElement('button')
    confirmButton.type = 'button'
    confirmButton.textContent = '確認'
    Object.assign(confirmButton.style, {
      border: 'none',
      borderRadius: '8px',
      background: '#2563eb',
      color: '#ffffff',
      fontSize: '14px',
      padding: '8px 14px',
      cursor: 'pointer',
    })

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
