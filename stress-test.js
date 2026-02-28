const http = require('http');

const HOST = 'localhost';
const PORT = 3000;
const COUNT = 10;

function sendText(i) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ text: `Stress test payload #${i + 1} - ${new Date().toISOString()}` });
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/print',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`[${i + 1}] ${res.statusCode} ${data.trim()}`);
        resolve();
      });
    });
    req.on('error', (err) => {
      console.error(`[${i + 1}] ERROR: ${err.message}`);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log(`Sending ${COUNT} payloads simultaneously...`);
  const start = Date.now();
  await Promise.all(Array.from({ length: COUNT }, (_, i) => sendText(i)));
  console.log(`Done in ${Date.now() - start}ms`);
}

run();
