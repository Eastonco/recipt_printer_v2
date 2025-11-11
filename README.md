# Receipt Printer Service

A simple HTTP service for printing messages to an Epson thermal printer (M244A/TM-T88V series).

## Prerequisites

- Node.js (v22.20.0 or higher)
- Epson thermal printer connected via USB
- User must be in the `lp` group for printer access

## Setup

1. Install dependencies:
```bash
npm install
```

2. Verify printer connection:
```bash
lsusb | grep -i epson
ls -l /dev/usb/lp0
```

3. Start the service:
```bash
npm start
```

The server will start on `http://localhost:3000` and can be published to a domain of your choice through a Cloudflare tunnel.

## Usage

### Web Interface

Visit `https://localhost:3000` to send a message through the web interface.

### API Endpoint

**Print Message**

```bash
POST https://localhost:3000/print
Content-Type: application/json

{
  "text": "Your text content here"
}
```

**Example with curl:**
```bash
curl -X POST https://localhost:3000/print \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from the printer!"}'
```

**Health Check**
```bash
GET https://localhost:3000/health
```

## Configuration

Printer settings can be modified in `printer-config.js`:
- `type`: Printer type (EPSON)
- `interface`: Device path (`/dev/usb/lp0`)
- `characterSet`: Character encoding
- `timeout`: Connection timeout (5000ms)

## Features

- Simple HTTP API for printing
- Web interface for testing
- Automatic receipt formatting with header/footer
- Date/time stamps on receipts
- Paper cutting support
- Error handling and logging
