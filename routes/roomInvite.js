const express = require('express');
const router = express.Router();

const APP_CUSTOM_SCHEME = 'com.mojan.app';
const APP_JOIN_HOST = 'join';

/**
 * 從 /r?r=12345 或 /r/r=12345 等路徑解析房號（5–6 位數字）。
 */
function parseRoomIdFromRequest(req) {
  const q = req.query?.r ?? req.query?.room ?? req.query?.roomId;
  if (q != null && String(q).trim()) {
    const fromQuery = String(q).trim();
    const m = fromQuery.match(/(\d{5,6})/);
    if (m) return m[1];
  }
  const rawPath = (req.path || '').replace(/^\/+/, '');
  if (!rawPath) return null;
  const pathMatch = rawPath.match(/(?:^|[/?&=])r=(\d{5,6})(?:$|[/?&])/i);
  if (pathMatch) return pathMatch[1];
  const digitsOnly = rawPath.match(/^(\d{5,6})$/);
  if (digitsOnly) return digitsOnly[1];
  return null;
}

function buildDeepLinkUrls(roomId, req) {
  const fp = req.get('x-forwarded-proto');
  const proto = fp ? fp.split(',')[0].trim() : req.protocol || 'https';
  const fh = req.get('x-forwarded-host');
  const host = fh ? fh.split(',')[0].trim() : req.get('host');
  const webUrl = host ? `${proto}://${host}/r?r=${encodeURIComponent(roomId)}` : `/r?r=${encodeURIComponent(roomId)}`;
  const appUrl = `${APP_CUSTOM_SCHEME}://${APP_JOIN_HOST}?r=${encodeURIComponent(roomId)}`;
  return { webUrl, appUrl };
}

function renderInviteHtml({ roomId, webUrl, appUrl, title }) {
  const safeTitle = title || '伍參麻將 — 加入房間';
  const safeRoom = String(roomId).replace(/[<>&"']/g, '');
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="房號 ${safeRoom}，點擊開啟伍參麻將並加入房間" />
  <meta property="og:url" content="${webUrl}" />
  <style>
    body { font-family: system-ui, sans-serif; background: #1a2e1a; color: #f5f5f5; margin: 0; padding: 24px; text-align: center; }
    .card { max-width: 420px; margin: 48px auto; padding: 24px; background: #243d24; border-radius: 12px; }
    a.btn { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #c9a227; color: #1a2e1a; text-decoration: none; border-radius: 8px; font-weight: 600; }
    p { line-height: 1.6; opacity: 0.9; }
  </style>
  <script>
    (function () {
      var appUrl = ${JSON.stringify(appUrl)};
      var webUrl = ${JSON.stringify(webUrl)};
      function openApp() {
        window.location.href = appUrl;
        setTimeout(function () { window.location.href = webUrl; }, 1200);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', openApp);
      } else {
        openApp();
      }
    })();
  </script>
</head>
<body>
  <div class="card">
    <h1>伍參麻將</h1>
    <p>房號：<strong>${safeRoom}</strong></p>
    <p>正在開啟 App…若未自動跳轉，請點下方按鈕。</p>
    <a class="btn" href="${appUrl}">開啟遊戲加入房間</a>
    <p style="font-size:12px;margin-top:24px;">Safari：點右上角「打開」→ 選擇在 App 中開啟</p>
  </div>
</body>
</html>`;
}

router.get(['/', '/*'], async (req, res) => {
  const roomId = parseRoomIdFromRequest(req);
  if (!roomId) {
    res.status(400).type('text/plain; charset=utf-8').send('缺少房號參數（例：/r?r=123456）');
    return;
  }

  const { webUrl, appUrl } = buildDeepLinkUrls(roomId, req);
  let title = `伍參麻將 房號 ${roomId}`;
  try {
    const prisma = req.app?.locals?.prisma;
    if (prisma) {
      const room = await prisma.room.findUnique({
        where: { roomId },
        select: { status: true, gameSettings: true },
      });
      if (!room) {
        res
          .status(404)
          .type('text/html; charset=utf-8')
          .send(
            renderInviteHtml({
              roomId,
              webUrl,
              appUrl,
              title: '房間已結束',
            }).replace(
              '正在開啟 App',
              '房間不存在或已結束。若已安裝 App，仍可嘗試開啟（可能無法加入）'
            )
          );
        return;
      }
      if (room.status && room.status !== 'WAITING') {
        res
          .status(410)
          .type('text/html; charset=utf-8')
          .send(
            renderInviteHtml({
              roomId,
              webUrl,
              appUrl,
              title: '房間已結束',
            }).replace('正在開啟 App', '此房間已結束或無法再加入')
          );
        return;
      }
      const gs = room.gameSettings && typeof room.gameSettings === 'object' ? room.gameSettings : {};
      const gameType = gs.game_type === 'SOUTHERN' ? '台灣南部麻將' : '台灣北部麻將';
      const rounds = gs.rounds === 4 ? 4 : gs.rounds === 2 ? 2 : 1;
      title = `${gameType} 房號:${roomId}(${rounds}圈)`;
    }
  } catch (e) {
    console.error('[roomInvite] lookup failed:', e?.message ?? e);
  }

  res.status(200).type('text/html; charset=utf-8').send(
    renderInviteHtml({ roomId, webUrl, appUrl, title })
  );
});

module.exports = router;
module.exports.parseRoomIdFromRequest = parseRoomIdFromRequest;
