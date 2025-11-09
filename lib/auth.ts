import { NextRequest } from 'next/server'
import { prisma } from './prisma'

/**
 * 從請求中獲取當前使用者 ID
 * 從 Authorization header 或 cookie 中讀取 token，並解析出 userId
 */
export async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  try {
    // 方法 1: 從 Authorization header 讀取
    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const userId = extractUserIdFromToken(token)
      if (userId) {
        // 驗證使用者是否存在
        const user = await prisma.user.findUnique({
          where: { id: userId }
        })
        if (user) {
          return userId
        }
      }
    }

    // 方法 2: 從 cookie 讀取（如果前端使用 cookie）
    const cookieToken = request.cookies.get('adminToken')?.value
    if (cookieToken) {
      const userId = extractUserIdFromToken(cookieToken)
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId }
        })
        if (user) {
          return userId
        }
      }
    }

    return null
  } catch (error) {
    console.error('獲取當前使用者 ID 錯誤:', error)
    return null
  }
}

/**
 * 從 token 中提取 userId
 * token 格式: admin-token-{timestamp}-{userId}
 * 或簡單格式: {userId}
 */
function extractUserIdFromToken(token: string): string | null {
  try {
    // 如果 token 包含 userId（格式: admin-token-{timestamp}-{userId}）
    if (token.includes('-')) {
      const parts = token.split('-')
      // 嘗試從最後一部分提取 userId（如果它是有效的 cuid）
      const userId = parts[parts.length - 1]
      if (userId && userId.length > 10) {
        return userId
      }
    }
    
    // 如果 token 本身就是 userId
    if (token.length > 10) {
      return token
    }

    return null
  } catch (error) {
    console.error('解析 token 錯誤:', error)
    return null
  }
}

/**
 * 創建包含 userId 的 token
 */
export function createToken(userId: string): string {
  return `admin-token-${Date.now()}-${userId}`
}

/**
 * 從 token 中提取 userId（同步版本，用於前端）
 */
export function getUserIdFromToken(token: string): string | null {
  return extractUserIdFromToken(token)
}

