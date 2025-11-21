const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/agents/room-cards/products',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

console.log('Testing:', `http://${options.hostname}:${options.port}${options.path}`);

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response:', data);
        try {
            const json = JSON.parse(data);
            console.log('Parsed:', JSON.stringify(json, null, 2));
            if (json.data && json.data.products) {
                console.log(`Products count: ${json.data.products.length}`);
            }
        } catch (e) {
            console.log('Parse error:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
