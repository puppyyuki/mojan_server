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

  const generalStaffAccounts = [
    { username: 'DJ1021', password: 'dj1021' },
    { username: 'DJ1022', password: 'dj1022' },
  ]

  for (const account of generalStaffAccounts) {
    const existingStaff = await prisma.user.findUnique({
      where: { username: account.username },
    })

    if (!existingStaff) {
      const hashedPassword = await bcrypt.hash(account.password, 10)
      await prisma.user.create({
        data: {
          username: account.username,
          password: hashedPassword,
          role: 'GENERAL_STAFF',
        },
      })
      console.log(`一般職員帳號已建立：${account.username} / ${account.password}`)
    } else if (existingStaff.role !== 'GENERAL_STAFF') {
      await prisma.user.update({
        where: { id: existingStaff.id },
        data: { role: 'GENERAL_STAFF' },
      })
      console.log(`一般職員帳號角色已更新：${account.username} -> GENERAL_STAFF`)
    } else {
      console.log(`一般職員帳號已存在：${account.username}`)
    }
  }

  // 建立房卡產品
  const products = [
    { cardAmount: 3000, price: 9000 },
    { cardAmount: 5000, price: 12500 },
    { cardAmount: 10000, price: 20000 },
  ]

  for (const product of products) {
    const existing = await prisma.roomCardProduct.findFirst({
      where: {
        cardAmount: product.cardAmount,
        price: product.price
      }
    })

    if (!existing) {
      await prisma.roomCardProduct.create({
        data: {
          cardAmount: product.cardAmount,
          price: product.price,
          isActive: true,
        }
      })
      console.log(`房卡產品已建立：${product.cardAmount}張 - ${product.price}元`)
    } else {
      console.log(`房卡產品已存在：${product.cardAmount}張`)
    }
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
