const https = require('https');

const options = {
    hostname: 'mojan-server-0kuv.onrender.com',
    port: 443,
    path: '/api/room-cards/products',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

console.log('Testing API: GET https://mojan-server-0kuv.onrender.com/api/room-cards/products');
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
        } catch (e) {
            console.log('Raw response:', responseData);
            console.error('Error parsing JSON:', e.message);
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error.message);
});

req.end();
