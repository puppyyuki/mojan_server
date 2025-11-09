// 生成6位數字ID（確保不重複）
export async function generateUniqueId(
  checkUnique: (id: string) => Promise<boolean>,
  maxAttempts: number = 100
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const id = Math.floor(100000 + Math.random() * 900000).toString()
    const isUnique = await checkUnique(id)
    if (isUnique) {
      return id
    }
  }
  throw new Error('無法生成唯一ID，請重試')
}

