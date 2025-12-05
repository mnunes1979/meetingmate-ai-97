/**
 * Production-safe logger that only logs in development mode
 * Prevents sensitive data from being logged in production
 */

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  
  warn: (...args: unknown[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  
  error: (...args: unknown[]) => {
    // Errors are logged in all environments but sanitized in production
    if (isDev) {
      console.error(...args);
    } else {
      // In production, only log error messages, not full stack traces or sensitive data
      const sanitizedArgs = args.map(arg => {
        if (arg instanceof Error) {
          return { message: arg.message, name: arg.name };
        }
        if (typeof arg === 'object' && arg !== null) {
          // Don't log objects that might contain sensitive data in production
          return '[Object]';
        }
        return arg;
      });
      console.error(...sanitizedArgs);
    }
  },
  
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.debug(...args);
    }
  },
  
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
};

export default logger;
