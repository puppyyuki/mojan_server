const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/room-cards/products',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

console.log('Testing LOCAL API: GET http://localhost:3000/api/room-cards/products');
console.log('');

const req = http.request(options, (res) => {
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
    console.log('\n⚠️  Make sure the local server is running (npm run dev:all)');
});

req.end();
