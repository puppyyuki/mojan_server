const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');

const forbiddenPatterns = [
  "io.to(playerId).emit('selfKongAvailable'",
  'io.to(playerId).emit("selfKongAvailable"'
];

const hits = forbiddenPatterns.filter(p => source.includes(p));

function sliceBetween(markStart, markEnd) {
  const start = source.indexOf(markStart);
  if (start === -1) return null;
  const end = source.indexOf(markEnd, start + markStart.length);
  if (end === -1) return null;
  return source.slice(start, end);
}

const handleClaimRequestBlock = sliceBetween(
  'function handleClaimRequest(',
  'function executeClaim('
);

const checkAllPlayersDecidedBlock = sliceBetween(
  'function checkAllPlayersDecided(',
  'function passTing('
);

const claimFlowFailures = [];

if (!handleClaimRequestBlock) {
  claimFlowFailures.push('Cannot locate handleClaimRequest block');
} else if (handleClaimRequestBlock.includes('declareHu(')) {
  claimFlowFailures.push('handleClaimRequest should not call declareHu directly');
}

if (!checkAllPlayersDecidedBlock) {
  claimFlowFailures.push('Cannot locate checkAllPlayersDecided block');
} else {
  const hasHuResolution =
    checkAllPlayersDecidedBlock.includes('finalDecision.claimType === ClaimType.HU') &&
    checkAllPlayersDecidedBlock.includes('declareHu(');

  if (!hasHuResolution) {
    claimFlowFailures.push('checkAllPlayersDecided should resolve HU via declareHu');
  }
}

if (hits.length > 0) {
  console.error(`[selfkong-regression-check] FAIL: Found forbidden emit patterns:\n- ${hits.join('\n- ')}`);
  process.exit(1);
}

if (claimFlowFailures.length > 0) {
  console.error(`[selfkong-regression-check] FAIL: Claim flow regression detected:\n- ${claimFlowFailures.join('\n- ')}`);
  process.exit(1);
}

console.log('[selfkong-regression-check] OK');
