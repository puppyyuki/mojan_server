// 綠界站內付2.0 金流串接服務
const crypto = require('crypto');

// 導出類型定義（CommonJS）
module.exports = {};

export interface EcpayPaymentData {
  MerchantID: string;           // 商店代號
  MerchantTradeNo: string;      // 商店訂單編號
  MerchantTradeDate: string;    // 商店訂單建立時間
  TotalAmount: number;          // 交易金額
  TradeDesc: string;            // 交易描述
  ItemName: string;             // 商品名稱
  ReturnURL: string;            // 付款完成通知回傳網址
  PaymentInfoURL: string;       // 取號結果通知回傳網址
  ClientBackURL: string;        // 付款完成後導回商店網址
  OrderResultURL: string;       // 付款完成後導回商店網址
  ChoosePayment: string;        // 選擇預設付款方式
  EncryptType: number;          // 加密類型
  CheckMacValue: string;        // 檢查碼
  ExpireDate?: number;          // 繳費期限 (可選)
  IgnorePayment?: string;       // 隱藏付款方式 (可選)
  PaymentType: string;          // 付款類型
}

export interface EcpayConfig {
  MerchantID: string;
  HashKey: string;
  HashIV: string;
  IsProduction: boolean;
}

// 綠界金流設定
export const ecpayConfig: EcpayConfig = {
  MerchantID: process.env.ECPAY_MERCHANT_ID || '3468906',
  HashKey: process.env.ECPAY_HASH_KEY || 'ttJrguIVdSb0IsT',
  HashIV: process.env.ECPAY_HASH_IV || 'hHSu2N034m1QdDBd',
  IsProduction: process.env.ECPAY_IS_PRODUCTION === 'true'
};

// 生成商店訂單編號
export function generateMerchantTradeNo(): string {
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
export function generateMerchantTradeDate(): string {
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
export function generateCheckMacValue(data: Record<string, any>): string {
  // 0. 排除 CheckMacValue 自身
  const clone: Record<string, any> = { ...data };
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
export function createEcpayPaymentData(
  amount: number,
  description: string,
  paymentType: string = 'ATM',
  customMerchantTradeNo?: string,
  tempOrderData?: any
): EcpayPaymentData {
  const merchantTradeNo = customMerchantTradeNo || generateMerchantTradeNo();
  const merchantTradeDate = generateMerchantTradeDate();
  
  // 決定回呼網址
  const callbackBase = process.env.ECPAY_CALLBACK_BASE || process.env.NEXT_PUBLIC_BASE_URL || 'https://mojan-server-0kuv.onrender.com';
  const returnUrl = `${callbackBase}/api/ecpay/notify`;
  const paymentInfoUrl = `${callbackBase}/api/ecpay/payment-info`;
  const frontBase = process.env.NEXT_PUBLIC_BASE_URL || 'https://mojan-server-0kuv.onrender.com';
  
  // 基礎支付資料 - 站內付2.0格式
  const basePaymentData: any = {
    MerchantID: ecpayConfig.MerchantID,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: merchantTradeDate,
    TotalAmount: amount,
    TradeDesc: description,
    ItemName: description,
    ChoosePayment: paymentType,
    PaymentType: 'aio', // 重要：綠界要求這個參數
    ReturnURL: returnUrl,
    PaymentInfoURL: paymentInfoUrl,
    ClientBackURL: `${frontBase}/shop`,
    OrderResultURL: `${frontBase}/shop`,
    IgnorePayment: 'Credit#AndroidPay#GooglePay#WebATM#ApplePay',
    EncryptType: 1,
  };

  // 根據付款方式添加特定參數
  if (paymentType === 'ATM') {
    basePaymentData.ExpireDate = 3; // 3天繳費期限
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
export function createEcpayPaymentForm(
  amount: number,
  description: string,
  paymentType: string = 'ATM'
): string {
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
export function verifyCheckMacValue(data: Record<string, any>): boolean {
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
export function getEcpayPaymentUrl(): string {
  return ecpayConfig.IsProduction 
    ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
}

// 解析綠界回傳資料
export function parseEcpayResponse(formData: any) {
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

