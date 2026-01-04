const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mahjongLogic = require('./mahjong_logic');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 引入配置和中間件
const corsMiddleware = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const socketConfig = require('./config/socket');

// 創建全局 PrismaClient 實例
const prisma = new PrismaClient();

const app = express();

// 使用統一的 CORS 中間件
app.use(corsMiddleware);
app.use(express.json());
// 綠界使用 application/x-www-form-urlencoded 格式
app.use(express.urlencoded({ extended: true }));

// 設置靜態文件服務（用於提供語音文件）
const uploadsDir = path.join(__dirname, 'uploads', 'voices');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads/voices', express.static(uploadsDir));

// 配置 multer 用於文件上傳
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制 5MB
  },
  fileFilter: function (req, file, cb) {
    // 只接受音頻文件
    const allowedMimes = ['audio/mp4', 'audio/m4a', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(m4a|mp3|wav)$/)) {
      cb(null, true);
    } else {
      cb(new Error('只支持音頻文件格式'));
    }
  }
});

const server = http.createServer(app);
const io = new Server(server, socketConfig);

// 台灣麻將完整牌組（包含花牌）
const allTiles = [
  // 萬子 (1-9萬) 各4張
  ...Array(4).fill(['一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬']).flat(),
  // 筒子 (1-9筒) 各4張
  ...Array(4).fill(['一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒']).flat(),
  // 條子 (1-9條) 各4張
  ...Array(4).fill(['一條', '二條', '三條', '四條', '五條', '六條', '七條', '八條', '九條']).flat(),
  // 風牌 (東南西北) 各4張
  ...Array(4).fill(['東', '南', '西', '北']).flat(),
  // 三元牌 (中發白) 各4張
  ...Array(4).fill(['中', '發', '白']).flat(),
  // 花牌 (春夏秋冬梅蘭竹菊) 各1張
  '春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'
];

// 遊戲階段
const GamePhase = {
  WAITING: 'waiting',      // 等待玩家
  DEALING: 'dealing',      // 發牌階段
  FLOWER_REPLACEMENT: 'flower_replacement', // 開局補花
  PLAYING: 'playing',      // 遊戲進行中
  CLAIMING: 'claiming',    // 吃碰槓胡等待
  ENDED: 'ended'          // 遊戲結束
};

// 吃碰槓類型
const ClaimType = {
  CHI: 'chi',      // 吃
  PONG: 'pong',    // 碰
  KONG: 'kong',    // 槓
  HU: 'hu'         // 胡
};

let tables = {}; // 完整的遊戲狀態
const socketToPlayer = {}; // socket.id 到 {tableId, playerId} 的映射
const nicknameToPlayerId = {}; // 暱稱到玩家ID的映射（用於綁定暱稱和ID）

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 使用Haversine公式計算兩點間距離（地球表面）
 * @param {number} lat1 第一個點的緯度
 * @param {number} lon1 第一個點的經度
 * @param {number} lat2 第二個點的緯度
 * @param {number} lon2 第二個點的經度
 * @returns {number} 距離（公尺）
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 地球半徑（公尺）
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// 檢查是否為花牌
function isFlowerTile(tile) {
  return mahjongLogic.isFlowerTile(tile);
}

// 隨機選擇莊家
function selectRandomDealer() {
  return Math.floor(Math.random() * 4);
}

// 開始遊戲倒數計時
function startGameCountdown(tableId) {
  const table = tables[tableId];
  if (!table || table.players.length !== 4 || table.countdownStarted) return;

  // 標記倒數已開始
  table.countdownStarted = true;

  console.log(`開始倒數計時 - 房間: ${tableId}`);

  let countdown = 5;

  // 廣播倒數計時開始
  io.to(tableId).emit('gameCountdown', {
    countdown: countdown,
    message: '四人到齊，遊戲即將開始！'
  });

  const countdownInterval = setInterval(() => {
    countdown--;

    if (countdown > 0) {
      // 廣播倒數計時
      io.to(tableId).emit('gameCountdown', {
        countdown: countdown,
        message: `遊戲將在 ${countdown} 秒後開始`
      });
    } else {
      // 倒數結束，開始遊戲
      clearInterval(countdownInterval);
      io.to(tableId).emit('gameCountdown', {
        countdown: 0,
        message: '遊戲開始！'
      });

      // 延遲1秒後開始遊戲
      setTimeout(() => {
        startGame(tableId).catch(err => console.error('開始遊戲失敗:', err));
      }, 1000);
    }
  }, 1000);
}

// 開始遊戲
async function startGame(tableId) {
  const table = tables[tableId];
  if (!table || table.players.length !== 4 || table.started) return;

  // 重置倒數標記
  table.countdownStarted = false;

  console.log(`開始遊戲 - 房間: ${tableId}`);

  // 設置遊戲狀態
  table.started = true;
  table.gamePhase = GamePhase.DEALING;
  
  // 隨機選擇一個玩家作為東風位（windStart）
  // 第一圈時，東風位玩家就是莊家
  table.windStart = Math.floor(Math.random() * 4); // 隨機選擇 0-3 其中一個座位作為東風位
  table.dealerIndex = table.windStart; // 第一圈東風位玩家為莊家
  table.turn = table.dealerIndex;
  
  const windNames = ['東', '南', '西', '北'];
  console.log(`>>> [遊戲開始] 隨機選擇玩家${table.windStart + 1}為東風位，並擔任莊家`);
  console.log(`>>> [遊戲開始] 風位分配：座位${table.windStart}=${windNames[0]}風，座位${(table.windStart + 1) % 4}=${windNames[1]}風，座位${(table.windStart + 2) % 4}=${windNames[2]}風，座位${(table.windStart + 3) % 4}=${windNames[3]}風`);
  
  // 初始化圈數和分數
  table.round = 1;
  table.roundHistory = [];
  
  // 確保 maxRounds 和 gameSettings 正確設置（從房間設定讀取）
  if (!table.maxRounds || table.maxRounds < 1 || !table.gameSettings) {
    try {
      const roomRecord = await prisma.room.findUnique({
        where: { roomId: tableId },
        select: { gameSettings: true }
      });
      const gameSettings = roomRecord?.gameSettings || null;
      table.maxRounds = gameSettings?.rounds || 1;
      table.gameSettings = gameSettings || {
        base_points: 100,
        scoring_unit: 20,
        point_cap: 'UP_TO_8_POINTS'
      };
      console.log(`>>> [遊戲開始] 從資料庫讀取圈數設定: ${table.maxRounds} 圈`);
      console.log(`>>> [遊戲開始] 遊戲設定: 底分=${table.gameSettings.base_points}, 每台分數=${table.gameSettings.scoring_unit}, 封頂=${table.gameSettings.point_cap}`);
    } catch (err) {
      console.error(`>>> [遊戲開始] 查詢房間設定失敗: ${err.message}`);
      table.maxRounds = table.maxRounds || 1;
      if (!table.gameSettings) {
        table.gameSettings = {
          base_points: 100,
          scoring_unit: 20,
          point_cap: 'UP_TO_8_POINTS'
        };
      }
    }
  }
  
  // 確保所有玩家分數為 0，並初始化統計資料
  table.players.forEach(player => {
    player.score = 0;
    if (!player.roundScores) player.roundScores = [];
    if (!player.statistics) {
      player.statistics = {
        selfDraws: 0,
        discards: 0,
        claimedDiscards: 0,
        discardedHu: 0
      };
    }
  });
  
  console.log(`>>> [遊戲開始] 圈數設定: ${table.maxRounds} 圈，當前圈數: ${table.round}`);

  // 執行扣卡邏輯（在遊戲開始時）
  try {
    const deduction = table.gameSettings?.deduction || 'AA_DEDUCTION';
    const rounds = table.maxRounds || 1;
    const cardsPerRound = 4; // 每圈需要4張房卡（4人各1張）
    const totalCardsNeeded = rounds * cardsPerRound; // 總共需要的房卡數量
    
    // 獲取房間資訊以找到房主
    const room = await prisma.room.findUnique({
      where: { roomId: tableId },
      select: { creatorId: true },
    });
    
    if (deduction === 'HOST_DEDUCTION' && room && room.creatorId) {
      // 房主扣卡：由房主扣除所有房卡
      const hostPlayer = await prisma.player.findUnique({
        where: { id: room.creatorId },
        select: { cardCount: true },
      });
      
      if (hostPlayer && hostPlayer.cardCount >= totalCardsNeeded) {
        const previousCount = hostPlayer.cardCount;
        const newCount = previousCount - totalCardsNeeded;
        
        await prisma.$transaction([
          prisma.player.update({
            where: { id: room.creatorId },
            data: {
              cardCount: {
                decrement: totalCardsNeeded,
              },
            },
          }),
          prisma.cardConsumptionRecord.create({
            data: {
              playerId: room.creatorId,
              roomId: tableId,
              amount: totalCardsNeeded,
              reason: 'game_start_host_deduction',
              previousCount: previousCount,
              newCount: newCount,
            },
          }),
        ]);
        console.log(`>>> [扣卡] 房主扣卡：扣除 ${totalCardsNeeded} 張房卡（${rounds}圈），剩餘: ${newCount}`);
      } else {
        console.log(`>>> [扣卡] 房主房卡不足：需要 ${totalCardsNeeded} 張，目前 ${hostPlayer?.cardCount || 0} 張`);
      }
    } else if (deduction === 'AA_DEDUCTION') {
      // AA扣卡：每位玩家各扣每圈1張（共 rounds 張）
      const cardsPerPlayer = rounds; // 每位玩家需要扣的房卡數量
      
      for (const player of table.players) {
        try {
          const dbPlayer = await prisma.player.findUnique({
            where: { id: player.id },
            select: { cardCount: true },
          });
          
          if (dbPlayer && dbPlayer.cardCount >= cardsPerPlayer) {
            const previousCount = dbPlayer.cardCount;
            const newCount = previousCount - cardsPerPlayer;
            
            await prisma.$transaction([
              prisma.player.update({
                where: { id: player.id },
                data: {
                  cardCount: {
                    decrement: cardsPerPlayer,
                  },
                },
              }),
              prisma.cardConsumptionRecord.create({
                data: {
                  playerId: player.id,
                  roomId: tableId,
                  amount: cardsPerPlayer,
                  reason: 'game_start_aa_deduction',
                  previousCount: previousCount,
                  newCount: newCount,
                },
              }),
            ]);
            console.log(`>>> [扣卡] AA扣卡：玩家 ${player.name} 扣除 ${cardsPerPlayer} 張房卡（${rounds}圈），剩餘: ${newCount}`);
          } else {
            console.log(`>>> [扣卡] 玩家 ${player.name} 房卡不足：需要 ${cardsPerPlayer} 張，目前 ${dbPlayer?.cardCount || 0} 張`);
          }
        } catch (error) {
          console.error(`>>> [扣卡] 扣除玩家 ${player.name} 房卡失敗:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`>>> [扣卡] 扣卡邏輯執行失敗:`, error);
    // 不影響遊戲開始流程，只記錄錯誤
  }

  // 設置莊家標記
  table.players.forEach((player, index) => {
    player.isDealer = (index === table.dealerIndex);
    if (player.isDealer) {
      console.log(`>>> [遊戲開始] 玩家${index + 1} (${player.name}) 是莊家`);
    }
  });

  // 洗牌並發牌（台灣麻將每人16張）
  let shuffledTiles = shuffle(allTiles);

  // 測試模式：如果房間號為 777777，給玩家1發3張相同牌，且第一次摸牌會摸到第4張
  if (tableId === '777777') {
    console.log('>>> 測試模式：房間號 777777，給玩家1發3張相同牌，第一次摸牌會摸到第4張');

    // 強制玩家1成為莊家，確保他第一個摸牌
    table.dealerIndex = 0;
    table.windStart = 0; // 風位固定，座位0=東風
    table.turn = 0;
    table.players.forEach((player, index) => {
      player.isDealer = (index === 0);
    });
    console.log(`>>> 測試模式：強制玩家1（東風位）成為莊家，確保他第一個摸牌`);

    // 定義測試手牌：玩家1有3張南風 + 其他13張牌（總共16張）
    const testKongHand = [
      '南', '南', '南',                    // 3張南風（準備自槓）
      '一萬', '二萬', '三萬',              // 順子1
      '四萬', '五萬', '六萬',              // 順子2
      '七萬', '八萬', '九萬',              // 順子3
      '一筒', '二筒', '三筒',              // 順子4
      '一筒'                               // 1張單牌（總共16張）
    ];

    // 從牌組中移除測試手牌所需的牌
    const remainingTiles = [];
    const tileCounts = {};

    // 統計測試手牌中每張牌需要的數量
    testKongHand.forEach(tile => {
      tileCounts[tile] = (tileCounts[tile] || 0) + 1;
    });

    // 從洗牌後的牌組中移除測試手牌所需的牌
    // 同時，先將所有南風分離出來，確保不會發給其他玩家
    const reservedSouthTiles = [];
    const tilesForDealing = []; // 用於發牌給其他玩家的牌組（不包含南風）

    shuffledTiles.forEach(tile => {
      if (tile === '南') {
        // 如果是南風，先保留起來
        reservedSouthTiles.push(tile);
      } else if (tileCounts[tile] && tileCounts[tile] > 0) {
        // 如果是測試手牌需要的牌，移除它
        tileCounts[tile]--;
      } else {
        // 其他牌，加入發牌用的牌組
        tilesForDealing.push(tile);
      }
    });

    // 從保留的南風中，移除測試手牌需要的3張南風
    const southUsedForTestHand = 3;
    const southRemoved = reservedSouthTiles.splice(0, southUsedForTestHand);
    console.log(`>>> 測試模式：從牌組中移除了 ${southRemoved.length} 張南風用於測試手牌`);
    console.log(`>>> 測試模式：剩餘 ${reservedSouthTiles.length} 張南風保留在牌組中，不會發給其他玩家`);

    // 確保南風數量正確（應該有1張剩餘的南風）
    if (reservedSouthTiles.length === 0) {
      console.log(`>>> 警告：沒有找到剩餘的南風！牌組中可能沒有足夠的南風。`);
    } else if (reservedSouthTiles.length > 1) {
      console.log(`>>> 警告：找到 ${reservedSouthTiles.length} 張剩餘的南風，應該只有1張。`);
    }

    // tilesForDealing 已經不包含任何南風，直接用於發牌

    // 給玩家1發測試手牌
    table.players.forEach((player, playerIndex) => {
      if (playerIndex === 0) {
        // 玩家1：發測試手牌（3張南風 + 其他13張）
        table.hiddenHands[player.id] = [...testKongHand];
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）測試手牌（3張南風）：${testKongHand.join(', ')}`);
      } else {
        // 其他玩家：從不包含南風的牌組中發牌
        const startIndex = (playerIndex - 1) * 16;
        const playerTiles = tilesForDealing.slice(startIndex, startIndex + 16);
        table.hiddenHands[player.id] = playerTiles;
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）手牌：${playerTiles.join(', ')}`);
        // 檢查其他玩家手牌中是否有南風
        const southCount = playerTiles.filter(t => t === '南').length;
        if (southCount > 0) {
          console.log(`>>> 錯誤：玩家${playerIndex + 1}手牌中包含 ${southCount} 張南風，這不應該發生！`);
        } else {
          console.log(`>>> 驗證：玩家${playerIndex + 1}手牌中沒有南風 ✓`);
        }
      }
    });

    // 剩餘牌組（從不包含南風的牌組的第48張開始，因為其他3個玩家已經發了48張）
    const deckWithoutSouth = tilesForDealing.slice(48);

    // 將保留的南風放在牌組最前面（確保玩家1第一次摸牌會摸到南風）
    if (reservedSouthTiles.length > 0) {
      table.deck = [reservedSouthTiles[0], ...deckWithoutSouth];
      console.log(`>>> 測試模式：將南風放在牌組最前面，玩家1第一次摸牌會摸到南風`);
      if (reservedSouthTiles.length > 1) {
        // 如果有多張南風，將其他的放在牌組後面
        table.deck.push(...reservedSouthTiles.slice(1));
        console.log(`>>> 測試模式：將其他 ${reservedSouthTiles.length - 1} 張南風放在牌組後面`);
      }
    } else {
      table.deck = deckWithoutSouth;
      console.log(`>>> 警告：沒有找到南風，無法設置自槓測試`);
    }

    // 標記這是777777測試房間，需要在補花完成後調整牌組順序
    table.isTestKongRoom = true;
  }
  // 測試模式：如果房間號為 222222，測試補槓功能
  else if (tableId === '222222') {
    console.log('>>> 測試模式：房間號 222222，測試補槓功能');

    // 強制玩家1成為莊家，玩家2為下一家
    table.dealerIndex = 0;
    table.windStart = 0; // 風位固定，座位0=東風
    table.turn = 0;
    table.players.forEach((player, index) => {
      player.isDealer = (index === 0);
    });
    console.log(`>>> 測試模式：強制玩家1（東風位）成為莊家，玩家2為下一家`);

    // 定義測試手牌
    // 莊家（玩家1）：1張東風 + 2張西風 + 其他13張牌（總共16張）
    const dealerHand = [
      '東',                               // 1張東風
      '西', '西',                        // 2張西風
      '一萬', '二萬', '三萬',            // 順子1
      '四萬', '五萬', '六萬',            // 順子2
      '七萬', '八萬', '九萬',            // 順子3
      '一筒', '二筒', '三筒',            // 順子4
      '一筒'                              // 1張單牌（總共16張）
    ];

    // 下一家（玩家2）：2張東風 + 1張西風 + 其他13張牌（總共16張）
    const nextPlayerHand = [
      '東', '東',                        // 2張東風
      '西',                              // 1張西風
      '一萬', '二萬', '三萬',            // 順子1
      '四萬', '五萬', '六萬',            // 順子2
      '七萬', '八萬', '九萬',            // 順子3
      '一筒', '二筒', '三筒',            // 順子4
      '一筒'                              // 1張單牌（總共16張）
    ];

    // 從牌組中移除測試手牌所需的牌
    const remainingTiles = [];
    const tileCounts = {};

    // 統計測試手牌中每張牌需要的數量
    [...dealerHand, ...nextPlayerHand].forEach(tile => {
      tileCounts[tile] = (tileCounts[tile] || 0) + 1;
    });

    // 從洗牌後的牌組中移除測試手牌所需的牌
    // 同時，先將所有東風分離出來，確保不會發給其他玩家
    const reservedEastTiles = [];
    const tilesForDealing = []; // 用於發牌給其他玩家的牌組（不包含東風）

    shuffledTiles.forEach(tile => {
      if (tile === '東') {
        // 如果是東風，先保留起來
        reservedEastTiles.push(tile);
      } else if (tileCounts[tile] && tileCounts[tile] > 0) {
        // 如果是測試手牌需要的牌，移除它
        tileCounts[tile]--;
      } else {
        // 其他牌，加入發牌用的牌組
        tilesForDealing.push(tile);
      }
    });

    // 從保留的東風中，移除測試手牌需要的東風（莊家1張 + 下一家2張 = 3張）
    const eastUsedForTestHand = 3;
    const eastRemoved = reservedEastTiles.splice(0, eastUsedForTestHand);
    console.log(`>>> 測試模式：從牌組中移除了 ${eastRemoved.length} 張東風用於測試手牌`);
    console.log(`>>> 測試模式：剩餘 ${reservedEastTiles.length} 張東風保留在牌組中，用於補槓測試`);

    // 確保有剩餘的東風用於補槓測試（下一家第一次摸牌會摸到東風）
    if (reservedEastTiles.length === 0) {
      console.log(`>>> 警告：沒有找到剩餘的東風！牌組中可能沒有足夠的東風用於補槓測試。`);
    } else if (reservedEastTiles.length > 1) {
      console.log(`>>> 警告：找到 ${reservedEastTiles.length} 張剩餘的東風，應該只有1張。`);
    }

    // tilesForDealing 已經不包含任何東風，直接用於發牌

    // 給玩家發測試手牌
    table.players.forEach((player, playerIndex) => {
      if (playerIndex === 0) {
        // 莊家（玩家1）：發測試手牌（1張東風 + 2張西風）
        table.hiddenHands[player.id] = [...dealerHand];
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）測試手牌（1張東風 + 2張西風）：${dealerHand.join(', ')}`);
      } else if (playerIndex === 1) {
        // 下一家（玩家2）：發測試手牌（2張東風 + 1張西風）
        table.hiddenHands[player.id] = [...nextPlayerHand];
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）測試手牌（2張東風 + 1張西風）：${nextPlayerHand.join(', ')}`);
      } else {
        // 其他玩家：從不包含東風的牌組中發牌
        const startIndex = (playerIndex - 2) * 16; // 因為前兩個玩家已經發了32張
        const playerTiles = tilesForDealing.slice(startIndex, startIndex + 16);
        table.hiddenHands[player.id] = playerTiles;
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）手牌：${playerTiles.join(', ')}`);
        // 檢查其他玩家手牌中是否有東風
        const eastCount = playerTiles.filter(t => t === '東').length;
        if (eastCount > 0) {
          console.log(`>>> 錯誤：玩家${playerIndex + 1}手牌中包含 ${eastCount} 張東風，這不應該發生！`);
        } else {
          console.log(`>>> 驗證：玩家${playerIndex + 1}手牌中沒有東風 ✓`);
        }
      }
    });

    // 剩餘牌組（從不包含東風的牌組的第32張開始，因為前兩個玩家已經發了32張）
    const deckWithoutEast = tilesForDealing.slice(32);

    // 將保留的東風放在牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風
    if (reservedEastTiles.length > 0) {
      // 如果牌組至少有1張牌，將東風插入到第2個位置（索引1）
      if (deckWithoutEast.length > 0) {
        table.deck = [deckWithoutEast[0], reservedEastTiles[0], ...deckWithoutEast.slice(1)];
        console.log(`>>> 測試模式：將東風放在牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
      } else {
        // 如果牌組不足，將東風放在最前面
        table.deck = [reservedEastTiles[0], ...deckWithoutEast];
        console.log(`>>> 測試模式：牌組不足，將東風放在最前面`);
      }
      if (reservedEastTiles.length > 1) {
        // 如果有多張東風，將其他的放在牌組後面
        table.deck.push(...reservedEastTiles.slice(1));
        console.log(`>>> 測試模式：將其他 ${reservedEastTiles.length - 1} 張東風放在牌組後面`);
      }
    } else {
      table.deck = deckWithoutEast;
      console.log(`>>> 警告：沒有找到東風，無法設置補槓測試`);
    }

    // 標記這是222222測試房間（補槓測試）
    table.isTestAddKongRoom = true;
  }
  // 測試模式：如果房間號為 888888，給莊家發一個固定的可聽牌牌型
  else if (tableId === '888888') {
    console.log(`>>> 測試模式：房間號 888888，給莊家（玩家${table.dealerIndex + 1}）發可聽牌牌型`);

    // 定義一個可聽牌的手牌（16張，差1張就能胡牌）
    // 結構：4組順子 + 1對將牌 + 1張單牌 = 12 + 2 + 1 = 15張（應該16張）
    // 修正：4組順子 + 1對將牌 + 2張單牌 = 12 + 2 + 2 = 16張
    // 聽牌：聽那2張單牌組成的對子或順子
    // 例如：一二三萬、四五六萬、七八九萬、一二三筒、四四條、五五條、六條
    // 聽：六條（湊成對子）或三條（湊成順子）
    const testTingHand = [
      '一萬', '二萬', '三萬',        // 順子1
      '四萬', '五萬', '六萬',        // 順子2
      '七萬', '八萬', '九萬',        // 順子3
      '一筒', '二筒', '三筒',        // 順子4
      '四條', '四條',                 // 對子（將牌）
      '五條', '六條'                  // 單牌（聽五條湊對子或三條湊順子）
    ];

    // 從牌組中移除測試手牌所需的牌
    const remainingTiles = [];
    const tileCounts = {};

    // 統計測試手牌中每張牌需要的數量
    testTingHand.forEach(tile => {
      tileCounts[tile] = (tileCounts[tile] || 0) + 1;
    });

    // 從洗牌後的牌組中移除測試手牌所需的牌
    shuffledTiles.forEach(tile => {
      if (tileCounts[tile] && tileCounts[tile] > 0) {
        tileCounts[tile]--;
      } else {
        remainingTiles.push(tile);
      }
    });

    // 給莊家發測試手牌，其他玩家從剩餘牌組中發牌
    table.players.forEach((player, playerIndex) => {
      if (playerIndex === table.dealerIndex) {
        // 莊家：發測試手牌
        table.hiddenHands[player.id] = [...testTingHand];
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}，莊家）測試手牌（可聽牌）：${testTingHand.join(', ')}`);
      } else {
        // 其他玩家：從剩餘牌組中發牌
        // 計算其他玩家的發牌起始位置（需要跳過莊家的16張）
        const otherPlayerIndex = playerIndex < table.dealerIndex ? playerIndex : playerIndex - 1;
        const startIndex = otherPlayerIndex * 16;
        const playerTiles = remainingTiles.slice(startIndex, startIndex + 16);
        table.hiddenHands[player.id] = playerTiles;
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）手牌：${playerTiles.join(', ')}`);
      }
    });

    // 剩餘牌組（從剩餘牌組的第48張開始，因為其他3個玩家已經發了48張）
    table.deck = remainingTiles.slice(48); // 其他3個玩家已經發了48張，剩餘牌組從這裡開始
  }
  // 測試模式：如果房間號為 666666，給除了莊家以外的一位玩家發可聽牌牌型
  else if (tableId === '666666') {
    console.log(`>>> 測試模式：房間號 666666，給除了莊家（玩家${table.dealerIndex + 1}）以外的一位玩家發可聽牌牌型`);

    // 定義一個可聽牌的手牌（16張，差1張就能胡牌）
    // 結構：4組順子 + 1對將牌 + 2張單牌 = 12 + 2 + 2 = 16張
    // 聽牌：聽那2張單牌組成的對子或順子
    const testTingHand = [
      '一萬', '二萬', '三萬',        // 順子1
      '四萬', '五萬', '六萬',        // 順子2
      '七萬', '八萬', '九萬',        // 順子3
      '一筒', '二筒', '三筒',        // 順子4
      '四條', '四條',                 // 對子（將牌）
      '五條', '六條'                  // 單牌（聽五條湊對子或三條湊順子）
    ];

    // 從牌組中移除測試手牌所需的牌（只需要1套）
    const remainingTiles = [];
    const tileCounts = {};

    // 統計測試手牌中每張牌需要的數量（只需要1套）
    testTingHand.forEach(tile => {
      tileCounts[tile] = (tileCounts[tile] || 0) + 1;
    });

    // 從洗牌後的牌組中移除測試手牌所需的牌
    shuffledTiles.forEach(tile => {
      if (tileCounts[tile] && tileCounts[tile] > 0) {
        tileCounts[tile]--;
      } else {
        remainingTiles.push(tile);
      }
    });

    // 驗證是否所有需要的牌都找到了
    const missingTiles = Object.keys(tileCounts).filter(tile => tileCounts[tile] > 0);
    if (missingTiles.length > 0) {
      console.log(`>>> 警告：測試模式 666666 缺少以下牌：${missingTiles.join(', ')}`);
    }

    // 選擇一位非莊家玩家來發可聽牌牌型（選擇第一個非莊家玩家）
    let testPlayerIndex = -1;
    for (let i = 0; i < table.players.length; i++) {
      if (i !== table.dealerIndex) {
        testPlayerIndex = i;
        break;
      }
    }

    if (testPlayerIndex === -1) {
      console.log(`>>> 錯誤：找不到非莊家玩家，無法設置測試模式`);
      testPlayerIndex = (table.dealerIndex + 1) % 4;
    }

    console.log(`>>> 測試模式：玩家${testPlayerIndex + 1}將獲得可聽牌牌型`);

    // 給玩家發牌
    table.players.forEach((player, playerIndex) => {
      if (playerIndex === table.dealerIndex) {
        // 莊家：從剩餘牌組中發正常牌
        const dealerStartIndex = 0;
        const dealerTiles = remainingTiles.slice(dealerStartIndex, dealerStartIndex + 16);
        table.hiddenHands[player.id] = dealerTiles;
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}，莊家）正常手牌：${dealerTiles.join(', ')}`);
      } else if (playerIndex === testPlayerIndex) {
        // 選中的非莊家玩家：發測試手牌（可聽牌）
        table.hiddenHands[player.id] = [...testTingHand];
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）測試手牌（可聽牌）：${testTingHand.join(', ')}`);
      } else {
        // 其他非莊家玩家：從剩餘牌組中發正常牌
        // 計算其他玩家的發牌起始位置（需要跳過莊家的16張）
        // 需要計算這是第幾個非莊家玩家（排除莊家和測試玩家）
        let otherPlayerCount = 0;
        for (let j = 0; j < playerIndex; j++) {
          if (j !== table.dealerIndex && j !== testPlayerIndex) {
            otherPlayerCount++;
          }
        }
        const startIndex = 16 + (otherPlayerCount * 16);
        const playerTiles = remainingTiles.slice(startIndex, startIndex + 16);
        table.hiddenHands[player.id] = playerTiles;
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）正常手牌：${playerTiles.join(', ')}`);
      }
    });

    // 剩餘牌組（從剩餘牌組的第48張開始，因為莊家、測試玩家和其他2位玩家已經發了48張）
    table.deck = remainingTiles.slice(48);
    console.log(`>>> 測試模式：剩餘牌組有 ${table.deck.length} 張牌`);
  }
  // 測試模式：如果房間號為 555555，給玩家1發可聽牌牌型，且第一張摸牌就能胡
  else if (tableId === '555555') {
    console.log('>>> 測試模式：房間號 555555，給玩家1發可聽牌牌型，且第一張摸牌就能胡');

    // 強制玩家1成為莊家，確保他第一個摸牌
    table.dealerIndex = 0;
    table.windStart = 0; // 風位固定，座位0=東風
    table.turn = 0;
    table.players.forEach((player, index) => {
      player.isDealer = (index === 0);
    });
    console.log(`>>> 測試模式：強制玩家1（東風位）成為莊家，確保他第一個摸牌`);

    // 定義一個可聽牌的手牌（16張，差1張就能胡牌）
    // 結構：4組順子 + 1對將牌 + 2張單牌 = 12 + 2 + 2 = 16張
    // 聽牌：聽四條（湊成刻子）或七條（湊成順子）
    // 如果摸到四條：四條四條四條（刻子）+ 4組順子 + 五條六條（剩餘，需要處理）
    // 如果摸到七條：五條六條七條（順子）+ 4組順子 + 四條四條（對子，將牌）= 胡牌
    const testTingHand = [
      '一萬', '二萬', '三萬',        // 順子1
      '四萬', '五萬', '六萬',        // 順子2
      '七萬', '八萬', '九萬',        // 順子3
      '一筒', '二筒', '三筒',        // 順子4
      '四條', '四條',                 // 對子（將牌）
      '五條', '六條'                  // 單牌（聽四條湊刻子或七條湊順子）
    ];

    // 從牌組中移除測試手牌所需的牌
    const remainingTiles = [];
    const tileCounts = {};

    // 統計測試手牌中每張牌需要的數量
    testTingHand.forEach(tile => {
      tileCounts[tile] = (tileCounts[tile] || 0) + 1;
    });

    // 從洗牌後的牌組中移除測試手牌所需的牌
    // 同時，先將所有四條和七條分離出來，確保不會發給其他玩家
    const reservedHuTiles = []; // 保留能讓玩家1胡牌的牌（四條或七條）
    const tilesForDealing = []; // 用於發牌給其他玩家的牌組（不包含四條和七條）

    shuffledTiles.forEach(tile => {
      if (tile === '四條' || tile === '七條') {
        // 如果是四條或七條（能讓玩家1胡牌的牌），先保留起來
        reservedHuTiles.push(tile);
      } else if (tileCounts[tile] && tileCounts[tile] > 0) {
        // 如果是測試手牌需要的牌，移除它
        tileCounts[tile]--;
      } else {
        // 其他牌，加入發牌用的牌組
        tilesForDealing.push(tile);
      }
    });

    // 從保留的牌中，優先選擇七條（因為聽七條可以湊成順子，更直觀）
    // 如果沒有七條，則使用四條
    let huTile = null;
    const qiTiaoIndex = reservedHuTiles.findIndex(t => t === '七條');
    if (qiTiaoIndex !== -1) {
      huTile = reservedHuTiles.splice(qiTiaoIndex, 1)[0];
      console.log(`>>> 測試模式：找到七條，將作為玩家1的第一張摸牌`);
    } else {
      const siTiaoIndex = reservedHuTiles.findIndex(t => t === '四條');
      if (siTiaoIndex !== -1) {
        huTile = reservedHuTiles.splice(siTiaoIndex, 1)[0];
        console.log(`>>> 測試模式：找到四條，將作為玩家1的第一張摸牌`);
      } else if (reservedHuTiles.length > 0) {
        huTile = reservedHuTiles.splice(0, 1)[0];
        console.log(`>>> 測試模式：找到${huTile}，將作為玩家1的第一張摸牌`);
      } else {
        console.log(`>>> 警告：沒有找到四條或七條，無法設置胡牌測試`);
      }
    }

    // 給玩家發牌
    table.players.forEach((player, playerIndex) => {
      if (playerIndex === 0) {
        // 玩家1：發測試手牌（可聽牌）
        table.hiddenHands[player.id] = [...testTingHand];
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）測試手牌（可聽牌）：${testTingHand.join(', ')}`);
      } else {
        // 其他玩家：從不包含四條和七條的牌組中發牌
        const startIndex = (playerIndex - 1) * 16;
        const playerTiles = tilesForDealing.slice(startIndex, startIndex + 16);
        table.hiddenHands[player.id] = playerTiles;
        table.hands[player.id] = []; // 明牌初始為空
        console.log(`玩家${playerIndex + 1}（${player.name}）手牌：${playerTiles.join(', ')}`);
        // 檢查其他玩家手牌中是否有四條或七條
        const huTileCount = playerTiles.filter(t => t === '四條' || t === '七條').length;
        if (huTileCount > 0) {
          console.log(`>>> 錯誤：玩家${playerIndex + 1}手牌中包含 ${huTileCount} 張能讓玩家1胡牌的牌，這不應該發生！`);
        } else {
          console.log(`>>> 驗證：玩家${playerIndex + 1}手牌中沒有四條或七條 ✓`);
        }
      }
    });

    // 剩餘牌組（從不包含四條和七條的牌組的第48張開始，因為其他3個玩家已經發了48張）
    const deckWithoutHuTiles = tilesForDealing.slice(48);

    // 將能讓玩家1胡牌的牌放在牌組最前面（確保玩家1第一次摸牌就能胡）
    if (huTile) {
      table.deck = [huTile, ...deckWithoutHuTiles];
      console.log(`>>> 測試模式：將${huTile}放在牌組最前面，玩家1第一次摸牌就能胡牌`);
      // 如果還有其他四條或七條，將它們放在牌組後面
      if (reservedHuTiles.length > 0) {
        table.deck.push(...reservedHuTiles);
        console.log(`>>> 測試模式：將其他 ${reservedHuTiles.length} 張能讓玩家1胡牌的牌放在牌組後面`);
      }
    } else {
      table.deck = deckWithoutHuTiles;
      console.log(`>>> 警告：沒有找到能讓玩家1胡牌的牌（四條或七條），無法設置胡牌測試`);
    }

    // 標記這是555555測試房間
    table.isTestHuRoom = true;
  } else {
    // 正常模式：隨機發牌
    table.deck = shuffledTiles.slice(64); // 剩餘牌組（144-64=80張）

    // 發牌給每位玩家
    table.players.forEach((player, playerIndex) => {
      const startIndex = playerIndex * 16;
      const playerTiles = shuffledTiles.slice(startIndex, startIndex + 16);
      table.hiddenHands[player.id] = playerTiles;
      table.hands[player.id] = []; // 明牌初始為空

      // 調試：顯示每個玩家的完整手牌
      console.log(`玩家${playerIndex + 1}（${player.name}）手牌：${playerTiles.join(', ')}`);
    });
  }

  console.log(`莊家: 玩家${table.dealerIndex + 1}, 東風起始位置: ${table.windStart}`);

  // 廣播遊戲開始
  safeEmit(tableId, 'startGame', {
    id: tableId,
    players: table.players.map(p => ({
      id: p.id,
      name: p.name,
      userId: p.userId || null,
      avatarUrl: p.avatarUrl || null,
      seat: p.seat,
      isDealer: p.isDealer,
      score: p.score,
      isReady: p.isReady,
      ipAddress: p.ipAddress || null,
      latitude: p.latitude || null,
      longitude: p.longitude || null
    })),
    dealerIndex: table.dealerIndex,
    windStart: table.windStart,
    turn: table.turn,
    gamePhase: table.gamePhase
  });

  // 同步最新桌狀態（確保有玩家漏掉 startGame 事件時仍能收到 started 狀態）
  const cleanTableData = getCleanTableData(table);
  io.to(tableId).emit('tableUpdate', cleanTableData);

  // 廣播所有玩家的手牌數量更新（讓所有玩家知道手牌數量）
  const handCounts = {};
  table.players.forEach(p => {
    handCounts[p.id] = table.hiddenHands[p.id].length;
  });
  console.log(`>>> [遊戲開始] 廣播手牌數量更新: ${JSON.stringify(handCounts)}`);
  io.to(tableId).emit('handCountsUpdate', {
    handCounts: handCounts
  });

  // 開局發牌後，立即發送所有玩家的手牌給前端，確保手牌狀態一致
  console.log(`>>> [遊戲開始] 同步所有玩家的手牌給前端`);
  table.players.forEach(player => {
    const hand = table.hiddenHands[player.id] || [];
    // 發送給對應玩家的 socket
    const playerSockets = Array.from(io.sockets.adapter.rooms.get(tableId) || []);
    playerSockets.forEach(socketId => {
      const mapping = socketToPlayer[socketId];
      if (mapping && mapping.playerId === player.id) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('myHand', {
            hand: hand
          });
          const playerIndex = table.players.findIndex(p => p.id === player.id);
          console.log(`>>> [遊戲開始] 發送玩家${playerIndex + 1}的手牌給前端，手牌數量：${hand.length}`);
        }
      }
    });
  });

  // 開始開局補花流程
  setTimeout(() => {
    startInitialFlowerReplacement(tableId);
  }, 2000);
}

// 開始下一圈（中間結算後）
function startNextRound(tableId) {
  const table = tables[tableId];
  if (!table || table.players.length !== 4) return;

  console.log(`>>> [下一圈] 開始第 ${table.round} 圈 - 房間: ${tableId}`);

  // 找到獲勝者（上一圈的獲勝者）
  const winnerId = table.nextRoundWinnerId;
  if (!winnerId) {
    console.error(`>>> [下一圈] 錯誤：找不到獲勝者ID`);
    return;
  }

  // 找到獲勝者的索引
  const winnerIndex = table.players.findIndex(p => p.id === winnerId);
  if (winnerIndex === -1) {
    console.error(`>>> [下一圈] 錯誤：找不到獲勝者 ${winnerId}`);
    return;
  }

  // 保存上一圈的莊家索引
  const previousDealerIndex = table.dealerIndex;
  
  // 判斷獲勝者是否是莊家
  const isDealerWin = (winnerIndex === previousDealerIndex);
  
  // 決定新莊家：
  // - 如果莊家獲勝：下一輪還是該玩家當莊家（dealerIndex 不變）
  // - 如果其他家獲勝：依序輪換到下一個風位（東->南->西->北）
  let newDealerIndex;
  if (isDealerWin) {
    // 莊家獲勝，保持莊家不變
    newDealerIndex = previousDealerIndex;
    console.log(`>>> [下一圈] 獲勝者：玩家${winnerIndex + 1} (${table.players[winnerIndex].name})，莊家獲勝，繼續當莊家`);
  } else {
    // 其他家獲勝，輪換到下一個風位（相對於 windStart 的風位順序）
    // 計算當前莊家相對於 windStart 的風位偏移
    const currentWindOffset = (previousDealerIndex - table.windStart + 4) % 4;
    // 輪換到下一個風位（東->南->西->北->東）
    const nextWindOffset = (currentWindOffset + 1) % 4;
    // 計算新的座位索引
    newDealerIndex = (table.windStart + nextWindOffset) % 4;
    const windNames = ['東', '南', '西', '北'];
    console.log(`>>> [下一圈] 獲勝者：玩家${winnerIndex + 1} (${table.players[winnerIndex].name})，非莊家獲勝，輪換到${windNames[nextWindOffset]}風位（座位${newDealerIndex}）當莊家`);
  }

  // 重置遊戲狀態
  table.gamePhase = GamePhase.DEALING;
  table.dealerIndex = newDealerIndex;
  // windStart 在遊戲開始時已隨機設定，代表東風位的起始座位，整場遊戲不變
  // 風位不隨莊家輪替而改變，只會按照風位順序輪換莊家
  table.turn = newDealerIndex;

  // 清除所有玩家的手牌、明牌、打出牌、花牌、聽牌狀態
  table.players.forEach((player, index) => {
    table.hiddenHands[player.id] = [];
    table.hands[player.id] = [];
    table.discards[player.id] = [];
    table.flowers[player.id] = [];
    table.melds[player.id] = [];
    // 根據新的 dealerIndex 設置莊家標記
    player.isDealer = (index === newDealerIndex);
    // 清除聽牌相關狀態
    player.isTing = false;
    player.isTianTing = false;
    player.isDiTing = false;
    player.initialTingHand = null;
    player.initialTingMelds = null;
  });

  // 重置遊戲標記
  table.lastDiscard = null;
  table.claimingState = null;
  table.tingState = null;
  table.initialTingState = null;
  table.timer = 0;
  if (table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
  }
  if (table.tingTimer) {
    clearInterval(table.tingTimer);
    table.tingTimer = null;
  }
  table.isFirstDealerDiscard = true;
  table.isFirstRound = true;
  table.hasFirstRoundClaim = false;
  table.firstRoundPlayersDiscarded = new Set();
  table.isFirstDraw = true;

  // 洗牌並發牌（台灣麻將每人16張）
  let shuffledTiles = shuffle(allTiles);
  table.deck = shuffledTiles.slice(64); // 剩餘牌組（144-64=80張）

  // 發牌給每位玩家
  table.players.forEach((player, playerIndex) => {
    const startIndex = playerIndex * 16;
    const playerTiles = shuffledTiles.slice(startIndex, startIndex + 16);
    table.hiddenHands[player.id] = playerTiles;
    table.hands[player.id] = []; // 明牌初始為空

    console.log(`玩家${playerIndex + 1}（${player.name}）手牌：${playerTiles.join(', ')}`);
  });

  console.log(`>>> [下一圈] 新莊家: 玩家${table.dealerIndex + 1}, 東風起始位置: ${table.windStart}`);

  // 清除繼續確認狀態
  table.roundContinueReady = null;
  table.nextRoundWinnerId = null;

  // 廣播下一圈開始
  safeEmit(tableId, 'startGame', {
    id: tableId,
    players: table.players.map(p => ({
      id: p.id,
      name: p.name,
      userId: p.userId || null,
      avatarUrl: p.avatarUrl || null,
      seat: p.seat,
      isDealer: p.isDealer,
      score: p.score,
      isReady: p.isReady,
      ipAddress: p.ipAddress || null,
      latitude: p.latitude || null,
      longitude: p.longitude || null
    })),
    dealerIndex: table.dealerIndex,
    windStart: table.windStart,
    turn: table.turn,
    gamePhase: table.gamePhase,
    round: table.round,
    maxRounds: table.maxRounds
  });

  // 同步最新桌狀態
  const cleanTableData = getCleanTableData(table);
  io.to(tableId).emit('tableUpdate', cleanTableData);

  // 廣播所有玩家的手牌數量更新（讓所有玩家知道手牌數量）
  const handCounts = {};
  table.players.forEach(p => {
    handCounts[p.id] = table.hiddenHands[p.id].length;
  });
  console.log(`>>> [下一圈] 廣播手牌數量更新: ${JSON.stringify(handCounts)}`);
  io.to(tableId).emit('handCountsUpdate', {
    handCounts: handCounts
  });

  // 下一圈發牌後，立即發送所有玩家的手牌給前端，確保手牌狀態一致
  console.log(`>>> [下一圈] 同步所有玩家的手牌給前端`);
  table.players.forEach(player => {
    const hand = table.hiddenHands[player.id] || [];
    // 發送給對應玩家的 socket
    const playerSockets = Array.from(io.sockets.adapter.rooms.get(tableId) || []);
    playerSockets.forEach(socketId => {
      const mapping = socketToPlayer[socketId];
      if (mapping && mapping.playerId === player.id) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('myHand', {
            hand: hand
          });
          const playerIndex = table.players.findIndex(p => p.id === player.id);
          console.log(`>>> [下一圈] 發送玩家${playerIndex + 1}的手牌給前端，手牌數量：${hand.length}`);
        }
      }
    });
  });

  // 開始開局補花流程
  setTimeout(() => {
    startInitialFlowerReplacement(tableId);
  }, 2000);
}

// 開局補花流程
function startInitialFlowerReplacement(tableId) {
  const table = tables[tableId];
  if (!table) return;

  table.gamePhase = GamePhase.FLOWER_REPLACEMENT;
  console.log(`開始開局補花 - 房間: ${tableId}`);

  // 依序處理每位玩家的補花
  let playerIndex = 0;
  processPlayerFlowerReplacement(tableId, playerIndex);
}

// 處理單一玩家補花
function processPlayerFlowerReplacement(tableId, playerIndex) {
  const table = tables[tableId];
  if (!table || playerIndex >= 4) {
    // 所有玩家補花完成，進入遊戲階段
    if (table) {
      console.log(`開局補花完成，進入遊戲階段 - 房間: ${tableId}`);

      // 設置遊戲階段為 PLAYING（重要：必須先設置才能讓 drawTile 執行）
      table.gamePhase = GamePhase.PLAYING;

      // 延遲廣播遊戲狀態更新，確保最後一位玩家的補花事件已完全處理
      // 這樣可以避免前端在補花狀態更新完成前就收到 gameStateUpdate
      setTimeout(() => {
        // 廣播遊戲狀態更新
        io.to(tableId).emit('gameStateUpdate', {
          gamePhase: GamePhase.PLAYING,
          turn: table.turn,
          message: '遊戲開始！'
        });

        // 補花完成後，再次同步所有玩家的手牌給前端，確保補花後的手牌狀態一致
        console.log(`>>> [補花完成] 同步所有玩家的手牌給前端`);
        table.players.forEach(player => {
          const hand = table.hiddenHands[player.id] || [];
          // 發送給對應玩家的 socket
          const playerSockets = Array.from(io.sockets.adapter.rooms.get(tableId) || []);
          playerSockets.forEach(socketId => {
            const mapping = socketToPlayer[socketId];
            if (mapping && mapping.playerId === player.id) {
              const socket = io.sockets.sockets.get(socketId);
              if (socket) {
                socket.emit('myHand', {
                  hand: hand
                });
                const playerIndex = table.players.findIndex(p => p.id === player.id);
                console.log(`>>> [補花完成] 發送玩家${playerIndex + 1}的手牌給前端，手牌數量：${hand.length}`);
              }
            }
          });
        });
      }, 300);

      // 不再檢測開局聽牌（天聽），改為莊家第一次打牌後檢測
      // 設置遊戲開始標記，用於判斷是否為莊家第一次打牌
      table.isFirstDealerDiscard = true;

      // 初始化第一圈和吃碰槓記錄標記（用於地聽判斷）
      table.isFirstRound = true; // 標記是否在第一圈
      table.hasFirstRoundClaim = false; // 標記第一圈是否有玩家吃碰槓
      table.firstRoundPlayersDiscarded = new Set(); // 記錄第一圈已打牌的玩家索引

      // 標記是否是開局第一張摸牌（用於天胡判斷）
      table.isFirstDraw = true;

      // 如果是222222測試房間，在補花完成後調整牌組順序，確保下一家第一次摸牌會摸到東風
      if (table.isTestAddKongRoom && table.dealerIndex === 0) {
        // 如果有保存的東風，先放回牌組
        if (table.savedEastTile) {
          // 將東風放在第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風
          if (table.deck.length > 0) {
            const firstTile = table.deck.shift();
            table.deck.unshift(firstTile, table.savedEastTile);
            table.savedEastTile = null;
            console.log(`>>> [222222測試] 補花完成後，將保存的東風放在牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
          } else {
            table.deck.unshift(table.savedEastTile);
            table.savedEastTile = null;
            console.log(`>>> [222222測試] 補花完成後，牌組為空，將保存的東風放在最前面`);
          }
        } else {
          // 檢查牌組中是否有東風
          const eastIndex = table.deck.findIndex(tile => tile === '東');
          if (eastIndex !== -1 && eastIndex !== 1) {
            // 如果東風不在第2個位置（索引1），將它移到第2個位置
            const eastTile = table.deck.splice(eastIndex, 1)[0];
            if (table.deck.length > 0) {
              const firstTile = table.deck.shift();
              table.deck.unshift(firstTile, eastTile);
              console.log(`>>> [222222測試] 補花完成後，將東風移到牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
            } else {
              table.deck.unshift(eastTile);
              console.log(`>>> [222222測試] 補花完成後，牌組不足，將東風放在最前面`);
            }
          } else if (eastIndex === 1) {
            console.log(`>>> [222222測試] 補花完成後，東風已經在牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
          } else if (eastIndex === 0) {
            // 如果東風在最前面，需要移到第2個位置
            const eastTile = table.deck.shift();
            if (table.deck.length > 0) {
              const firstTile = table.deck.shift();
              table.deck.unshift(firstTile, eastTile);
              console.log(`>>> [222222測試] 補花完成後，將東風從最前面移到第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
            } else {
              table.deck.unshift(eastTile);
              console.log(`>>> [222222測試] 補花完成後，牌組不足，東風保持最前面`);
            }
          } else {
            console.log(`>>> [222222測試] 警告：補花完成後，牌組中沒有東風`);
          }
        }
      }

      // 如果是777777測試房間，在補花完成後調整牌組順序，確保玩家1第一次摸牌會摸到南風
      if (table.isTestKongRoom && table.dealerIndex === 0) {
        // 如果有保存的南風，先放回牌組最前面
        if (table.savedSouthTile) {
          table.deck.unshift(table.savedSouthTile);
          table.savedSouthTile = null;
          console.log(`>>> [777777測試] 補花完成後，將保存的南風放回牌組最前面，玩家1第一次摸牌會摸到南風`);
        } else {
          // 檢查牌組中是否有南風
          const southIndex = table.deck.findIndex(tile => tile === '南');
          if (southIndex !== -1 && southIndex !== 0) {
            // 如果南風不在最前面，將它移到最前面
            const southTile = table.deck.splice(southIndex, 1)[0];
            table.deck.unshift(southTile);
            console.log(`>>> [777777測試] 補花完成後，將南風移到牌組最前面，玩家1第一次摸牌會摸到南風`);
          } else if (southIndex === 0) {
            console.log(`>>> [777777測試] 補花完成後，南風已經在牌組最前面，玩家1第一次摸牌會摸到南風`);
          } else {
            console.log(`>>> [777777測試] 警告：補花完成後，牌組中沒有南風`);
          }
        }
      }

      // 如果是555555測試房間，在補花完成後調整牌組順序，確保玩家1第一次摸牌會摸到四條或七條
      if (table.isTestHuRoom && table.dealerIndex === 0) {
        // 如果有保存的胡牌牌（四條或七條），先放回牌組最前面
        if (table.savedHuTile) {
          table.deck.unshift(table.savedHuTile);
          table.savedHuTile = null;
          console.log(`>>> [555555測試] 補花完成後，將保存的胡牌牌放回牌組最前面，玩家1第一次摸牌會摸到胡牌牌`);
        } else {
          // 檢查牌組中是否有四條或七條
          const huTileIndex = table.deck.findIndex(tile => tile === '四條' || tile === '七條');
          if (huTileIndex !== -1 && huTileIndex !== 0) {
            // 如果胡牌牌不在最前面，將它移到最前面（優先選擇七條）
            let targetTile = null;
            // 優先選擇七條
            const qiTiaoIndex = table.deck.findIndex(tile => tile === '七條');
            if (qiTiaoIndex !== -1) {
              targetTile = table.deck.splice(qiTiaoIndex, 1)[0];
            } else {
              // 如果沒有七條，選擇四條
              const siTiaoIndex = table.deck.findIndex(tile => tile === '四條');
              if (siTiaoIndex !== -1) {
                targetTile = table.deck.splice(siTiaoIndex, 1)[0];
              }
            }
            if (targetTile) {
              table.deck.unshift(targetTile);
              console.log(`>>> [555555測試] 補花完成後，將${targetTile}移到牌組最前面，玩家1第一次摸牌會摸到${targetTile}`);
            }
          } else if (huTileIndex === 0) {
            console.log(`>>> [555555測試] 補花完成後，胡牌牌已經在牌組最前面，玩家1第一次摸牌會摸到胡牌牌`);
          } else {
            console.log(`>>> [555555測試] 警告：補花完成後，牌組中沒有四條或七條`);
          }
        }
      }

      // 莊家開始摸牌
      setTimeout(() => {
        if (table.players && table.players[table.turn]) {
          console.log(`>>> [補花完成] 莊家開始摸牌：玩家${table.turn + 1}`);
          drawTile(tableId, table.players[table.turn].id);
        } else {
          console.log(`>>> [補花完成] 錯誤：找不到莊家玩家，turn=${table.turn}`);
        }
      }, 1000);
    }
    return;
  }

  const player = table.players[playerIndex];
  if (!player || !player.id) {
    console.log(`玩家${playerIndex + 1}不存在，跳過補花`);
    processPlayerFlowerReplacement(tableId, playerIndex + 1);
    return;
  }

  const hand = table.hiddenHands[player.id];

  // 檢查手牌中的花牌
  const flowers = hand.filter(tile => isFlowerTile(tile));

  // 調試：顯示所有被識別為花牌的牌
  console.log(`玩家${playerIndex + 1}手牌檢查：${hand.join(', ')}`);
  console.log(`玩家${playerIndex + 1}識別的花牌：${flowers.join(', ')}`);

  if (flowers.length > 0) {
    console.log(`玩家${playerIndex + 1}有${flowers.length}張花牌需要補花：${flowers.join(', ')}`);

    // 處理第一張花牌
    const flower = flowers[0];
    console.log(`玩家${playerIndex + 1}正在處理花牌：${flower}`);
    const flowerIndex = hand.indexOf(flower);

    // 移除花牌並加入收集
    hand.splice(flowerIndex, 1);
    table.flowers[player.id].push(flower);

    // 從牌組補摸一張牌
    if (table.deck.length > 0) {
      // 如果是777777測試房間，且牌組最前面是南風，先保存南風，取下一張牌
      // 如果是555555測試房間，且牌組最前面是四條或七條，先保存，取下一張牌
      let newTile;
      if (table.isTestKongRoom && table.deck[0] === '南') {
        // 保存南風
        const savedSouth = table.deck.shift();
        if (!table.savedSouthTile) {
          table.savedSouthTile = savedSouth;
          console.log(`>>> [777777測試] 補花時遇到南風，暫時保存，避免被補花消耗`);
        }
        // 如果還有牌，取下一張
        if (table.deck.length > 0) {
          newTile = table.deck.shift();
        } else {
          // 如果沒有其他牌了，使用保存的南風
          newTile = savedSouth;
          table.savedSouthTile = null;
        }
      } else if (table.isTestAddKongRoom && table.deck[0] === '東') {
        // 保存東風（用於補槓測試）
        const savedEast = table.deck.shift();
        if (!table.savedEastTile) {
          table.savedEastTile = savedEast;
          console.log(`>>> [222222測試] 補花時遇到東風，暫時保存，避免被補花消耗`);
        }
        // 如果還有牌，取下一張
        if (table.deck.length > 0) {
          newTile = table.deck.shift();
        } else {
          // 如果沒有其他牌了，使用保存的東風
          newTile = savedEast;
          table.savedEastTile = null;
        }
      } else if (table.isTestHuRoom && (table.deck[0] === '四條' || table.deck[0] === '七條')) {
        // 保存四條或七條（能讓玩家1胡牌的牌）
        const savedHuTile = table.deck.shift();
        if (!table.savedHuTile) {
          table.savedHuTile = savedHuTile;
          console.log(`>>> [555555測試] 補花時遇到${savedHuTile}，暫時保存，避免被補花消耗`);
        }
        // 如果還有牌，取下一張
        if (table.deck.length > 0) {
          newTile = table.deck.shift();
        } else {
          // 如果沒有其他牌了，使用保存的胡牌牌
          newTile = savedHuTile;
          table.savedHuTile = null;
        }
      } else {
        newTile = table.deck.shift();
      }
      hand.push(newTile);

      console.log(`玩家${playerIndex + 1}補花: ${flower} -> ${newTile}`);

      // 廣播補花事件
      console.log(`>>> 廣播補花事件：玩家${playerIndex + 1}，花牌：${flower}，新牌：${newTile}`);
      // 廣播開局補花給所有玩家（確保所有玩家都能聽到音效）
      console.log(`>>> [音效廣播] 廣播開局補花事件給房間 ${tableId} 的所有玩家`);
      io.to(tableId).emit('flowerReplacement', {
        playerId: player.id,
        playerIndex: playerIndex,
        flower: flower,
        newTile: newTile,
        isInitial: true
      });

      // 如果補摸的仍是花牌，繼續補花
      if (isFlowerTile(newTile)) {
        setTimeout(() => {
          processPlayerFlowerReplacement(tableId, playerIndex);
        }, 2000); // 等待前端補花動畫（約1.8秒）完成再繼續
      } else {
        // 補摸的不是花牌，檢查是否還有其他花牌需要處理
        // 重新檢查手牌中的花牌（因為補摸的牌已經加入手牌）
        const remainingFlowers = hand.filter(tile => isFlowerTile(tile));
        if (remainingFlowers.length > 0) {
          // 還有其他花牌，繼續補花
          setTimeout(() => {
            processPlayerFlowerReplacement(tableId, playerIndex);
          }, 2000); // 等待前端補花動畫完成再繼續
        } else {
          // 沒有其他花牌了，處理下一位玩家
          setTimeout(() => {
            processPlayerFlowerReplacement(tableId, playerIndex + 1);
          }, 2000); // 確保上一位玩家的補花動畫完全播放完畢
        }
      }
    } else {
      console.log('牌組已空，無法補花');
      processPlayerFlowerReplacement(tableId, playerIndex + 1);
    }
  } else {
    // 沒有花牌，處理下一位玩家
    setTimeout(() => {
      processPlayerFlowerReplacement(tableId, playerIndex + 1);
    }, 500);
  }
}

// 摸牌函數
function drawTile(tableId, playerId) {
  const table = tables[tableId];
  if (!table || table.gamePhase !== GamePhase.PLAYING) return;

  // 檢查是否輪到該玩家
  const playerIndex = table.players.findIndex(p => p.id === playerId);
  if (playerIndex !== table.turn) {
    console.log(`不是玩家${playerIndex + 1}的回合`);
    return;
  }

  // 獲取玩家對象
  const player = table.players[playerIndex];
  if (!player || !player.id) {
    console.log(`玩家索引 ${playerIndex} 無效，無法摸牌`);
    return;
  }

  // 檢查牌組是否還有牌
  if (table.deck.length === 0) {
    console.log('牌組已空，遊戲結束');
    endGame(tableId, 'draw').catch(err => console.error('結束遊戲失敗:', err));
    return;
  }

  // 摸牌
  const drawnTile = table.deck.shift();
  table.hiddenHands[playerId].push(drawnTile);

  // 檢查是否是開局第一張摸牌（用於天胡判斷）
  // 注意：補花不算第一張摸牌，只有補花完成後摸到的非花牌才算第一張摸牌
  const isFirstDraw = table.isFirstDraw || false;
  const isDealerFirstDraw = isFirstDraw && playerIndex === table.dealerIndex;

  // 檢查是否是摸到最後一張牌（摸牌後牌組為0）
  const isLastTile = table.deck.length === 0;
  if (isLastTile) {
    console.log(`>>> [海底撈魚檢測] 玩家${playerIndex + 1}摸到最後一張牌`);
    player.drewLastTile = true; // 標記玩家摸到了最後一張牌
  }

  // 如果玩家曾經開局聽牌，摸牌會改變手牌
  // 但如果是自摸胡牌，需要在胡牌時檢查天聽（手牌多了一張摸到的牌）
  // 所以這裡先不處理，在胡牌時再檢查

  console.log(`玩家${playerIndex + 1}摸牌: ${drawnTile}`);

  // 廣播摸牌事件
  io.to(tableId).emit('playerDrawTile', {
    playerId: playerId,
    playerIndex: playerIndex,
    tile: drawnTile,
    deckCount: table.deck.length
  });

  // 檢查是否為花牌
  if (isFlowerTile(drawnTile)) {
    console.log(`玩家${playerIndex + 1}摸到花牌: ${drawnTile}`);
    // 延遲處理補花，讓玩家先看到摸到的花牌（1.5秒）
    // 注意：補花不算第一張摸牌，不清除 isFirstDraw 標記
    setTimeout(() => {
      handleFlowerTile(tableId, playerId, drawnTile);
    }, 1500);
  } else {
    // 不是花牌，清除第一張摸牌標記（因為已經摸到非花牌了）
    if (isFirstDraw) {
      table.isFirstDraw = false;
    }
    // 不是花牌，檢測自摸胡牌
    // 注意：drawnTile 已經被加入 hiddenHands[playerId] 了
    const hand = table.hiddenHands[playerId];
    const melds = table.melds[playerId] || [];
    // 手牌中已經包含摸到的牌，需要排除剛摸到的牌再檢測
    // 使用 lastIndexOf 找到最後一次出現的位置（因為可能有多張相同的牌）
    let handWithoutDrawn;
    if (hand.includes(drawnTile)) {
      // 手牌中包含這張牌，排除最後一次出現的那張
      const lastIndex = hand.lastIndexOf(drawnTile);
      handWithoutDrawn = hand.slice(0, lastIndex).concat(hand.slice(lastIndex + 1));
    } else {
      // 手牌中不包含這張牌（不應該發生，但為了安全）
      handWithoutDrawn = [...hand];
    }
    console.log(`>>> [自摸檢測] 玩家${playerIndex + 1}摸牌：${drawnTile}`);
    console.log(`>>> [自摸檢測] 當前手牌：${hand.join(',')}，手牌數量：${hand.length}`);
    console.log(`>>> [自摸檢測] 排除目標牌後的手牌：${handWithoutDrawn.join(',')}，手牌數量：${handWithoutDrawn.length}`);
    console.log(`>>> [自摸檢測] 明牌數量：${melds.length}`);
    const canHuResult = canHu(handWithoutDrawn, drawnTile, melds.length);
    console.log(`>>> [自摸檢測] 自摸檢測結果：${canHuResult}`);

    // 檢查是否八仙過海（湊齊8張花牌，可以無視任何條件直接胡牌）
    const isBaXianGuoHai = player.isBaXianGuoHai || false;
    if (isBaXianGuoHai) {
      console.log(`>>> [八仙過海檢測] 玩家${playerIndex + 1}湊齊8張花牌，可以無視任何條件直接胡牌！`);
      // 八仙過海可以直接胡牌，不需要檢查 canHuResult
    }

    if (canHuResult || isBaXianGuoHai) {
      console.log(`>>> [自摸檢測] 玩家${playerIndex + 1}可以自摸胡牌！`);

      // 檢查是否是天胡（開局莊家摸起第一張牌就胡牌）
      if (isDealerFirstDraw) {
        console.log(`>>> [天胡檢測] 玩家${playerIndex + 1}（莊家）開局第一張摸牌就胡牌，標記為天胡`);
        player.isTianHu = true; // 標記為天胡
      }

      // 檢查是否是槓上開花（補槓/自槓後補牌，補牌後胡牌）
      if (player.lastKongAction) {
        console.log(`>>> [槓上開花檢測] 玩家${playerIndex + 1}補槓/自槓後補牌胡牌，標記為槓上開花`);
        player.isGangShangKaiHua = true; // 標記為槓上開花
        player.lastKongAction = null; // 清除標記
      }

      // 檢查是否是海底撈月（摸牌後牌組為0，即摸到的是最後一張牌）
      const isHaiDiLaoYue = table.deck.length === 0;
      if (isHaiDiLaoYue) {
        console.log(`>>> [海底撈月檢測] 玩家${playerIndex + 1}摸到最後一張牌自摸，標記為海底撈月`);
        player.isHaiDiLaoYue = true; // 標記為海底撈月
      }

      // 設置自摸胡牌等待狀態
      table.gamePhase = GamePhase.CLAIMING;
      // 初始化玩家決策追蹤
      const playerDecisions = {};
      playerDecisions[playerId] = {
        hasDecided: false,
        decision: null
      };
      
      table.claimingState = {
        discardPlayerId: playerId, // 自摸時，打出牌的玩家是自己
        discardedTile: drawnTile, // 自摸時，目標牌是剛摸到的牌
        claimType: 'selfDrawnHu', // 標記為自摸胡牌
        options: [{
          playerId: playerId,
          playerIndex: playerIndex,
          claimType: ClaimType.HU,
          priority: 1
        }],
        timer: 30,
        playerDecisions: playerDecisions
      };

      // 廣播自摸胡牌機會（使用與放槍胡牌相同的格式）
      io.to(tableId).emit('claimRequest', {
        discardPlayerId: playerId, // 自摸時，打出牌的玩家是自己
        discardedTile: drawnTile, // 自摸時，目標牌是剛摸到的牌
        options: [{
          playerId: playerId,
          playerIndex: playerIndex,
          claimType: ClaimType.HU,
          priority: 1
        }]
      });

      // 開始倒計時
      startClaimTimer(tableId);
    } else {
      // 不能自摸，檢測自槓（包括補槓）
      console.log(`>>> [自槓檢測] 玩家${playerIndex + 1}摸牌：${drawnTile}`);
      console.log(`>>> [自槓檢測] 當前手牌：${hand.join(',')}，手牌數量：${hand.length}`);
      console.log(`>>> [自槓檢測] 手牌（不包括剛摸起的牌）：${handWithoutDrawn.join(',')}，手牌數量：${handWithoutDrawn.length}`);

      // 檢測自槓：檢查兩種情況
      // 1. 剛摸起的牌加入手牌後有4張相同（canSelfKong檢測）
      // 2. 手牌中已有4張相同（不包括剛摸起的牌，之前選擇"棄"後留在手牌的牌）
      const canSelfKongResult = canSelfKong(handWithoutDrawn, drawnTile);
      console.log(`>>> [自槓檢測] 自槓檢測結果（手牌+摸起牌）：${canSelfKongResult}`);

      // 檢測手牌中是否已有4張相同（不包括剛摸起的牌）
      const countsInHand = {};
      handWithoutDrawn.forEach(tile => {
        countsInHand[tile] = (countsInHand[tile] || 0) + 1;
      });
      const hasFourInHand = Object.values(countsInHand).some(count => count >= 4);
      console.log(`>>> [自槓檢測] 手牌中是否已有4張相同（不包括摸起牌）：${hasFourInHand}`);

      const canDoSelfKong = canSelfKongResult || hasFourInHand;

      // 檢測補槓：檢查兩種情況
      // 1. 剛摸起的牌與碰牌相同
      // 2. 手牌中已有1張與碰牌相同（不包括剛摸起的牌）
      const melds = table.melds[playerId] || [];
      const pongMelds = melds.filter(meld => meld.type === 'pong');

      let canAddKong = false;
      // 檢查剛摸起的牌是否與碰牌相同
      const drawnTileMatchesPong = pongMelds.some(meld => {
        return meld.tiles && meld.tiles.length > 0 && meld.tiles[0] === drawnTile;
      });

      // 檢查手牌中是否有1張與碰牌相同（不包括剛摸起的牌）
      const handHasPongTile = pongMelds.some(meld => {
        if (meld.tiles && meld.tiles.length > 0) {
          const pongTile = meld.tiles[0];
          return handWithoutDrawn.includes(pongTile);
        }
        return false;
      });

      canAddKong = drawnTileMatchesPong || handHasPongTile;
      console.log(`>>> [補槓檢測] 剛摸起的牌是否與碰牌相同：${drawnTileMatchesPong}`);
      console.log(`>>> [補槓檢測] 手牌中是否已有1張與碰牌相同：${handHasPongTile}`);
      console.log(`>>> [補槓檢測] 玩家${playerIndex + 1}是否有可補槓的碰牌：${canAddKong}`);

      if (canDoSelfKong || canAddKong) {
        console.log(`>>> [自槓檢測] 玩家${playerIndex + 1}可以自槓或補槓！`);
        const kongTiles = [];

        // 自槓：找出可以自槓的牌（有4張相同的牌）
        if (canDoSelfKong) {
          // 統計整個手牌（包括剛摸起的牌）
          const counts = {};
          hand.forEach(tile => {
            counts[tile] = (counts[tile] || 0) + 1;
          });
          // 找出有4張或以上的牌（可能是之前選擇"棄"後留在手牌的牌）
          const selfKongTiles = Object.keys(counts).filter(tile => counts[tile] >= 4);
          kongTiles.push(...selfKongTiles);
          console.log(`>>> [自槓檢測] 可自槓的牌：${selfKongTiles.join(',')}`);
        }

        // 補槓：找出可以補槓的牌（有碰牌的牌）
        if (canAddKong) {
          pongMelds.forEach(meld => {
            if (meld.tiles && meld.tiles.length > 0) {
              const pongTile = meld.tiles[0];
              // 如果剛摸起的牌與碰牌相同，使用剛摸起的牌
              if (pongTile === drawnTile) {
                kongTiles.push(drawnTile);
              } else if (handWithoutDrawn.includes(pongTile)) {
                // 如果手牌中有1張與碰牌相同，使用碰牌的牌
                kongTiles.push(pongTile);
              }
            }
          });
          console.log(`>>> [補槓檢測] 可補槓的牌：${kongTiles.filter(t => !kongTiles.slice(0, kongTiles.length - 1).includes(t)).join(',')}`);
        }

        // 去重
        const uniqueKongTiles = [...new Set(kongTiles)];

        if (uniqueKongTiles.length > 0) {
          // 發送自槓提示給客戶端
          io.to(playerId).emit('selfKongAvailable', {
            playerId: playerId,
            playerIndex: playerIndex,
            tiles: uniqueKongTiles // 可以自槓或補槓的牌列表
          });
          console.log(`>>> [自槓檢測] 發送自槓/補槓提示給玩家${playerIndex + 1}，可自槓/補槓的牌：${uniqueKongTiles.join(',')}`);
        }
      }

      // 保留天聽記錄（不在摸牌時清除）
      // 天聽記錄將在打牌時檢查，如果打出的牌改變了手牌組合才清除
      // 這樣如果玩家摸到牌後直接打出相同牌，手牌組合沒變，仍然是天聽

      // 如果玩家已經天聽或地聽，自動打出摸到的牌（延遲1.5秒）
      if (player.isTianTing || player.isDiTing) {
        const tingType = player.isTianTing ? '天聽' : '地聽';
        console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}已${tingType}，將自動打出摸到的牌：${drawnTile}`);
        setTimeout(() => {
          // 再次檢查玩家是否仍然天聽且手牌中包含這張牌
          const currentTable = tables[tableId];
          if (!currentTable) return;
          const currentPlayer = currentTable.players[playerIndex];
          if (!currentPlayer || (!currentPlayer.isTianTing && !currentPlayer.isDiTing)) {
            const tingType = currentPlayer && currentPlayer.isTianTing ? '天聽' : (currentPlayer && currentPlayer.isDiTing ? '地聽' : '聽牌');
            console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}已不再${tingType}，取消自動打牌`);
            startTurnTimer(tableId, playerId);
            return;
          }
          const currentHand = currentTable.hiddenHands[playerId];
          const tingType = currentPlayer.isTianTing ? '天聽' : '地聽';
          if (currentHand && currentHand.includes(drawnTile)) {
            console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}自動打出：${drawnTile}`);
            discardTile(tableId, playerId, drawnTile);
          } else {
            // 如果手牌中沒有這張牌（可能是補花後換了牌），打出第一張牌
            if (currentHand && currentHand.length > 0) {
              console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}手牌中沒有摸到的牌，自動打出第一張牌：${currentHand[0]}`);
              discardTile(tableId, playerId, currentHand[0]);
            } else {
              startTurnTimer(tableId, playerId);
            }
          }
        }, 1500);
      } else {
        // 等待玩家打牌或自槓
        startTurnTimer(tableId, playerId);
      }
    }
  }
}

// 處理摸到花牌
function handleFlowerTile(tableId, playerId, flower) {
  const table = tables[tableId];
  if (!table) return;

  const playerIndex = table.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return;
  const player = table.players[playerIndex];
  if (!player) return;

  // 將花牌加入收集
  table.flowers[playerId].push(flower);

  // 檢查是否湊齊8張花牌（八仙過海）
  const playerFlowers = table.flowers[playerId] || [];
  const allFlowerTypes = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];
  const hasAllFlowers = allFlowerTypes.every(flowerType => playerFlowers.includes(flowerType));

  if (hasAllFlowers && playerFlowers.length >= 8) {
    console.log(`>>> [八仙過海檢測] 玩家${playerIndex + 1}湊齊8張花牌，標記為八仙過海`);
    player.isBaXianGuoHai = true; // 標記為八仙過海
  }

  // 從手牌移除花牌
  const hand = table.hiddenHands[playerId];
  const flowerIndex = hand.indexOf(flower);
  if (flowerIndex !== -1) {
    hand.splice(flowerIndex, 1);
  }

  // 補花時不清除天聽記錄
  // 補花只是換牌，如果換到的牌直接打出，手牌組合可能沒變，仍然是天聽
  // 天聽記錄將在打牌時檢查，如果打出的牌改變了手牌組合才清除

  // 補摸一張牌
  if (table.deck.length > 0) {
    // 如果是777777測試房間，且牌組最前面是南風，先保存南風，取下一張牌
    // 如果是222222測試房間，且牌組最前面是東風，先保存東風，取下一張牌
    // 如果是555555測試房間，且牌組最前面是四條或七條，先保存，取下一張牌
    let newTile;
    if (table.isTestKongRoom && table.deck[0] === '南') {
      // 保存南風
      const savedSouth = table.deck.shift();
      if (!table.savedSouthTile) {
        table.savedSouthTile = savedSouth;
        console.log(`>>> [777777測試] 補花時遇到南風，暫時保存，避免被補花消耗`);
      }
      // 如果還有牌，取下一張
      if (table.deck.length > 0) {
        newTile = table.deck.shift();
      } else {
        // 如果沒有其他牌了，使用保存的南風
        newTile = savedSouth;
        table.savedSouthTile = null;
      }
    } else if (table.isTestHuRoom && (table.deck[0] === '四條' || table.deck[0] === '七條')) {
      // 保存四條或七條（能讓玩家1胡牌的牌）
      const savedHuTile = table.deck.shift();
      if (!table.savedHuTile) {
        table.savedHuTile = savedHuTile;
        console.log(`>>> [555555測試] 補花時遇到${savedHuTile}，暫時保存，避免被補花消耗`);
      }
      // 如果還有牌，取下一張
      if (table.deck.length > 0) {
        newTile = table.deck.shift();
      } else {
        // 如果沒有其他牌了，使用保存的胡牌牌
        newTile = savedHuTile;
        table.savedHuTile = null;
      }
    } else {
      newTile = table.deck.shift();
    }
    hand.push(newTile);

    // 檢查是否是補摸到最後一張牌（補摸後牌組為0）
    const isLastTile = table.deck.length === 0;
    if (isLastTile) {
      console.log(`>>> [海底撈魚檢測] 玩家${playerIndex + 1}補花後摸到最後一張牌`);
      player.drewLastTile = true; // 標記玩家摸到了最後一張牌
    }

    console.log(`玩家${playerIndex + 1}補花: ${flower} -> ${newTile}`);

    // 廣播補花事件
    // 廣播遊戲中補花給所有玩家（確保所有玩家都能聽到音效）
    console.log(`>>> [音效廣播] 廣播遊戲中補花事件給房間 ${tableId} 的所有玩家`);
    io.to(tableId).emit('flowerReplacement', {
      playerId: playerId,
      playerIndex: playerIndex,
      flower: flower,
      newTile: newTile,
      isInitial: false
    });

    // 標記玩家最近進行了補花（用於槓上開花判斷）
    player.lastFlowerAction = true; // 標記為補花

    // 如果補摸的仍是花牌，繼續補花（延遲讓玩家看到新補的花牌）
    if (isFlowerTile(newTile)) {
      setTimeout(() => {
        handleFlowerTile(tableId, playerId, newTile);
      }, 2000); // 延遲2秒，讓玩家看到補摸到的花牌
    } else {
      // 補摸的不是花牌，檢測自摸胡牌
      const melds = table.melds[playerId] || [];
      // hand 中已經包含了 newTile，所以需要排除最後一張再檢測
      const handWithoutNewTile = hand.slice(0, -1);
      if (canHu(handWithoutNewTile, newTile, melds.length)) {
        console.log(`玩家${playerIndex + 1}補花後可以自摸胡牌！`);

        // 檢查是否是天胡（開局莊家補花後摸起第一張牌就胡牌）
        // 注意：補花後的摸牌也算是開局第一張摸牌
        const isFirstDraw = table.isFirstDraw || false;
        const isDealerFirstDraw = isFirstDraw && playerIndex === table.dealerIndex;
        if (isDealerFirstDraw) {
          console.log(`>>> [天胡檢測] 玩家${playerIndex + 1}（莊家）開局補花後第一張摸牌就胡牌，標記為天胡`);
          player.isTianHu = true; // 標記為天胡
          // 清除第一張摸牌標記（因為補花也算摸牌）
          table.isFirstDraw = false;
        }

        // 檢查是否是槓上開花（補花後補牌，補牌後胡牌）
        if (player.lastFlowerAction) {
          console.log(`>>> [槓上開花檢測] 玩家${playerIndex + 1}補花後補牌胡牌，標記為槓上開花`);
          player.isGangShangKaiHua = true; // 標記為槓上開花
          player.lastFlowerAction = false; // 清除標記
        }

        // 檢查是否是海底撈月（補摸後牌組為0，即補摸到的是最後一張牌）
        const isHaiDiLaoYue = table.deck.length === 0;
        if (isHaiDiLaoYue) {
          console.log(`>>> [海底撈月檢測] 玩家${playerIndex + 1}補花後摸到最後一張牌自摸，標記為海底撈月`);
          player.isHaiDiLaoYue = true; // 標記為海底撈月
        }

        // 設置自摸胡牌等待狀態
        table.gamePhase = GamePhase.CLAIMING;
        // 初始化玩家決策追蹤
        const playerDecisions2 = {};
        playerDecisions2[playerId] = {
          hasDecided: false,
          decision: null
        };
        
        table.claimingState = {
          discardPlayerId: playerId, // 自摸時，打出牌的玩家是自己
          discardedTile: newTile, // 自摸時，目標牌是補花後摸到的牌
          claimType: 'selfDrawnHu', // 標記為自摸胡牌
          options: [{
            playerId: playerId,
            playerIndex: playerIndex,
            claimType: ClaimType.HU,
            priority: 1
          }],
          timer: 30,
          playerDecisions: playerDecisions2
        };

        // 廣播自摸胡牌機會（使用與放槍胡牌相同的格式）
        io.to(tableId).emit('claimRequest', {
          discardPlayerId: playerId, // 自摸時，打出牌的玩家是自己
          discardedTile: newTile, // 自摸時，目標牌是補花後摸到的牌
          options: [{
            playerId: playerId,
            playerIndex: playerIndex,
            claimType: ClaimType.HU,
            priority: 1
          }]
        });

        // 開始倒計時
        setTimeout(() => {
          startClaimTimer(tableId);
        }, 1500);
      } else {
        // 不能自摸，檢測自槓（包括補槓）
        console.log(`>>> [補花後自槓檢測] 玩家${playerIndex + 1}補花後摸牌：${newTile}`);
        console.log(`>>> [補花後自槓檢測] 當前手牌：${hand.join(',')}，手牌數量：${hand.length}`);
        console.log(`>>> [補花後自槓檢測] 手牌（不包括剛摸起的牌）：${handWithoutNewTile.join(',')}，手牌數量：${handWithoutNewTile.length}`);

        // 檢測自槓：檢查兩種情況
        // 1. 剛摸起的牌加入手牌後有4張相同（canSelfKong檢測）
        // 2. 手牌中已有4張相同（不包括剛摸起的牌，之前選擇"棄"後留在手牌的牌）
        const canSelfKongResult = canSelfKong(handWithoutNewTile, newTile);
        console.log(`>>> [補花後自槓檢測] 自槓檢測結果（手牌+摸起牌）：${canSelfKongResult}`);

        // 檢測手牌中是否已有4張相同（不包括剛摸起的牌）
        const countsInHand = {};
        handWithoutNewTile.forEach(tile => {
          countsInHand[tile] = (countsInHand[tile] || 0) + 1;
        });
        const hasFourInHand = Object.values(countsInHand).some(count => count >= 4);
        console.log(`>>> [補花後自槓檢測] 手牌中是否已有4張相同（不包括摸起牌）：${hasFourInHand}`);

        const canDoSelfKong = canSelfKongResult || hasFourInHand;

        // 檢測補槓：檢查兩種情況
        // 1. 剛摸起的牌與碰牌相同
        // 2. 手牌中已有1張與碰牌相同（不包括剛摸起的牌）
        const melds = table.melds[playerId] || [];
        const pongMelds = melds.filter(meld => meld.type === 'pong');

        let canAddKong = false;
        // 檢查剛摸起的牌是否與碰牌相同
        const newTileMatchesPong = pongMelds.some(meld => {
          return meld.tiles && meld.tiles.length > 0 && meld.tiles[0] === newTile;
        });

        // 檢查手牌中是否有1張與碰牌相同（不包括剛摸起的牌）
        const handHasPongTile = pongMelds.some(meld => {
          if (meld.tiles && meld.tiles.length > 0) {
            const pongTile = meld.tiles[0];
            return handWithoutNewTile.includes(pongTile);
          }
          return false;
        });

        canAddKong = newTileMatchesPong || handHasPongTile;
        console.log(`>>> [補花後補槓檢測] 剛摸起的牌是否與碰牌相同：${newTileMatchesPong}`);
        console.log(`>>> [補花後補槓檢測] 手牌中是否已有1張與碰牌相同：${handHasPongTile}`);
        console.log(`>>> [補花後補槓檢測] 玩家${playerIndex + 1}是否有可補槓的碰牌：${canAddKong}`);

        if (canDoSelfKong || canAddKong) {
          console.log(`>>> [補花後自槓檢測] 玩家${playerIndex + 1}補花後可以自槓或補槓！`);
          const kongTiles = [];

          // 自槓：找出可以自槓的牌（有4張相同的牌）
          if (canDoSelfKong) {
            // 統計整個手牌（包括剛摸起的牌）
            const counts = {};
            hand.forEach(tile => {
              counts[tile] = (counts[tile] || 0) + 1;
            });
            // 找出有4張或以上的牌（可能是之前選擇"棄"後留在手牌的牌）
            const selfKongTiles = Object.keys(counts).filter(tile => counts[tile] >= 4);
            kongTiles.push(...selfKongTiles);
            console.log(`>>> [補花後自槓檢測] 可自槓的牌：${selfKongTiles.join(',')}`);
          }

          // 補槓：找出可以補槓的牌（有碰牌的牌）
          if (canAddKong) {
            pongMelds.forEach(meld => {
              if (meld.tiles && meld.tiles.length > 0) {
                const pongTile = meld.tiles[0];
                // 如果剛摸起的牌與碰牌相同，使用剛摸起的牌
                if (pongTile === newTile) {
                  kongTiles.push(newTile);
                } else if (handWithoutNewTile.includes(pongTile)) {
                  // 如果手牌中有1張與碰牌相同，使用碰牌的牌
                  kongTiles.push(pongTile);
                }
              }
            });
            console.log(`>>> [補花後補槓檢測] 可補槓的牌：${kongTiles.filter(t => !kongTiles.slice(0, kongTiles.length - 1).includes(t)).join(',')}`);
          }

          // 去重
          const uniqueKongTiles = [...new Set(kongTiles)];

          if (uniqueKongTiles.length > 0) {
            // 發送自槓提示給客戶端
            io.to(playerId).emit('selfKongAvailable', {
              playerId: playerId,
              playerIndex: playerIndex,
              tiles: uniqueKongTiles // 可以自槓或補槓的牌列表
            });
            console.log(`>>> [補花後自槓檢測] 發送自槓/補槓提示給玩家${playerIndex + 1}，可自槓/補槓的牌：${uniqueKongTiles.join(',')}`);
          }
        }

        // 如果玩家已經天聽或地聽，自動打出補花後摸到的牌（延遲1.5秒）
        const player = table.players[playerIndex];
        if (player && (player.isTianTing || player.isDiTing)) {
          const tingType = player.isTianTing ? '天聽' : '地聽';
          console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}已${tingType}，補花後將自動打出摸到的牌：${newTile}`);
          setTimeout(() => {
            // 再次檢查玩家是否仍然天聽且手牌中包含這張牌
            const currentTable = tables[tableId];
            if (!currentTable) return;
            const currentPlayer = currentTable.players[playerIndex];
            if (!currentPlayer || (!currentPlayer.isTianTing && !currentPlayer.isDiTing)) {
              const tingType = currentPlayer && currentPlayer.isTianTing ? '天聽' : (currentPlayer && currentPlayer.isDiTing ? '地聽' : '聽牌');
              console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}已不再${tingType}，取消自動打牌`);
              startTurnTimer(tableId, playerId);
              return;
            }
            const currentHand = currentTable.hiddenHands[playerId];
            const tingType = currentPlayer.isTianTing ? '天聽' : '地聽';
            if (currentHand && currentHand.includes(newTile)) {
              console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}自動打出：${newTile}`);
              discardTile(tableId, playerId, newTile);
            } else {
              // 如果手牌中沒有這張牌，打出第一張牌
              if (currentHand && currentHand.length > 0) {
                console.log(`>>> [${tingType}自動打牌] 玩家${playerIndex + 1}手牌中沒有摸到的牌，自動打出第一張牌：${currentHand[0]}`);
                discardTile(tableId, playerId, currentHand[0]);
              } else {
                startTurnTimer(tableId, playerId);
              }
            }
          }, 1500);
        } else {
          // 等待玩家打牌或自槓
          setTimeout(() => {
            startTurnTimer(tableId, playerId);
          }, 1500);
        }
      }
    }
  } else {
    console.log('牌組已空，無法補花');
    endGame(tableId, 'draw').catch(err => console.error('結束遊戲失敗:', err));
  }
}

// 開始回合計時
function startTurnTimer(tableId, playerId) {
  const table = tables[tableId];
  if (!table) return;

  // 檢查玩家是否仍然存在
  const playerIndex = table.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    console.log(`玩家 ${playerId} 不存在，無法開始回合計時`);
    return;
  }

  // 確保 turn 索引正確
  if (table.turn !== playerIndex) {
    table.turn = playerIndex;
  }

  console.log(`開始回合計時：玩家${table.turn + 1}，房間${tableId}`);

  table.timer = 30; // 30秒倒計時

  // 廣播輪次更新
  safeEmit(tableId, 'turnUpdate', {
    turn: table.turn,
    playerId: playerId,
    timeLeft: table.timer
  });

  const timerInterval = setInterval(() => {
    // 檢查房間和玩家是否仍然存在
    const currentTable = tables[tableId];
    if (!currentTable) {
      clearInterval(timerInterval);
      return;
    }

    const playerStillExists = currentTable.players.find(p => p.id === playerId);
    if (!playerStillExists) {
      clearInterval(timerInterval);
      currentTable.turnTimer = null;
      console.log(`玩家 ${playerId} 已離開，停止回合計時`);
      return;
    }

    currentTable.timer--;

    // 廣播倒計時
    safeEmit(tableId, 'timerUpdate', {
      playerId: playerId,
      timeLeft: currentTable.timer
    });

    if (currentTable.timer <= 0) {
      clearInterval(timerInterval);
      currentTable.turnTimer = null;
      // 倒數結束後不再自動執行任何動作，遊戲將停住並等待玩家自行出牌
      console.log(`>>> 倒數結束，等待玩家${playerId}自行出牌`);
    }
  }, 1000);

  // 儲存計時器ID以便清除
  table.turnTimer = timerInterval;
}

// 自動打牌（時間到時）
function autoDiscardTile(tableId, playerId) {
  const table = tables[tableId];
  if (!table) {
    console.log(`房間 ${tableId} 不存在，無法自動打牌`);
    return;
  }

  // 檢查玩家是否仍然存在
  const player = table.players.find(p => p.id === playerId);
  if (!player) {
    console.log(`玩家 ${playerId} 已離開，無法自動打牌`);
    return;
  }

  // 檢查玩家手牌是否存在
  const hand = table.hiddenHands[playerId];
  if (!hand || hand.length === 0) {
    console.log(`玩家 ${playerId} 手牌為空，無法自動打牌`);
    return;
  }

  const tileToDiscard = hand[0]; // 打第一張牌
  discardTile(tableId, playerId, tileToDiscard);
}

// 結束遊戲
async function endGame(tableId, reason, scores = null) {
  const table = tables[tableId];
  if (!table) return;

  table.gamePhase = GamePhase.ENDED;

  console.log(`遊戲結束 - 房間: ${tableId}, 原因: ${reason}`);

  // 清除所有計時器
  if (table.claimingTimer) {
    clearInterval(table.claimingTimer);
    table.claimingTimer = null;
    console.log('>>> 清除吃碰槓計時器');
  }

  if (table.tingTimer) {
    clearInterval(table.tingTimer);
    table.tingTimer = null;
    console.log('>>> 清除聽牌計時器');
  }

  if (table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
    console.log('>>> 清除回合計時器');
  }

  // 清除所有等待狀態
  table.claimingState = null;
  table.tingState = null;
  table.initialTingState = null;

  // 更新玩家分數（如果有提供，但通常分數已經在 declareHu 中累加）
  if (scores) {
    Object.keys(scores).forEach(playerId => {
      const player = table.players.find(p => p.id === playerId);
      if (player) {
        player.score = (player.score || 0) + scores[playerId];
      }
    });
  }

  // 廣播遊戲結束（包含天聽/地聽信息）
  console.log('>>> [結算] 準備廣播遊戲結束，檢查天聽/地聽玩家：');

  // 為每個玩家生成完整的胡牌描述
  const playersWithDescription = table.players.map((p, playerIndex) => {
    const isTianTing = p.isTianTing || false;
    const isDiTing = p.isDiTing || false;
    const isSelfDrawnHu = p.lastHuType === 'selfDrawnHu' || false;
    const hasHuType = p.lastHuType !== undefined && p.lastHuType !== null; // 只有真正胡牌的玩家才有 lastHuType

    // 檢查是否有明牌（吃碰槓）
    const melds = table.melds[p.id] || [];
    const hasNoMelds = melds.length === 0; // 門清：沒有吃碰槓

    // 計算玩家的風位（根據windStart和玩家座位）
    // windStart位置是東，(windStart+1)%4是南，(windStart+2)%4是西，(windStart+3)%4是北
    const windStart = table.windStart || 0;
    const playerWindIndex = (playerIndex - windStart + 4) % 4; // 玩家的風位索引：0=東, 1=南, 2=西, 3=北
    const windNames = ['東', '南', '西', '北'];
    const playerWindTile = windNames[playerWindIndex]; // 玩家對應的風牌名稱

    // 檢查門風台：手牌有3張以上對應自己風位的風牌，或有碰槓對應的風牌
    let hasMenFengTai = false;
    const hand = table.hiddenHands[p.id] || [];
    // 統計手牌中對應自己風位的風牌數量
    const windTileCountInHand = hand.filter(tile => tile === playerWindTile).length;
    // 檢查明牌（碰槓）中是否有對應自己風位的風牌
    const hasWindTileInMelds = melds.some(meld => {
      // 只檢查碰和槓（不檢查吃，因為吃不能是風牌）
      if (meld.type === 'pong' || meld.type === 'kong') {
        return meld.tiles && meld.tiles.includes(playerWindTile);
      }
      return false;
    });

    // 門風台條件：手牌有3張以上對應風位的風牌，或有碰槓對應的風牌
    if (windTileCountInHand >= 3 || hasWindTileInMelds) {
      hasMenFengTai = true;
      console.log(`>>> [門風台檢測] 玩家${playerIndex + 1}風位：${playerWindTile}，手牌中${playerWindTile}數量：${windTileCountInHand}，明牌中有${playerWindTile}：${hasWindTileInMelds}`);
    }

    // 檢查三元台：手牌有3張以上的"中、發、白"，或是有碰槓對應的"中、發、白"
    const dragonTiles = ['中', '發', '白']; // 三元牌名稱
    let sanYuanTaiCount = 0; // 三元台數量（最多3種）

    dragonTiles.forEach(dragonTile => {
      // 統計手牌中該三元牌的數量
      const dragonTileCountInHand = hand.filter(tile => tile === dragonTile).length;

      // 檢查明牌（碰槓）中是否有該三元牌
      const hasDragonTileInMelds = melds.some(meld => {
        // 只檢查碰和槓（不檢查吃，因為吃不能是字牌）
        if (meld.type === 'pong' || meld.type === 'kong') {
          return meld.tiles && meld.tiles.includes(dragonTile);
        }
        return false;
      });

      // 三元台條件：手牌有3張以上該三元牌，或有碰槓對應的該三元牌
      if (dragonTileCountInHand >= 3 || hasDragonTileInMelds) {
        sanYuanTaiCount++;
        console.log(`>>> [三元台檢測] 玩家${playerIndex + 1}三元牌：${dragonTile}，手牌中${dragonTile}數量：${dragonTileCountInHand}，明牌中有${dragonTile}：${hasDragonTileInMelds}`);
      }
    });

    // 檢查花牌：胡牌後玩家身上的補花若有跟自身座位風向對應的花牌則會在結算顯示花牌(n)
    // 對應關係：東(春、梅)，南(夏、蘭)，西(秋、菊)，北(冬、竹)
    let flowerTaiCount = 0; // 花牌台數量（最多2）
    const playerFlowers = table.flowers[p.id] || []; // 玩家的補花花牌
    const windFlowerMap = {
      0: ['春', '梅'], // 東
      1: ['夏', '蘭'], // 南
      2: ['秋', '菊'], // 西
      3: ['冬', '竹']  // 北
    };
    const playerWindFlowers = windFlowerMap[playerWindIndex] || []; // 玩家風位對應的花牌

    // 檢查玩家是否有對應自己風位的花牌
    playerWindFlowers.forEach(flowerTile => {
      if (playerFlowers.includes(flowerTile)) {
        flowerTaiCount++;
        console.log(`>>> [花牌檢測] 玩家${playerIndex + 1}風位：${playerWindTile}，有對應花牌：${flowerTile}`);
      }
    });

    // 生成胡牌描述（動態組合所有特殊牌型）
    // 只有真正胡牌的玩家（有 lastHuType）才顯示胡牌描述
    let huDescription = '';
    if (reason === 'hu' && hasHuType) {
      const specialTypes = [];

      // 檢查是否同時有自摸和門清，合併顯示為"門清自摸"
      if (isSelfDrawnHu && hasNoMelds) {
        specialTypes.push('門清自摸');
      } else {
        // 如果不同時有，分別處理
        if (isSelfDrawnHu) {
          specialTypes.push('自摸');
        }
        if (hasNoMelds) {
          specialTypes.push('門清');
        }
      }

      // 檢查天聽和地聽
      if (isTianTing) specialTypes.push('天聽');
      if (isDiTing) specialTypes.push('地聽');
      // 檢查門風台
      if (hasMenFengTai) {
        specialTypes.push('門風台');
      }
      // 檢查三元台
      if (sanYuanTaiCount > 0) {
        specialTypes.push(`三元台(${sanYuanTaiCount})`);
      }
      // 檢查花牌
      if (flowerTaiCount > 0) {
        specialTypes.push(`花牌(${flowerTaiCount})`);
      }
      // 檢查海底撈月
      const isHaiDiLaoYue = p.isHaiDiLaoYue || false;
      if (isHaiDiLaoYue) {
        specialTypes.push('海底撈月');
        console.log(`>>> [海底撈月檢測] 玩家${playerIndex + 1}海底撈月，加入結算`);
      }
      // 檢查海底撈魚
      const isHaiDiLaoYu = p.isHaiDiLaoYu || false;
      if (isHaiDiLaoYu) {
        specialTypes.push('海底撈魚');
        console.log(`>>> [海底撈魚檢測] 玩家${playerIndex + 1}海底撈魚，加入結算`);
      }
      // 檢查獨聽
      const isDuTing = p.isDuTing || false;
      if (isDuTing) {
        specialTypes.push('獨聽');
        console.log(`>>> [獨聽檢測] 玩家${playerIndex + 1}獨聽，加入結算`);
      }
      // 檢查搶槓
      const isQiangGang = p.isQiangGang || false;
      if (isQiangGang) {
        specialTypes.push('搶槓');
        console.log(`>>> [搶槓檢測] 玩家${playerIndex + 1}搶槓，加入結算`);
      }
      // 檢查全求
      const isQuanQiu = p.isQuanQiu || false;
      if (isQuanQiu) {
        specialTypes.push('全求');
        console.log(`>>> [全求檢測] 玩家${playerIndex + 1}全求，加入結算`);
      }
      // 檢查花槓
      const isHuaGang = p.isHuaGang || false;
      if (isHuaGang) {
        specialTypes.push('花槓');
        console.log(`>>> [花槓檢測] 玩家${playerIndex + 1}花槓，加入結算`);
      }
      // 檢查三暗刻、四暗刻、五暗刻
      const isSanAnKe = p.isSanAnKe || false;
      const isSiAnKe = p.isSiAnKe || false;
      const isWuAnKe = p.isWuAnKe || false;
      if (isWuAnKe) {
        specialTypes.push('五暗刻');
        console.log(`>>> [暗刻檢測] 玩家${playerIndex + 1}五暗刻，加入結算`);
      } else if (isSiAnKe) {
        specialTypes.push('四暗刻');
        console.log(`>>> [暗刻檢測] 玩家${playerIndex + 1}四暗刻，加入結算`);
      } else if (isSanAnKe) {
        specialTypes.push('三暗刻');
        console.log(`>>> [暗刻檢測] 玩家${playerIndex + 1}三暗刻，加入結算`);
      }
      // 檢查清一色
      const isQingYiSe = p.isQingYiSe || false;
      if (isQingYiSe) {
        specialTypes.push('清一色');
        console.log(`>>> [清一色檢測] 玩家${playerIndex + 1}清一色，加入結算`);
      }
      // 檢查字一色
      const isZiYiSe = p.isZiYiSe || false;
      if (isZiYiSe) {
        specialTypes.push('字一色');
        console.log(`>>> [字一色檢測] 玩家${playerIndex + 1}字一色，加入結算`);
      }
      // 檢查槓上開花
      const isGangShangKaiHua = p.isGangShangKaiHua || false;
      if (isGangShangKaiHua) {
        specialTypes.push('槓上開花');
        console.log(`>>> [槓上開花檢測] 玩家${playerIndex + 1}槓上開花，加入結算`);
      }
      // 檢查大四喜
      const isDaSiXi = p.isDaSiXi || false;
      if (isDaSiXi) {
        specialTypes.push('大四喜');
        console.log(`>>> [大四喜檢測] 玩家${playerIndex + 1}大四喜，加入結算`);
      }
      // 檢查小四喜
      const isXiaoSiXi = p.isXiaoSiXi || false;
      if (isXiaoSiXi) {
        specialTypes.push('小四喜');
        console.log(`>>> [小四喜檢測] 玩家${playerIndex + 1}小四喜，加入結算`);
      }
      // 檢查碰碰胡
      const isPengPengHu = p.isPengPengHu || false;
      if (isPengPengHu) {
        specialTypes.push('碰碰胡');
        console.log(`>>> [碰碰胡檢測] 玩家${playerIndex + 1}碰碰胡，加入結算`);
      }
      // 檢查天胡
      const isTianHu = p.isTianHu || false;
      if (isTianHu) {
        specialTypes.push('天胡');
        console.log(`>>> [天胡檢測] 玩家${playerIndex + 1}天胡，加入結算`);
      }
      // 檢查混一色
      const isHunYiSe = p.isHunYiSe || false;
      if (isHunYiSe) {
        specialTypes.push('混一色');
        console.log(`>>> [混一色檢測] 玩家${playerIndex + 1}混一色，加入結算`);
      }
      // 檢查八仙過海
      const isBaXianGuoHai = p.isBaXianGuoHai || false;
      if (isBaXianGuoHai) {
        specialTypes.push('八仙過海');
        console.log(`>>> [八仙過海檢測] 玩家${playerIndex + 1}八仙過海，加入結算`);
      }
      // 檢查哩咕哩咕
      const isLiGuLiGu = p.isLiGuLiGu || false;
      if (isLiGuLiGu) {
        specialTypes.push('哩咕哩咕');
        console.log(`>>> [哩咕哩咕檢測] 玩家${playerIndex + 1}哩咕哩咕，加入結算`);
      }
      // 檢查大三元
      const isDaSanYuan = p.isDaSanYuan || false;
      if (isDaSanYuan) {
        specialTypes.push('大三元');
        console.log(`>>> [大三元檢測] 玩家${playerIndex + 1}大三元，加入結算`);
      }
      // 檢查小三元
      const isXiaoSanYuan = p.isXiaoSanYuan || false;
      if (isXiaoSanYuan) {
        specialTypes.push('小三元');
        console.log(`>>> [小三元檢測] 玩家${playerIndex + 1}小三元，加入結算`);
      }
      // 未來可以在這裡添加更多特殊牌型，例如：
      // if (isSomeSpecialType) specialTypes.push('特殊牌型');

      if (specialTypes.length > 0) {
        huDescription = ` (胡牌+${specialTypes.join('+')})`;
      }
    }

    return {
      id: p.id,
      name: p.name, // 添加玩家名稱
      avatarUrl: p.avatarUrl || null, // 添加頭像URL
      score: p.score,
      isTianTing: isTianTing,
      isDiTing: isDiTing,
      isSelfDrawnHu: isSelfDrawnHu,
      huDescription: huDescription // 完整的胡牌描述，由伺服器端生成
    };
  });

  playersWithDescription.forEach((p, index) => {
    const player = table.players.find(pl => pl.id === p.id);
    const melds = player ? (table.melds[player.id] || []) : [];
    console.log(`>>> [結算] 玩家${index + 1} (ID: ${p.id}): isTianTing = ${p.isTianTing}, isDiTing = ${p.isDiTing}, isSelfDrawnHu = ${p.isSelfDrawnHu}, 明牌數量 = ${melds.length}, 描述 = "${p.huDescription}"`);
  });

  // 準備最終結算資料
  const finalScores = table.players.map(p => ({ 
    id: p.id, 
    score: p.score || 0 
  }));

  // 準備每圈分數變化記錄
  const roundHistory = (table.roundHistory || []).map(roundData => ({
    round: roundData.round,
    scores: roundData.scores,
    winnerId: roundData.winnerId
  }));

  // 準備玩家統計資料
  const playersWithStats = playersWithDescription.map((p, index) => {
    const player = table.players[index];
    return {
      ...p,
      userId: player.userId || null, // 添加6位數userId
      remark: player.remark || player.bio || null, // 備註內容（優先使用 remark，如果沒有則使用 bio）
      statistics: player.statistics || {
        selfDraws: 0,
        discards: 0,
        claimedDiscards: 0,
        discardedHu: 0
      }
    };
  });

  safeEmit(tableId, 'gameEnd', {
    reason: reason === 'completed' ? 'completed' : reason,
    players: playersWithStats,
    finalScores: finalScores,
    roundHistory: roundHistory,
    maxRounds: table.maxRounds || 1,
    currentRound: table.round || 1
  });

  // 扣除房間創建者的卡片（流局或胡牌時都扣除）
  if (reason === 'draw' || reason === 'hu') {
    try {
      // 從數據庫獲取房間信息
      const room = await prisma.room.findUnique({
        where: { roomId: tableId },
        select: { creatorId: true },
      });

      if (room && room.creatorId) {
        // 獲取創建者的當前卡片數量
        const creator = await prisma.player.findUnique({
          where: { id: room.creatorId },
          select: { cardCount: true },
        });

        if (creator && creator.cardCount > 0) {
          const previousCount = creator.cardCount;
          const newCount = previousCount - 1;

          // 扣除一張卡片並記錄消耗
          await prisma.$transaction([
            prisma.player.update({
              where: { id: room.creatorId },
              data: {
                cardCount: {
                  decrement: 1,
                },
              },
            }),
            prisma.cardConsumptionRecord.create({
              data: {
                playerId: room.creatorId,
                roomId: tableId,
                amount: 1,
                reason: 'game_end',
                previousCount: previousCount,
                newCount: newCount,
              },
            }),
          ]);
          console.log(`已扣除房間創建者 ${room.creatorId} 的卡片，剩餘: ${newCount}`);
        } else {
          console.log(`房間創建者 ${room.creatorId} 卡片數量不足，無法扣除`);
        }
      } else {
        console.log(`無法找到房間 ${tableId} 的創建者信息`);
      }
    } catch (error) {
      console.error(`扣除房間創建者卡片失敗: ${tableId}`, error);
      // 不影響遊戲結束流程，只記錄錯誤
    }
  }
}

// 打牌函數
function discardTile(tableId, playerId, tile) {
  const table = tables[tableId];
  if (!table || table.gamePhase !== GamePhase.PLAYING) return;

  // 檢查是否輪到該玩家
  const playerIndex = table.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    console.log(`玩家 ${playerId} 不存在，無法打牌`);
    return;
  }

  // 檢查玩家是否存在
  const player = table.players[playerIndex];
  if (!player || !player.id) {
    console.log(`玩家索引 ${playerIndex} 無效，無法打牌`);
    return;
  }

  if (playerIndex !== table.turn) {
    console.log(`不是玩家${playerIndex + 1}的回合`);
    return;
  }

  // 檢查手牌是否存在
  const hand = table.hiddenHands[playerId];
  if (!hand) {
    console.log(`玩家 ${playerId} 的手牌不存在，無法打牌`);
    return;
  }

  const tileIndex = hand.indexOf(tile);
  if (tileIndex === -1) {
    console.log(`玩家${playerIndex + 1}手牌中沒有這張牌: ${tile}`);
    return;
  }

  // 清除計時器
  if (table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
  }

  // 從手牌移除並加入打出牌
  hand.splice(tileIndex, 1);
  table.discards[playerId].push(tile);

  // 如果玩家曾經開局聽牌（天聽或地聽），檢查打牌後手牌是否改變
  if (player.initialTingHand) {
    const currentHand = [...hand]; // 打牌後的手牌
    const initialHand = [...player.initialTingHand];
    const currentMelds = (table.melds[playerId] || []).length;
    const initialMelds = player.initialTingMelds;

    // 排序後比較（因為順序可能不同）
    currentHand.sort();
    initialHand.sort();

    // 檢查手牌是否相同
    const handSame = currentHand.length === initialHand.length &&
      currentHand.every((tile, index) => tile === initialHand[index]);

    // 檢查明牌數量是否相同
    const meldsSame = currentMelds === initialMelds;

    if (!handSame || !meldsSame) {
      // 手牌組合改變，清除天聽/地聽記錄
      const tingType = player.isTianTing ? '天聽' : (player.isDiTing ? '地聽' : '聽牌');
      player.initialTingHand = null;
      player.initialTingMelds = null;
      player.isTianTing = false; // 清除天聽標記
      player.isDiTing = false; // 清除地聽標記
      console.log(`>>> 玩家${playerIndex + 1}打牌後，手牌組合改變，不再符合${tingType}條件`);
      console.log(`>>> 開局手牌：${initialHand.join(',')}，明牌數量：${initialMelds}`);
      console.log(`>>> 當前手牌：${currentHand.join(',')}，明牌數量：${currentMelds}`);
    } else {
      const tingType = player.isTianTing ? '天聽' : (player.isDiTing ? '地聽' : '聽牌');
      console.log(`>>> 玩家${playerIndex + 1}打牌後，手牌組合未變，保留${tingType}記錄`);
    }
  }

  // 記錄最後打出的牌
  // 檢查是否是摸到最後一張牌後打出的牌（海底撈魚）
  const isLastTileDiscard = player.drewLastTile || false;
  if (isLastTileDiscard) {
    console.log(`>>> [海底撈魚檢測] 玩家${playerIndex + 1}摸到最後一張牌後打出：${tile}`);
    player.drewLastTile = false; // 清除標記
  }

  table.lastDiscard = {
    playerId: playerId,
    tile: tile,
    index: table.discards[playerId].length - 1,
    isLastTile: isLastTileDiscard // 標記是否是最後一張牌打出的
  };

  // 記錄是否為莊家第一次打牌（在清除標記之前）
  const wasFirstDealerDiscard = table.isFirstDealerDiscard && playerIndex === table.dealerIndex;

  // 清除莊家第一次打牌標記（如果已經打過）
  if (wasFirstDealerDiscard) {
    console.log(`>>> [天聽檢測] 莊家第一次打牌完成，清除標記`);
    table.isFirstDealerDiscard = false;
  }

  console.log(`玩家${playerIndex + 1}打出: ${tile}`);

  // 廣播打牌事件
  // 廣播打牌事件給所有玩家（確保所有玩家都能聽到打牌音效）
  console.log(`>>> [音效廣播] 廣播打牌事件給房間 ${tableId} 的所有玩家，玩家${playerIndex + 1}打出：${tile}`);
  io.to(tableId).emit('playerDiscard', {
    playerId: playerId,
    playerIndex: playerIndex,
    tile: tile,
    discardIndex: table.lastDiscard.index
  });

  // 檢測是否聽牌（打牌後）
  // 注意：hand 已經在第 537 行宣告，但打牌後手牌已更新，需要重新獲取
  const updatedHand = table.hiddenHands[playerId];
  const melds = table.melds[playerId] || [];
  console.log(`玩家${playerIndex + 1}打牌後手牌：${updatedHand.join(',')}，明牌數量：${melds.length}`);

  // 優先檢測打牌玩家是否可以聽牌（打牌後）
  const currentPlayer = table.players[playerIndex];
  if (currentPlayer && currentPlayer.id && !currentPlayer.isTing) {
    // 檢測是否聽牌（打牌後）
    const isTing = canTing(updatedHand, melds.length);
    console.log(`玩家${playerIndex + 1}打牌後聽牌檢測結果：${isTing}`);

    if (isTing) {
      console.log(`玩家${playerIndex + 1}打牌後可以聽牌！手牌：${updatedHand.join(',')}，明牌：${melds.length}組`);

      // 使用之前記錄的 wasFirstDealerDiscard 標記
      // 檢查地聽條件：第一圈、非莊家、摸牌打牌後聽牌、沒有其他玩家吃碰槓
      const isDiTingCandidate = table.isFirstRound &&
        playerIndex !== table.dealerIndex &&
        !table.hasFirstRoundClaim &&
        wasFirstDealerDiscard === false; // 莊家已經打過牌，輪到其他玩家

      table.tingState = {
        playerId: playerId,
        playerIndex: playerIndex,
        timer: 30,
        isAfterDiscard: true,
        isTianTingCandidate: wasFirstDealerDiscard || false, // 標記為天聽候選
        isDiTingCandidate: isDiTingCandidate || false // 標記為地聽候選
      };

      if (wasFirstDealerDiscard) {
        console.log(`>>> [天聽檢測] 這是莊家第一次打牌後的聽牌，標記為天聽候選`);
      }

      if (isDiTingCandidate) {
        console.log(`>>> [地聽檢測] 玩家${playerIndex + 1}在第一圈摸牌打牌後聽牌，且沒有其他玩家吃碰槓，標記為地聽候選`);
      }

      // 設置聽牌等待狀態
      table.gamePhase = GamePhase.CLAIMING;

      // 通知客戶端可以聽牌（發送到整個房間，客戶端會判斷是否是自己）
      // 延遲一小段時間，確保客戶端已經處理完打牌事件
      setTimeout(() => {
        io.to(tableId).emit('tingAvailable', {
          playerId: playerId,
          playerIndex: playerIndex,
          isTianTingCandidate: wasFirstDealerDiscard || false,
          isDiTingCandidate: isDiTingCandidate || false
        });
      }, 100);

      // 開始聽牌倒計時
      startTingTimer(tableId);

      // 聽牌選項優先，不檢查其他玩家的吃碰槓（聽牌決策完成後再處理）
      return;
    }
  }

  // 如果玩家已經聽牌，不再檢測聽牌
  if (currentPlayer && currentPlayer.isTing) {
    console.log(`玩家${playerIndex + 1}已經聽牌，不再顯示聽牌選項`);
    // 檢查其他玩家是否可以吃碰槓胡
    const hasClaims = checkClaims(tableId, playerId, tile);
    if (!hasClaims) {
      // 沒有吃碰槓機會，直接輪到下一家
      nextTurn(tableId);
    }
    return;
  }

  // 如果玩家不能聽牌，檢查其他玩家是否可以吃碰槓胡
  const hasClaims = checkClaims(tableId, playerId, tile);
  if (!hasClaims) {
    // 沒有吃碰槓機會，直接輪到下一家
    nextTurn(tableId);
  }
}

// 檢查吃碰槓胡機會
// 返回是否有吃碰槓機會
function checkClaims(tableId, discardPlayerId, discardedTile) {
  const table = tables[tableId];
  if (!table) return false;

  const discardPlayerIndex = table.players.findIndex(p => p.id === discardPlayerId);
  if (discardPlayerIndex === -1) {
    console.log(`玩家 ${discardPlayerId} 不存在，無法檢查吃碰槓胡機會`);
    return false;
  }

  const claimOptions = [];

  // 檢查其他玩家（使用實際的玩家陣列長度，而不是固定的 4）
  for (let i = 0; i < table.players.length; i++) {
    if (i === discardPlayerIndex) continue; // 跳過打出牌的玩家

    const player = table.players[i];
    // 檢查玩家是否存在
    if (!player || !player.id) {
      console.log(`玩家索引 ${i} 不存在，跳過`);
      continue;
    }

    // 檢查玩家手牌是否存在
    const hand = table.hiddenHands[player.id];
    if (!hand) {
      console.log(`玩家 ${player.id} 的手牌不存在，跳過`);
      continue;
    }

    const melds = table.melds[player.id] || [];

    // 如果玩家已經天聽或地聽，只檢查胡牌，不顯示吃碰槓決策
    if (player.isTianTing || player.isDiTing) {
      const tingType = player.isTianTing ? '天聽' : '地聽';
      console.log(`>>> [吃碰槓檢測] 玩家${i + 1}已${tingType}，只檢查胡牌，不顯示吃碰槓決策`);
      // 檢查胡牌（考慮明牌數量）
      const canHuResult = canHu(hand, discardedTile, melds.length);
      if (canHuResult) {
        console.log(`>>> [胡牌檢測] 玩家${i + 1}可以胡牌！`);
        claimOptions.push({
          playerId: player.id,
          playerIndex: i,
          claimType: ClaimType.HU,
          priority: 1 // 胡牌優先級最高
        });
      }
      // 跳過吃碰槓檢查
      continue;
    }

    // 檢查是否八仙過海（湊齊8張花牌，可以無視任何條件直接胡牌）
    const isBaXianGuoHai = player.isBaXianGuoHai || false;
    if (isBaXianGuoHai) {
      console.log(`>>> [八仙過海檢測] 玩家${i + 1}湊齊8張花牌，可以無視任何條件直接胡牌！`);
      claimOptions.push({
        playerId: player.id,
        playerIndex: i,
        claimType: ClaimType.HU,
        priority: 1 // 胡牌優先級最高
      });
    }

    // 檢查胡牌（考慮明牌數量）
    console.log(`>>> [胡牌檢測] 玩家${i + 1}，手牌：${hand.join(',')}，手牌數量：${hand.length}，明牌數量：${melds.length}，目標牌：${discardedTile}，是否聽牌：${player.isTing}`);
    const canHuResult = canHu(hand, discardedTile, melds.length);
    console.log(`>>> [胡牌檢測] 玩家${i + 1}胡牌檢測結果：${canHuResult}`);
    if (canHuResult) {
      console.log(`>>> [胡牌檢測] 玩家${i + 1}可以胡牌！`);
      claimOptions.push({
        playerId: player.id,
        playerIndex: i,
        claimType: ClaimType.HU,
        priority: 1 // 胡牌優先級最高
      });
    }

    // 檢查槓牌
    if (canKong(hand, discardedTile)) {
      claimOptions.push({
        playerId: player.id,
        playerIndex: i,
        claimType: ClaimType.KONG,
        priority: 2
      });
    }

    // 檢查碰牌
    if (canPong(hand, discardedTile)) {
      claimOptions.push({
        playerId: player.id,
        playerIndex: i,
        claimType: ClaimType.PONG,
        priority: 3
      });
    }

    // 檢查吃牌（只有上家可以吃）
    // 注意：這裡需要根據實際玩家數量計算上家，而不是固定的 4
    const nextPlayerIndex = (discardPlayerIndex + 1) % table.players.length;
    if (i === nextPlayerIndex && canChi(hand, discardedTile, discardPlayerIndex, i)) {
      claimOptions.push({
        playerId: player.id,
        playerIndex: i,
        claimType: ClaimType.CHI,
        priority: 4
      });
    }
  }

  if (claimOptions.length > 0) {
    // 按優先級排序（數字越小優先級越高）
    claimOptions.sort((a, b) => a.priority - b.priority);

    // 設置吃碰槓胡等待狀態
    table.gamePhase = GamePhase.CLAIMING;
    // 初始化玩家決策追蹤：記錄每個有決策權的玩家ID
    const playersWithOptions = [...new Set(claimOptions.map(opt => opt.playerId))];
    const playerDecisions = {};
    playersWithOptions.forEach(playerId => {
      playerDecisions[playerId] = {
        hasDecided: false,
        decision: null // 'claim' 或 'pass'
      };
    });
    
    table.claimingState = {
      discardPlayerId: discardPlayerId,
      discardedTile: discardedTile,
      options: claimOptions,
      timer: 30, // 30秒等待時間（給客戶端足夠的時間）
      playerDecisions: playerDecisions // 追蹤每個玩家的決策狀態
    };

    console.log(`檢測到吃碰槓胡機會: ${claimOptions.map(opt => `玩家${opt.playerIndex + 1}(${opt.claimType})`).join(', ')}`);

    // 廣播吃碰槓胡等待
    io.to(tableId).emit('claimRequest', {
      discardPlayerId: discardPlayerId,
      discardedTile: discardedTile,
      options: claimOptions
    });

    // 開始倒計時（增加到30秒，給客戶端更多時間）
    startClaimTimer(tableId);
    return true; // 有吃碰槓機會
  } else {
    // 沒有人要吃碰槓胡，輪到下一家
    // 注意：不在這裡調用 nextTurn，讓調用者決定是否立即輪到下一家
    return false; // 沒有吃碰槓機會
  }
}

// 開始吃碰槓胡倒計時
function startClaimTimer(tableId) {
  const table = tables[tableId];
  if (!table || !table.claimingState) return;

  // 檢查遊戲是否已結束
  if (table.gamePhase === GamePhase.ENDED) {
    console.log('>>> 遊戲已結束，無法開始吃碰槓倒計時');
    return;
  }

  const claimTimer = setInterval(() => {
    // 檢查房間是否仍然存在
    const currentTable = tables[tableId];
    if (!currentTable) {
      clearInterval(claimTimer);
      return;
    }

    // 檢查遊戲是否已結束
    if (currentTable.gamePhase === GamePhase.ENDED) {
      clearInterval(claimTimer);
      currentTable.claimingTimer = null;
      console.log('>>> 遊戲已結束，停止吃碰槓倒計時');
      return;
    }

    // 檢查 claimingState 是否仍然存在
    if (!currentTable.claimingState) {
      clearInterval(claimTimer);
      currentTable.claimingTimer = null;
      return;
    }

    currentTable.claimingState.timer--;

    // 廣播倒計時
    safeEmit(tableId, 'claimTimerUpdate', {
      timeLeft: currentTable.claimingState.timer
    });

    if (currentTable.claimingState.timer <= 0) {
      clearInterval(claimTimer);
      currentTable.claimingTimer = null;
      // 時間到，自動放棄吃碰槓
      console.log('>>> 吃碰槓超時（30秒），自動放棄');
      passClaim(tableId, null);
    }
  }, 1000);

  table.claimingTimer = claimTimer;
}

// 開始聽牌倒計時
function startTingTimer(tableId) {
  const table = tables[tableId];
  if (!table || !table.tingState) return;

  const tingTimer = setInterval(() => {
    // 檢查房間是否仍然存在
    const currentTable = tables[tableId];
    if (!currentTable) {
      clearInterval(tingTimer);
      return;
    }

    // 檢查 tingState 是否仍然存在
    if (!currentTable.tingState) {
      clearInterval(tingTimer);
      currentTable.tingTimer = null;
      return;
    }

    currentTable.tingState.timer--;

    // 廣播倒計時
    safeEmit(tableId, 'tingTimerUpdate', {
      timeLeft: currentTable.tingState.timer
    });

    if (currentTable.tingState.timer <= 0) {
      clearInterval(tingTimer);
      currentTable.tingTimer = null;
      // 時間到，自動放棄聽牌
      console.log('>>> 聽牌超時（30秒），自動放棄');
      passTing(tableId, null);
    }
  }, 1000);

  table.tingTimer = tingTimer;
}

// 檢測開局聽牌（天聽）
function checkInitialTing(tableId) {
  const table = tables[tableId];
  if (!table) return;

  console.log('>>> 開始檢測開局聽牌（天聽）');

  // 檢測所有玩家的手牌是否可聽牌
  const tingPlayers = [];
  // 使用實際的玩家陣列長度，而不是固定的 4
  for (let i = 0; i < table.players.length; i++) {
    const player = table.players[i];
    if (!player || !player.id) {
      console.log(`玩家索引 ${i} 不存在，跳過開局聽牌檢測`);
      continue;
    }

    // 檢查玩家手牌是否存在
    const hand = table.hiddenHands[player.id];
    if (!hand) {
      console.log(`玩家 ${player.id} 的手牌不存在，跳過開局聽牌檢測`);
      continue;
    }

    const melds = table.melds[player.id] || [];

    // 檢測是否聽牌
    const isTing = canTing(hand, melds.length);

    if (isTing) {
      console.log(`>>> 玩家${i + 1}開局可聽牌（天聽）！`);
      tingPlayers.push({
        playerId: player.id,
        playerIndex: i,
        initialHand: [...hand], // 保存開局手牌（用於判斷天聽）
        initialMelds: melds.length
      });
    }
  }

  if (tingPlayers.length > 0) {
    console.log(`>>> 發現${tingPlayers.length}位玩家可開局聽牌`);

    // 設置開局聽牌等待狀態
    table.gamePhase = GamePhase.CLAIMING;
    table.initialTingState = {
      players: tingPlayers,
      currentPlayerIndex: 0,
      timer: 30
    };

    // 開始處理第一個可聽牌的玩家
    processInitialTingPlayer(tableId);
  } else {
    // 沒有玩家可聽牌，直接進入遊戲
    table.gamePhase = GamePhase.PLAYING;
    console.log('>>> 沒有玩家可開局聽牌，直接開始遊戲');

    // 如果是777777測試房間，在補花完成後調整牌組順序，確保玩家1第一次摸牌會摸到南風
    if (table.isTestKongRoom && table.dealerIndex === 0) {
      // 如果有保存的南風，先放回牌組最前面
      if (table.savedSouthTile) {
        table.deck.unshift(table.savedSouthTile);
        table.savedSouthTile = null;
        console.log(`>>> [777777測試] 補花完成後，將保存的南風放回牌組最前面，玩家1第一次摸牌會摸到南風`);
      } else {
        // 檢查牌組中是否有南風
        const southIndex = table.deck.findIndex(tile => tile === '南');
        if (southIndex !== -1 && southIndex !== 0) {
          // 如果南風不在最前面，將它移到最前面
          const southTile = table.deck.splice(southIndex, 1)[0];
          table.deck.unshift(southTile);
          console.log(`>>> [777777測試] 補花完成後，將南風移到牌組最前面，玩家1第一次摸牌會摸到南風`);
        } else if (southIndex === 0) {
          console.log(`>>> [777777測試] 補花完成後，南風已經在牌組最前面，玩家1第一次摸牌會摸到南風`);
        } else {
          console.log(`>>> [777777測試] 警告：補花完成後，牌組中沒有南風`);
        }
      }
    }

    // 莊家開始摸牌
    setTimeout(() => {
      if (table.players && table.players[table.turn]) {
        drawTile(tableId, table.players[table.turn].id);
      }
    }, 1000);
  }
}

// 處理開局聽牌玩家
function processInitialTingPlayer(tableId) {
  const table = tables[tableId];
  if (!table || !table.initialTingState) return;

  const state = table.initialTingState;

  // 如果所有玩家都處理完，進入遊戲
  if (state.currentPlayerIndex >= state.players.length) {
    console.log('>>> 所有開局聽牌玩家處理完成，開始遊戲');
    table.initialTingState = null;
    table.gamePhase = GamePhase.PLAYING;

    // 如果是222222測試房間，在補花完成後調整牌組順序，確保下一家第一次摸牌會摸到東風
    if (table.isTestAddKongRoom && table.dealerIndex === 0) {
      // 如果有保存的東風，先放回牌組
      if (table.savedEastTile) {
        // 將東風放在第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風
        if (table.deck.length > 0) {
          const firstTile = table.deck.shift();
          table.deck.unshift(firstTile, table.savedEastTile);
          table.savedEastTile = null;
          console.log(`>>> [222222測試] 補花完成後，將保存的東風放在牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
        } else {
          table.deck.unshift(table.savedEastTile);
          table.savedEastTile = null;
          console.log(`>>> [222222測試] 補花完成後，牌組為空，將保存的東風放在最前面`);
        }
      } else {
        // 檢查牌組中是否有東風
        const eastIndex = table.deck.findIndex(tile => tile === '東');
        if (eastIndex !== -1 && eastIndex !== 1) {
          // 如果東風不在第2個位置（索引1），將它移到第2個位置
          const eastTile = table.deck.splice(eastIndex, 1)[0];
          if (table.deck.length > 0) {
            const firstTile = table.deck.shift();
            table.deck.unshift(firstTile, eastTile);
            console.log(`>>> [222222測試] 補花完成後，將東風移到牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
          } else {
            table.deck.unshift(eastTile);
            console.log(`>>> [222222測試] 補花完成後，牌組不足，將東風放在最前面`);
          }
        } else if (eastIndex === 1) {
          console.log(`>>> [222222測試] 補花完成後，東風已經在牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
        } else if (eastIndex === 0) {
          // 如果東風在最前面，需要移到第2個位置
          const eastTile = table.deck.shift();
          if (table.deck.length > 0) {
            const firstTile = table.deck.shift();
            table.deck.unshift(firstTile, eastTile);
            console.log(`>>> [222222測試] 補花完成後，將東風從最前面移到第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風`);
          } else {
            table.deck.unshift(eastTile);
            console.log(`>>> [222222測試] 補花完成後，牌組不足，東風保持最前面`);
          }
        } else {
          console.log(`>>> [222222測試] 警告：補花完成後，牌組中沒有東風`);
        }
      }
    }

    // 如果是777777測試房間，在補花完成後調整牌組順序，確保玩家1第一次摸牌會摸到南風
    if (table.isTestKongRoom && table.dealerIndex === 0) {
      // 如果有保存的南風，先放回牌組最前面
      if (table.savedSouthTile) {
        table.deck.unshift(table.savedSouthTile);
        table.savedSouthTile = null;
        console.log(`>>> [777777測試] 補花完成後，將保存的南風放回牌組最前面，玩家1第一次摸牌會摸到南風`);
      } else {
        // 檢查牌組中是否有南風
        const southIndex = table.deck.findIndex(tile => tile === '南');
        if (southIndex !== -1 && southIndex !== 0) {
          // 如果南風不在最前面，將它移到最前面
          const southTile = table.deck.splice(southIndex, 1)[0];
          table.deck.unshift(southTile);
          console.log(`>>> [777777測試] 補花完成後，將南風移到牌組最前面，玩家1第一次摸牌會摸到南風`);
        } else if (southIndex === 0) {
          console.log(`>>> [777777測試] 補花完成後，南風已經在牌組最前面，玩家1第一次摸牌會摸到南風`);
        } else {
          console.log(`>>> [777777測試] 警告：補花完成後，牌組中沒有南風`);
        }
      }
    }

    // 莊家開始摸牌
    setTimeout(() => {
      if (table.players && table.players[table.turn]) {
        drawTile(tableId, table.players[table.turn].id);
      }
    }, 1000);
    return;
  }

  const tingPlayer = state.players[state.currentPlayerIndex];

  // 設置當前玩家的聽牌等待狀態
  table.tingState = {
    playerId: tingPlayer.playerId,
    playerIndex: tingPlayer.playerIndex,
    timer: 30,
    isAfterDiscard: false,
    isInitialTing: true // 標記為開局聽牌
  };

  console.log(`>>> 玩家${tingPlayer.playerIndex + 1}開始開局聽牌決策`);

  // 通知客戶端可以聽牌
  setTimeout(() => {
    io.to(tableId).emit('tingAvailable', {
      playerId: tingPlayer.playerId,
      playerIndex: tingPlayer.playerIndex,
      isInitialTing: true
    });
  }, 100);

  // 開始聽牌倒計時
  startTingTimer(tableId);
}

// 處理吃碰槓請求
function handleClaimRequest(tableId, playerId, claimType, tiles) {
  const table = tables[tableId];
  if (!table || !table.claimingState || table.gamePhase !== GamePhase.CLAIMING) return;

  // 檢查該玩家是否有這個吃碰槓選項
  const option = table.claimingState.options.find(opt =>
    opt.playerId === playerId && opt.claimType === claimType
  );

  if (!option) {
    console.log(`玩家${playerId}沒有${claimType}選項`);
    return;
  }

  // 記錄玩家決策
  if (table.claimingState.playerDecisions && table.claimingState.playerDecisions[playerId]) {
    table.claimingState.playerDecisions[playerId].hasDecided = true;
    table.claimingState.playerDecisions[playerId].decision = 'claim';
    table.claimingState.playerDecisions[playerId].claimType = claimType;
    table.claimingState.playerDecisions[playerId].tiles = tiles;
    console.log(`>>> [決策追蹤] 玩家${playerId}選擇${claimType}`);
  }

  // 如果是胡牌，直接宣告胡牌（胡牌優先級最高，不需要等待其他玩家）
  if (claimType === ClaimType.HU || claimType === 'hu') {
    const targetTile = table.claimingState.discardedTile || null;
    const targetPlayer = table.claimingState.discardPlayerId
      ? table.players.findIndex(p => p.id === table.claimingState.discardPlayerId)
      : null;
    const huType = table.claimingState.claimType === 'selfDrawnHu' ? 'selfDrawnHu' : 'hu';
    declareHu(tableId, playerId, huType, targetTile, targetPlayer);
    return;
  }

  // 檢查是否所有有決策權的玩家都已完成選擇
  checkAllPlayersDecided(tableId);
}

// 執行吃碰槓
function executeClaim(tableId, playerId, claimType, tiles) {
  const table = tables[tableId];
  if (!table) return;

  const playerIndex = table.players.findIndex(p => p.id === playerId);
  const hand = table.hiddenHands[playerId];

  console.log(`玩家${playerIndex + 1}執行${claimType}: ${tiles.join(',')}`);

  // 從手牌移除對應的牌（客戶端只發送手牌中的牌，不包含目標牌）
  tiles.forEach(tile => {
    const index = hand.indexOf(tile);
    if (index !== -1) {
      hand.splice(index, 1);
      console.log(`從玩家${playerIndex + 1}手牌移除: ${tile}`);
    } else {
      console.log(`警告：玩家${playerIndex + 1}手牌中找不到牌: ${tile}`);
    }
  });

  // 獲取目標牌和打出牌的玩家
  // 優先使用 claimingState，如果不存在則使用 lastDiscard
  let discardedTile;
  let discardPlayerId;

  if (table.claimingState) {
    discardedTile = table.claimingState.discardedTile;
    discardPlayerId = table.claimingState.discardPlayerId;
  } else if (table.lastDiscard) {
    discardedTile = table.lastDiscard.tile;
    discardPlayerId = table.lastDiscard.playerId;
    console.log(`>>> [執行吃碰槓] claimingState 不存在，使用 lastDiscard: ${discardedTile}`);
  } else {
    console.log(`>>> [執行吃碰槓] 錯誤：無法獲取目標牌信息`);
    return;
  }

  // 添加吃碰槓牌組
  const meld = {
    type: claimType,
    tiles: [...tiles, discardedTile], // 手牌 + 目標牌
    fromPlayer: discardPlayerId
  };

  console.log(`創建${claimType}牌組: ${meld.tiles.join(',')} (共${meld.tiles.length}張)`);

  table.melds[playerId].push(meld);

  // 如果玩家曾經開局聽牌，檢查手牌是否變化（天聽/地聽判斷）
  if (table.players[playerIndex].initialTingHand) {
    // 吃碰槓會改變手牌和明牌，不再是天聽/地聽
    const player = table.players[playerIndex];
    const tingType = player.isTianTing ? '天聽' : (player.isDiTing ? '地聽' : '聽牌');
    player.initialTingHand = null;
    player.initialTingMelds = null;
    player.isTianTing = false; // 清除天聽標記
    player.isDiTing = false; // 清除地聽標記
    console.log(`>>> 玩家${playerIndex + 1}吃碰槓後，不再符合${tingType}條件`);
  }

  // 記錄第一圈有玩家吃碰槓（用於地聽判斷）
  if (table.isFirstRound) {
    table.hasFirstRoundClaim = true;
    console.log(`>>> [第一圈] 玩家${playerIndex + 1}在第一圈進行吃碰槓，後續玩家不再算地聽`);
  }

  // 從打出牌移除被吃碰槓的牌（使用之前獲取的變量）
  const discardPlayerIndex = table.players.findIndex(p => p.id === discardPlayerId);

  console.log(`從玩家${discardPlayerIndex + 1}（ID: ${discardPlayerId}）的打出牌中移除: ${discardedTile}`);
  console.log(`移除前打出牌: ${table.discards[discardPlayerId].join(',')}`);

  const discardIndex = table.discards[discardPlayerId].indexOf(discardedTile);
  if (discardIndex !== -1) {
    table.discards[discardPlayerId].splice(discardIndex, 1);
    console.log(`成功移除打出牌: ${discardedTile}`);
    console.log(`移除後打出牌: ${table.discards[discardPlayerId].join(',')}`);

    // 廣播打出牌移除事件
    console.log(`>>> 廣播 discardRemoved 事件：playerIndex=${discardPlayerIndex}, tile=${discardedTile}`);
    io.to(tableId).emit('discardRemoved', {
      playerIndex: discardPlayerIndex,
      tile: discardedTile
    });
  } else {
    console.log(`警告：找不到要移除的打出牌: ${discardedTile}`);
  }

  // 廣播吃碰槓執行
  // 廣播吃碰槓執行給所有玩家（確保所有玩家都能聽到音效）
  console.log(`>>> [音效廣播] 廣播 ${claimType} 執行事件給房間 ${tableId} 的所有玩家`);
  io.to(tableId).emit('claimExecuted', {
    playerId: playerId,
    playerIndex: playerIndex,
    claimType: claimType,
    meld: meld,
    targetPlayer: discardPlayerIndex,
    targetTile: discardedTile
  });

  // 廣播所有玩家的手牌數量更新（讓其他玩家知道手牌數量變化）
  const handCounts = {};
  table.players.forEach(p => {
    handCounts[p.id] = table.hiddenHands[p.id].length;
  });

  console.log(`廣播手牌數量更新: ${JSON.stringify(handCounts)}`);
  io.to(tableId).emit('handCountsUpdate', {
    handCounts: handCounts
  });

  // 清除吃碰槓狀態
  table.claimingState = null;
  table.gamePhase = GamePhase.PLAYING;

  // 清除吃碰槓計時器
  if (table.claimingTimer) {
    clearInterval(table.claimingTimer);
    table.claimingTimer = null;
  }

  // 設置輪次為執行吃碰槓的玩家
  table.turn = playerIndex;

  // 如果是槓牌，需要補牌
  if (claimType === ClaimType.KONG) {
    console.log(`槓牌後輪到玩家${playerIndex + 1}補牌`);
    // 槓牌後補摸一張牌
    setTimeout(() => {
      drawTile(tableId, playerId);
    }, 1000);
  } else {
    // 吃碰後必須打出一張牌
    console.log(`吃碰後輪到玩家${playerIndex + 1}打牌`);
    // 直接開始打牌倒數，打牌後再檢測聽牌
    startTurnTimer(tableId, playerId);
  }
}

// 放棄吃碰槓
function passClaim(tableId, playerId) {
  const table = tables[tableId];
  if (!table || !table.claimingState) return;

  // 檢查遊戲是否已結束
  if (table.gamePhase === GamePhase.ENDED) {
    console.log('>>> 遊戲已結束，無法放棄吃碰槓');
    // 清除計時器
    if (table.claimingTimer) {
      clearInterval(table.claimingTimer);
      table.claimingTimer = null;
    }
    return;
  }

  // 記錄玩家決策（選擇「過」）
  if (table.claimingState.playerDecisions && table.claimingState.playerDecisions[playerId]) {
    table.claimingState.playerDecisions[playerId].hasDecided = true;
    table.claimingState.playerDecisions[playerId].decision = 'pass';
    console.log(`>>> [決策追蹤] 玩家${playerId}選擇「過」`);
  }

  // 保存 claimingState 信息（在清除前）
  const claimingState = table.claimingState;
  const claimPlayerId = claimingState.discardPlayerId || playerId;
  const claimPlayerIndex = table.players.findIndex(p => p.id === claimPlayerId);
  const claimPlayer = claimPlayerIndex !== -1 ? table.players[claimPlayerIndex] : null;
  const isSelfDrawnHu = claimingState.claimType === 'selfDrawnHu';
  const discardedTile = claimingState.discardedTile;

  // 清除計時器（但保留 claimingState，等待其他玩家決策）
  if (table.claimingTimer) {
    clearInterval(table.claimingTimer);
    table.claimingTimer = null;
  }

  // 檢查是否所有有決策權的玩家都已完成選擇
  checkAllPlayersDecided(tableId);
}

// 檢查所有玩家是否都已完成決策，並依權重順序決定最終行為
function checkAllPlayersDecided(tableId) {
  const table = tables[tableId];
  if (!table || !table.claimingState || !table.claimingState.playerDecisions) return;

  const claimingState = table.claimingState;
  const playerDecisions = claimingState.playerDecisions;

  // 檢查是否所有有決策權的玩家都已完成選擇
  const allPlayersDecided = Object.keys(playerDecisions).every(playerId => {
    return playerDecisions[playerId].hasDecided === true;
  });

  if (!allPlayersDecided) {
    console.log(`>>> [決策追蹤] 還有玩家未完成選擇，繼續等待...`);
    return; // 還有玩家未完成選擇，繼續等待
  }

  console.log(`>>> [決策追蹤] 所有玩家都已完成選擇，開始依權重順序決定最終行為`);

  // 收集所有選擇「claim」的決策，並按優先級排序
  const claimDecisions = [];
  Object.keys(playerDecisions).forEach(playerId => {
    const decision = playerDecisions[playerId];
    if (decision.decision === 'claim') {
      // 找到該玩家的選項以獲取優先級
      const option = claimingState.options.find(opt => 
        opt.playerId === playerId && opt.claimType === decision.claimType
      );
      if (option) {
        claimDecisions.push({
          playerId: playerId,
          claimType: decision.claimType,
          tiles: decision.tiles,
          priority: option.priority
        });
      }
    }
  });

  // 如果沒有任何玩家選擇「claim」，所有玩家都選擇「過」
  if (claimDecisions.length === 0) {
    console.log(`>>> [決策追蹤] 所有玩家都選擇「過」，輪到下一家`);
    
    // 處理搶槓的特殊情況
    const isQiangGang = claimingState.isQiangGang || false;
    if (isQiangGang) {
      console.log(`>>> [搶槓檢測] 所有玩家都選擇了「過」，恢復補槓流程`);
      const kongPlayerId = claimingState.discardPlayerId;
      const kongPlayerIndex = table.players.findIndex(p => p.id === kongPlayerId);
      
      // 清除吃碰槓狀態
      table.claimingState = null;
      table.gamePhase = GamePhase.PLAYING;
      
      if (kongPlayerIndex !== -1) {
        console.log(`>>> [搶槓檢測] 恢復補槓流程：玩家${kongPlayerIndex + 1}補摸一張牌`);
        setTimeout(() => {
          drawTile(tableId, kongPlayerId);
        }, 800);
        return;
      }
    }

    // 處理自摸胡牌放棄的情況
    const isSelfDrawnHu = claimingState.claimType === 'selfDrawnHu';
    const claimPlayerId = claimingState.discardPlayerId;
    const claimPlayerIndex = table.players.findIndex(p => p.id === claimPlayerId);
    const claimPlayer = claimPlayerIndex !== -1 ? table.players[claimPlayerIndex] : null;
    const discardedTile = claimingState.discardedTile;

    // 清除吃碰槓狀態
    table.claimingState = null;
    table.gamePhase = GamePhase.PLAYING;

    if (isSelfDrawnHu && claimPlayer) {
      // 如果是天聽/地聽玩家放棄自摸胡牌，自動打出摸到的牌（延遲1.5秒）
      if (claimPlayer.isTianTing || claimPlayer.isDiTing) {
        const tingType = claimPlayer.isTianTing ? '天聽' : '地聽';
        console.log(`>>> [${tingType}自動打牌] 玩家${claimPlayerIndex + 1}${tingType}且放棄自摸胡牌，將自動打出摸到的牌：${discardedTile}`);
        setTimeout(() => {
          const currentTable = tables[tableId];
          if (!currentTable) return;
          const currentPlayer = currentTable.players[claimPlayerIndex];
          if (!currentPlayer || (!currentPlayer.isTianTing && !currentPlayer.isDiTing)) {
            const tingType = currentPlayer && currentPlayer.isTianTing ? '天聽' : (currentPlayer && currentPlayer.isDiTing ? '地聽' : '聽牌');
            console.log(`>>> [${tingType}自動打牌] 玩家${claimPlayerIndex + 1}已不再${tingType}，進入正常打牌流程`);
            table.turn = claimPlayerIndex;
            startTurnTimer(tableId, claimPlayerId);
            return;
          }
          const currentHand = currentTable.hiddenHands[claimPlayerId];
          const tingType = currentPlayer.isTianTing ? '天聽' : '地聽';
          if (currentHand && currentHand.includes(discardedTile)) {
            console.log(`>>> [${tingType}自動打牌] 玩家${claimPlayerIndex + 1}自動打出：${discardedTile}`);
            discardTile(tableId, claimPlayerId, discardedTile);
          } else {
            if (currentHand && currentHand.length > 0) {
              console.log(`>>> [${tingType}自動打牌] 玩家${claimPlayerIndex + 1}手牌中沒有摸到的牌，自動打出第一張牌：${currentHand[0]}`);
              discardTile(tableId, claimPlayerId, currentHand[0]);
            } else {
              table.turn = claimPlayerIndex;
              startTurnTimer(tableId, claimPlayerId);
            }
          }
        }, 1500);
        return;
      } else {
        // 普通玩家放棄自摸胡牌，需要打出一張牌
        console.log(`>>> [放棄自摸胡牌] 玩家${claimPlayerIndex + 1}放棄自摸胡牌，需要打出一張牌`);
        table.turn = claimPlayerIndex;
        startTurnTimer(tableId, claimPlayerId);
        return;
      }
    }

    // 一般情況：輪到下一家
    nextTurn(tableId);
    return;
  }

  // 依權重順序排序（優先級數字越小，優先級越高）
  claimDecisions.sort((a, b) => a.priority - b.priority);

  // 執行最高優先級的決策
  const finalDecision = claimDecisions[0];
  console.log(`>>> [決策追蹤] 依權重順序決定執行：玩家${finalDecision.playerId}的${finalDecision.claimType}（優先級：${finalDecision.priority}）`);

  // 清除吃碰槓狀態
  table.claimingState = null;
  table.gamePhase = GamePhase.PLAYING;

  // 執行決策
  executeClaim(tableId, finalDecision.playerId, finalDecision.claimType, finalDecision.tiles);
}

// 放棄聽牌
function passTing(tableId, playerId) {
  const table = tables[tableId];
  if (!table || !table.tingState) return;

  // 保存 tingState 信息（在清除前）
  const tingState = table.tingState;
  const tingPlayerIndex = tingState.playerIndex;

  // 清除計時器
  if (table.tingTimer) {
    clearInterval(table.tingTimer);
    table.tingTimer = null;
  }

  // 清除聽牌狀態
  table.tingState = null;

  if (playerId) {
    const playerIndex = table.players.findIndex(p => p.id === playerId);
    console.log(`玩家${playerIndex + 1}放棄聽牌，繼續遊戲`);
  } else {
    console.log(`聽牌超時，自動放棄，繼續遊戲`);
  }

  // 正常遊戲中的聽牌
  table.gamePhase = GamePhase.PLAYING;

  // 繼續遊戲：如果是吃碰後聽牌，需要打牌；如果是打牌後聽牌，檢查其他玩家的吃碰槓機會
  // 判斷方式：使用 tingState.isAfterDiscard 標記來區分
  if (tingState.isAfterDiscard) {
    // 打牌後的聽牌，檢查其他玩家是否可以吃碰槓胡
    // 使用最後打出的牌來檢查
    if (table.lastDiscard && table.lastDiscard.playerId) {
      const discardedTile = table.lastDiscard.tile;
      const discardPlayerId = table.lastDiscard.playerId;
      const hasClaims = checkClaims(tableId, discardPlayerId, discardedTile);
      if (!hasClaims) {
        // 沒有吃碰槓機會，輪到下一家
        nextTurn(tableId);
      }
      // 如果有吃碰槓機會，checkClaims 會設置 claimingState 並開始倒計時
    } else {
      // 如果沒有最後打出的牌信息，直接輪到下一家
      nextTurn(tableId);
    }
  } else {
    // 吃碰後的聽牌，需要打牌
    startTurnTimer(tableId, table.players[tingPlayerIndex].id);
  }
}

// 計算台數和收集牌型
// 返回 { totalTai: number, patterns: string[], patternNames: string[] }
function calculateTai(table, player, playerIndex, huType) {
  const hand = table.hiddenHands[player.id] || [];
  const melds = table.melds[player.id] || [];
  const hasNoMelds = melds.length === 0; // 門清：沒有吃碰槓
  const isSelfDrawnHu = huType === 'selfDrawnHu';
  const isDealer = player.isDealer || false;
  
  let totalTai = 0;
  const patterns = []; // 牌型名稱列表
  const patternNames = []; // 用於顯示的牌型名稱（中文）
  
  // 計算玩家的風位（根據windStart和玩家座位）
  const windStart = table.windStart || 0;
  const playerWindIndex = (playerIndex - windStart + 4) % 4; // 玩家的風位索引：0=東, 1=南, 2=西, 3=北
  const windNames = ['東', '南', '西', '北'];
  const playerWindTile = windNames[playerWindIndex]; // 玩家對應的風牌名稱
  
  // 計算當前風圈（使用 table.wind，如果沒有則根據圈數計算）
  const currentRoundWindIndex = table.wind !== undefined ? table.wind : Math.floor((table.round - 1) / 4) % 4;
  const roundWindTile = windNames[currentRoundWindIndex];
  
  // 檢查門風台：手牌有3張以上對應自己風位的風牌，或有碰槓對應的風牌
  const windTileCountInHand = hand.filter(tile => tile === playerWindTile).length;
  const hasWindTileInMelds = melds.some(meld => {
    if (meld.type === 'pong' || meld.type === 'kong') {
      return meld.tiles && meld.tiles.includes(playerWindTile);
    }
    return false;
  });
  if (windTileCountInHand >= 3 || hasWindTileInMelds) {
    totalTai += 1;
    patterns.push('menFengTai');
    patternNames.push('門風台');
  }
  
  // 檢查圈風台：手牌有3張以上對應風圈的風牌，或有碰槓對應的風牌
  const roundWindTileCountInHand = hand.filter(tile => tile === roundWindTile).length;
  const hasRoundWindTileInMelds = melds.some(meld => {
    if (meld.type === 'pong' || meld.type === 'kong') {
      return meld.tiles && meld.tiles.includes(roundWindTile);
    }
    return false;
  });
  if (roundWindTileCountInHand >= 3 || hasRoundWindTileInMelds) {
    totalTai += 1;
    patterns.push('quanFengTai');
    patternNames.push('圈風台');
  }
  
  // 檢查三元台：手牌有3張以上的"中、發、白"，或是有碰槓對應的"中、發、白"
  const dragonTiles = ['中', '發', '白'];
  let sanYuanTaiCount = 0;
  dragonTiles.forEach(dragonTile => {
    const dragonTileCountInHand = hand.filter(tile => tile === dragonTile).length;
    const hasDragonTileInMelds = melds.some(meld => {
      if (meld.type === 'pong' || meld.type === 'kong') {
        return meld.tiles && meld.tiles.includes(dragonTile);
      }
      return false;
    });
    if (dragonTileCountInHand >= 3 || hasDragonTileInMelds) {
      sanYuanTaiCount++;
    }
  });
  if (sanYuanTaiCount > 0) {
    totalTai += sanYuanTaiCount;
    patterns.push('sanYuanTai');
    patternNames.push(`三元台(${sanYuanTaiCount})`);
  }
  
  // 檢查花牌：胡牌後玩家身上的補花若有跟自身座位風向對應的花牌
  const playerFlowers = table.flowers[player.id] || [];
  const windFlowerMap = {
    0: ['春', '梅'], // 東
    1: ['夏', '蘭'], // 南
    2: ['秋', '菊'], // 西
    3: ['冬', '竹']  // 北
  };
  const playerWindFlowers = windFlowerMap[playerWindIndex] || [];
  let flowerTaiCount = 0;
  playerWindFlowers.forEach(flowerTile => {
    if (playerFlowers.includes(flowerTile)) {
      flowerTaiCount++;
    }
  });
  if (flowerTaiCount > 0) {
    totalTai += flowerTaiCount;
    patterns.push('flowerTai');
    patternNames.push(`花牌(${flowerTaiCount})`);
  }
  
  // 1台牌型
  if (isDealer) {
    totalTai += 1;
    patterns.push('dealer');
    patternNames.push('莊家');
  }
  
  // 檢查門清自摸（需要同時有門清和自摸）
  if (hasNoMelds && isSelfDrawnHu) {
    // 門清自摸是3台
    totalTai += 3;
    patterns.push('menQingSelfDraw');
    patternNames.push('門清自摸');
  } else {
    // 分別處理自摸和門清
    if (isSelfDrawnHu) {
      totalTai += 1;
      patterns.push('selfDraw');
      patternNames.push('自摸');
    }
    
    if (hasNoMelds) {
      totalTai += 1; // 門清單獨1台
      patterns.push('menQing');
      patternNames.push('門清');
    }
  }
  
  if (player.isDuTing) {
    totalTai += 1;
    patterns.push('duTing');
    patternNames.push('獨聽');
  }
  
  if (player.isQiangGang) {
    totalTai += 1;
    patterns.push('qiangGang');
    patternNames.push('搶槓');
  }
  
  if (player.isGangShangKaiHua) {
    totalTai += 1;
    patterns.push('gangShangKaiHua');
    patternNames.push('槓上開花');
  }
  
  if (player.isHaiDiLaoYue) {
    totalTai += 1;
    patterns.push('haiDiLaoYue');
    patternNames.push('海底撈月');
  }
  
  if (player.isHaiDiLaoYu) {
    totalTai += 1;
    patterns.push('haiDiLaoYu');
    patternNames.push('海底撈魚');
  }
  
  // 2台牌型
  if (player.isHuaGang) {
    totalTai += 2;
    patterns.push('huaGang');
    patternNames.push('花槓');
  }
  
  if (player.isQuanQiu) {
    totalTai += 2;
    patterns.push('quanQiu');
    patternNames.push('全求');
  }
  
  if (player.isSanAnKe) {
    totalTai += 2;
    patterns.push('sanAnKe');
    patternNames.push('三暗刻');
  }
  
  // 4台牌型
  if (player.isPengPengHu) {
    totalTai += 4;
    patterns.push('pengPengHu');
    patternNames.push('碰碰胡');
  }
  
  if (player.isHunYiSe) {
    totalTai += 4;
    patterns.push('hunYiSe');
    patternNames.push('混一色');
  }
  
  if (player.isXiaoSanYuan) {
    totalTai += 4;
    patterns.push('xiaoSanYuan');
    patternNames.push('小三元');
  }
  
  // 5台牌型
  if (player.isSiAnKe) {
    totalTai += 5;
    patterns.push('siAnKe');
    patternNames.push('四暗刻');
  }
  
  // 8台牌型
  if (player.isDiTing) {
    totalTai += 8;
    patterns.push('diTing');
    patternNames.push('地聽');
  }
  
  if (player.isWuAnKe) {
    totalTai += 8;
    patterns.push('wuAnKe');
    patternNames.push('五暗刻');
  }
  
  if (player.isQingYiSe) {
    totalTai += 8;
    patterns.push('qingYiSe');
    patternNames.push('清一色');
  }
  
  if (player.isZiYiSe) {
    totalTai += 8;
    patterns.push('ziYiSe');
    patternNames.push('字一色');
  }
  
  if (player.isDaSanYuan) {
    totalTai += 8;
    patterns.push('daSanYuan');
    patternNames.push('大三元');
  }
  
  if (player.isXiaoSiXi) {
    totalTai += 8;
    patterns.push('xiaoSiXi');
    patternNames.push('小四喜');
  }
  
  if (player.isLiGuLiGu) {
    totalTai += 8;
    patterns.push('liGuLiGu');
    patternNames.push('嚦咕嚦咕');
  }
  
  if (player.isBaXianGuoHai) {
    totalTai += 8;
    patterns.push('baXianGuoHai');
    patternNames.push('八仙過海');
  }
  
  // 16台牌型
  if (player.isTianTing) {
    totalTai += 16;
    patterns.push('tianTing');
    patternNames.push('天聽');
  }
  
  if (player.isDaSiXi) {
    totalTai += 16;
    patterns.push('daSiXi');
    patternNames.push('大四喜');
  }
  
  // 套用封頂限制
  const pointCap = table.gameSettings?.point_cap || 'UP_TO_8_POINTS';
  let finalTai = totalTai;
  
  // 莊家台和連莊台不計入封頂限制（但我們這裡沒有連莊台，所以只考慮莊家台）
  // 根據規則，封頂只限制牌型台數，不限制莊家台
  // 但為了簡化，我們先計算所有台數，然後套用封頂
  // 如果設定封頂，需要將莊家台分開計算
  const dealerTai = isDealer ? 1 : 0;
  const patternTai = totalTai - dealerTai; // 牌型台數（不含莊家台）
  
  if (pointCap === 'UP_TO_4_POINTS') {
    finalTai = dealerTai + Math.min(patternTai, 4);
  } else if (pointCap === 'UP_TO_8_POINTS') {
    finalTai = dealerTai + Math.min(patternTai, 8);
  } else if (pointCap === 'NO_LIMIT' || pointCap === 'UNLIMITED_POINTS' || pointCap === 'UNLIMITED') {
    // 無限制，不套用封頂
    finalTai = totalTai;
  } else {
    // 預設為8台滿
    finalTai = dealerTai + Math.min(patternTai, 8);
  }
  
  console.log(`>>> [台數計算] 玩家${playerIndex + 1} 總台數: ${totalTai}, 牌型台數: ${patternTai}, 莊家台: ${dealerTai}, 封頂後: ${finalTai}`);
  console.log(`>>> [台數計算] 牌型: ${patternNames.join('、')}`);
  
  return {
    totalTai: finalTai,
    originalTai: totalTai,
    patterns: patterns,
    patternNames: patternNames
  };
}

// 宣告胡牌
function declareHu(tableId, playerId, huType, targetTile, targetPlayer) {
  const table = tables[tableId];
  if (!table) return;

  const playerIndex = table.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    console.log(`>>> [胡牌驗證] 找不到玩家 ${playerId}`);
    return;
  }
  const player = table.players[playerIndex];

  // 驗證胡牌
  const hand = table.hiddenHands[playerId];
  const melds = table.melds[playerId] || [];

  console.log(`>>> [胡牌驗證] 玩家${playerIndex + 1}胡牌驗證開始，類型：${huType}`);
  console.log(`>>> [胡牌驗證] 當前手牌：${hand.join(',')}，手牌數量：${hand.length}`);
  console.log(`>>> [胡牌驗證] 明牌數量：${melds.length}`);

  // 檢查是否八仙過海（湊齊8張花牌，可以無視任何條件直接胡牌）
  const isBaXianGuoHai = player.isBaXianGuoHai || false;
  if (isBaXianGuoHai) {
    console.log(`>>> [八仙過海檢測] 玩家${playerIndex + 1}湊齊8張花牌，可以無視任何條件直接胡牌！`);
    // 八仙過海可以直接胡牌，不需要驗證手牌
    // 直接設置為有效胡牌，跳過後續驗證
  }

  let isValidHu = false;
  if (isBaXianGuoHai) {
    // 八仙過海可以直接胡牌
    isValidHu = true;
  } else if (huType === 'selfDrawnHu') {
    // 自摸胡牌：驗證最後摸到的牌
    // 手牌中已經包含摸到的牌，需要排除最後一張再檢測
    // 但要注意：如果玩家在等待胡牌期間打牌了，最後一張可能不是剛摸到的牌
    // 所以應該使用 claimingState 中的 discardedTile（剛摸到的牌）
    const targetTile = table.claimingState?.discardedTile || hand[hand.length - 1];
    const lastTile = targetTile; // 使用 claimingState 中的牌，或者手牌最後一張

    // 如果手牌中包含這張牌，排除它；如果不包含，說明已經打出去了，直接檢測
    let handWithoutLast;
    if (hand.includes(lastTile)) {
      // 手牌中包含這張牌，排除最後一張
      const lastIndex = hand.lastIndexOf(lastTile);
      handWithoutLast = hand.slice(0, lastIndex).concat(hand.slice(lastIndex + 1));
    } else {
      // 手牌中不包含這張牌，直接使用完整手牌（可能已經打出去了）
      handWithoutLast = [...hand];
    }

    console.log(`>>> [胡牌驗證] 自摸胡牌，目標牌：${lastTile}`);
    console.log(`>>> [胡牌驗證] 手牌是否包含目標牌：${hand.includes(lastTile)}`);
    console.log(`>>> [胡牌驗證] 排除目標牌後的手牌：${handWithoutLast.join(',')}，手牌數量：${handWithoutLast.length}`);
    isValidHu = canHu(handWithoutLast, lastTile, melds.length);
    console.log(`>>> [胡牌驗證] 自摸胡牌驗證結果：${isValidHu}`);
  } else {
    // 放槍胡牌：驗證目標牌
    // 放槍時手牌中不包含目標牌，所以直接傳入完整手牌
    if (targetTile && table.claimingState && table.claimingState.discardedTile === targetTile) {
      console.log(`>>> [胡牌驗證] 放槍胡牌，目標牌：${targetTile}`);
      isValidHu = canHu(hand, targetTile, melds.length);
      console.log(`>>> [胡牌驗證] 放槍胡牌驗證結果：${isValidHu}`);
    }
  }

  if (!isValidHu) {
    console.log(`>>> [胡牌驗證] 玩家${playerIndex + 1}胡牌驗證失敗`);
    console.log(`>>> [胡牌驗證] 手牌：${hand.join(',')}，手牌數量：${hand.length}`);
    console.log(`>>> [胡牌驗證] 明牌數量：${melds.length}`);
    return;
  }

  // 檢查是否為天聽或地聽

  // 檢查是否是搶槓（放槍胡牌，且是補槓後的胡牌）
  if (huType !== 'selfDrawnHu' && table.claimingState && table.claimingState.isQiangGang) {
    console.log(`>>> [搶槓檢測] 玩家${playerIndex + 1}搶槓胡牌，標記為搶槓`);
    player.isQiangGang = true; // 標記為搶槓

    // 撤銷補槓：將槓牌恢復為碰牌
    const kongPlayerId = table.claimingState.discardPlayerId; // 補槓的玩家
    const kongTile = table.claimingState.discardedTile; // 補槓的牌
    const kongPlayerIndex = table.players.findIndex(p => p.id === kongPlayerId);

    if (kongPlayerIndex !== -1) {
      const kongPlayerMelds = table.melds[kongPlayerId] || [];
      // 找到補槓的槓牌
      const kongMeld = kongPlayerMelds.find(m =>
        m.type === 'kong' &&
        m.tiles &&
        m.tiles.length > 0 &&
        m.tiles[0] === kongTile
      );

      if (kongMeld) {
        console.log(`>>> [搶槓檢測] 撤銷補槓：玩家${kongPlayerIndex + 1}的槓牌恢復為碰牌`);

        // 移除槓牌
        const kongIndex = kongPlayerMelds.indexOf(kongMeld);
        if (kongIndex !== -1) {
          kongPlayerMelds.splice(kongIndex, 1);
          console.log(`>>> [搶槓檢測] 移除槓牌：${kongMeld.tiles.join(',')}`);
        }

        // 恢復碰牌（3張相同的牌）
        const pongMeld = {
          type: 'pong',
          tiles: [kongTile, kongTile, kongTile],
          fromPlayer: kongMeld.fromPlayer // 保留原來的 fromPlayer
        };
        kongPlayerMelds.push(pongMeld);
        console.log(`>>> [搶槓檢測] 恢復碰牌：${pongMeld.tiles.join(',')}`);

        // 廣播撤銷補槓（將槓牌恢復為碰牌）
        io.to(tableId).emit('qiangGangRevert', {
          playerId: kongPlayerId,
          playerIndex: kongPlayerIndex,
          tile: kongTile,
          kongMeld: kongMeld,
          pongMeld: pongMeld
        });
      }
    }
  }

  // 檢查是否是海底撈魚（放槍胡牌，且打出的牌是最後一張牌打出的）
  if (huType !== 'selfDrawnHu' && table.lastDiscard && table.lastDiscard.isLastTile) {
    console.log(`>>> [海底撈魚檢測] 玩家${playerIndex + 1}胡到最後一張牌打出的牌，標記為海底撈魚`);
    player.isHaiDiLaoYu = true; // 標記為海底撈魚
  }

  // 檢查是否是全求（手牌只剩一張牌單吊胡牌，而其餘全吃或碰，且胡他人牌）
  if (huType !== 'selfDrawnHu' && melds.length === 4 && hand.length === 1) {
    // 檢查明牌是否都是吃或碰（不包含槓）
    const allChiOrPong = melds.every(meld => meld.type === 'chi' || meld.type === 'pong');
    if (allChiOrPong) {
      console.log(`>>> [全求檢測] 玩家${playerIndex + 1}全求！手牌只剩1張，明牌4組（全為吃或碰），且胡他人牌`);
      player.isQuanQiu = true; // 標記為全求
    }
  }

  // 檢查是否是獨聽（只聽一張牌）
  // 獲取玩家胡牌前的手牌（排除胡的那張牌）
  let handBeforeHu;
  if (huType === 'selfDrawnHu') {
    // 自摸：手牌中已經包含摸到的牌，需要排除最後一張
    const targetTile = table.claimingState?.discardedTile || hand[hand.length - 1];
    if (hand.includes(targetTile)) {
      const lastIndex = hand.lastIndexOf(targetTile);
      handBeforeHu = hand.slice(0, lastIndex).concat(hand.slice(lastIndex + 1));
    } else {
      handBeforeHu = [...hand];
    }
  } else {
    // 放槍：手牌中不包含目標牌，直接使用完整手牌
    handBeforeHu = [...hand];
  }

  // 定義所有可能的牌（不包括花牌）
  const allPossibleTiles = [
    // 萬子
    '一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬',
    // 筒子
    '一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒',
    // 條子
    '一條', '二條', '三條', '四條', '五條', '六條', '七條', '八條', '九條',
    // 風牌
    '東', '南', '西', '北',
    // 三元牌
    '中', '發', '白'
  ];

  // 檢查能聽哪些牌（哪些牌能讓玩家胡牌）
  const canHuTiles = [];
  for (const tile of allPossibleTiles) {
    if (canHu(handBeforeHu, tile, melds.length)) {
      canHuTiles.push(tile);
    }
  }

  // 如果只有一張牌能胡，標記為獨聽
  if (canHuTiles.length === 1) {
    console.log(`>>> [獨聽檢測] 玩家${playerIndex + 1}只聽一張牌：${canHuTiles[0]}，標記為獨聽`);
    player.isDuTing = true; // 標記為獨聽
  } else {
    console.log(`>>> [獨聽檢測] 玩家${playerIndex + 1}聽多張牌：${canHuTiles.join(',')}，不是獨聽`);
  }

  // 檢查是否是哩咕哩咕（由七組不同的牌對組成，門清，聽一張牌）
  // 條件：1. 門清（沒有吃、碰、槓）2. 聽一張牌（獨聽）3. 手牌全為牌對（7組不同的牌對+1張單牌）
  const isMenQing = melds.length === 0; // 門清：沒有吃、碰、槓
  const isDuTing = canHuTiles.length === 1; // 獨聽：只聽一張牌

  if (isMenQing && isDuTing) {
    // 統計手牌中每種牌的數量
    const handCounts = {};
    handBeforeHu.forEach(tile => {
      handCounts[tile] = (handCounts[tile] || 0) + 1;
    });

    // 檢查手牌是否全為牌對（2張）或單牌（1張）
    let pairCount = 0; // 牌對數量
    let singleCount = 0; // 單牌數量
    let hasInvalidCount = false; // 是否有不符合的數量（3張或4張）

    Object.values(handCounts).forEach(count => {
      if (count === 2) {
        pairCount++; // 是牌對
      } else if (count === 1) {
        singleCount++; // 是單牌
      } else {
        hasInvalidCount = true; // 有刻子或槓子（3張或4張）
      }
    });

    // 哩咕哩咕條件：7組不同的牌對（14張）+1張單牌（1張）= 15張（聽牌時）
    // 胡牌時是7組不同的牌對（14張）+胡的那張牌（1張）= 15張
    // 但台灣麻將是17張，所以可能是7組不同的牌對（14張）+3張單牌（3張）= 17張
    // 或者7組不同的牌對（14張）+1組牌對（2張）+1張單牌（1張）= 17張
    // 根據用戶描述「由七組不同的牌對組成」，應該是7組不同的牌對（14張）+其他牌（3張）
    // 但「手牌全為牌對」又說只有牌對，所以可能是7組不同的牌對（14張）+1組相同的牌對（2張）+1張單牌（1張）= 17張
    // 或者更簡單：7組不同的牌對（14張）+1張單牌（1張）= 15張（聽牌），胡牌時是16張（7組不同的牌對+胡的那張牌）

    // 根據「手牌全為牌對」的描述，應該是全部都是牌對，但用戶說「由七組不同的牌對組成」
    // 我理解為：7組不同的牌對（14張）+可能還有其他牌對或單牌

    // 簡化判斷：7組不同的牌對（14張）+1張單牌（1張）= 15張（聽牌時）
    // 或者7組不同的牌對（14張）+其他牌對或單牌，總共17張
    // 但為了符合「七組不同的牌對」的描述，我們檢查是否有7組不同的牌對，且沒有刻子或槓子

    // 如果沒有刻子或槓子，且有至少7組不同的牌對，且聽一張牌，且門清，則為哩咕哩咕
    // 台灣麻將是17張，所以可能是7組不同的牌對（14張）+其他牌對或單牌（3張）= 17張
    // 簡化判斷：檢查是否有至少7組不同的牌對，且沒有刻子或槓子
    if (!hasInvalidCount && pairCount >= 7 && handBeforeHu.length >= 14) {
      console.log(`>>> [哩咕哩咕檢測] 玩家${playerIndex + 1}哩咕哩咕！7組不同的牌對，門清，聽一張牌`);
      player.isLiGuLiGu = true; // 標記為哩咕哩咕
    }
  }

  let isTianTing = false;
  let isDiTing = false;

  console.log(`>>> [天聽/地聽檢測] 玩家${playerIndex + 1}胡牌，開始檢測天聽/地聽`);
  console.log(`>>> [天聽/地聽檢測] player.initialTingHand: ${player.initialTingHand ? '存在' : '不存在'}`);
  console.log(`>>> [天聽/地聽檢測] player.initialTingMelds: ${player.initialTingMelds !== undefined ? player.initialTingMelds : '未定義'}`);

  if (player.initialTingHand && player.initialTingMelds !== undefined) {
    console.log(`>>> [天聽/地聽檢測] 玩家${playerIndex + 1}有開局聽牌記錄，開始比較手牌`);

    // 對於自摸胡牌，需要檢查手牌（不包含剛摸到的牌）是否與開局聽牌時相同
    let currentHand;
    if (huType === 'selfDrawnHu') {
      // 自摸：手牌中已經包含摸到的牌，需要排除最後一張
      currentHand = hand.slice(0, -1);
      console.log(`>>> [天聽/地聽檢測] 自摸胡牌，排除最後一張牌`);
    } else {
      // 放槍：手牌中不包含目標牌，直接使用完整手牌
      currentHand = [...hand];
      console.log(`>>> [天聽/地聽檢測] 放槍胡牌，使用完整手牌`);
    }

    const initialHand = [...player.initialTingHand];

    // 排序後比較（因為順序可能不同）
    currentHand.sort();
    initialHand.sort();

    // 檢查手牌是否相同
    const handSame = currentHand.length === initialHand.length &&
      currentHand.every((tile, index) => tile === initialHand[index]);

    // 檢查明牌數量是否相同
    const meldsSame = melds.length === player.initialTingMelds;

    console.log(`>>> [天聽/地聽檢測] 開局手牌數量: ${initialHand.length}, 當前手牌數量: ${currentHand.length}`);
    console.log(`>>> [天聽/地聽檢測] 開局明牌數量: ${player.initialTingMelds}, 當前明牌數量: ${melds.length}`);
    console.log(`>>> [天聽/地聽檢測] 手牌相同: ${handSame}, 明牌數量相同: ${meldsSame}`);

    if (handSame && meldsSame) {
      // 根據原始標記判斷是天聽還是地聽
      if (player.isTianTing) {
        isTianTing = true;
        player.isTianTing = true; // 標記為天聽
        console.log(`>>> [天聽檢測] 玩家${playerIndex + 1}天聽！手牌和明牌數量未變`);
      } else if (player.isDiTing) {
        isDiTing = true;
        player.isDiTing = true; // 標記為地聽
        console.log(`>>> [地聽檢測] 玩家${playerIndex + 1}地聽！手牌和明牌數量未變`);
      }
      console.log(`>>> [天聽/地聽檢測] 開局手牌：${initialHand.join(',')}`);
      console.log(`>>> [天聽/地聽檢測] 當前手牌（不包含摸到的牌）：${currentHand.join(',')}`);
    } else {
      console.log(`>>> [天聽/地聽檢測] 玩家${playerIndex + 1}不符合天聽/地聽條件：手牌相同=${handSame}，明牌數量相同=${meldsSame}`);
      console.log(`>>> [天聽/地聽檢測] 開局手牌：${initialHand.join(',')}`);
      console.log(`>>> [天聽/地聽檢測] 當前手牌（不包含摸到的牌）：${currentHand.join(',')}`);
    }
  } else {
    console.log(`>>> [天聽/地聽檢測] 玩家${playerIndex + 1}沒有開局聽牌記錄，不是天聽/地聽`);
  }

  const tingTypeText = isTianTing ? ' + 天聽' : (isDiTing ? ' + 地聽' : '');
  console.log(`玩家${playerIndex + 1}胡牌！類型：${huType}${tingTypeText}`);

  // 檢查是否是花槓（胡牌時有『梅蘭竹菊』或『春夏秋冬』任一組）
  const playerFlowers = table.flowers[playerId] || [];
  const meiLanZhuJu = ['梅', '蘭', '竹', '菊']; // 梅蘭竹菊
  const chunXiaQiuDong = ['春', '夏', '秋', '冬']; // 春夏秋冬

  // 檢查是否有梅蘭竹菊
  const hasMeiLanZhuJu = meiLanZhuJu.every(flower => playerFlowers.includes(flower));
  // 檢查是否有春夏秋冬
  const hasChunXiaQiuDong = chunXiaQiuDong.every(flower => playerFlowers.includes(flower));

  if (hasMeiLanZhuJu || hasChunXiaQiuDong) {
    const gangType = hasMeiLanZhuJu ? '梅蘭竹菊' : '春夏秋冬';
    console.log(`>>> [花槓檢測] 玩家${playerIndex + 1}花槓！有${gangType}組`);
    player.isHuaGang = true; // 標記為花槓
  }

  // 檢查是否是三暗刻、四暗刻、五暗刻（胡牌時"手牌"有3組、4組、5組3張相同或4張相同）
  // 需要統計胡牌前手牌中的暗刻數量（3張或4張相同的牌，每種牌算1組）
  let handForAnKe = [];
  if (huType === 'selfDrawnHu') {
    // 自摸：手牌包含剛摸到的牌，需要排除它來統計暗刻
    const targetTile = table.claimingState?.discardedTile || hand[hand.length - 1];
    if (hand.includes(targetTile)) {
      const lastIndex = hand.lastIndexOf(targetTile);
      handForAnKe = hand.slice(0, lastIndex).concat(hand.slice(lastIndex + 1));
    } else {
      handForAnKe = [...hand];
    }
  } else {
    // 放槍：手牌不包含目標牌，直接使用完整手牌
    handForAnKe = [...hand];
  }

  // 統計手牌中每種牌的數量
  const tileCounts = {};
  handForAnKe.forEach(tile => {
    tileCounts[tile] = (tileCounts[tile] || 0) + 1;
  });

  // 計算暗刻數量（3張相同或4張相同，每種牌算1組）
  let anKeCount = 0;
  Object.values(tileCounts).forEach(count => {
    if (count === 3 || count === 4) {
      anKeCount++;
    }
  });

  // 標記暗刻類型
  if (anKeCount === 3) {
    console.log(`>>> [暗刻檢測] 玩家${playerIndex + 1}三暗刻！手牌中有3組暗刻`);
    player.isSanAnKe = true; // 標記為三暗刻
  } else if (anKeCount === 4) {
    console.log(`>>> [暗刻檢測] 玩家${playerIndex + 1}四暗刻！手牌中有4組暗刻`);
    player.isSiAnKe = true; // 標記為四暗刻
  } else if (anKeCount === 5) {
    console.log(`>>> [暗刻檢測] 玩家${playerIndex + 1}五暗刻！手牌中有5組暗刻`);
    player.isWuAnKe = true; // 標記為五暗刻
  }

  // 檢查是否是清一色或字一色
  // 需要收集所有牌：手牌 + 明牌 + 胡的那張牌
  let allTilesForColor = [];

  // 添加手牌中的所有牌
  allTilesForColor.push(...hand);

  // 添加明牌中的所有牌
  melds.forEach(meld => {
    if (meld.tiles && meld.tiles.length > 0) {
      allTilesForColor.push(...meld.tiles);
    }
  });

  // 添加胡的那張牌（如果不在手牌中）
  if (huType === 'selfDrawnHu') {
    // 自摸：手牌包含剛摸到的牌，不需要額外添加
    // 因為手牌已經包含了剛摸到的牌，所以 allTilesForColor 已經包含了所有牌
  } else {
    // 放槍：手牌不包含目標牌，需要添加
    if (targetTile) {
      allTilesForColor.push(targetTile);
    }
  }

  // 判斷牌的類型
  const isWan = tile => tile.includes('萬');
  const isTong = tile => tile.includes('筒');
  const isTiao = tile => tile.includes('條');
  const isZi = tile => ['東', '南', '西', '北', '中', '發', '白'].includes(tile);

  // 統計牌的類型
  let wanCount = 0;
  let tongCount = 0;
  let tiaoCount = 0;
  let ziCount = 0;

  allTilesForColor.forEach(tile => {
    if (isWan(tile)) wanCount++;
    else if (isTong(tile)) tongCount++;
    else if (isTiao(tile)) tiaoCount++;
    else if (isZi(tile)) ziCount++;
  });

  // 檢查清一色：全部牌都是同一類型的數字牌（筒、條或萬），不含字牌
  const totalNumberTiles = wanCount + tongCount + tiaoCount;
  const totalTiles = wanCount + tongCount + tiaoCount + ziCount;

  if (ziCount === 0 && totalNumberTiles === totalTiles && totalTiles > 0) {
    // 只有一種數字牌類型
    if ((wanCount > 0 && tongCount === 0 && tiaoCount === 0) ||
      (wanCount === 0 && tongCount > 0 && tiaoCount === 0) ||
      (wanCount === 0 && tongCount === 0 && tiaoCount > 0)) {
      const colorType = wanCount > 0 ? '萬' : (tongCount > 0 ? '筒' : '條');
      console.log(`>>> [清一色檢測] 玩家${playerIndex + 1}清一色！全部是${colorType}子`);
      player.isQingYiSe = true; // 標記為清一色
    }
  }

  // 檢查字一色：全部由字牌組成，沒有任何數字牌
  if (wanCount === 0 && tongCount === 0 && tiaoCount === 0 && ziCount > 0 && ziCount === totalTiles) {
    console.log(`>>> [字一色檢測] 玩家${playerIndex + 1}字一色！全部是字牌`);
    player.isZiYiSe = true; // 標記為字一色
  }

  // 檢查混一色：整副牌由字牌及另外單一花色（萬、筒、條）組成
  // 條件：1. 有字牌 2. 有且僅有一種數字牌（萬、筒或條）
  if (ziCount > 0 && totalNumberTiles > 0) {
    // 只有一種數字牌類型
    if ((wanCount > 0 && tongCount === 0 && tiaoCount === 0) ||
      (wanCount === 0 && tongCount > 0 && tiaoCount === 0) ||
      (wanCount === 0 && tongCount === 0 && tiaoCount > 0)) {
      const colorType = wanCount > 0 ? '萬' : (tongCount > 0 ? '筒' : '條');
      console.log(`>>> [混一色檢測] 玩家${playerIndex + 1}混一色！字牌+${colorType}子`);
      player.isHunYiSe = true; // 標記為混一色
    }
  }

  // 檢查小四喜和大四喜
  // 需要統計東、南、西、北的刻子（3張或4張）和對子（2張）數量
  const windTiles = ['東', '南', '西', '北'];
  const windCounts = {};
  const windKezi = {}; // 刻子：3張或4張
  const windDuizi = {}; // 對子：2張

  // 統計所有牌中東南西北的數量
  allTilesForColor.forEach(tile => {
    if (windTiles.includes(tile)) {
      windCounts[tile] = (windCounts[tile] || 0) + 1;
    }
  });

  // 檢查每個風牌的刻子和對子
  windTiles.forEach(wind => {
    const count = windCounts[wind] || 0;
    if (count === 3 || count === 4) {
      windKezi[wind] = true; // 是刻子
    } else if (count === 2) {
      windDuizi[wind] = true; // 是對子
    }
  });

  // 統計刻子和對子數量
  const keziCount = Object.keys(windKezi).length;
  const duiziCount = Object.keys(windDuizi).length;

  // 確保四個風牌都有對應的數量（2、3或4張）
  const windTilesWithCount = windTiles.filter(wind => windCounts[wind] && (windCounts[wind] === 2 || windCounts[wind] === 3 || windCounts[wind] === 4));

  // 檢查大四喜：東南西北四個都是刻子（3張或4張）
  if (windTilesWithCount.length === 4 && keziCount === 4) {
    console.log(`>>> [大四喜檢測] 玩家${playerIndex + 1}大四喜！東南西北都是刻子`);
    player.isDaSiXi = true; // 標記為大四喜
  }
  // 檢查小四喜：東南西北中有三個是刻子，一個是對子
  else if (windTilesWithCount.length === 4 && keziCount === 3 && duiziCount === 1) {
    console.log(`>>> [小四喜檢測] 玩家${playerIndex + 1}小四喜！東南西北中三個是刻子，一個是對子`);
    player.isXiaoSiXi = true; // 標記為小四喜
  }

  // 檢查小三元和大三元
  // 需要統計中、發、白的刻子（3張或4張）和對子（2張）數量
  const dragonTiles = ['中', '發', '白'];
  const dragonCounts = {};
  const dragonKezi = {}; // 刻子：3張或4張
  const dragonDuizi = {}; // 對子：2張

  // 統計所有牌中中發白的數量
  allTilesForColor.forEach(tile => {
    if (dragonTiles.includes(tile)) {
      dragonCounts[tile] = (dragonCounts[tile] || 0) + 1;
    }
  });

  // 檢查每個三元牌的刻子和對子
  dragonTiles.forEach(dragon => {
    const count = dragonCounts[dragon] || 0;
    if (count === 3 || count === 4) {
      dragonKezi[dragon] = true; // 是刻子
    } else if (count === 2) {
      dragonDuizi[dragon] = true; // 是對子
    }
  });

  // 統計刻子和對子數量
  const dragonKeziCount = Object.keys(dragonKezi).length;
  const dragonDuiziCount = Object.keys(dragonDuizi).length;

  // 確保三個三元牌都有對應的數量（2、3或4張）
  const dragonTilesWithCount = dragonTiles.filter(dragon => dragonCounts[dragon] && (dragonCounts[dragon] === 2 || dragonCounts[dragon] === 3 || dragonCounts[dragon] === 4));

  // 檢查大三元：中發白三個都是刻子（3張或4張）
  if (dragonTilesWithCount.length === 3 && dragonKeziCount === 3) {
    console.log(`>>> [大三元檢測] 玩家${playerIndex + 1}大三元！中發白都是刻子`);
    player.isDaSanYuan = true; // 標記為大三元
  }
  // 檢查小三元：中發白中有兩個是刻子，一個是對子
  else if (dragonTilesWithCount.length === 3 && dragonKeziCount === 2 && dragonDuiziCount === 1) {
    console.log(`>>> [小三元檢測] 玩家${playerIndex + 1}小三元！中發白中兩個是刻子，一個是對子`);
    player.isXiaoSanYuan = true; // 標記為小三元
  }

  // 檢查是否是碰碰胡（全部由刻子再加一個對子組成，沒有順子，包含吃跟槓就不算碰碰胡，但碰可以）
  // 條件：1. 明牌中沒有吃（chi）和槓（kong）2. 所有牌（手牌+明牌+胡的那張牌）全部是刻子（3張或4張）+ 1個對子（2張）
  const hasChi = melds.some(meld => meld.type === 'chi');
  const hasKong = melds.some(meld => meld.type === 'kong');

  // 如果沒有吃和槓，檢查是否全部是刻子+對子
  if (!hasChi && !hasKong) {
    // 統計所有牌（手牌+明牌+胡的那張牌）中每種牌的數量
    const allTilesCounts = {};
    allTilesForColor.forEach(tile => {
      allTilesCounts[tile] = (allTilesCounts[tile] || 0) + 1;
    });

    // 檢查每種牌的數量：應該是刻子（3張或4張）或對子（2張）
    let hasInvalidCount = false;
    let keziGroupCount = 0; // 刻子組數（3張或4張）
    let duiziGroupCount = 0; // 對子組數（2張）

    Object.values(allTilesCounts).forEach(count => {
      if (count === 2) {
        duiziGroupCount++; // 是對子
      } else if (count === 3 || count === 4) {
        keziGroupCount++; // 是刻子（3張或4張）
      } else {
        hasInvalidCount = true; // 有不符合的數量（1張或5張以上）
      }
    });

    // 碰碰胡條件：
    // 1. 所有牌沒有順子（沒有1張或不符合的數量）
    // 2. 所有牌有且僅有1個對子（2張）
    // 3. 其他都是刻子（3張或4張），總共5組面子
    if (!hasInvalidCount && duiziGroupCount === 1 && keziGroupCount === 5) {
      console.log(`>>> [碰碰胡檢測] 玩家${playerIndex + 1}碰碰胡！全部是刻子+1個對子，沒有順子，沒有吃和槓`);
      player.isPengPengHu = true; // 標記為碰碰胡
    }
  }

  // 保存胡牌類型到玩家對象，用於結算時顯示
  player.lastHuType = huType; // 'selfDrawnHu' 或 'hu'

  // 更新統計資料
  if (huType === 'selfDrawnHu') {
    player.statistics = player.statistics || { selfDraws: 0, discards: 0, claimedDiscards: 0, discardedHu: 0 };
    player.statistics.selfDraws = (player.statistics.selfDraws || 0) + 1;
  } else {
    player.statistics = player.statistics || { selfDraws: 0, discards: 0, claimedDiscards: 0, discardedHu: 0 };
    player.statistics.claimedDiscards = (player.statistics.claimedDiscards || 0) + 1;
    
    // 更新放槍者的放槍次數統計
    let discarderId = null;
    if (targetPlayer !== null && targetPlayer !== undefined) {
      if (typeof targetPlayer === 'number') {
        const discarder = table.players[targetPlayer];
        discarderId = discarder ? discarder.id : null;
      } else if (typeof targetPlayer === 'string') {
        discarderId = targetPlayer;
      } else if (targetPlayer.id) {
        discarderId = targetPlayer.id;
      }
    }
    
    // 如果還是找不到，嘗試從 claimingState 中獲取
    if (!discarderId && table.claimingState && table.claimingState.discardPlayerId) {
      discarderId = table.claimingState.discardPlayerId;
    }
    
    // 更新放槍者的統計
    if (discarderId) {
      const discarder = table.players.find(p => p.id === discarderId);
      if (discarder) {
        discarder.statistics = discarder.statistics || { selfDraws: 0, discards: 0, claimedDiscards: 0, discardedHu: 0 };
        discarder.statistics.discardedHu = (discarder.statistics.discardedHu || 0) + 1;
        console.log(`>>> [統計] 玩家 ${discarderId} 放槍次數 +1，當前總計: ${discarder.statistics.discardedHu}`);
      }
    }
  }

  // 計算台數和牌型
  const taiResult = calculateTai(table, player, playerIndex, huType);
  const totalTai = taiResult.totalTai;
  
  // 構建牌型列表，確保"自摸"或"胡牌"在最前面
  // 注意：calculateTai 已經會添加"自摸"到 patternNames 中，但順序可能不對
  // 我們需要將"自摸"或"門清自摸"移到最前面，避免重複
  let winPatterns;
  if (huType === 'selfDrawnHu') {
    // 自摸時，從 patternNames 中移除"自摸"或"門清自摸"，然後放在最前面
    const otherPatterns = taiResult.patternNames.filter(p => p !== '自摸' && p !== '門清自摸');
    const selfDrawPattern = taiResult.patternNames.find(p => p === '自摸' || p === '門清自摸') || '自摸';
    winPatterns = [selfDrawPattern, ...otherPatterns];
  } else {
    // 放槍時，在前面加上"胡牌"
    winPatterns = ['胡牌', ...taiResult.patternNames];
  }
  
  // 獲取遊戲設定
  const gameSettings = table.gameSettings || {
    base_points: 100,
    scoring_unit: 20,
    point_cap: 'UP_TO_8_POINTS'
  };
  const basePoints = gameSettings.base_points || 100;
  const scoringUnit = gameSettings.scoring_unit || 20;
  
  // 計算分數：底 + 台 × 台數
  // 底 = basePoints（基本胡牌數字/底分）
  // 台 = totalTai（總台數，已套用封頂限制）
  // 台數 = scoringUnit（每台分數）
  const scorePerPlayer = basePoints + (totalTai * scoringUnit);
  
  console.log(`>>> [分數計算] 底: ${basePoints}, 台: ${totalTai}, 台數: ${scoringUnit}`);
  console.log(`>>> [分數計算] 計算公式: 底(${basePoints}) + 台(${totalTai}) × 台數(${scoringUnit}) = ${scorePerPlayer}`);
  
  // 計算該圈的分數變化
  const roundScores = {};
  
  if (huType === 'selfDrawnHu') {
    // 自摸：其他三家各扣相同分數，獲勝者獲得三家總和
    const totalWinnings = scorePerPlayer * 3; // 三家總和
    table.players.forEach(p => {
      if (p.id === playerId) {
        roundScores[p.id] = totalWinnings; // 獲勝者得分
      } else {
        roundScores[p.id] = -scorePerPlayer; // 其他玩家各扣分
      }
    });
    console.log(`>>> [分數計算] 自摸：獲勝者得 ${totalWinnings}，其他玩家各扣 ${scorePerPlayer}`);
  } else {
    // 放槍：只扣放槍玩家的點數
    // targetPlayer 可能是玩家索引（數字）或玩家ID（字符串）或玩家對象
    let discarderId = null;
    if (targetPlayer !== null && targetPlayer !== undefined) {
      if (typeof targetPlayer === 'number') {
        // 如果是索引，找到對應的玩家ID
        const discarder = table.players[targetPlayer];
        discarderId = discarder ? discarder.id : null;
      } else if (typeof targetPlayer === 'string') {
        // 如果是字符串，直接使用
        discarderId = targetPlayer;
      } else if (targetPlayer.id) {
        // 如果是對象，使用 id 屬性
        discarderId = targetPlayer.id;
      }
    }
    
    // 如果還是找不到，嘗試從 claimingState 中獲取
    if (!discarderId && table.claimingState && table.claimingState.discardPlayerId) {
      discarderId = table.claimingState.discardPlayerId;
    }
    
    if (discarderId) {
      table.players.forEach(p => {
        if (p.id === playerId) {
          roundScores[p.id] = scorePerPlayer; // 獲勝者得分
        } else if (p.id === discarderId) {
          roundScores[p.id] = -scorePerPlayer; // 放槍者扣分
        } else {
          roundScores[p.id] = 0; // 其他玩家不扣分
        }
      });
      console.log(`>>> [分數計算] 放槍：獲勝者得 ${scorePerPlayer}，放槍者扣 ${scorePerPlayer}`);
    } else {
      // 如果找不到放槍者，使用舊邏輯（不應該發生）
      console.warn(`>>> [分數計算] 警告：找不到放槍者，使用舊邏輯`);
      table.players.forEach(p => {
        if (p.id === playerId) {
          roundScores[p.id] = scorePerPlayer;
        } else {
          roundScores[p.id] = -Math.floor(scorePerPlayer / 3);
        }
      });
    }
  }

  // 累加分數到玩家總分
  table.players.forEach(p => {
    p.score = (p.score || 0) + roundScores[p.id];
    // 記錄該圈分數變化
    if (!p.roundScores) p.roundScores = [];
    p.roundScores.push({
      round: table.round,
      scoreChange: roundScores[p.id]
    });
  });

  // 記錄該圈分數變化到 roundHistory
  if (!table.roundHistory) table.roundHistory = [];
  table.roundHistory.push({
    round: table.round,
    scores: { ...roundScores },
    winnerId: playerId
  });

  console.log(`>>> [圈數管理] 第 ${table.round} 圈結束，分數變化:`, roundScores);
  console.log(`>>> [圈數管理] 當前總分:`, table.players.map(p => ({ id: p.id, score: p.score })));

  // 廣播胡牌
  // 廣播胡牌宣告給所有玩家（確保所有玩家都能聽到音效）
  console.log(`>>> [音效廣播] 廣播胡牌宣告事件給房間 ${tableId} 的所有玩家，類型：${huType}`);
  io.to(tableId).emit('huDeclared', {
    winnerPlayerId: playerId,
    winnerPlayerIndex: playerIndex,
    huType: huType, // 'selfDrawnHu' 或 'hu'
    targetTile: targetTile,
    targetPlayer: targetPlayer,
    scores: roundScores, // 該圈分數變化
    isTianTing: isTianTing, // 是否為天聽
    isDiTing: isDiTing // 是否為地聽
  });

  // 判斷是否需要中間結算或最終結算
  const maxRounds = table.maxRounds || 1;
  const currentRound = table.round;
  const nextRound = currentRound + 1;
  const isLastRound = (nextRound > maxRounds) || (maxRounds === 1 && currentRound === 1);

  console.log(`>>> [圈數管理] 當前圈數: ${currentRound}, 下一圈: ${nextRound}, 總圈數: ${maxRounds}, 是否最後一圈: ${isLastRound}`);

  // 所有情況都先顯示中間結算（包括最後一圈），玩家按下繼續後才顯示最終結算
  console.log(`>>> [圈數管理] 觸發中間結算（當前圈數: ${currentRound}/${maxRounds}）`);
  
  // 準備中間結算資料
  const totalScores = {};
  table.players.forEach(p => {
    totalScores[p.id] = p.score || 0;
  });

  // 保存獲勝者ID（用於下一圈換莊家，如果是最後一圈則不會用到）
  table.nextRoundWinnerId = playerId;
  
  // 廣播中間結算事件
  io.to(tableId).emit('roundEnd', {
    round: currentRound,
    maxRounds: maxRounds,
    roundScores: roundScores, // 該圈分數變化
    totalScores: totalScores, // 累積總分
    isLastRound: isLastRound, // 標記是否為最後一圈
    remainingTilesList: table.deck || [], // 剩餘牌列表
    players: table.players.map(p => ({
      id: p.id,
      name: p.name,
      userId: p.userId || null, // 添加6位數userId
      avatarUrl: p.avatarUrl || null, // 添加頭像URL
      score: p.score || 0,
      seat: p.seat,
      isDealer: p.isDealer,
      statistics: p.statistics || { selfDraws: 0, discards: 0, claimedDiscards: 0, discardedHu: 0 },
      winPatterns: p.id === playerId ? winPatterns : [], // 只有獲勝者才有牌型
      hand: table.hiddenHands[p.id] || [], // 所有玩家都顯示手牌
      melds: table.melds[p.id] || [], // 所有玩家都顯示明牌
      winningTile: p.id === playerId ? targetTile : null // 只有獲勝者才有胡牌的那張牌
    }))
  });

  // 如果不是最後一圈，增加圈數，準備下一圈
  if (!isLastRound) {
    table.round = nextRound;
  }
  table.roundContinueReady = new Set(); // 追蹤哪些玩家已確認繼續
  table.isLastRound = isLastRound; // 標記是否為最後一圈
  console.log(`>>> [圈數管理] 等待玩家確認繼續，是否最後一圈: ${isLastRound}`);
}

// 清理資料，確保可序列化（移除函數、循環引用等）
function getCleanTableData(table) {
  if (!table) return null;

  try {
    // 創建一個純資料的副本
    const cleanData = {
      id: table.id,
      players: table.players ? table.players.map(p => ({
        id: p.id,
        name: p.name,
        userId: p.userId || null,
        avatarUrl: p.avatarUrl || null,
        seat: p.seat,
        isDealer: p.isDealer,
        score: p.score,
        isReady: p.isReady,
        isTing: p.isTing || false,
        isTianTing: p.isTianTing || false,
        isDiTing: p.isDiTing || false,
        ipAddress: p.ipAddress || null,
        latitude: p.latitude || null,
        longitude: p.longitude || null
      })) : [],
      hands: table.hands || {},
      // hiddenHands 不應該發送給所有玩家，只發送給自己
      // hiddenHands: table.hiddenHands || {},
      melds: table.melds || {},
      discards: table.discards || {},
      flowers: table.flowers || {},
      deck: table.deck || [],
      turn: table.turn,
      windStart: table.windStart,
      dealerIndex: table.dealerIndex,
      lastDiscard: table.lastDiscard,
      gamePhase: table.gamePhase,
      timer: table.timer,
      started: table.started,
      countdownStarted: table.countdownStarted,
      round: table.round,
      maxRounds: table.maxRounds || 1,
      wind: table.wind,
      manualStart: table.manualStart || false,
      gameSettings: table.gameSettings || null // 包含遊戲設定（GPS鎖定、IP檢查等）
    };

    return cleanData;
  } catch (error) {
    console.error('清理資料時發生錯誤:', error);
    return null;
  }
}

// 安全地發送資料（包含錯誤處理）
function safeEmit(room, event, data) {
  try {
    // 如果資料是 table 物件，先清理
    if (data && typeof data === 'object' && data.id && data.players) {
      data = getCleanTableData(data);
    }

    if (data === null || data === undefined) {
      console.warn(`嘗試發送 null/undefined 資料到 ${event}`);
      return;
    }

    io.to(room).emit(event, data);
  } catch (error) {
    console.error(`發送資料到 ${event} 時發生錯誤:`, error);
    // 不拋出錯誤，避免伺服器崩潰
  }
}

// 更新房間的當前玩家數
async function updateRoomCurrentPlayers(roomId, currentPlayers) {
  try {
    const room = await prisma.room.findUnique({
      where: { roomId: roomId },
    });

    if (room) {
      try {
        await prisma.room.update({
          where: { roomId: roomId },
          data: { currentPlayers: currentPlayers },
        });
        console.log(`已更新房間 ${roomId} 的 currentPlayers 為 ${currentPlayers}`);
      } catch (err) {
        if (err && err.code === 'P2025') {
          console.warn(`房間 ${roomId} 在更新時已不存在，忽略 P2025`);
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    console.error(`更新房間 ${roomId} 的 currentPlayers 失敗:`, error);
  }
}

// 處理玩家斷線
async function handlePlayerDisconnect(tableId, playerId, socketId) {
  const table = tables[tableId];
  if (!table) {
    console.log(`房間 ${tableId} 不存在`);
    return;
  }

  console.log(`處理玩家離開：房間 ${tableId}，玩家 ${playerId}`);

  // 找出玩家索引
  const playerIndex = table.players.findIndex(p => p.id === playerId);

  if (playerIndex === -1) {
    console.log(`玩家 ${playerId} 不在房間 ${tableId} 中`);
    return;
  }

  // 清除所有與該玩家相關的計時器
  if (table.claimingState && table.claimingState.options) {
    const playerOption = table.claimingState.options.find(opt => opt.playerId === playerId);
    if (playerOption) {
      // 如果該玩家正在等待吃碰槓，移除該選項
      table.claimingState.options = table.claimingState.options.filter(opt => opt.playerId !== playerId);

      // 如果沒有其他選項了，清除吃碰槓狀態
      if (table.claimingState.options.length === 0) {
        if (table.claimingTimer) {
          clearInterval(table.claimingTimer);
          table.claimingTimer = null;
        }
        table.claimingState = null;
        table.gamePhase = GamePhase.PLAYING;
      }
    }
  }

  // 清除聽牌狀態（如果該玩家正在聽牌）
  if (table.tingState && table.tingState.playerId === playerId) {
    if (table.tingTimer) {
      clearInterval(table.tingTimer);
      table.tingTimer = null;
    }
    table.tingState = null;
    table.gamePhase = GamePhase.PLAYING;
  }

  // 清除回合計時器（如果該玩家是當前回合）
  if (table.turn === playerIndex && table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
  }

  // 如果是手動開始房間，重置所有玩家的準備狀態
  if (table.manualStart) {
    table.players.forEach(p => {
      p.isReady = false;
    });
    console.log(`玩家 ${playerId} 離開，重置所有玩家準備狀態`);
  }

  // 從玩家列表中移除
  table.players = table.players.filter(p => p.id !== playerId);

  // 清理玩家相關數據
  delete table.hands[playerId];
  delete table.hiddenHands[playerId];
  delete table.melds[playerId];
  delete table.discards[playerId];
  delete table.flowers[playerId];

  // 更新數據庫中的 currentPlayers
  updateRoomCurrentPlayers(tableId, table.players.length).catch(err => {
    console.error(`更新房間 ${tableId} 的 currentPlayers 失敗:`, err);
  });

  // 如果房間空了，刪除房間
  if (table.players.length === 0) {
    console.log(`房間 ${tableId} 已空，刪除房間`);
    delete tables[tableId];

    // 刪除數據庫中的房間記錄
    try {
      // 查找並刪除房間
      const room = await prisma.room.findUnique({
        where: { roomId: tableId },
      });

      if (room) {
        await prisma.room.delete({
          where: { roomId: tableId },
        });
        console.log(`已刪除數據庫中的房間記錄：${tableId}`);
      }
    } catch (error) {
      console.error(`刪除房間記錄失敗：${tableId}`, error);
      // 即使刪除失敗，也繼續執行，因為內存中的房間已經刪除
    }

    return;
  }

  // 如果遊戲正在進行，需要處理玩家離開的情況
  if (table.gamePhase === GamePhase.PLAYING || table.gamePhase === GamePhase.CLAIMING) {
    // 如果離開的是當前玩家，輪到下一家
    if (table.turn === playerIndex) {
      console.log(`當前玩家離開，輪到下一家`);
      // 確保下一個玩家索引有效
      if (table.players.length > 0) {
        // 重新計算 turn（因為玩家列表已更新）
        const newTurnIndex = table.turn % table.players.length;
        table.turn = newTurnIndex;
        nextTurn(tableId);
      }
    } else {
      // 更新 turn 索引（因為玩家列表已更新）
      const oldTurn = table.turn;
      if (playerIndex < oldTurn) {
        table.turn = oldTurn - 1;
      }
    }
  }

  // 廣播玩家離開
  safeEmit(tableId, 'playerLeft', {
    playerId: playerId,
    remainingPlayers: table.players.length
  });

  // 發送更新後的房間狀態
  const cleanTableData = getCleanTableData(table);
  if (cleanTableData) {
    safeEmit(tableId, 'tableUpdate', cleanTableData);
  }
}

// 輪到下一家
function nextTurn(tableId) {
  const table = tables[tableId];
  if (!table) {
    console.log(`房間 ${tableId} 不存在，無法輪到下一家`);
    return;
  }

  // 檢查遊戲是否已結束
  if (table.gamePhase === GamePhase.ENDED) {
    console.log('>>> 遊戲已結束，無法輪到下一家');
    return;
  }

  // 檢查是否還有玩家
  if (table.players.length === 0) {
    console.log('房間已無玩家，無法輪到下一家');
    return;
  }

  // 清除回合計時器
  if (table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
  }

  // 確保 turn 索引有效
  if (table.turn >= table.players.length) {
    table.turn = 0;
  }

  table.turn = (table.turn + 1) % table.players.length;

  // 檢查第一圈是否結束（如果回到莊家，且莊家已經打過牌，則第一圈結束）
  if (table.isFirstRound && table.turn === table.dealerIndex && table.isFirstDealerDiscard === false) {
    table.isFirstRound = false;
    console.log(`>>> [第一圈] 第一圈結束，後續聽牌不再算地聽`);
  }

  // 確保下一個玩家存在
  if (table.turn >= table.players.length || !table.players[table.turn]) {
    console.log(`錯誤：下一個玩家索引 ${table.turn} 無效`);
    return;
  }

  const nextPlayer = table.players[table.turn];
  console.log(`輪到玩家${table.turn + 1} (${nextPlayer.name || nextPlayer.id})`);

  // 廣播輪次更新
  safeEmit(tableId, 'turnUpdate', {
    turn: table.turn,
    playerId: nextPlayer.id
  });

  // 下一家摸牌
  setTimeout(() => {
    // 再次檢查玩家是否仍然存在
    const currentTable = tables[tableId];
    if (currentTable && currentTable.players[table.turn] && currentTable.players[table.turn].id === nextPlayer.id) {
      drawTile(tableId, nextPlayer.id);
    } else {
      console.log(`玩家 ${nextPlayer.id} 已離開，跳過摸牌`);
    }
  }, 1000);
}

// 胡牌檢測（考慮明牌數量）
function canHu(hand, tile, exposedMelds = 0) {
  return mahjongLogic.canHu(hand, tile, exposedMelds);
}

// 聽牌檢測（考慮明牌數量）
function canTing(hand, exposedMelds = 0) {
  return mahjongLogic.canTing(hand, exposedMelds);
}

// 槓牌檢測
function canKong(hand, tile) {
  return mahjongLogic.canKong(hand, tile);
}

// 碰牌檢測
function canPong(hand, tile) {
  return mahjongLogic.canPong(hand, tile);
}

// 吃牌檢測
function canChi(hand, tile, discardingPlayer, currentPlayer) {
  const combinations = mahjongLogic.canChi(hand, tile, discardingPlayer, currentPlayer);
  return combinations.length > 0;
}

// 自槓檢測
function canSelfKong(hand, newTile) {
  return mahjongLogic.canSelfKong(hand, newTile);
}

io.on('connection', (socket) => {
  console.log('有玩家連線', socket.id);

  socket.on('joinTable', async ({ tableId, player }) => {
    // 檢查該 socket 是否已經在其他房間，如果是，先清理舊的映射
    const existingMapping = socketToPlayer[socket.id];
    if (existingMapping && existingMapping.tableId !== tableId) {
      console.log(`Socket ${socket.id} 從房間 ${existingMapping.tableId} 切換到房間 ${tableId}`);
      // 從舊房間離開
      socket.leave(existingMapping.tableId);
      // 清理舊的映射（但不調用 handlePlayerDisconnect，因為玩家可能只是切換房間）
      delete socketToPlayer[socket.id];
    }

    // 根據暱稱獲取或生成玩家ID
    const nickname = player.name || player.nickname || '玩家';
    let playerId;
    let userId = null;
    let avatarUrl = player.avatarUrl || null; // 從客戶端獲取頭像URL
    let remark = null; // 備註內容

    // 嘗試從數據庫中查找玩家（使用 findFirst 因為現在允許暱稱重複）
    try {
      const dbPlayer = await prisma.player.findFirst({
        where: { nickname: nickname.trim() },
        select: { id: true, userId: true, avatarUrl: true, bio: true }
      });

      if (dbPlayer) {
        // 使用數據庫中的ID
        playerId = dbPlayer.id;
        userId = dbPlayer.userId;
        // 如果客戶端沒有提供頭像URL，使用數據庫中的
        if (!avatarUrl && dbPlayer.avatarUrl) {
          avatarUrl = dbPlayer.avatarUrl;
        }
        // 從數據庫獲取備註（使用 bio 字段）
        remark = dbPlayer.bio || null;
        // 保存暱稱到ID的映射
        nicknameToPlayerId[nickname] = playerId;
        // 只在第一次查詢時輸出日誌，避免重複日誌
        if (!existingMapping || existingMapping.tableId !== tableId) {
          console.log(`暱稱 "${nickname}" 已存在於數據庫，使用ID: ${playerId}, userId: ${userId}, remark: ${remark || '無'}`);
        }
      } else {
        // 如果數據庫中不存在，檢查內存映射
        if (nicknameToPlayerId[nickname]) {
          playerId = nicknameToPlayerId[nickname];
          if (!existingMapping || existingMapping.tableId !== tableId) {
            console.log(`暱稱 "${nickname}" 已存在於內存映射，使用ID: ${playerId}`);
          }
        } else {
          // 生成新的ID（使用簡單的哈希算法或時間戳）
          // 這裡使用時間戳 + 隨機數生成唯一ID
          playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          // 保存暱稱到ID的映射
          nicknameToPlayerId[nickname] = playerId;
          console.log(`新暱稱 "${nickname}"，生成新ID: ${playerId}`);
        }
      }
    } catch (error) {
      console.error(`查詢玩家失敗: ${error.message}`);
      // 如果數據庫查詢失敗，使用內存映射或生成新ID
      if (nicknameToPlayerId[nickname]) {
        playerId = nicknameToPlayerId[nickname];
        if (!existingMapping || existingMapping.tableId !== tableId) {
          console.log(`暱稱 "${nickname}" 已存在於內存映射，使用ID: ${playerId}`);
        }
      } else {
        playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        nicknameToPlayerId[nickname] = playerId;
        console.log(`新暱稱 "${nickname}"，生成新ID: ${playerId}`);
      }
    }

    // 使用服務器端生成的ID，而不是客戶端發送的ID
    const serverPlayer = {
      id: playerId,
      name: nickname,
      userId: userId || null, // 添加6位數userId
      avatarUrl: avatarUrl || null, // 添加頭像URL
      remark: remark || null // 添加備註
    };

    // 取得房間設定（特別是是否手動開始）
    let manualStart = false;
    let maxRounds = 1; // 預設1圈
    let gameSettings = null; // 保存完整的遊戲設定
    try {
      const roomRecord = await prisma.room.findUnique({
        where: { roomId: tableId },
        select: { gameSettings: true }
      });
      gameSettings = roomRecord?.gameSettings || null;
      manualStart = gameSettings?.manual_start === true;
      // 讀取圈數設定（1/2/4圈）
      maxRounds = gameSettings?.rounds || 1;
      // 只在第一次加入或切換房間時輸出日誌
      if (!existingMapping || existingMapping.tableId !== tableId) {
        console.log(`>>> [房間設定] 房間 ${tableId} 的圈數設定: ${maxRounds} 圈`);
        console.log(`>>> [房間設定] 底分: ${gameSettings?.base_points || 100}, 每台分數: ${gameSettings?.scoring_unit || 20}, 封頂: ${gameSettings?.point_cap || 'UP_TO_8_POINTS'}`);
        const isGPSLockEnabled = gameSettings?.gps_lock === true || gameSettings?.location_check === true;
        if (isGPSLockEnabled) {
          console.log(`>>> [房間設定] GPS鎖定: 已啟用`);
        }
        if (gameSettings?.ip_check === true) {
          console.log(`>>> [房間設定] IP檢查: 已啟用`);
        }
      }
    } catch (err) {
      console.error(`查詢房間設定失敗（${tableId}）:`, err.message);
    }

    if (!tables[tableId]) {
      tables[tableId] = {
        id: tableId,
        players: [], // [{id, name, seat, isDealer}]
        hands: {}, // {playerId: [tiles...]} - 只存明牌（公開資訊）
        hiddenHands: {}, // {playerId: [tiles...]} - 存暗牌（只有自己知道）
        melds: {}, // {playerId: [{type, tiles, fromPlayer}]} - 吃碰槓牌組
        discards: {}, // {playerId: [tiles...]} - 打出的牌
        flowers: {}, // {playerId: [tiles...]} - 收集的花牌
        deck: [], // 剩餘牌組
        turn: 0, // 當前輪次 (0-3)
        windStart: 0, // 東的起始位置
        dealerIndex: 0, // 莊家索引
        lastDiscard: null, // {playerId, tile, index} - 最後打出的牌
        gamePhase: GamePhase.WAITING, // 遊戲階段
        claimingState: null, // {playerId, claimType, options, timer} - 吃碰槓胡等待狀態
        timer: 0, // 倒計時秒數
        started: false,
        countdownStarted: false, // 倒數計時是否已開始
        round: 1, // 當前圈數
        maxRounds: maxRounds, // 總圈數（從 gameSettings.rounds 讀取）
        wind: 0, // 風圈 (0:東風, 1:南風, 2:西風, 3:北風)
        manualStart, // 是否手動開始（需房主觸發）
        roundHistory: [], // 每圈分數變化記錄
        chatMessages: [], // 聊天訊息陣列
        gameSettings: gameSettings || { // 保存遊戲設定供計分使用
          base_points: 100,
          scoring_unit: 20,
          point_cap: 'UP_TO_8_POINTS'
        }
      };
    } else {
      // 如果 table 已存在，更新 maxRounds 和 gameSettings（以防房間設定變更）
      tables[tableId].maxRounds = maxRounds;
      if (gameSettings) {
        tables[tableId].gameSettings = gameSettings;
      }
    }

    // 檢查玩家是否已經在房間中（使用服務器端生成的ID）
    const existingPlayer = tables[tableId].players.find(p => p.id === playerId);
    
    // 檢查該 socket 是否已經在同一個房間中
    const isSameRoom = existingMapping && existingMapping.tableId === tableId && existingMapping.playerId === playerId;
    
    if (isSameRoom && existingPlayer) {
      // 如果 socket 已經在同一個房間中，且玩家已存在，直接返回，避免重複處理
      console.log(`Socket ${socket.id} 已在此房間 ${tableId}，跳過重複加入`);
      // 仍然發送更新，確保客戶端狀態同步
      const cleanTableData = getCleanTableData(tables[tableId]);
      socket.emit('tableUpdate', cleanTableData);
      return;
    }
    
    // GPS位置收集（僅在新玩家加入時收集）
    // 檢查 gps_lock 或 location_check（為了向後兼容）
    // 注意：GPS鎖定現在只要求提供GPS位置（用於UI顯示距離），不再限制距離
    const isGPSLockEnabled = gameSettings?.gps_lock === true || gameSettings?.location_check === true;
    if (!existingPlayer && isGPSLockEnabled) {
      const newPlayerLat = player.latitude;
      const newPlayerLon = player.longitude;
      
      console.log(`[GPS檢查] 玩家 ${playerId} 嘗試加入房間 ${tableId}，GPS鎖定已啟用（要求提供GPS位置）`);
      console.log(`[GPS檢查] 新玩家GPS位置: lat=${newPlayerLat}, lon=${newPlayerLon}`);
      
      // 檢查新玩家是否提供了GPS位置（GPS鎖定啟用時必須提供）
      if (newPlayerLat == null || newPlayerLon == null) {
        console.log(`[GPS檢查] 玩家 ${playerId} 嘗試加入房間 ${tableId}，但未提供GPS位置（房間已開啟GPS鎖定）`);
        socket.emit('joinTableError', {
          success: false,
          error: 'LOCATION_REQUIRED',
          message: '此房間需要GPS位置資訊，請開啟定位服務'
        });
        return;
      }
      
      // 驗證GPS座標是否有效
      if (isNaN(newPlayerLat) || isNaN(newPlayerLon) || 
          newPlayerLat < -90 || newPlayerLat > 90 ||
          newPlayerLon < -180 || newPlayerLon > 180) {
        console.log(`[GPS檢查] 玩家 ${playerId} 提供的GPS座標無效: lat=${newPlayerLat}, lon=${newPlayerLon}`);
        socket.emit('joinTableError', {
          success: false,
          error: 'LOCATION_INVALID',
          message: 'GPS位置資訊無效，請重新定位'
        });
        return;
      }
      
      // GPS鎖定啟用時，只保存GPS位置用於UI顯示，不檢查距離限制
      serverPlayer.latitude = newPlayerLat;
      serverPlayer.longitude = newPlayerLon;
      console.log(`[GPS檢查] ✅ 已保存玩家 ${playerId} 的GPS位置（用於UI顯示距離）`);
    } else if (!existingPlayer && player.latitude != null && player.longitude != null) {
      // 即使GPS鎖定未啟用，如果玩家提供了GPS位置，也保存它（以備後用）
      serverPlayer.latitude = player.latitude;
      serverPlayer.longitude = player.longitude;
      console.log(`[GPS收集] ✅ 已保存玩家 ${playerId} 的GPS位置（GPS鎖定未啟用，但玩家提供了位置）`);
    }
    
    // IP地址收集和檢查（僅在新玩家加入時處理）
    // 不管IP檢查是否啟用，都要保存IP地址用於UI顯示
    // 但只有IP檢查啟用時，才會限制相同IP的玩家加入
    if (!existingPlayer) {
      // 獲取客戶端IP地址
      const clientIP = socket.handshake.address || 
                      socket.request?.connection?.remoteAddress || 
                      socket.handshake?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
                      socket.handshake?.headers?.['x-real-ip'] ||
                      'unknown';
      
      // 處理IPv6映射的IPv4地址 (::ffff:192.168.1.1 -> 192.168.1.1)
      const cleanIP = clientIP.replace(/^::ffff:/, '');
      
      const isIPCheckEnabled = gameSettings?.ip_check === true;
      
      if (isIPCheckEnabled) {
        console.log(`[IP檢查] 玩家 ${playerId} 嘗試加入房間 ${tableId}，IP檢查已啟用`);
        console.log(`[IP檢查] 新玩家IP地址: ${cleanIP}`);
        
        // 檢查與房間內所有現有玩家的IP
        const existingPlayers = tables[tableId].players;
        
        console.log(`[IP檢查] 房間內現有玩家數量: ${existingPlayers.length}`);
        
        for (const existingPlayer of existingPlayers) {
          if (existingPlayer.ipAddress) {
            console.log(`[IP檢查] 玩家 ${playerId} IP: ${cleanIP} vs 房間內玩家 ${existingPlayer.id} (${existingPlayer.name}) IP: ${existingPlayer.ipAddress}`);
            
            if (cleanIP === existingPlayer.ipAddress) {
              console.log(`[IP檢查] ❌ 玩家 ${playerId} 與房間內玩家 ${existingPlayer.id} 使用相同IP地址: ${cleanIP}`);
              socket.emit('joinTableError', {
                success: false,
                error: 'IP_SAME',
                message: '您與房內玩家使用相同IP地址，無法加入'
              });
              return;
            }
          } else {
            console.log(`[IP檢查] ⚠️ 房間內玩家 ${existingPlayer.id} (${existingPlayer.name}) 沒有IP地址資訊`);
          }
        }
        
        // IP檢查通過，將IP地址添加到serverPlayer
        serverPlayer.ipAddress = cleanIP;
        console.log(`[IP檢查] ✅ 玩家 ${playerId} IP檢查通過，已加入房間`);
      } else {
        // IP檢查未啟用，但仍保存IP地址用於UI顯示
        serverPlayer.ipAddress = cleanIP;
        console.log(`[IP收集] ✅ 已保存玩家 ${playerId} 的IP地址（IP檢查未啟用，但保存用於UI顯示）`);
      }
    }
    
    if (!existingPlayer) {
      // 分配座位（0:東、1:南、2:西、3:北）
      const seat = tables[tableId].players.length;
      const playerData = {
        ...serverPlayer,
        seat,
        isDealer: false,
        score: 0, // 初始分數為 0
        isReady: false,
        isTing: false,
        isTianTing: false,
        isDiTing: false,
        roundScores: [], // 每圈分數變化記錄
        statistics: { // 統計資料
          selfDraws: 0,
          discards: 0,
          claimedDiscards: 0,
          discardedHu: 0
        }
      };
      
      // 如果有GPS位置，添加到玩家資料中
      if (serverPlayer.latitude != null && serverPlayer.longitude != null) {
        playerData.latitude = serverPlayer.latitude;
        playerData.longitude = serverPlayer.longitude;
      }
      
      // 如果有IP地址，添加到玩家資料中
      if (serverPlayer.ipAddress) {
        playerData.ipAddress = serverPlayer.ipAddress;
      }
      
      tables[tableId].players.push(playerData);

      // 初始化玩家狀態
      tables[tableId].hands[playerId] = [];
      tables[tableId].hiddenHands[playerId] = [];
      tables[tableId].melds[playerId] = [];
      tables[tableId].discards[playerId] = [];
      tables[tableId].flowers[playerId] = [];

      console.log('新玩家加入:', tableId, serverPlayer);

      // 更新數據庫中的 currentPlayers
      updateRoomCurrentPlayers(tableId, tables[tableId].players.length).catch(err => {
        console.error(`更新房間 ${tableId} 的 currentPlayers 失敗:`, err);
      });
    } else {
      // 玩家已存在於房間中，但可能是不同的 socket 連接
      console.log('玩家已存在於房間中，更新 socket 映射:', tableId, playerId);
    }

    socket.join(tableId);

    // 建立 socket.id 到 playerId 的映射
    socketToPlayer[socket.id] = {
      tableId: tableId,
      playerId: playerId
    };

    // 發送玩家ID給客戶端，讓客戶端知道實際使用的ID
    socket.emit('playerIdAssigned', {
      playerId: playerId,
      nickname: nickname,
      userId: userId // 添加 userId（6位數字）
    });

    // 四人到齊自動開始（僅非手動開始房間）
    if (
      tables[tableId].players.length === 4 &&
      !tables[tableId].started &&
      !tables[tableId].manualStart
    ) {
      startGameCountdown(tableId);
    }

    // 發送資料前清理，確保可序列化
    const cleanTableData = getCleanTableData(tables[tableId]);
    io.to(tableId).emit('tableUpdate', cleanTableData);
  });

  // 切換玩家準備狀態（用於手動開始房間）
  socket.on('toggleReady', ({ tableId, playerId }) => {
    const table = tables[tableId];
    if (!table) return;
    if (!table.manualStart) return; // 只允許手動開始房間呼叫
    if (table.started) return;

    const player = table.players.find(p => p.id === playerId);
    if (!player) return;

    // 房主（第一個玩家，seat 0）不需要準備
    if (player.seat === 0) {
      console.log(`房主不需要準備`);
      return;
    }

    // 切換準備狀態
    player.isReady = !player.isReady;
    console.log(`玩家 ${playerId} 準備狀態: ${player.isReady}`);

    // 廣播更新
    const cleanTableData = getCleanTableData(table);
    io.to(tableId).emit('tableUpdate', cleanTableData);
  });

  // 手動開始遊戲（房間設定 manual_start = true 時使用）
  socket.on('manualStartGame', ({ tableId }) => {
    const table = tables[tableId];
    if (!table) return;
    if (!table.manualStart) return; // 只允許手動開始房間呼叫
    if (table.started) return;

    if (table.players.length !== 4) {
      socket.emit('gameCountdown', {
        countdown: null,
        message: '玩家人數不足，無法開始'
      });
      return;
    }

    // 檢查所有非房主玩家是否已準備
    const nonHostPlayers = table.players.filter(p => p.seat !== 0);
    const allReady = nonHostPlayers.every(p => p.isReady === true);

    if (!allReady) {
      socket.emit('gameCountdown', {
        countdown: null,
        message: '還有玩家未準備，無法開始'
      });
      return;
    }

    console.log(`手動開始遊戲 - 房間: ${tableId}`);
    startGame(tableId).catch(err => console.error('開始遊戲失敗:', err));
  });

  // 摸牌事件
  socket.on('drawTile', ({ tableId, playerId }) => {
    drawTile(tableId, playerId);
  });

  // 打牌事件
  socket.on('discardTile', ({ tableId, playerId, tile }) => {
    discardTile(tableId, playerId, tile);
  });

  // 吃碰槓請求事件
  socket.on('claimTile', ({ tableId, playerId, claimType, tiles }) => {
    handleClaimRequest(tableId, playerId, claimType, tiles);
  });

  // 執行吃碰槓事件（僅由服務器端調用，客戶端不應直接調用）
  // 客戶端應該使用 claimTile 來記錄決策，等待所有玩家決策完畢後由服務器依權重執行
  socket.on('executeClaim', ({ tableId, playerId, claimType, tiles, targetPlayer }) => {
    // 檢查是否在決策等待狀態中
    const table = tables[tableId];
    if (table && table.claimingState && table.claimingState.playerDecisions) {
      // 如果在決策等待狀態中，將 executeClaim 視為 claimTile（記錄決策）
      console.log(`>>> [警告] 客戶端直接發送 executeClaim，轉換為 claimTile 記錄決策`);
      handleClaimRequest(tableId, playerId, claimType, tiles);
      return;
    }
    // 如果不在決策等待狀態中，直接執行（用於特殊情況，如服務器端調用）
    executeClaim(tableId, playerId, claimType, tiles);
  });

  // 執行自槓事件（新增，包括補槓）
  socket.on('executeSelfKong', ({ tableId, playerId, tile }) => {
    const table = tables[tableId];
    if (!table) return;
    const playerIndex = table.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    const hand = table.hiddenHands[playerId];
    if (!hand) return;

    const melds = table.melds[playerId] || [];
    const pongMelds = melds.filter(meld => meld.type === 'pong');

    // 檢查是否是補槓（有碰牌，且碰牌的第一張牌與目標牌相同）
    const pongMeld = pongMelds.find(meld =>
      meld.tiles && meld.tiles.length > 0 && meld.tiles[0] === tile
    );

    let isAddKong = false;
    if (pongMeld) {
      // 補槓：將碰牌升級為槓牌
      console.log(`玩家${playerIndex + 1}執行補槓: ${tile}`);
      isAddKong = true;

      // 從手牌移除摸到的牌（補槓只需要移除1張，因為另外3張在碰牌中）
      const tileIndex = hand.indexOf(tile);
      if (tileIndex !== -1) {
        hand.splice(tileIndex, 1);
        console.log(`補槓從手牌移除 ${tile} x1`);
      } else {
        console.log(`補槓失敗：玩家${playerIndex + 1}手牌中沒有 ${tile}`);
        return;
      }

      // 將碰牌升級為槓牌（移除碰牌，添加槓牌）
      const pongIndex = melds.indexOf(pongMeld);
      if (pongIndex !== -1) {
        melds.splice(pongIndex, 1);
        console.log(`補槓移除碰牌：${pongMeld.tiles.join(',')}`);
      }

      // 創建槓牌（4張相同的牌）
      const kongMeld = {
        type: 'kong',
        tiles: [tile, tile, tile, tile],
        fromPlayer: playerId
      };
      melds.push(kongMeld);
      console.log(`補槓添加槓牌：${kongMeld.tiles.join(',')}`);
    } else {
      // 自槓：手牌中4張相同
      // 驗證手牌中該牌至少有4張（包含剛摸起的）
      const count = hand.filter(t => t === tile).length;
      if (count < 4) {
        console.log(`自槓失敗：玩家${playerIndex + 1}手牌中 ${tile} 數量不足（${count}/4）`);
        return;
      }

      console.log(`玩家${playerIndex + 1}執行自槓: ${tile}`);

      // 從手牌移除4張
      let removed = 0;
      for (let i = hand.length - 1; i >= 0 && removed < 4; i--) {
        if (hand[i] === tile) {
          hand.splice(i, 1);
          removed++;
        }
      }
      console.log(`自槓從手牌移除 ${tile} x${removed}`);

      // 添加明刻（自槓視為明槓，fromPlayer 自己）
      const meld = {
        type: 'kong',
        tiles: [tile, tile, tile, tile],
        fromPlayer: playerId
      };
      melds.push(meld);
    }

    // 獲取最終的槓牌 meld（補槓或自槓）
    const finalMeld = isAddKong
      ? melds.find(m => m.type === 'kong' && m.tiles && m.tiles[0] === tile)
      : melds[melds.length - 1];

    // 如果玩家曾經開局聽牌，自槓/補槓會改變手牌和明牌，不再是天聽/地聽
    if (table.players[playerIndex].initialTingHand) {
      const player = table.players[playerIndex];
      const tingType = player.isTianTing ? '天聽' : (player.isDiTing ? '地聽' : '聽牌');
      player.initialTingHand = null;
      player.initialTingMelds = null;
      player.isTianTing = false; // 清除天聽標記
      player.isDiTing = false; // 清除地聽標記
      const actionType = isAddKong ? '補槓' : '自槓';
      console.log(`>>> 玩家${playerIndex + 1}${actionType}後，不再符合${tingType}條件`);
    }

    // 記錄第一圈有玩家自槓/補槓（用於地聽判斷）
    if (table.isFirstRound) {
      table.hasFirstRoundClaim = true;
      const actionType = isAddKong ? '補槓' : '自槓';
      console.log(`>>> [第一圈] 玩家${playerIndex + 1}在第一圈進行${actionType}，後續玩家不再算地聽`);
    }

    // 廣播吃碰槓執行（沿用 claimExecuted 結構）
    io.to(tableId).emit('claimExecuted', {
      playerId: playerId,
      playerIndex: playerIndex,
      claimType: 'kong',
      meld: finalMeld,
      targetPlayer: playerIndex,
      targetTile: tile
    });

    // 廣播手牌數量更新
    const handCounts = {};
    table.players.forEach(p => {
      handCounts[p.id] = table.hiddenHands[p.id].length;
    });
    io.to(tableId).emit('handCountsUpdate', { handCounts });

    // 如果是補槓，檢查其他玩家是否可以搶槓胡牌
    if (isAddKong) {
      console.log(`>>> [搶槓檢測] 玩家${playerIndex + 1}補槓 ${tile}，檢查其他玩家是否可以搶槓胡牌`);

      // 檢查其他玩家是否可以胡該張補槓的牌
      const claimOptions = [];

      for (let i = 0; i < table.players.length; i++) {
        if (i === playerIndex) continue; // 跳過補槓的玩家

        const otherPlayer = table.players[i];
        if (!otherPlayer || !otherPlayer.id) continue;

        const otherHand = table.hiddenHands[otherPlayer.id];
        if (!otherHand) continue;

        const otherMelds = table.melds[otherPlayer.id] || [];

        // 檢查是否可以胡該張補槓的牌
        console.log(`>>> [搶槓檢測] 檢查玩家${i + 1}是否可以胡 ${tile}`);
        const canHuResult = canHu(otherHand, tile, otherMelds.length);
        console.log(`>>> [搶槓檢測] 玩家${i + 1}胡牌檢測結果：${canHuResult}`);

        if (canHuResult) {
          console.log(`>>> [搶槓檢測] 玩家${i + 1}可以搶槓胡牌！`);
          claimOptions.push({
            playerId: otherPlayer.id,
            playerIndex: i,
            claimType: ClaimType.HU,
            priority: 1 // 胡牌優先級最高
          });
        }
      }

      // 如果有玩家可以搶槓，進入搶槓決策流程
      if (claimOptions.length > 0) {
        console.log(`>>> [搶槓檢測] 檢測到搶槓機會: ${claimOptions.map(opt => `玩家${opt.playerIndex + 1}`).join(', ')}`);

        // 清除補槓標記（因為有搶槓，不會補摸牌）
        const player = table.players[playerIndex];
        player.lastKongAction = null;

        // 設置搶槓等待狀態
        table.gamePhase = GamePhase.CLAIMING;
        // 初始化玩家決策追蹤：記錄每個有決策權的玩家ID
        const playersWithOptions3 = [...new Set(claimOptions.map(opt => opt.playerId))];
        const playerDecisions3 = {};
        playersWithOptions3.forEach(playerId => {
          playerDecisions3[playerId] = {
            hasDecided: false,
            decision: null
          };
        });
        
        table.claimingState = {
          discardPlayerId: playerId, // 補槓的玩家
          discardedTile: tile, // 補槓的牌
          options: claimOptions,
          timer: 30,
          isQiangGang: true, // 標記為搶槓
          playerDecisions: playerDecisions3
        };

        // 廣播搶槓胡牌等待
        io.to(tableId).emit('claimRequest', {
          discardPlayerId: playerId,
          discardedTile: tile,
          options: claimOptions,
          isQiangGang: true // 標記為搶槓
        });

        // 開始倒計時
        startClaimTimer(tableId);

        // 搶槓時不補摸牌，等待搶槓決策
        return;
      } else {
        console.log(`>>> [搶槓檢測] 沒有玩家可以搶槓，繼續補槓流程`);
      }
    }

    // 標記玩家最近進行了補槓或自槓（用於槓上開花判斷）
    const player = table.players[playerIndex];
    player.lastKongAction = isAddKong ? 'addKong' : 'selfKong'; // 標記為補槓或自槓

    // 自槓後需補摸一張（補槓且沒有搶槓時也會補摸）
    setTimeout(() => {
      drawTile(tableId, playerId);
    }, 800);
  });

  // 吃碰槓超時事件（新增）
  socket.on('claimTimeout', ({ tableId, playerId }) => {
    passClaim(tableId, playerId);
  });

  // 放棄吃碰槓事件
  socket.on('passClaim', ({ tableId, playerId }) => {
    passClaim(tableId, playerId);
  });

  // 檢測聽牌事件
  socket.on('checkTing', ({ tableId, playerId }) => {
    const table = tables[tableId];
    if (!table) return;

    const playerIndex = table.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    // 如果玩家已經聽牌，不再檢測聽牌
    if (table.players[playerIndex].isTing) {
      console.log(`玩家${playerIndex + 1}已經聽牌，不再檢測聽牌`);
      socket.emit('tingCheckResult', {
        canTing: false
      });
      return;
    }

    const hand = table.hiddenHands[playerId];
    const melds = table.melds[playerId] || [];

    // 檢測是否聽牌
    const isTing = canTing(hand, melds.length);

    console.log(`檢測玩家${playerIndex + 1}聽牌：${isTing}`);

    // 回傳聽牌檢測結果
    socket.emit('tingCheckResult', {
      canTing: isTing
    });
  });

  // 宣告聽牌事件
  socket.on('declareTing', ({ tableId, playerId }) => {
    const table = tables[tableId];
    if (!table || !table.tingState) return;

    const playerIndex = table.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    // 驗證是否是正確的玩家
    if (table.tingState.playerId !== playerId) {
      console.log(`玩家${playerIndex + 1}宣告聽牌失敗：不是聽牌決策的玩家`);
      return;
    }

    const hand = table.hiddenHands[playerId];
    const melds = table.melds[playerId] || [];

    // 再次驗證是否聽牌
    const isTing = canTing(hand, melds.length);

    if (!isTing) {
      console.log(`玩家${playerIndex + 1}宣告聽牌失敗：不符合聽牌條件`);
      return;
    }

    console.log(`玩家${playerIndex + 1}宣告聽牌！`);

    // 保存 tingState 信息（在清除前）
    const tingState = table.tingState;
    const tingPlayerIndex = tingState.playerIndex;

    // 清除聽牌計時器
    if (table.tingTimer) {
      clearInterval(table.tingTimer);
      table.tingTimer = null;
    }

    // 設置聽牌狀態
    table.players[playerIndex].isTing = true;

    // 如果是莊家第一次打牌後的天聽候選，標記為天聽
    if (tingState.isTianTingCandidate) {
      const hand = table.hiddenHands[playerId];
      const melds = table.melds[playerId] || [];
      table.players[playerIndex].isTianTing = true; // 標記為天聽
      table.players[playerIndex].initialTingHand = [...hand]; // 保存天聽時的手牌
      table.players[playerIndex].initialTingMelds = melds.length; // 保存天聽時的明牌數量
      console.log(`>>> [天聽宣告] 玩家${playerIndex + 1}天聽！記錄初始手牌：${hand.join(',')}`);
      console.log(`>>> [天聽宣告] 玩家${playerIndex + 1}天聽！記錄初始明牌數量：${melds.length}`);
    }

    // 如果是地聽候選，標記為地聽
    if (tingState.isDiTingCandidate) {
      const hand = table.hiddenHands[playerId];
      const melds = table.melds[playerId] || [];
      table.players[playerIndex].isDiTing = true; // 標記為地聽
      table.players[playerIndex].initialTingHand = [...hand]; // 保存地聽時的手牌
      table.players[playerIndex].initialTingMelds = melds.length; // 保存地聽時的明牌數量
      console.log(`>>> [地聽宣告] 玩家${playerIndex + 1}地聽！記錄初始手牌：${hand.join(',')}`);
      console.log(`>>> [地聽宣告] 玩家${playerIndex + 1}地聽！記錄初始明牌數量：${melds.length}`);
    }

    // 清除聽牌等待狀態
    table.tingState = null;

    // 廣播聽牌宣告
    // 廣播聽牌宣告給所有玩家（確保所有玩家都能聽到音效）
    console.log(`>>> [音效廣播] 廣播聽牌宣告事件給房間 ${tableId} 的所有玩家`);
    io.to(tableId).emit('tingDeclared', {
      playerId: playerId,
      playerIndex: playerIndex,
      isTianTing: tingState.isTianTingCandidate || false,
      isDiTing: tingState.isDiTingCandidate || false
    });

    // 正常遊戲中的聽牌
    table.gamePhase = GamePhase.PLAYING;

    // 繼續遊戲：如果是吃碰後聽牌，需要打牌；如果是打牌後聽牌，檢查其他玩家的吃碰槓機會
    // 判斷方式：使用 tingState.isAfterDiscard 標記來區分
    if (tingState.isAfterDiscard) {
      // 打牌後的聽牌，檢查其他玩家是否可以吃碰槓胡
      // 使用最後打出的牌來檢查
      if (table.lastDiscard && table.lastDiscard.playerId) {
        const discardedTile = table.lastDiscard.tile;
        const discardPlayerId = table.lastDiscard.playerId;
        const hasClaims = checkClaims(tableId, discardPlayerId, discardedTile);
        if (!hasClaims) {
          // 沒有吃碰槓機會，輪到下一家
          nextTurn(tableId);
        }
        // 如果有吃碰槓機會，checkClaims 會設置 claimingState 並開始倒計時
      } else {
        // 如果沒有最後打出的牌信息，直接輪到下一家
        nextTurn(tableId);
      }
    } else {
      // 吃碰後的聽牌，需要打牌
      startTurnTimer(tableId, playerId);
    }
  });

  // 放棄聽牌事件
  socket.on('passTing', ({ tableId, playerId }) => {
    passTing(tableId, playerId);
  });

  // 宣告胡牌事件
  socket.on('declareHu', ({ tableId, playerId, huType, targetTile, targetPlayer }) => {
    const table = tables[tableId];
    if (!table) return;

    // 優先使用 claimingState 中的 claimType，確保自摸/放槍判斷正確
    // 只有在 claimingState 不存在時才使用前端傳來的 huType
    let finalHuType = huType;
    if (table.claimingState && table.claimingState.claimType === 'selfDrawnHu') {
      finalHuType = 'selfDrawnHu';
      console.log(`>>> [胡牌宣告] 使用服務器端的 selfDrawnHu 類型（忽略前端傳來的 ${huType}）`);
    } else if (table.claimingState && table.claimingState.claimType) {
      // 如果 claimingState 有設置但不是 selfDrawnHu，使用前端傳來的（可能是放槍）
      finalHuType = huType;
    }

    declareHu(tableId, playerId, finalHuType, targetTile, targetPlayer);
  });

  // 繼續下一圈事件
  socket.on('roundContinue', ({ tableId, playerId }) => {
    const table = tables[tableId];
    if (!table) return;

    // 檢查是否正在等待玩家確認繼續
    if (!table.roundContinueReady) {
      console.log(`>>> [繼續下一圈] 玩家 ${playerId} 發送繼續請求，但不在等待狀態`);
      return;
    }

    // 記錄玩家已確認
    table.roundContinueReady.add(playerId);
    console.log(`>>> [繼續下一圈] 玩家 ${playerId} 已確認繼續，已確認人數: ${table.roundContinueReady.size}/${table.players.length}`);

    // 如果所有玩家都已確認
    if (table.roundContinueReady.size >= table.players.length) {
      // 檢查是否為最後一圈（1圈遊戲或已達到總圈數）
      if (table.isLastRound) {
        console.log(`>>> [繼續下一圈] 所有玩家已確認，這是最後一圈，觸發最終結算`);
        endGame(tableId, 'completed', null).catch(err => console.error('結束遊戲失敗:', err));
      } else {
        console.log(`>>> [繼續下一圈] 所有玩家已確認，開始第 ${table.round} 圈`);
        startNextRound(tableId);
      }
    }
  });

  // 獲取自己的手牌
  socket.on('getMyHand', ({ tableId, playerId }) => {
    const table = tables[tableId];
    if (!table) return;

    const hand = table.hiddenHands[playerId] || [];
    socket.emit('myHand', {
      hand: hand
    });
  });

  // 發送聊天訊息
  socket.on('sendChatMessage', ({ tableId, playerId, message, displayName }) => {
    const table = tables[tableId];
    if (!table) return;

    // 初始化聊天訊息陣列（如果不存在）
    if (!table.chatMessages) {
      table.chatMessages = [];
    }

    // 創建聊天訊息物件
    const chatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId: tableId,
      playerId: playerId,
      displayName: displayName || '玩家',
      message: message,
      createdAt: new Date().toISOString()
    };

    // 添加到聊天訊息陣列
    table.chatMessages.push(chatMessage);

    // 限制聊天訊息數量（保留最近100條）
    if (table.chatMessages.length > 100) {
      table.chatMessages = table.chatMessages.slice(-100);
    }

    // 廣播給房間內所有玩家
    io.to(tableId).emit('chatMessage', chatMessage);
  });

  // 發送快速聊天語音
  socket.on('sendQuickChatAudio', ({ tableId, playerId, audioIndex }) => {
    const table = tables[tableId];
    if (!table) return;

    // 獲取玩家資訊
    const player = table.players.find(p => p.id === playerId);
    if (!player) return;

    // 廣播給房間內所有玩家（除了發送者）
    io.to(tableId).emit('quickChatAudio', {
      from: playerId,
      audioIndex: audioIndex,
      displayName: player.name || '玩家'
    });
  });

  // 發送語音訊息
  socket.on('voiceMessage', ({ tableId, playerId, displayName, voiceUrl, timestamp }) => {
    const table = tables[tableId];
    if (!table) return;

    // 創建語音訊息物件
    const voiceMessage = {
      id: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId: tableId,
      playerId: playerId,
      displayName: displayName || '玩家',
      voiceUrl: voiceUrl,
      type: 'voice',
      createdAt: timestamp || new Date().toISOString()
    };

    // 添加到聊天訊息陣列
    if (!table.chatMessages) {
      table.chatMessages = [];
    }
    table.chatMessages.push(voiceMessage);

    // 限制訊息數量
    if (table.chatMessages.length > 100) {
      table.chatMessages = table.chatMessages.slice(-100);
    }

    // 廣播給房間內所有玩家
    io.to(tableId).emit('voiceMessage', voiceMessage);
  });

  socket.on('leaveTable', ({ tableId, playerId }) => {
    // 清除映射
    if (socketToPlayer[socket.id]) {
      delete socketToPlayer[socket.id];
    }

    // 使用統一的處理函數
    handlePlayerDisconnect(tableId, playerId, socket.id);

    socket.leave(tableId);
  });

  socket.on('disconnect', () => {
    console.log('玩家離線', socket.id);

    // 從映射表中獲取玩家資訊
    const playerInfo = socketToPlayer[socket.id];

    if (playerInfo) {
      const { tableId, playerId } = playerInfo;

      // 處理玩家離開
      handlePlayerDisconnect(tableId, playerId, socket.id);

      // 清除映射
      delete socketToPlayer[socket.id];
    } else {
      console.log(`警告：找不到 socket ${socket.id} 對應的玩家資訊`);
    }
  });
});

// ===== 路由掛載（使用獨立路由文件）=====
app.locals.prisma = prisma;

// 前端 API 路由
const playersRoutes = require('./routes/client/players');
app.use('/api/client/players', playersRoutes);
console.log('[Server] Client players routes mounted at /api/client/players');

const clubsRoutes = require('./routes/client/clubs');
app.use('/api/client/clubs', clubsRoutes);
console.log('[Server] Client clubs routes mounted at /api/client/clubs');

const roomsRoutes = require('./routes/client/rooms');
app.use('/api/client/rooms', roomsRoutes);
console.log('[Server] Client rooms routes mounted at /api/client/rooms');

const announcementsRoutes = require('./routes/client/announcements');
app.use('/api/client/announcements', announcementsRoutes);
console.log('[Server] Client announcements routes mounted at /api/client/announcements');

const paymentsRoutes = require('./routes/client/payments');
app.use('/api/client/payments', paymentsRoutes);
console.log('[Server] Client payments routes mounted at /api/client/payments');

// 後台 API 路由
const adminRoomCardOrdersRoutes = require('./routes/admin/roomCardOrders');
app.use('/api/admin', adminRoomCardOrdersRoutes);
console.log('[Server] Admin room card orders routes mounted at /api/admin');

// ===== 向後兼容：舊的 API 路徑重定向到新路徑 =====
// 為了保持向後兼容，將舊的 API 路徑重定向到新的路由結構
app.use('/api/players', playersRoutes);
app.use('/api/clubs', clubsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/rooms', roomsRoutes);

// 語音上傳API
app.post('/api/upload-voice', upload.single('voice'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '沒有上傳文件' });
    }

    // 構建文件URL
    const fileUrl = `/uploads/voices/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get('host')}${fileUrl}`;

    res.json({
      success: true,
      url: fullUrl,
      filename: req.file.filename,
      size: req.file.size
    });
  } catch (error) {
    console.error('語音上傳錯誤:', error);
    res.status(500).json({ error: '上傳失敗' });
  }
});

// 特殊路由：/api/players/:playerId/clubs
// 這個路由在 clubs.js 中定義為 /players/:playerId/clubs
// 需要單獨掛載到 /api/players 路徑下以匹配前端調用
app.get('/api/players/:playerId/clubs', (req, res, next) => {
  // 保存原始 URL
  const originalUrl = req.url;
  const playerId = req.params.playerId;
  
  // 修改 URL 以匹配 clubs.js 中的路由定義
  req.url = `/players/${playerId}/clubs`;
  
  // 轉發到 clubsRoutes
  clubsRoutes(req, res, (err) => {
    // 恢復原始 URL
    req.url = originalUrl;
    if (err) {
      next(err);
    }
  });
});

// 綠界支付 API 向後兼容
// 前端調用的是 /api/ecpay/create-payment，但路由定義是 /ecpay/create
// 需要添加額外的路由映射
app.post('/api/ecpay/create-payment', (req, res, next) => {
  // 將請求轉發到正確的路由
  req.url = '/ecpay/create';
  paymentsRoutes(req, res, next);
});
app.post('/api/ecpay/payment-info', (req, res, next) => {
  req.url = '/ecpay/payment-info';
  paymentsRoutes(req, res, next);
});
app.post('/api/ecpay/notify', (req, res, next) => {
  req.url = '/ecpay/notify';
  paymentsRoutes(req, res, next);
});

console.log('[Server] 向後兼容路由已掛載（/api/players, /api/clubs, /api/announcements, /api/ecpay/*）');

// ===== 遊戲邏輯和 Socket.IO 處理 =====
// 以下保留遊戲相關的邏輯（尚未拆分）
// 注意：所有 API 路由已移至 routes/client/* 和 routes/admin/*
// 遊戲邏輯相關的函數和 Socket.IO 處理器保留在此文件中

// ===== Socket.IO 連接處理 =====
// 注意：Socket.IO 處理器已在第 3931 行定義，此處不再重複定義
// 所有舊的 API 路由已移至 routes/client/* 和 routes/admin/*

// ===== 根路由 =====
app.get('/', (req, res) => {
  res.send('Mahjong server running!');
});

// 房卡產品路由（公開）
const roomCardsRoutes = require('./routes/roomCards');
app.use('/api/room-cards', roomCardsRoutes);
console.log('[Server] Room cards routes mounted at /api/room-cards');

// 代理管理路由
const agentsRoutes = require('./routes/agents');
app.use('/api/agents', agentsRoutes);
console.log('[Server] Agents routes mounted at /api/agents');

// 代理房卡路由（代理專用房卡操作）
const agentRoomCardsRoutes = require('./routes/agentRoomCards');
app.use('/api/agents/room-cards', agentRoomCardsRoutes);
console.log('[Server] Agent room cards routes mounted at /api/agents/room-cards');

// IAP 內購路由
const iapRoutes = require('./routes/iap');
app.use('/api/iap', iapRoutes);
console.log('[Server] IAP routes mounted at /api/iap');

// 後台金流管理路由（整合 IAP + 綠界）
const adminPaymentsRoutes = require('./routes/adminPayments');
app.use('/api/admin', adminPaymentsRoutes);
console.log('[Server] Admin payments routes mounted at /api/admin');

// 健康檢查端點（Render 需要）
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 處理器（必須在錯誤處理中間件之前）
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'API 端點不存在',
    path: req.path,
    method: req.method,
  });
});

// 掛載錯誤處理中間件（必須在所有路由之後）
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`伺服器啟動於 http://0.0.0.0:${PORT}`);
});

// 導出函數供其他模組使用
module.exports = {
  passClaim,
  passTing,
  autoDiscardTile,
  startTurnTimer,
  startClaimTimer,
  startTingTimer
};
