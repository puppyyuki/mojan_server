const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createRoomCardProducts() {
  try {
    console.log('開始創建大廳購卡產品...');

    // 大廳購卡產品
    const shopProducts = [
      {
        cardAmount: 20,
        price: 100,
        isActive: true,
      },
      {
        cardAmount: 50,
        price: 250,
        isActive: true,
      },
      {
        cardAmount: 200,
        price: 1000,
        isActive: true,
      },
    ];

    for (const product of shopProducts) {
      const existing = await prisma.roomCardProduct.findFirst({
        where: {
          cardAmount: product.cardAmount,
          price: product.price,
        },
      });

      if (!existing) {
        const created = await prisma.roomCardProduct.create({
          data: product,
        });
        console.log(`✅ 已創建大廳購卡產品: ${created.cardAmount}張 - NT$ ${created.price} (ID: ${created.id})`);
      } else {
        console.log(`ℹ️  大廳購卡產品已存在: ${existing.cardAmount}張 - NT$ ${existing.price}`);
      }
    }

    console.log('\n開始創建代理購卡產品...');

    // 代理購卡產品
    const agentProducts = [
      {
        cardAmount: 3000,
        price: 9000,
        isActive: true,
      },
      {
        cardAmount: 5000,
        price: 12500,
        isActive: true,
      },
      {
        cardAmount: 10000,
        price: 20000,
        isActive: true,
      },
    ];

    for (const product of agentProducts) {
      const existing = await prisma.agentRoomCardProduct.findFirst({
        where: {
          cardAmount: product.cardAmount,
          price: product.price,
        },
      });

      if (!existing) {
        const created = await prisma.agentRoomCardProduct.create({
          data: product,
        });
        console.log(`✅ 已創建代理購卡產品: ${created.cardAmount}張 - NT$ ${created.price} (ID: ${created.id})`);
      } else {
        console.log(`ℹ️  代理購卡產品已存在: ${existing.cardAmount}張 - NT$ ${existing.price}`);
      }
    }

    console.log('\n✅ 所有房卡產品創建完成！');
  } catch (error) {
    console.error('❌ 創建產品失敗:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createRoomCardProducts();
