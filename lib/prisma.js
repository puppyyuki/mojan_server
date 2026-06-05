const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

/** @type {import('@prisma/client').PrismaClient | undefined} */
let prisma = globalForPrisma.__mojanPrisma;

if (!prisma) {
  prisma = new PrismaClient();
  globalForPrisma.__mojanPrisma = prisma;
}

module.exports = { prisma };
