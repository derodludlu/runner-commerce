import { Throttle } from '@nestjs/throttler';

/**
 * Rate limiting for authentication endpoints
 */
export const AuthRateLimit = () =>
  Throttle({
    short: {
      ttl: 10000, // 10 seconds
      limit: 3, // 3 attempts
    },
  });

/**
 * Rate limiting for general API endpoints
 */
export const ApiRateLimit = () =>
  Throttle({
    default: {
      ttl: 60000, // 1 minute
      limit: 30, // 30 requests
    },
  });

/**
 * Rate limiting for sensitive operations
 */
export const StrictRateLimit = () =>
  Throttle({
    default: {
      ttl: 60000, // 1 minute
      limit: 5, // 5 requests
    },
  });
