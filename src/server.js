const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const dither = require('floyd-steinberg');
const { PNG } = require('pngjs');
const ThermalPrinter = require('node-thermal-printer').printer;
const printerConfig = require('./printer-config');

const logsDir = path.join(__dirname, '..', 'logs');
const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const IMAGES_DIR = path.join(logsDir, sessionTimestamp, 'images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });
const LOG_FILE = path.join(logsDir, sessionTimestamp, 'events.log');

function log(level, msg) {
  console.log(`[${new Date().toISOString()}] ${level.padEnd(5)} ${msg}`);
}

function logEvent(type, detail) {
  const line = `[${new Date().toISOString()}] ${type}: ${detail}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

const app = express();
const PORT = 3000;
const PRINTER_WIDTH_PX = 384;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

// --- Admin state ---

let receiptAcceptanceEnabled = true;

// --- Print queue ---

const printQueue = [];
let isPrinting = false;

async function processQueue() {
  if (isPrinting || printQueue.length === 0) return;
  isPrinting = true;

  const job = printQueue.shift();
  log('QUEUE', `Processing job (${printQueue.length} remaining)`);

  try {
    await job();
  } catch (err) {
    log('ERROR', `Queue job error: ${err.message}`);
  }

  isPrinting = false;
  processQueue();
}

function enqueue(job) {
  printQueue.push(job);
  processQueue();
}

function getQueueStatus() {
  return { length: printQueue.length, printing: isPrinting };
}

// --- Printer helpers ---

function addHeader(printer, title) {
  printer.alignCenter();
  printer.drawLine();
  printer.setTypeFontB();
  printer.bold(true);
  printer.println(title);
  printer.bold(false);
  printer.setTypeFontA();
  printer.drawLine();
  printer.newLine();
}

function addFooter(printer, domain) {
  printer.drawLine();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US');
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  printer.println(`Date: ${dateStr} ${timeStr}`);
  if (domain) printer.println(`From: ${domain}`);
  printer.drawLine();
  printer.cut();
}

// --- Image processing ---

async function processImageForPrinter(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .resize(PRINTER_WIDTH_PX, null, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .grayscale()
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const png = new PNG({ width: info.width, height: info.height });

  for (let i = 0; i < data.length; i++) {
    const idx = i * 4;
    png.data[idx] = data[i];       // R
    png.data[idx + 1] = data[i];   // G
    png.data[idx + 2] = data[i];   // B
    png.data[idx + 3] = 255;       // A
  }

  dither(png);

  return PNG.sync.write(png);
}

// --- Print jobs ---

async function printTextReceipt(text, domain) {
  const printer = new ThermalPrinter(printerConfig);
  addHeader(printer, 'RECEIPT');
  printer.alignLeft();
  printer.println(text);
  printer.newLine();
  addFooter(printer, domain);
  await printer.execute();
  log('PRINT', 'Text receipt printed');
}

async function printImageReceipt(processedImage, domain) {
  const printer = new ThermalPrinter(printerConfig);
  addHeader(printer, 'IMAGE PRINT');
  await printer.printImageBuffer(processedImage);
  printer.newLine();
  addFooter(printer, domain);
  await printer.execute();
  log('PRINT', 'Image receipt printed');
}

// --- Middleware ---

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

function requireAcceptance(req, res, next) {
  if (!receiptAcceptanceEnabled) {
    return res.status(403).json({
      success: false,
      message: 'Receipt printing is currently disabled',
    });
  }
  next();
}

// --- Routes ---

app.get('/', (req, res) => {
  const host = req.get('host') || '';
  const page = host.includes('mystraightfriends.com') ? 'comedy.html' : 'index.html';
  res.sendFile(path.join(__dirname, 'public', page));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Print text
app.post('/print', requireAcceptance, (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      message: 'Missing "text" field in request body',
    });
  }

  const domain = req.get('host') || '';
  log('RECV', `Text from ${domain} (queue: ${printQueue.length})`);

  logEvent('TEXT', text);
  enqueue(() => printTextReceipt(text, domain));
  res.json({ success: true, message: 'Receipt added to print queue' });
});

// Print image
app.post('/print-image', requireAcceptance, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
      });
    }

    const domain = req.get('host') || '';
    log('RECV', `Image "${req.file.originalname}" (${req.file.size} bytes) from ${domain}`);

    const ext = path.extname(req.file.originalname) || '.jpg';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const savedFilename = `${timestamp}${ext}`;
    fs.writeFileSync(path.join(IMAGES_DIR, savedFilename), req.file.buffer);
    logEvent('IMAGE', savedFilename);

    const processedImage = await processImageForPrinter(req.file.buffer);

    enqueue(() => printImageReceipt(processedImage, domain));
    res.json({ success: true, message: 'Image added to print queue' });
  } catch (error) {
    log('ERROR', `Image print failed: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to queue image',
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'receipt-printer',
    printer: 'Epson M244A',
    port: PORT,
    queue: getQueueStatus(),
  });
});

// Admin status
app.get('/admin/status', (req, res) => {
  res.json({
    enabled: receiptAcceptanceEnabled,
    queue: getQueueStatus(),
  });
});

// Admin toggle
app.post('/admin/toggle', (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'enabled field must be a boolean',
    });
  }

  receiptAcceptanceEnabled = enabled;
  log('ADMIN', `Receipt acceptance ${enabled ? 'ENABLED' : 'DISABLED'}`);

  res.json({ success: true, enabled: receiptAcceptanceEnabled });
});

// --- Start server ---

app.listen(PORT, () => {
  log('START', `Receipt printer service on http://localhost:${PORT}`);
  log('START', `Printer: Epson M244A (${printerConfig.interface})`);
  log('START', `Session log: logs/${sessionTimestamp}/`);
});
