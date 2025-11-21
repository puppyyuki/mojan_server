const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createRoomCardProducts() {
  try {
    console.log('開始刪除舊的大廳購卡產品...');
    
    // 刪除所有舊的大廳購卡產品
    const deletedShopProducts = await prisma.roomCardProduct.deleteMany({});
    console.log(`✅ 已刪除 ${deletedShopProducts.count} 個大廳購卡產品`);

    console.log('\n開始創建大廳購卡產品...');

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
      const created = await prisma.roomCardProduct.create({
        data: product,
      });
      console.log(`✅ 已創建大廳購卡產品: ${created.cardAmount}張 - NT$ ${created.price} (ID: ${created.id})`);
    }

    console.log('\n開始刪除舊的代理購卡產品...');
    
    // 刪除所有舊的代理購卡產品
    const deletedAgentProducts = await prisma.agentRoomCardProduct.deleteMany({});
    console.log(`✅ 已刪除 ${deletedAgentProducts.count} 個代理購卡產品`);

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
      const created = await prisma.agentRoomCardProduct.create({
        data: product,
      });
      console.log(`✅ 已創建代理購卡產品: ${created.cardAmount}張 - NT$ ${created.price} (ID: ${created.id})`);
    }

    console.log('\n✅ 所有房卡產品創建完成！');
  } catch (error) {
    console.error('❌ 創建產品失敗:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createRoomCardProducts();
