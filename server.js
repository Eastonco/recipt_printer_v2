const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const ThermalPrinter = require('node-thermal-printer').printer;
const printerConfig = require('./printer-config');

const app = express();
const PORT = 3000;

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Helper function to format and print receipt
function printReceipt(text) {
  const printer = new ThermalPrinter(printerConfig);

  try {
    // Initialize printer
    printer.alignCenter();

    // Header
    printer.drawLine();
    printer.setTypeFontB();
    printer.bold(true);
    printer.println('RECEIPT');
    printer.bold(false);
    printer.setTypeFontA();
    printer.drawLine();
    printer.newLine();

    // Content - align left for the actual text
    printer.alignLeft();
    printer.println(text);
    printer.newLine();

    // Footer with date/time
    printer.drawLine();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US');
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    printer.println(`Date: ${dateStr} ${timeStr}`);
    printer.drawLine();
    // printer.newLine();

    // Cut paper
    printer.cut();

    // Execute print
    printer.execute((err) => {
      if (err) {
        console.error('Print error:', err);
      }
    });

    return { success: true, message: 'Receipt printed successfully' };
  } catch (error) {
    console.error('Printer error:', error);
    return { success: false, message: error.message };
  }
}

// Routes
// Static files are served from the public directory via express.static middleware

// Print endpoint
app.post('/print', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      message: 'Missing "text" field in request body'
    });
  }

  console.log(`[${new Date().toISOString()}] Print request received`);
  console.log('Text:', text);

  const result = printReceipt(text);
  res.json(result);
});

// Print image endpoint
app.post('/print-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
    }

    console.log(`[${new Date().toISOString()}] Image print request received`);
    console.log('File:', req.file.originalname, 'Size:', req.file.size, 'bytes');

    // Convert and resize image to fit thermal printer width (384 pixels for 48mm width)
    // Using 384 pixels as it's optimal for most 58mm thermal printers
    const processedImage = await sharp(req.file.buffer)
      .resize(384, null, {
        fit: 'inside',
        withoutEnlargement: false
      })
      .grayscale() // Convert to grayscale for better thermal printing
      .png() // Convert to PNG format
      .toBuffer();

    const printer = new ThermalPrinter(printerConfig);

    // Print header
    printer.alignCenter();
    printer.drawLine();
    printer.setTypeFontB();
    printer.bold(true);
    printer.println('IMAGE PRINT');
    printer.bold(false);
    printer.setTypeFontA();
    printer.drawLine();
    printer.newLine();

    // Print the image
    await printer.printImageBuffer(processedImage);
    printer.newLine();

    // Footer with date/time
    printer.drawLine();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US');
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    printer.println(`Date: ${dateStr} ${timeStr}`);
    printer.drawLine();

    // Cut paper
    printer.cut();

    // Execute print
    await new Promise((resolve, reject) => {
      printer.execute((err) => {
        if (err) {
          console.error('Print error:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    res.json({ success: true, message: 'Image printed successfully' });
  } catch (error) {
    console.error('Image print error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to print image'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'receipt-printer',
    printer: 'Epson M244A',
    port: PORT
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Receipt Printer Service Started`);
  console.log(`=================================`);
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Printer: Epson M244A (${printerConfig.interface})`);
  console.log(`=================================`);
  console.log(`Ready to print receipts!`);
  console.log(``);
});
