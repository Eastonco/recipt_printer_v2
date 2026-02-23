const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;

// Printer configuration for Epson M244A (TM-T88V series)
const printerConfig = {
  type: PrinterTypes.EPSON,
  interface: '/dev/usb/lp0',
  characterSet: 'SLOVENIA',
  removeSpecialCharacters: false,
  lineCharacter: "=",
  width: 42,
  options: {
    timeout: 5000
  }
};

module.exports = printerConfig;
