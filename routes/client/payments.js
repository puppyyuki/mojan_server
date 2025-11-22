const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const ecpayLib = require('../../lib/ecpay.js');

/**
 * POST /api/client/payments/ecpay/create
 * 建立綠界付款
 */
router.post('/ecpay/create', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { productId, cardAmount, price, playerId, description, paymentType } = req.body;

    console.log('📥 接收到的請求參數:');
    console.log('   productId:', productId);
    console.log('   cardAmount:', cardAmount);
    console.log('   price:', price);
    console.log('   playerId:', playerId);
    console.log('   description:', description);
    console.log('   paymentType:', paymentType);

    if (!productId || !cardAmount || !price || !playerId) {
      return errorResponse(res, '缺少必要參數', null, 400);
    }

    // 驗證產品是否存在
    const product = await prisma.roomCardProduct.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      return errorResponse(res, '產品不存在或已停用', null, 400);
    }

    // 驗證玩家是否存在
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 400);
    }

    // 建立臨時訂單記錄
    const merchantTradeNo = ecpayLib.generateMerchantTradeNo();
    const tempOrderData = {
      productId,
      cardAmount,
      price,
      playerId,
      description: description || `購買 ${cardAmount} 張房卡`,
    };

    // 建立綠界付款資料（使用傳入的 paymentType，預設為 'ALL'）
    const finalPaymentType = paymentType || 'ALL';
    const paymentData = ecpayLib.createEcpayPaymentData(
      price,
      tempOrderData.description,
      finalPaymentType,
      merchantTradeNo,
      tempOrderData
    );

    // 建立臨時訂單記錄（狀態為 PENDING，等待取號成功後更新）
    await prisma.roomCardOrder.create({
      data: {
        playerId,
        productId,
        merchantTradeNo,
        cardAmount,
        price,
        status: 'PENDING',
        paymentType: finalPaymentType,
        raw: {
          ...paymentData,
          tempOrderData,
        },
      },
    });

    // 建立支付表單 HTML
    const paymentFormHtml = ecpayLib.createEcpayPaymentForm(
      price,
      tempOrderData.description,
      finalPaymentType,
      paymentData
    );

    return successResponse(res, {
      paymentData,
      paymentFormHtml,
      paymentUrl: ecpayLib.getEcpayPaymentUrl(),
    }, '支付表單建立成功');
  } catch (error) {
    console.error('[Payments API] 建立支付資料失敗:', error);
    return errorResponse(res, '建立支付資料失敗', error.message, 500);
  }
});

/**
 * POST /api/client/payments/ecpay/payment-info
 * 綠界取號結果通知（PaymentInfoURL）
 */
router.post('/ecpay/payment-info', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    console.log('\n📬 收到綠界取號結果通知 (PaymentInfoURL)');

    // 解析表單資料
    let data = {};

    if (req.is('application/x-www-form-urlencoded')) {
      data = req.body;
    } else if (req.is('application/json')) {
      data = req.body;
    } else {
      data = req.body;
    }

    console.log('📦 通知內容:', JSON.stringify(data, null, 2));

    // 驗證檢查碼（確保資料不為空）
    if (!data || Object.keys(data).length === 0) {
      console.error('❌ PaymentInfoURL 資料為空');
      return res.status(200).send('1|OK'); // 綠界要求回傳 1|OK
    }

    // 驗證檢查碼
    const isValid = ecpayLib.verifyCheckMacValue({ ...data });
    if (!isValid) {
      console.error('❌ PaymentInfoURL CheckMacValue 驗證失敗');
      console.warn('⚠️  驗證失敗但仍繼續處理訂單更新（綠界要求）');
    } else {
      console.log('✅ PaymentInfoURL CheckMacValue 驗證成功');
    }

    // 即使驗證失敗也要處理訂單更新（綠界要求回傳 1|OK）
    try {
      // 解析付款資訊
      const paymentInfo = {
        virtualAccount: data.vAccount || null,
        bankCode: data.BankCode || null,
        expireDate: data.ExpireDate ? new Date(data.ExpireDate) : null,
      };

      // 更新訂單記錄
      const updateResult = await prisma.roomCardOrder.updateMany({
        where: { merchantTradeNo: data.MerchantTradeNo },
        data: {
          ecpayTradeNo: data.TradeNo || null,
          status: 'PENDING',
          paymentType: data.PaymentType || null,
          virtualAccount: paymentInfo.virtualAccount,
          bankCode: paymentInfo.bankCode,
          expireDate: paymentInfo.expireDate,
          raw: data,
        },
      });

      if (updateResult.count > 0) {
        console.log('✅ 訂單記錄已更新:', data.MerchantTradeNo);
      } else {
        console.warn('⚠️  找不到對應的訂單:', data.MerchantTradeNo);
      }
    } catch (updateError) {
      console.error('❌ 更新訂單記錄失敗:', updateError);
    }

    return res.status(200).send('1|OK');
  } catch (error) {
    console.error('處理 PaymentInfo 通知失敗:', error);
    return res.status(200).send('1|OK'); // 綠界要求回傳 1|OK
  }
});

/**
 * POST /api/client/payments/ecpay/notify
 * 綠界付款完成通知（ReturnURL）
 */
router.post('/ecpay/notify', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    console.log('\n🎉🎉🎉 SUCCESS: 收到綠界 Callback！🎉🎉🎉');

    // 解析表單資料
    const formData = {};
    for (const [key, value] of Object.entries(req.body)) {
      formData[key] = value;
    }

    const paymentResult = ecpayLib.parseEcpayResponse(formData);

    // 驗證 CheckMac
    const isValidCheckMac = ecpayLib.verifyCheckMacValue({ ...paymentResult });
    if (!isValidCheckMac) {
      console.error('❌ CheckMacValue 驗證失敗');
    } else {
      console.log('✅ CheckMacValue 驗證成功');
    }

    const rtnCode = paymentResult.RtnCode;
    const rtnMsg = paymentResult.RtnMsg;

    console.log('📊 綠界回傳狀態:', { rtnCode, rtnMsg });

    let newStatus = 'PENDING';
    if (rtnCode === '1') {
      // 付款成功
      newStatus = 'PAID';
      console.log('✅ 付款成功，更新狀態為 PAID');

      // 查找訂單
      const order = await prisma.roomCardOrder.findUnique({
        where: { merchantTradeNo: paymentResult.MerchantTradeNo },
        include: { player: true },
      });

      if (order && order.status !== 'PAID') {
        // 檢查是否為代理購買
        const isAgentPurchase = order.raw && typeof order.raw === 'object' && order.raw.isAgentPurchase === true;

        if (isAgentPurchase) {
          // 代理購買：更新代理的房卡數量
          console.log(`[代理購買] 為代理 ${order.playerId} 增加 ${order.cardAmount} 張房卡`);

          await prisma.player.update({
            where: { id: order.playerId },
            data: {
              cardCount: {
                increment: order.cardAmount,
              },
            },
          });

          console.log(`✅ 已為代理 ${order.playerId} 增加 ${order.cardAmount} 張房卡`);
        } else {
          // 一般玩家購買：更新玩家房卡數量
          await prisma.player.update({
            where: { id: order.playerId },
            data: {
              cardCount: {
                increment: order.cardAmount,
              },
            },
          });

          console.log(`✅ 已為玩家 ${order.playerId} 增加 ${order.cardAmount} 張房卡`);
        }
      }
    } else if (rtnCode === '10100073') {
      // 取號成功但未付款（ATM/超商等）
      newStatus = 'PENDING';
      console.log('⏳ 取號成功，維持 PENDING 狀態等待付款');
    } else {
      // 其他錯誤情況
      newStatus = 'FAILED';
      console.log('❌ 付款失敗，更新狀態為 FAILED:', { rtnCode, rtnMsg });
    }

    // 更新訂單狀態
    await prisma.roomCardOrder.updateMany({
      where: { merchantTradeNo: paymentResult.MerchantTradeNo },
      data: {
        ecpayTradeNo: paymentResult.TradeNo,
        status: newStatus,
        paymentType: paymentResult.PaymentType,
        paidAt: newStatus === 'PAID' ? new Date() : null,
        raw: paymentResult,
      },
    });

    return res.status(200).send('1|OK');
  } catch (error) {
    console.error('處理支付通知失敗:', error);
    return res.status(200).send('1|OK'); // 綠界要求回傳 1|OK
  }
});

module.exports = router;

