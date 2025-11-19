// 綠界站內付2.0 金流串接服務
const crypto = require('crypto');

// 綠界金流設定（正式環境）
const ecpayConfig = {
  MerchantID: process.env.ECPAY_MERCHANT_ID || '3468906',
  HashKey: process.env.ECPAY_HASH_KEY || 'ttJrgurIVdSb0IsT',  // 修正：用戶提供的正確 HashKey
  HashIV: process.env.ECPAY_HASH_IV || 'hHSu2N034m1QdDBd',
  // 正式環境設置（與 house_work_1020 一致）
  IsProduction: true
};

// 生成商店訂單編號
function generateMerchantTradeNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  return `RC${year}${month}${day}${hours}${minutes}${seconds}${random}`;
}

// 生成商店訂單建立時間
function generateMerchantTradeDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

// 簡化的 CheckMacValue 計算方法
function generateCheckMacValue(data) {
  // 0. 排除 CheckMacValue 自身
  const clone = { ...data };
  delete clone.CheckMacValue;

  // 1. 依參數名稱 A-Z 排序
  const sortedKeys = Object.keys(clone).sort();

  // 2. 組合參數字串 key=value&key=value...
  const paramString = sortedKeys
    .filter((key) => clone[key] !== '' && clone[key] !== undefined && clone[key] !== null)
    .map((key) => `${key}=${clone[key]}`)
    .join('&');

  // 3. 依規格前後加上 HashKey / HashIV
  const rawString = `HashKey=${ecpayConfig.HashKey}&${paramString}&HashIV=${ecpayConfig.HashIV}`;

  // 4. URL Encode 後轉小寫，並依綠界規格替換特定字元
  const encoded = encodeURIComponent(rawString)
    .toLowerCase()
    // 保留特定符號 - _ . * () 與空白轉 +
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, '+');

  // 5. SHA256 並輸出大寫十六進位
  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

  // 建立綠界站內付2.0 支付資料
function createEcpayPaymentData(
  amount,
  description,
  paymentType = 'ALL',  // 與 house_work_1020 一致，預設為 'ALL'
  customMerchantTradeNo,
  tempOrderData
) {
  const merchantTradeNo = customMerchantTradeNo || generateMerchantTradeNo();
  const merchantTradeDate = generateMerchantTradeDate();
  
  // 調試：確認接收到的參數
  console.log('🔧 createEcpayPaymentData 接收參數:');
  console.log('   amount:', amount);
  console.log('   description:', description);
  console.log('   paymentType (傳入):', paymentType);
  console.log('   paymentType (類型):', typeof paymentType);
  
  // 決定回呼網址
  // 注意：綠界無法回調 localhost，必須使用公網 URL
  // 可以直接使用伺服器的正式網址（如 https://mojan-server-0kuv.onrender.com）
  let callbackBase = process.env.ECPAY_CALLBACK_BASE || process.env.NEXT_PUBLIC_BASE_URL;
  
  // 如果 callbackBase 包含 localhost，提示使用公網 URL
  if (callbackBase && (callbackBase.includes('localhost') || callbackBase.includes('127.0.0.1'))) {
    console.warn('⚠️  警告：localhost 無法接收綠界回調！');
    console.warn('   請設置 ECPAY_CALLBACK_BASE 環境變數為伺服器正式網址');
    console.warn('   例如：ECPAY_CALLBACK_BASE=https://mojan-server-0kuv.onrender.com');
  }
  
  // 如果沒有設置或包含 localhost，使用預設的公網 URL（伺服器正式網址）
  if (!callbackBase || callbackBase.includes('localhost') || callbackBase.includes('127.0.0.1')) {
    callbackBase = 'https://mojan-server-0kuv.onrender.com';
    console.log('✅ 使用預設回調網址:', callbackBase);
  }
  
  const returnUrl = `${callbackBase}/api/ecpay/notify`;
  const paymentInfoUrl = `${callbackBase}/api/ecpay/payment-info`;
  
  // 前端應用 URL（Flutter Web 應用）
  // 優先使用環境變數，否則使用預設的 Flutter 應用 URL
  const frontBase = process.env.FRONTEND_URL || process.env.FLUTTER_APP_URL || 'https://mojan-app.onrender.com';
  
  // 輸出調試資訊
  console.log('🔧 綠界回調網址設置:');
  console.log('   callbackBase:', callbackBase);
  console.log('   returnUrl:', returnUrl);
  console.log('   paymentInfoUrl:', paymentInfoUrl);
  console.log('   frontBase (Flutter App):', frontBase);
  
  // 基礎支付資料 - 站內付2.0格式
  // 完全參考 house_work_1020 的實作方式
  const basePaymentData = {
    MerchantID: ecpayConfig.MerchantID,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: merchantTradeDate,
    TotalAmount: Number(amount), // 確保是數字類型（與 house_work_1020 一致）
    TradeDesc: description,
    ItemName: description,
    ChoosePayment: paymentType, // 與 house_work_1020 一致，直接使用傳入值
    PaymentType: 'aio', // 重要：綠界要求這個參數
    ReturnURL: returnUrl,
    PaymentInfoURL: paymentInfoUrl,
    // Flutter Web 應用的路由（使用 # 路由或直接使用根路徑）
    // 注意：Flutter Web 使用客戶端路由，所以可能需要使用 #/shop 或直接返回根路徑
    ClientBackURL: frontBase,  // 返回 Flutter 應用首頁，由應用處理路由
    OrderResultURL: frontBase,  // 返回 Flutter 應用首頁，由應用處理路由
    // 暫時移除 IgnorePayment 以測試商店實際開啟的付款方式
    // 如果商店沒有開啟 ATM/CVS/BARCODE，IgnorePayment 會導致錯誤 10100300
    // IgnorePayment: 'Credit#AndroidPay#GooglePay#WebATM#ApplePay',
    EncryptType: 1,
  };

  // 注意：不能直接在綠界支付資料中加入自定義參數
  // 這些資訊會透過 PaymentInfoURL 的 POST 請求傳遞

  // 根據付款方式添加特定參數（與 house_work_1020 完全一致）
  if (paymentType === 'ATM') {
    basePaymentData.ExpireDate = 3;
  } else if (paymentType === 'CVS') {
    basePaymentData.StoreExpireDate = 1; // 超商代碼繳費期限(天)
  } else if (paymentType === 'BARCODE') {
    basePaymentData.StoreExpireDate = 1; // 超商條碼繳費期限(天)
  }

  // 計算 CheckMacValue
  basePaymentData.CheckMacValue = generateCheckMacValue(basePaymentData);
  
  // 調試資訊（與 house_work_1020 一致）
  console.log('🔧 綠界支付資料建立完成:');
  console.log('   📋 訂單編號:', basePaymentData.MerchantTradeNo);
  console.log('   💰 金額:', basePaymentData.TotalAmount);
  console.log('   📄 描述:', basePaymentData.TradeDesc);
  console.log('   🎯 付款方式:', basePaymentData.ChoosePayment);
  console.log('   🚫 IgnorePayment:', basePaymentData.IgnorePayment);
  console.log('   📅 ExpireDate:', basePaymentData.ExpireDate);
  console.log('   🔐 CheckMacValue:', basePaymentData.CheckMacValue);
  console.log('   📝 參數數量:', Object.keys(basePaymentData).length);
  console.log('   📋 所有參數:', Object.keys(basePaymentData).sort().join(', '));
  
  return basePaymentData;
}

// 建立綠界站內付2.0 支付表單 HTML
function createEcpayPaymentForm(
  amount,
  description,
  paymentType = 'ATM',
  paymentData = null
) {
  // 如果沒有提供 paymentData，則重新生成（向後兼容）
  const finalPaymentData = paymentData || createEcpayPaymentData(amount, description, paymentType);
  
  // 建立 HTML 表單 - 站內付2.0格式
  let formHtml = `
    <form id="ecpay-form" method="post" action="${getEcpayPaymentUrl()}">
  `;
  
  // 添加所有參數
  Object.entries(finalPaymentData).forEach(([key, value]) => {
    // 確保值被正確轉義
    const escapedValue = String(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    formHtml += `<input type="hidden" name="${key}" value="${escapedValue}">`;
  });
  
  formHtml += `
    </form>
    <script>
      document.getElementById('ecpay-form').submit();
    </script>
  `;
  
  return formHtml;
}

// 驗證綠界回傳的 CheckMacValue
function verifyCheckMacValue(data) {
  try {
    const receivedCheckMacValue = data.CheckMacValue;
    delete data.CheckMacValue; // 移除 CheckMacValue 再計算
    
    const calculatedCheckMacValue = generateCheckMacValue(data);
    
    return receivedCheckMacValue === calculatedCheckMacValue;
  } catch (error) {
    console.error('CheckMacValue 驗證失敗:', error);
    return false;
  }
}

// 綠界站內付2.0 支付網址
function getEcpayPaymentUrl() {
  return ecpayConfig.IsProduction 
    ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
}

// 解析綠界回傳資料
function parseEcpayResponse(formData) {
  return {
    MerchantID: formData.MerchantID || formData.get?.('MerchantID')?.toString() || '',
    MerchantTradeNo: formData.MerchantTradeNo || formData.get?.('MerchantTradeNo')?.toString() || '',
    PaymentDate: formData.PaymentDate || formData.get?.('PaymentDate')?.toString() || '',
    PaymentType: formData.PaymentType || formData.get?.('PaymentType')?.toString() || '',
    PaymentTypeChargeFee: formData.PaymentTypeChargeFee || formData.get?.('PaymentTypeChargeFee')?.toString() || '',
    RtnCode: formData.RtnCode || formData.get?.('RtnCode')?.toString() || '',
    RtnMsg: formData.RtnMsg || formData.get?.('RtnMsg')?.toString() || '',
    SimulatePaid: formData.SimulatePaid || formData.get?.('SimulatePaid')?.toString() || '',
    TradeAmt: formData.TradeAmt || formData.get?.('TradeAmt')?.toString() || '',
    TradeDate: formData.TradeDate || formData.get?.('TradeDate')?.toString() || '',
    TradeNo: formData.TradeNo || formData.get?.('TradeNo')?.toString() || '',
    CheckMacValue: formData.CheckMacValue || formData.get?.('CheckMacValue')?.toString() || '',
    // ATM 相關
    vAccount: formData.vAccount || formData.get?.('vAccount')?.toString() || '',
    BankCode: formData.BankCode || formData.get?.('BankCode')?.toString() || '',
    ExpireDate: formData.ExpireDate || formData.get?.('ExpireDate')?.toString() || '',
  };
}

module.exports = {
  generateMerchantTradeNo,
  generateMerchantTradeDate,
  generateCheckMacValue,
  createEcpayPaymentData,
  createEcpayPaymentForm,
  verifyCheckMacValue,
  getEcpayPaymentUrl,
  parseEcpayResponse,
  ecpayConfig,
};

