/**
 * 統一的 API 客戶端工具
 * 自動處理認證 token
 */

/**
 * 從 localStorage 獲取 token
 */
function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return localStorage.getItem('adminToken')
}

/**
 * 統一的 fetch 函數，自動添加認證 header
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // 如果有 token，添加到 Authorization header
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // 確保 cookie 也會發送
  })
}

/**
 * GET 請求
 */
export async function apiGet(url: string, options: RequestInit = {}): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'GET',
  })
}

/**
 * POST 請求
 */
export async function apiPost(
  url: string,
  data?: any,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
}

/**
 * PATCH 請求
 */
export async function apiPatch(
  url: string,
  data?: any,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  })
}

/**
 * DELETE 請求
 */
export async function apiDelete(url: string, options: RequestInit = {}): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'DELETE',
  })
}

