const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

/** @type {import('@prisma/client').PrismaClient | undefined} */
let prisma = globalForPrisma.__mojanPrisma;

if (!prisma) {
  prisma = new PrismaClient();
  globalForPrisma.__mojanPrisma = prisma;
  const dbUrl = process.env.DATABASE_URL || '';
  if (
    process.env.NODE_ENV === 'production' &&
    dbUrl &&
    !dbUrl.includes('connection_limit=')
  ) {
    console.warn(
      '[Prisma] DATABASE_URL 未設定 connection_limit；建議每服務加上 ?connection_limit=5&pool_timeout=20 以避免連線耗盡'
    );
  }
}

module.exports = { prisma };
