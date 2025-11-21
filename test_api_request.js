const http = require('http');

const data = JSON.stringify({
    search: '333'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/agents/players/search',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('Testing request to:', `http://${options.hostname}:${options.port}${options.path}`);
console.log('Request body:', data);

const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log('Headers:', res.headers);

    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        console.log('Response body:', responseData);
        try {
            const parsed = JSON.parse(responseData);
            console.log('Parsed response:', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('Could not parse as JSON');
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
