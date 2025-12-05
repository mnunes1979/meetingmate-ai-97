/**
 * Retry utility with exponential backoff and timeout support
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class PaymentRequiredError extends Error {
  constructor(message: string = 'Payment required') {
    super(message);
    this.name = 'PaymentRequiredError';
  }
}

/**
 * Executes an async function with retry logic and exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    timeoutMs = 90000, // 90 seconds
    onRetry,
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const result = await fn(abortController.signal);
      clearTimeout(timeoutId);
      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Check if operation was aborted (timeout)
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        lastError = new TimeoutError(`Operation timed out after ${timeoutMs}ms`);
      } else {
        lastError = error;
      }

      // Don't retry on certain errors
      if (
        error instanceof PaymentRequiredError ||
        error instanceof RateLimitError ||
        error.message?.includes('Payment required') ||
        error.message?.includes('Rate limit')
      ) {
        throw lastError;
      }

      // If this was the last attempt, throw
      if (attempt === maxAttempts) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      
      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Parse error response from edge function
 */
export function parseEdgeFunctionError(error: any): {
  status: number;
  message: string;
  isRetryable: boolean;
} {
  // Default values
  let status = 500;
  let message = 'Erro desconhecido';
  let isRetryable = true;

  if (error?.message) {
    message = error.message;

    // Check for specific error patterns
    if (message.includes('429') || message.includes('Rate limit')) {
      status = 429;
      message = 'Limite de pedidos excedido. Por favor, aguarde e tente novamente.';
      isRetryable = false;
    } else if (message.includes('402') || message.includes('Payment required')) {
      status = 402;
      message = 'Créditos esgotados. Por favor, adicione créditos à sua conta.';
      isRetryable = false;
    } else if (message.includes('timeout') || message.includes('timed out')) {
      status = 408;
      message = 'Operação demorou muito tempo. Por favor, tente novamente.';
      isRetryable = true;
    } else if (message.includes('401') || message.includes('Unauthorized')) {
      status = 401;
      message = 'Não autenticado. Por favor, faça login novamente.';
      isRetryable = false;
    }
  }

  return { status, message, isRetryable };
}
