/**
 * TTL Configuration for Redis Semaphore System
 * All values in seconds unless otherwise noted
 */

export const TTL_CONFIG = {
  // Pre-dial lease (before carrier answers)
  preDialBase: 15,           // Base TTL: 15-20s with jitter
  preDialJitter: 5,          // Add random 0-5s
  preDialMax: 45,            // Max total TTL with renewals

  // Active lease (after carrier answers)
  activeLease: 180,          // Base TTL: 180-240s with jitter
  activeJitter: 60,          // Add random 0-60s

  // Reservation system
  reservationTTL: 70,        // Must be > preDialMax + safety margin
  reservationOrphanAge: 60,  // Age before janitor reaps (seconds)

  // Promotion gate
  gateTTL: 20,               // Must be >= 2× max backoff delay
  gateGracePeriod: 15,       // Max age for stale gate check (seconds)

  // Cold-start
  coldStartBlocking: 90,     // Total blocking period (seconds)
  coldStartGrace: 60,        // Grace before reconciliation (seconds)
  coldStartDone: 86400,      // How long to remember "done" state (24h)

  // Markers and tracking
  markerTTL: 3600,           // Waitlist marker TTL (1h)
  dedupTTL: 86400,           // Contact dedup TTL (24h)

  // Circuit breaker
  circuitBreakerWindow: 60,  // Failure window (seconds)
  circuitBreakerTTL: 60,     // How long circuit stays open (seconds)

  // Services
  fairnessCounterTTL: 300,   // Fairness counter TTL (5min)
  pauseFlagTTL: 300,         // Campaign pause flag TTL (5min)

  // Idempotency
  dialIdempotencyTTL: 300,   // Default 5min, configurable up to 24h

  // Cleanup intervals
  janitorInterval: 30000,         // 30s
  compactorInterval: 120000,      // 2min
  reconcilerInterval: 300000,     // 5min
  reconciliationInterval: 900000, // 15min
  invariantInterval: 30000,       // 30s
  metricsExportInterval: 60000,   // 60s
} as const;

/**
 * Get pre-dial TTL with jitter
 */
export function getPreDialTTL(): number {
  return TTL_CONFIG.preDialBase + Math.floor(Math.random() * TTL_CONFIG.preDialJitter);
}

/**
 * Get active lease TTL with jitter
 */
export function getActiveTTL(): number {
  return TTL_CONFIG.activeLease + Math.floor(Math.random() * TTL_CONFIG.activeJitter);
}

/**
 * Get adaptive backoff delay (AWS-style full jitter)
 */
export function getAdaptiveDelay(attempts: number, baseMs: number = 2000, capMs: number = 30000): number {
  const max = Math.min(capMs, baseMs * Math.pow(2, attempts));
  return Math.floor(Math.random() * max);
}

/**
 * Cap first attempt delay to prevent gate TTL conflicts
 */
export function getFirstAttemptDelay(): number {
  return Math.floor(Math.random() * 2000); // 0-2s
}
