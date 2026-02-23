const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');

const PRINTER_URL = 'http://localhost:3000/print';

const connection = new TikTokLiveConnection('eastonco');

async function sendToPrinter(nickname, comment) {
    const text = `${nickname}: ${comment}`;

    try {
        const response = await fetch(PRINTER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✓ Printed:', text);
        } else {
            console.error('✗ Print failed:', result.message);
        }
    } catch (error) {
        console.error('✗ Error sending to printer:', error.message);
    }
}

connection.connect().then(state => {
    console.log(`Connected to room ${state.roomId}`);
}).catch(err => {
    console.error('Failed to connect', err);
});

// Listen for comments
connection.on(WebcastEvent.CHAT, data => {
    console.log(`${data.user.nickname}: ${data.comment}`);

    // Send to thermal printer
    sendToPrinter(data.user.nickname, data.comment);
});

// connection.on(WebcastEvent.LIKE, data => {
//     console.log(`${data.nickname} liked the stream x${data.likeCount}`);

//     sendToPrinter(data.event.nickname, `liked the stream x${data.likeCount}`);
// });