import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  __mojanPrisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.__mojanPrisma ?? new PrismaClient()

if (!globalForPrisma.__mojanPrisma) {
  globalForPrisma.__mojanPrisma = prisma
}

