const { google } = require('googleapis');
const axios = require('axios');

/**
 * 內購收據驗證服務
 * 處理 Google Play 和 App Store 的收據驗證
 */
class IAPVerificationService {
    constructor() {
        // Google Play 設定
        this.androidPublisher = null;
        this.packageName = process.env.ANDROID_PACKAGE_NAME || 'com.mojan.app';

        // App Store 設定
        this.appleSharedSecret = process.env.APPLE_SHARED_SECRET;
        this.appleVerifyUrl = process.env.APPLE_SANDBOX === 'true'
            ? 'https://sandbox.itunes.apple.com/verifyReceipt'
            : 'https://buy.itunes.apple.com/verifyReceipt';
    }

    /**
     * 初始化 Google Play API
     */
    async initializeGooglePlay() {
        try {
            // 從環境變數或檔案載入服務帳號金鑰
            const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
                ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
                : require('../google-service-account.json');

            const auth = new google.auth.GoogleAuth({
                credentials: serviceAccountKey,
                scopes: ['https://www.googleapis.com/auth/androidpublisher'],
            });

            this.androidPublisher = google.androidpublisher({
                version: 'v3',
                auth: auth,
            });

            console.log('Google Play API 初始化成功');
            return true;
        } catch (error) {
            console.error('Google Play API 初始化失敗:', error);
            return false;
        }
    }

    /**
     * 驗證 Google Play 購買收據
     * @param {string} productId - 商品 ID
     * @param {string} purchaseToken - 購買憑證
     * @returns {Promise<Object>} 驗證結果
     */
    async verifyGooglePlayPurchase(productId, purchaseToken) {
        try {
            if (!this.androidPublisher) {
                await this.initializeGooglePlay();
            }

            // 查詢購買資訊
            const response = await this.androidPublisher.purchases.products.get({
                packageName: this.packageName,
                productId: productId,
                token: purchaseToken,
            });

            const purchase = response.data;

            // 檢查購買狀態
            // purchaseState: 0 = 已購買, 1 = 已取消, 2 = 待處理
            if (purchase.purchaseState !== 0) {
                return {
                    valid: false,
                    error: '購買狀態無效',
                    purchaseState: purchase.purchaseState,
                };
            }

            // 檢查是否已消耗
            // consumptionState: 0 = 尚未消耗, 1 = 已消耗
            if (purchase.consumptionState === 1) {
                return {
                    valid: false,
                    error: '此購買已被消耗',
                    alreadyConsumed: true,
                };
            }

            return {
                valid: true,
                productId: productId,
                purchaseToken: purchaseToken,
                orderId: purchase.orderId,
                purchaseTime: purchase.purchaseTimeMillis,
                developerPayload: purchase.developerPayload,
            };
        } catch (error) {
            console.error('Google Play 收據驗證失敗:', error);
            return {
                valid: false,
                error: error.message,
            };
        }
    }

    /**
     * 消耗 Google Play 購買（標記為已處理）
     * @param {string} productId - 商品 ID
     * @param {string} purchaseToken - 購買憑證
     * @returns {Promise<boolean>} 是否成功
     */
    async consumeGooglePlayPurchase(productId, purchaseToken) {
        try {
            if (!this.androidPublisher) {
                await this.initializeGooglePlay();
            }

            await this.androidPublisher.purchases.products.consume({
                packageName: this.packageName,
                productId: productId,
                token: purchaseToken,
            });

            console.log(`Google Play 購買已消耗: ${productId}`);
            return true;
        } catch (error) {
            console.error('消耗 Google Play 購買失敗:', error);
            return false;
        }
    }

    /**
     * 驗證 App Store 購買收據
     * @param {string} receiptData - Base64 編碼的收據資料
     * @returns {Promise<Object>} 驗證結果
     */
    async verifyAppStorePurchase(receiptData) {
        try {
            // 驗證必要參數
            if (!receiptData) {
                return {
                    valid: false,
                    error: '缺少收據資料',
                };
            }

            if (!this.appleSharedSecret) {
                console.warn('⚠️ APPLE_SHARED_SECRET 未設定，收據驗證可能失敗');
            }

            const requestBody = {
                'receipt-data': receiptData,
                'password': this.appleSharedSecret,
                'exclude-old-transactions': true,
            };

            // 先嘗試正式環境
            console.log('📡 向 App Store 正式環境發送驗證請求...');
            let response = await axios.post(this.appleVerifyUrl, requestBody);
            let result = response.data;

            // 如果是沙盒收據（狀態碼 21007），切換到沙盒環境重試
            if (result.status === 21007) {
                console.log('🔄 檢測到沙盒收據，切換到沙盒環境驗證...');
                response = await axios.post(
                    'https://sandbox.itunes.apple.com/verifyReceipt',
                    requestBody
                );
                result = response.data;
            }

            // 檢查驗證狀態
            // status: 0 = 成功
            if (result.status !== 0) {
                const statusMessages = {
                    21000: 'App Store 無法讀取您提供的 JSON 資料',
                    21002: 'receipt-data 屬性中的資料格式錯誤或遺失',
                    21003: '收據無法驗證',
                    21004: '您提供的共享密鑰與帳戶的共享密鑰不一致',
                    21005: '收據伺服器目前無法使用',
                    21006: '此收據有效，但訂閱已過期',
                    21008: '此收據來自測試環境，但發送到生產環境進行驗證',
                    21010: '此收據無法授權',
                };

                const errorMessage = statusMessages[result.status] || `未知錯誤，狀態碼: ${result.status}`;
                console.error(`❌ App Store 驗證失敗: ${errorMessage} (狀態碼: ${result.status})`);
                
                return {
                    valid: false,
                    error: errorMessage,
                    status: result.status,
                };
            }

            // 獲取最新的購買資訊
            // 優先使用 latest_receipt_info（包含所有交易）
            const latestReceipt = result.latest_receipt_info?.[0] || result.receipt?.in_app?.[0];

            if (!latestReceipt) {
                console.error('❌ 找不到購買資訊');
                console.error('   latest_receipt_info:', result.latest_receipt_info?.length || 0, '筆');
                console.error('   receipt.in_app:', result.receipt?.in_app?.length || 0, '筆');
                return {
                    valid: false,
                    error: '找不到購買資訊',
                    details: '收據驗證成功，但收據中沒有找到購買記錄',
                };
            }

            // 驗證購買資訊完整性
            if (!latestReceipt.product_id) {
                return {
                    valid: false,
                    error: '收據中缺少商品 ID',
                };
            }

            if (!latestReceipt.transaction_id) {
                return {
                    valid: false,
                    error: '收據中缺少交易 ID',
                };
            }

            console.log(`✅ App Store 收據驗證成功:`);
            console.log(`   商品 ID: ${latestReceipt.product_id}`);
            console.log(`   交易 ID: ${latestReceipt.transaction_id}`);
            console.log(`   原始交易 ID: ${latestReceipt.original_transaction_id || 'N/A'}`);

            return {
                valid: true,
                productId: latestReceipt.product_id,
                transactionId: latestReceipt.transaction_id,
                originalTransactionId: latestReceipt.original_transaction_id,
                purchaseDate: latestReceipt.purchase_date_ms,
            };
        } catch (error) {
            console.error('❌ App Store 收據驗證異常:', error.message);
            if (error.response) {
                console.error('   回應狀態:', error.response.status);
                console.error('   回應資料:', error.response.data);
            }
            return {
                valid: false,
                error: `驗證過程發生錯誤: ${error.message}`,
            };
        }
    }

    /**
     * 統一驗證介面
     * @param {string} platform - 平台 ('android' 或 'ios')
     * @param {Object} purchaseData - 購買資料
     * @returns {Promise<Object>} 驗證結果
     */
    async verifyPurchase(platform, purchaseData) {
        if (platform === 'android') {
            return await this.verifyGooglePlayPurchase(
                purchaseData.productId,
                purchaseData.purchaseToken
            );
        } else if (platform === 'ios') {
            return await this.verifyAppStorePurchase(purchaseData.receiptData);
        } else {
            return {
                valid: false,
                error: '不支援的平台',
            };
        }
    }

    /**
     * 消耗購買（標記為已處理）
     * @param {string} platform - 平台 ('android' 或 'ios')
     * @param {Object} purchaseData - 購買資料
     * @returns {Promise<boolean>} 是否成功
     */
    async consumePurchase(platform, purchaseData) {
        if (platform === 'android') {
            return await this.consumeGooglePlayPurchase(
                purchaseData.productId,
                purchaseData.purchaseToken
            );
        } else if (platform === 'ios') {
            // iOS 的消耗性商品不需要手動消耗
            return true;
        } else {
            return false;
        }
    }
}

module.exports = new IAPVerificationService();
