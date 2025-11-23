/**
 * 清除測試購買腳本
 * 
 * 用途：手動消耗被卡住的 Google Play 測試購買
 * 
 * 使用方法：
 * node scripts/clear-test-purchases.js
 */

const { PrismaClient } = require('@prisma/client');
const iapVerification = require('../lib/iap_verification'); // 直接使用實例

const prisma = new PrismaClient();

async function clearTestPurchases() {
    try {
        console.log('🔍 開始查找測試購買記錄...\n');

        // 查找最近的購買記錄（最近 7 天）
        const recentPurchases = await prisma.purchase.findMany({
            where: {
                platform: 'android',
                createdAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 20,
        });

        if (recentPurchases.length === 0) {
            console.log('❌ 沒有找到最近的購買記錄');
            console.log('\n如果測試購買沒有在資料庫中，請使用 Google Play Console 手動清除：');
            console.log('https://play.google.com/console/');
            return;
        }

        console.log(`📦 找到 ${recentPurchases.length} 筆最近的購買記錄：\n`);

        for (const purchase of recentPurchases) {
            console.log(`\n處理購買記錄：`);
            console.log(`  交易 ID: ${purchase.transactionId}`);
            console.log(`  商品 ID: ${purchase.productId}`);
            console.log(`  玩家 ID: ${purchase.playerId}`);
            console.log(`  房卡數量: ${purchase.cardAmount}`);
            console.log(`  狀態: ${purchase.status}`);
            console.log(`  建立時間: ${purchase.createdAt}`);

            try {
                // 解析購買資料
                const purchaseData = JSON.parse(purchase.purchaseData);
                
                if (!purchaseData.purchaseToken) {
                    console.log(`  ⚠️ 沒有 purchaseToken，跳過`);
                    continue;
                }

                console.log(`  購買憑證: ${purchaseData.purchaseToken.substring(0, 20)}...`);

                // 嘗試消耗購買
                console.log(`  🔄 嘗試消耗購買...`);
                const consumed = await iapVerification.consumeGooglePlayPurchase(
                    purchase.productId,
                    purchaseData.purchaseToken
                );

                if (consumed) {
                    console.log(`  ✅ 成功消耗購買！`);
                } else {
                    console.log(`  ⚠️ 消耗失敗（可能已經消耗過）`);
                }
            } catch (error) {
                console.log(`  ❌ 處理失敗: ${error.message}`);
            }
        }

        console.log('\n\n🎉 清除腳本執行完成！');
        console.log('\n如果問題仍然存在，請嘗試以下方法：');
        console.log('1. 在 Google Play Console 中查看測試訂單');
        console.log('2. 使用不同的測試帳號');
        console.log('3. 清除 App 資料並重新安裝');

    } catch (error) {
        console.error('❌ 腳本執行失敗:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// 執行腳本
clearTestPurchases()
    .then(() => {
        console.log('\n✅ 腳本執行成功');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ 腳本執行失敗:', error);
        process.exit(1);
    });

