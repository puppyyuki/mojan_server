const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createRoomCardProducts() {
  try {
    console.log('開始創建房卡產品...');

    // 先刪除現有的產品（可選，如果需要重置）
    // await prisma.roomCardProduct.deleteMany({});

    // 創建產品
    const products = [
      {
        cardAmount: 20,
        price: 100,
        isActive: true,
      },
      {
        cardAmount: 76,
        price: 380,
        isActive: true,
      },
      {
        cardAmount: 190,
        price: 950,
        isActive: true,
      },
    ];

    for (const product of products) {
      const created = await prisma.roomCardProduct.create({
        data: product,
      });
      console.log(`✅ 已創建產品: ${created.cardAmount}張 - NT$ ${created.price} (ID: ${created.id})`);
    }

    console.log('\n✅ 所有房卡產品創建完成！');
  } catch (error) {
    console.error('❌ 創建產品失敗:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createRoomCardProducts();

