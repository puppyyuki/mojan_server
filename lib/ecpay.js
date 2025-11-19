// 綠界站內付2.0 金流串接服務
const crypto = require('crypto');

// 綠界金流設定
const ecpayConfig = {
  MerchantID: process.env.ECPAY_MERCHANT_ID || '3468906',
  HashKey: process.env.ECPAY_HASH_KEY || 'ttJrguIVdSb0IsT',
  HashIV: process.env.ECPAY_HASH_IV || 'hHSu2N034m1QdDBd',
  IsProduction: process.env.ECPAY_IS_PRODUCTION === 'true'
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
  paymentType = 'ATM',
  customMerchantTradeNo,
  tempOrderData
) {
  const merchantTradeNo = customMerchantTradeNo || generateMerchantTradeNo();
  const merchantTradeDate = generateMerchantTradeDate();
  
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
  const frontBase = process.env.NEXT_PUBLIC_BASE_URL || callbackBase;
  
  // 輸出調試資訊
  console.log('🔧 綠界回調網址設置:');
  console.log('   callbackBase:', callbackBase);
  console.log('   returnUrl:', returnUrl);
  console.log('   paymentInfoUrl:', paymentInfoUrl);
  
  // 基礎支付資料 - 站內付2.0格式
  const basePaymentData = {
    MerchantID: ecpayConfig.MerchantID,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: merchantTradeDate,
    TotalAmount: amount,
    TradeDesc: description,
    ItemName: description,
    // 使用 ALL 讓用戶選擇付款方式，然後用 IgnorePayment 限制不需要的選項
    // 這樣可以確保 ATM、CVS、BARCODE 等選項都能顯示
    ChoosePayment: 'ALL',
    PaymentType: 'aio', // 重要：綠界要求這個參數
    ReturnURL: returnUrl,
    PaymentInfoURL: paymentInfoUrl,
    ClientBackURL: `${frontBase}/shop`,
    OrderResultURL: `${frontBase}/shop`,
    // 隱藏不需要的付款方式，但保留 ATM、CVS、BARCODE
    // 注意：不要隱藏 ATM，否則會出現錯誤 10200141
    IgnorePayment: 'Credit#AndroidPay#GooglePay#WebATM#ApplePay',
    EncryptType: 1,
  };

  // 根據付款方式添加特定參數（即使 ChoosePayment 是 ALL，這些參數也會在用戶選擇對應方式時生效）
  if (paymentType === 'ATM') {
    basePaymentData.ExpireDate = 3; // 3天繳費期限（ATM 專用）
  } else if (paymentType === 'CVS') {
    basePaymentData.StoreExpireDate = 1; // 超商代碼繳費期限(天)
  } else if (paymentType === 'BARCODE') {
    basePaymentData.StoreExpireDate = 1; // 超商條碼繳費期限(天)
  }

  // 計算 CheckMacValue
  basePaymentData.CheckMacValue = generateCheckMacValue(basePaymentData);
  
  return basePaymentData;
}

// 建立綠界站內付2.0 支付表單 HTML
function createEcpayPaymentForm(
  amount,
  description,
  paymentType = 'ATM'
) {
  const paymentData = createEcpayPaymentData(amount, description, paymentType);
  
  // 建立 HTML 表單 - 站內付2.0格式
  let formHtml = `
    <form id="ecpay-form" method="post" action="${getEcpayPaymentUrl()}">
  `;
  
  // 添加所有參數
  Object.entries(paymentData).forEach(([key, value]) => {
    formHtml += `<input type="hidden" name="${key}" value="${value}">`;
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

