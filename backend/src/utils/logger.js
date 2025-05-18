/**
 * Basic logger utility.
 * Can be expanded with different log levels, transports (e.g., to Cloud Logging).
 */

const info = (message, ...args) => {
  console.log(`[INFO] ${message}`, ...args);
};

const error = (message, ...args) => {
  console.error(`[ERROR] ${message}`, ...args);
};

const warn = (message, ...args) => {
  console.warn(`[WARN] ${message}`, ...args);
};

const debug = (message, ...args) => {
  // For development, you might want to enable debug logs
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[DEBUG] ${message}`, ...args);
  }
};

module.exports = {
  info,
  error,
  warn,
  debug,
}; 