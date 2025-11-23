/**
 * 檢查 IAP 商品資料庫狀態
 * 
 * 用途：確認大廳內購商品（RoomCardProduct）是否正確建立
 * 
 * 使用方法：
 * node scripts/check-iap-products.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkIAPProducts() {
    try {
        console.log('🔍 檢查 IAP 商品資料庫狀態...\n');

        // 檢查大廳內購商品（RoomCardProduct）
        console.log('📦 檢查大廳內購商品（RoomCardProduct）...');
        const shopProducts = await prisma.roomCardProduct.findMany({
            orderBy: { cardAmount: 'asc' },
        });

        console.log(`   總數: ${shopProducts.length} 個商品\n`);

        if (shopProducts.length === 0) {
            console.log('   ❌ 沒有找到任何商品！');
            console.log('   💡 請執行腳本建立商品：');
            console.log('      node scripts/create-room-card-products.js\n');
        } else {
            console.log('   商品列表：');
            for (const product of shopProducts) {
                const productCode = `room_card_${product.cardAmount}`.toLowerCase();
                const status = product.isActive ? '✅ 啟用' : '❌ 停用';
                console.log(`   - ${productCode}: ${product.cardAmount} 張房卡, NT$ ${product.price} (${status})`);
                console.log(`     資料庫 ID: ${product.id}`);
                console.log(`     建立時間: ${product.createdAt}`);
                console.log(`     更新時間: ${product.updatedAt}\n`);
            }

            // 檢查啟用的商品
            const activeProducts = shopProducts.filter(p => p.isActive);
            console.log(`   ✅ 啟用的商品: ${activeProducts.length} 個`);
            
            if (activeProducts.length === 0) {
                console.log('   ⚠️ 警告：沒有啟用的商品！');
                console.log('   💡 請確認 isActive 為 true\n');
            }

            // 檢查預期的商品
            const expectedCardAmounts = [20, 50, 200];
            const foundCardAmounts = activeProducts.map(p => p.cardAmount);
            const missingCardAmounts = expectedCardAmounts.filter(
                amount => !foundCardAmounts.includes(amount)
            );

            if (missingCardAmounts.length > 0) {
                console.log(`   ⚠️ 缺少以下商品: ${missingCardAmounts.join(', ')} 張房卡`);
                console.log('   💡 請執行腳本建立缺少的商品\n');
            } else {
                console.log('   ✅ 所有預期商品都存在\n');
            }
        }

        // 檢查代理購卡商品（AgentRoomCardProduct）- 僅供參考
        console.log('📦 檢查代理購卡商品（AgentRoomCardProduct）- 僅供參考...');
        const agentProducts = await prisma.agentRoomCardProduct.findMany({
            orderBy: { cardAmount: 'asc' },
        });
        console.log(`   總數: ${agentProducts.length} 個商品`);
        if (agentProducts.length > 0) {
            console.log('   商品列表：');
            for (const product of agentProducts) {
                const status = product.isActive ? '✅ 啟用' : '❌ 停用';
                console.log(`   - ${product.cardAmount} 張房卡, NT$ ${product.price} (${status})`);
            }
        }
        console.log('   ⚠️ 注意：代理購卡商品不適用於 IAP，僅供參考\n');

        // 總結
        console.log('📊 總結：');
        const activeShopProducts = shopProducts.filter(p => p.isActive);
        if (activeShopProducts.length === 3) {
            console.log('   ✅ IAP 商品資料庫狀態正常');
            console.log('   ✅ 所有商品都已建立並啟用');
            console.log('   ✅ 商品 ID 格式正確（room_card_20, room_card_50, room_card_200）');
        } else {
            console.log('   ❌ IAP 商品資料庫狀態異常');
            console.log(`   ⚠️ 預期 3 個商品，實際 ${activeShopProducts.length} 個`);
            console.log('   💡 請執行腳本建立或更新商品：');
            console.log('      node scripts/create-room-card-products.js');
        }

    } catch (error) {
        console.error('❌ 檢查失敗:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// 執行檢查
checkIAPProducts()
    .then(() => {
        console.log('\n✅ 檢查完成');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ 檢查失敗:', error);
        process.exit(1);
    });

