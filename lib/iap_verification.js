const { google } = require('googleapis');
const axios = require('axios');
const jwt = require('jsonwebtoken');

/**
 * 內購收據驗證服務
 * 處理 Google Play 和 App Store 的收據驗證
 */
class IAPVerificationService {
    constructor() {
        // Google Play 設定
        this.androidPublisher = null;
        this.packageName = process.env.ANDROID_PACKAGE_NAME || 'com.mojan.app';

        // App Store 設定（舊的 Receipt Validation API）
        this.appleSharedSecret = process.env.APPLE_SHARED_SECRET;
        this.appleVerifyUrl = process.env.APPLE_SANDBOX === 'true'
            ? 'https://sandbox.itunes.apple.com/verifyReceipt'
            : 'https://buy.itunes.apple.com/verifyReceipt';

        // App Store Connect API 設定（新的 App Store Server API）
        this.appStoreConnectIssuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
        this.appStoreConnectKeyId = process.env.APP_STORE_CONNECT_KEY_ID;
        this.appStoreConnectPrivateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
        this.appStoreConnectBundleId = process.env.APP_STORE_CONNECT_BUNDLE_ID || 'com.example.mojanApp';
        
        // 優先使用新的 App Store Server API
        this.useAppStoreServerAPI = !!(this.appStoreConnectIssuerId && this.appStoreConnectKeyId && this.appStoreConnectPrivateKey);
    }

    /**
     * 初始化 Google Play API
     */
    async initializeGooglePlay() {
        try {
            // 從環境變數或檔案載入服務帳號金鑰
            let serviceAccountKey;
            
            if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
                // 解析環境變數中的 JSON
                serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
                
                // 🔧 修復私鑰格式：確保換行符正確
                // Render.com 環境變數中，\n 可能被轉義為 \\n 或丟失
                if (serviceAccountKey.private_key) {
                    // 如果私鑰中的 \n 被轉義為 \\n，需要修復
                    serviceAccountKey.private_key = serviceAccountKey.private_key.replace(/\\n/g, '\n');
                    
                    // 確保私鑰以正確的格式開始和結束
                    if (!serviceAccountKey.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
                        console.error('⚠️ 警告：私鑰格式可能不正確');
                    }
                }
            } else {
                serviceAccountKey = require('../google-service-account.json');
            }

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
            console.error('錯誤詳情:', error.message);
            if (error.stack) {
                console.error('堆疊追蹤:', error.stack);
            }
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
     * 生成 App Store Connect API JWT Token
     * @returns {string} JWT Token
     */
    _generateAppStoreConnectJWT() {
        if (!this.appStoreConnectIssuerId || !this.appStoreConnectKeyId || !this.appStoreConnectPrivateKey) {
            throw new Error('缺少 App Store Connect API 設定');
        }

        // 修復私鑰格式（處理環境變數中的轉義）
        let privateKey = this.appStoreConnectPrivateKey.replace(/\\n/g, '\n');
        
        // 確保私鑰格式正確
        if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
            privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
        }

        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: this.appStoreConnectIssuerId,
            iat: now,
            exp: now + 1200, // 20 分鐘有效期
            aud: 'appstoreconnect-v1',
        };

        const token = jwt.sign(payload, privateKey, {
            algorithm: 'ES256',
            keyid: this.appStoreConnectKeyId,
        });

        return token;
    }

    /**
     * 使用 App Store Server API 驗證交易
     * @param {string} transactionId - 交易 ID
     * @returns {Promise<Object>} 驗證結果
     */
    async verifyAppStoreTransaction(transactionId) {
        try {
            if (!transactionId) {
                return {
                    valid: false,
                    error: '缺少交易 ID',
                };
            }

            // 生成 JWT Token
            const token = this._generateAppStoreConnectJWT();

            // 先嘗試正式環境
            const productionUrl = `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${transactionId}`;
            console.log('📡 使用 App Store Server API 驗證交易...');
            
            let response;
            try {
                response = await axios.get(productionUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });
            } catch (error) {
                // 如果是 404，可能是沙盒交易，嘗試沙盒環境
                if (error.response && error.response.status === 404) {
                    console.log('🔄 正式環境找不到交易，嘗試沙盒環境...');
                    const sandboxUrl = `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${transactionId}`;
                    response = await axios.get(sandboxUrl, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });
                } else {
                    throw error;
                }
            }

            const transaction = response.data;

            // 驗證交易狀態
            if (!transaction.signedTransactionInfo) {
                return {
                    valid: false,
                    error: '交易資料格式錯誤',
                };
            }

            // 解析 JWT 交易資訊（不需要驗證，因為已經從 Apple 伺服器獲取）
            const transactionInfo = jwt.decode(transaction.signedTransactionInfo);
            
            if (!transactionInfo) {
                return {
                    valid: false,
                    error: '無法解析交易資訊',
                };
            }

            // 檢查 Bundle ID
            if (transactionInfo.bundleId !== this.appStoreConnectBundleId) {
                return {
                    valid: false,
                    error: `Bundle ID 不匹配: 期望 ${this.appStoreConnectBundleId}, 實際 ${transactionInfo.bundleId}`,
                };
            }

            // 檢查交易類型（應該是一次性購買）
            if (transactionInfo.type !== 'Auto-Renewable Subscription' && 
                transactionInfo.type !== 'Non-Consumable' && 
                transactionInfo.type !== 'Consumable') {
                console.warn(`⚠️ 未知的交易類型: ${transactionInfo.type}`);
            }

            // 檢查是否已撤銷
            if (transactionInfo.revocationDate) {
                return {
                    valid: false,
                    error: '交易已被撤銷',
                    revoked: true,
                    revocationDate: transactionInfo.revocationDate,
                };
            }

            console.log(`✅ App Store Server API 驗證成功:`);
            console.log(`   商品 ID: ${transactionInfo.productId}`);
            console.log(`   交易 ID: ${transactionInfo.transactionId}`);
            console.log(`   原始交易 ID: ${transactionInfo.originalTransactionId || 'N/A'}`);

            return {
                valid: true,
                productId: transactionInfo.productId,
                transactionId: transactionInfo.transactionId,
                originalTransactionId: transactionInfo.originalTransactionId,
                purchaseDate: transactionInfo.purchaseDate,
                environment: transactionInfo.environment, // 'Production' 或 'Sandbox'
            };
        } catch (error) {
            console.error('❌ App Store Server API 驗證異常:', error.message);
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
     * 驗證 App Store 購買收據（舊的 Receipt Validation API）
     * @param {string} receiptData - Base64 編碼的收據資料
     * @returns {Promise<Object>} 驗證結果
     */
    async verifyAppStorePurchaseLegacy(receiptData) {
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
     * 驗證 App Store 購買（自動選擇新舊 API）
     * @param {string} transactionId - 交易 ID（新 API）
     * @param {string} receiptData - 收據資料（舊 API，備用）
     * @returns {Promise<Object>} 驗證結果
     */
    async verifyAppStorePurchase(transactionId, receiptData) {
        // 優先使用新的 App Store Server API
        if (this.useAppStoreServerAPI && transactionId) {
            console.log('📱 使用 App Store Server API 驗證...');
            return await this.verifyAppStoreTransaction(transactionId);
        }

        // 降級使用舊的 Receipt Validation API
        if (receiptData) {
            console.log('📱 使用舊的 Receipt Validation API 驗證...');
            console.warn('⚠️ 建議升級到 App Store Server API（舊 API 將於 2025 年 11 月停止支援）');
            return await this.verifyAppStorePurchaseLegacy(receiptData);
        }

        return {
            valid: false,
            error: '缺少交易 ID 或收據資料',
        };
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
            return await this.verifyAppStorePurchase(
                purchaseData.transactionId,
                purchaseData.receiptData
            );
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
