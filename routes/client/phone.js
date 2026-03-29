const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function otpPepper() {
  return process.env.PHONE_OTP_SECRET || process.env.TWILIO_AUTH_TOKEN || 'dev-only-pepper';
}

function hashOtp(playerId, pendingE164, code) {
  return crypto
    .createHash('sha256')
    .update(`${playerId}|${pendingE164}|${code}|${otpPepper()}`)
    .digest('hex');
}

/** 台灣手機 -> E.164 +886… */
function normalizeTaiwanMobile(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/[\s-]/g, '');
  if (!s) return null;
  if (s.startsWith('+886')) {
    const rest = s.slice(4).replace(/^0+/, '');
    if (!/^[9]\d{8}$/.test(rest)) return null;
    return `+886${rest}`;
  }
  if (s.startsWith('886')) {
    const rest = s.slice(3).replace(/^0+/, '');
    if (!/^[9]\d{8}$/.test(rest)) return null;
    return `+886${rest}`;
  }
  if (s.startsWith('0')) {
    const rest = s.slice(1);
    if (!/^[9]\d{8}$/.test(rest)) return null;
    return `+886${rest}`;
  }
  if (/^[9]\d{8}$/.test(s)) {
    return `+886${s}`;
  }
  return null;
}

function random5Digit() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

router.post('/send-code', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId, phone } = req.body || {};

    if (!playerId || !phone) {
      return errorResponse(res, '缺少 playerId 或 phone', null, 400);
    }

    const e164 = normalizeTaiwanMobile(phone);
    if (!e164) {
      return errorResponse(res, '請輸入有效的台灣手機號碼', null, 400);
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
      console.error('[Phone API] Twilio 環境變數未設定完整');
      return errorResponse(res, '簡訊服務未設定', null, 503);
    }

    const player = await prisma.player.findUnique({ where: { id: String(playerId) } });
    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    if (player.phoneE164) {
      return errorResponse(res, '已綁定手機', null, 400);
    }

    const taken = await prisma.player.findFirst({
      where: { phoneE164: e164, NOT: { id: player.id } },
    });
    if (taken) {
      return errorResponse(res, '此手機號已被其他帳號使用', null, 400);
    }

    const now = new Date();
    if (player.phoneOtpLastSentAt) {
      const elapsed = now.getTime() - new Date(player.phoneOtpLastSentAt).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return errorResponse(res, `請稍候 ${waitSec} 秒後再發送`, null, 429);
      }
    }

    const code = random5Digit();
    const otpHash = hashOtp(player.id, e164, code);
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    await prisma.player.update({
      where: { id: player.id },
      data: {
        phoneOtpHash: otpHash,
        phoneOtpExpiresAt: expiresAt,
        phoneOtpPendingE164: e164,
        phoneOtpLastSentAt: now,
      },
    });

    const twilio = require('twilio')(accountSid, authToken);
    const msgBody = `${code} 是你的伍參麻將驗證碼，3分鐘內有效。`;
    const createPayload = {
      body: msgBody,
      to: e164,
    };
    if (messagingServiceSid) {
      createPayload.messagingServiceSid = messagingServiceSid;
    } else {
      createPayload.from = fromNumber;
    }

    await twilio.messages.create(createPayload);

    return successResponse(res, { success: true }, '驗證碼已發送');
  } catch (error) {
    console.error('[Phone API] 發送驗證碼失敗:', error);
    return errorResponse(res, error.message || '發送驗證碼失敗', null, 500);
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId, code } = req.body || {};

    if (!playerId || code == null || String(code).trim() === '') {
      return errorResponse(res, '缺少 playerId 或驗證碼', null, 400);
    }

    const codeStr = String(code).trim();
    if (!/^\d{5}$/.test(codeStr)) {
      return errorResponse(res, '請輸入 5 位數驗證碼', null, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { id: String(playerId) } });
      if (!player) {
        return { ok: false, status: 404, message: '玩家不存在' };
      }
      if (player.phoneE164) {
        return { ok: false, status: 400, message: '已綁定手機' };
      }
      if (!player.phoneOtpPendingE164 || !player.phoneOtpHash || !player.phoneOtpExpiresAt) {
        return { ok: false, status: 400, message: '請先發送驗證碼' };
      }
      if (new Date() > new Date(player.phoneOtpExpiresAt)) {
        return { ok: false, status: 400, message: '驗證碼已過期，請重新發送' };
      }

      const expected = hashOtp(player.id, player.phoneOtpPendingE164, codeStr);
      if (expected !== player.phoneOtpHash) {
        return { ok: false, status: 400, message: '驗證碼錯誤' };
      }

      const pending = player.phoneOtpPendingE164;
      const taken = await tx.player.findFirst({
        where: { phoneE164: pending, NOT: { id: player.id } },
      });
      if (taken) {
        return { ok: false, status: 400, message: '此手機號已被其他帳號使用' };
      }

      const verifiedAt = new Date();
      const adminUser = await tx.user.findFirst({ where: { role: 'ADMIN' } });

      let referrerRewardCards = 0;
      let phoneReferrerRewardGiven = player.phoneReferrerRewardGiven;

      if (player.referrerId && !player.phoneReferrerRewardGiven) {
        const referrer = await tx.player.findUnique({ where: { id: player.referrerId } });
        if (referrer) {
          const refReward = 2;
          const prevRefCards = referrer.cardCount;
          const updatedRef = await tx.player.update({
            where: { id: referrer.id },
            data: {
              cardCount: { increment: refReward },
              referralCount: { increment: 1 },
            },
          });
          if (adminUser) {
            await tx.cardRechargeRecord.create({
              data: {
                playerId: referrer.id,
                adminUserId: adminUser.id,
                amount: refReward,
                previousCount: prevRefCards,
                newCount: prevRefCards + refReward,
                note: '推薦獎勵-被推薦人已綁定手機',
              },
            });
          }
          referrerRewardCards = refReward;
          phoneReferrerRewardGiven = true;
          if (updatedRef.referralCount >= 20 && !updatedRef.isAgent) {
            await tx.player.update({
              where: { id: referrer.id },
              data: { isAgent: true },
            });
          }
        }
      }

      const bindReward = 8;
      const prevBindCards = player.cardCount;

      await tx.player.update({
        where: { id: player.id },
        data: {
          phoneE164: pending,
          phoneVerifiedAt: verifiedAt,
          phoneOtpHash: null,
          phoneOtpExpiresAt: null,
          phoneOtpPendingE164: null,
          phoneReferrerRewardGiven,
          cardCount: { increment: bindReward },
        },
      });

      if (adminUser) {
        await tx.cardRechargeRecord.create({
          data: {
            playerId: player.id,
            adminUserId: adminUser.id,
            amount: bindReward,
            previousCount: prevBindCards,
            newCount: prevBindCards + bindReward,
            note: '手機綁定獎勵',
          },
        });
      }

      return {
        ok: true,
        phoneE164: pending,
        referrerRewardCards,
        bindRewardCards: bindReward,
      };
    });

    if (!result.ok) {
      return errorResponse(res, result.message, null, result.status);
    }

    return successResponse(
      res,
      {
        success: true,
        phoneE164: result.phoneE164,
        referrerRewardCards: result.referrerRewardCards,
        bindRewardCards: result.bindRewardCards,
      },
      '手機綁定成功'
    );
  } catch (error) {
    console.error('[Phone API] 驗證失敗:', error);
    return errorResponse(res, '驗證失敗', null, 500);
  }
});

module.exports = router;
