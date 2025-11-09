import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // 檢查是否已存在預設帳號
  const existingUser = await prisma.user.findUnique({
    where: { username: 'admin001' }
  })

  if (!existingUser) {
    // 加密密碼
    const hashedPassword = await bcrypt.hash('123456', 10)

    // 建立預設帳號
    await prisma.user.create({
      data: {
        username: 'admin001',
        password: hashedPassword,
        role: 'ADMIN'
      }
    })

    console.log('預設帳號已建立：admin001 / 123456')
  } else {
    console.log('預設帳號已存在')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

