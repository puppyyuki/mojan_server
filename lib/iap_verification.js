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
        this.packageName = process.env.ANDROID_PACKAGE_NAME || 'com.example.mojan_app';

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
            const requestBody = {
                'receipt-data': receiptData,
                'password': this.appleSharedSecret,
                'exclude-old-transactions': true,
            };

            // 先嘗試正式環境
            let response = await axios.post(this.appleVerifyUrl, requestBody);
            let result = response.data;

            // 如果是沙盒收據，切換到沙盒環境重試
            if (result.status === 21007) {
                console.log('切換到沙盒環境驗證');
                response = await axios.post(
                    'https://sandbox.itunes.apple.com/verifyReceipt',
                    requestBody
                );
                result = response.data;
            }

            // 檢查驗證狀態
            // status: 0 = 成功
            if (result.status !== 0) {
                return {
                    valid: false,
                    error: `App Store 驗證失敗，狀態碼: ${result.status}`,
                    status: result.status,
                };
            }

            // 獲取最新的購買資訊
            const latestReceipt = result.latest_receipt_info?.[0] || result.receipt?.in_app?.[0];

            if (!latestReceipt) {
                return {
                    valid: false,
                    error: '找不到購買資訊',
                };
            }

            return {
                valid: true,
                productId: latestReceipt.product_id,
                transactionId: latestReceipt.transaction_id,
                originalTransactionId: latestReceipt.original_transaction_id,
                purchaseDate: latestReceipt.purchase_date_ms,
            };
        } catch (error) {
            console.error('App Store 收據驗證失敗:', error);
            return {
                valid: false,
                error: error.message,
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
