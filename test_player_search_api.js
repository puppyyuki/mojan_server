const https = require('https');

const data = JSON.stringify({
    search: '222'
});

const options = {
    hostname: 'mojan-server-0kuv.onrender.com',
    port: 443,
    path: '/api/agents/players/search',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('Testing API: POST https://mojan-server-0kuv.onrender.com/api/agents/players/search');
console.log('Request body:', data);
console.log('');

const req = https.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log('');

    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(responseData);
            console.log('Response:');
            console.log(JSON.stringify(json, null, 2));

            if (json.success && json.data && json.data.players) {
                console.log('\n===== PLAYER DATA ANALYSIS =====');
                json.data.players.forEach((player, index) => {
                    console.log(`\nPlayer ${index + 1}:`);
                    console.log(`  displayName: ${player.displayName}`);
                    console.log(`  playerId: ${player.playerId}`);
                    console.log(`  userId: ${player.userId}`);
                    console.log(`  userId length: ${player.userId ? player.userId.length : 'N/A'}`);
                    console.log(`  userId is 6 digits: ${/^\d{6}$/.test(player.userId)}`);
                    console.log(`  userId === playerId: ${player.userId === player.playerId}`);
                });
            }
        } catch (e) {
            console.log('Raw response:', responseData);
            console.error('Error parsing JSON:', e.message);
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error.message);
});

req.write(data);
req.end();
