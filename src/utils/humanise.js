/**
 * Human-like randomness utilities
 * All timing uses log-normal distributions — short actions are common, long ones are rare.
 */

// Gaussian random using Box-Muller transform
function gaussianRandom(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

// Log-normal random — always positive, skewed toward lower values
function logNormalRandom(median, sigma = 0.5) {
  const mu = Math.log(median);
  return Math.exp(gaussianRandom(mu, sigma));
}

// Random integer between min and max (inclusive)
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Sleep with optional jitter
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Human-like delay — log-normal centered on median ms
async function humanDelay(medianMs, sigma = 0.4) {
  const delay = Math.max(500, Math.min(logNormalRandom(medianMs, sigma), medianMs * 4));
  await sleep(delay);
  return delay;
}

// Scroll distance — log-normal, short scrolls more common
function scrollDistance(isMobile) {
  const median = isMobile ? 400 : 350;
  return Math.max(100, Math.min(Math.round(logNormalRandom(median, 0.5)), 1200));
}

// Generate a curved mouse path between two points (desktop only)
function curvedMousePath(startX, startY, endX, endY, steps = 8) {
  const points = [];
  const cpX = (startX + endX) / 2 + randomBetween(-100, 100);
  const cpY = (startY + endY) / 2 + randomBetween(-50, 50);
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round((1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cpX + t * t * endX);
    const y = Math.round((1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cpY + t * t * endY);
    points.push({ x, y });
  }
  return points;
}

module.exports = {
  gaussianRandom,
  logNormalRandom,
  randomBetween,
  sleep,
  humanDelay,
  scrollDistance,
  curvedMousePath,
};
