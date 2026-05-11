import { prisma } from '@/lib/prisma'

const ROW_ID = 'default'

export async function ensureAppReleaseSetting() {
  return prisma.appReleaseSetting.upsert({
    where: { id: ROW_ID },
    create: {
      id: ROW_ID,
      policyVersion: '',
      forceUpdate: false,
    },
    update: {},
  })
}
