/**
 * Fingerprint Profile Generator
 * 
 * On customer creation, generates two persistent fingerprint profiles:
 * - Mobile (iPhone Safari / Chrome iOS)
 * - Desktop (Chrome Windows / Mac)
 * 
 * Profiles stay consistent forever for that customer — same device every session.
 */

const { randomBetween } = require('../../utils/humanise');

const MOBILE_CONFIGS = [
  // iPhone 15 Pro Max
  { viewport: { width: 430, height: 932 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', deviceScaleFactor: 3 },
  // iPhone 15
  { viewport: { width: 393, height: 852 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1', deviceScaleFactor: 3 },
  // iPhone 14
  { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', deviceScaleFactor: 3 },
  // iPhone SE 3rd gen
  { viewport: { width: 375, height: 667 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', deviceScaleFactor: 2 },
  // Samsung Galaxy S24
  { viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', deviceScaleFactor: 2.625 },
  // Pixel 8
  { viewport: { width: 412, height: 892 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', deviceScaleFactor: 2.625 },
];

const DESKTOP_CONFIGS = [
  // Mac Chrome 1440x900
  { viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', deviceScaleFactor: 2 },
  // Mac Chrome 1680x1050
  { viewport: { width: 1680, height: 1050 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', deviceScaleFactor: 2 },
  // Windows Chrome 1920x1080
  { viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', deviceScaleFactor: 1 },
  // Windows Chrome 1366x768
  { viewport: { width: 1366, height: 768 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', deviceScaleFactor: 1 },
  // Mac Safari
  { viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', deviceScaleFactor: 2 },
];

// US timezone/locale pairs (proxy geo = US for now)
const US_LOCALES = [
  { timezone: 'America/New_York', locale: 'en-US' },
  { timezone: 'America/Chicago', locale: 'en-US' },
  { timezone: 'America/Denver', locale: 'en-US' },
  { timezone: 'America/Los_Angeles', locale: 'en-US' },
];

/**
 * Generate a pair of fingerprint profiles for a new customer.
 * Returns { mobile: {...}, desktop: {...} }
 */
function generateFingerprints(proxyTimezone = null) {
  const mobileBase = MOBILE_CONFIGS[randomBetween(0, MOBILE_CONFIGS.length - 1)];
  const desktopBase = DESKTOP_CONFIGS[randomBetween(0, DESKTOP_CONFIGS.length - 1)];
  const localeConfig = proxyTimezone
    ? US_LOCALES.find(l => l.timezone === proxyTimezone) || US_LOCALES[randomBetween(0, US_LOCALES.length - 1)]
    : US_LOCALES[randomBetween(0, US_LOCALES.length - 1)];

  const mobile = {
    ...mobileBase,
    locale: localeConfig.locale,
    timezone: localeConfig.timezone,
    colorScheme: 'light',
    hasTouch: true,
    isMobile: true,
  };

  const desktop = {
    ...desktopBase,
    locale: localeConfig.locale,
    timezone: localeConfig.timezone,
    colorScheme: randomBetween(0, 3) === 0 ? 'dark' : 'light',
    hasTouch: false,
    isMobile: false,
  };

  return { mobile, desktop };
}

module.exports = { generateFingerprints, MOBILE_CONFIGS, DESKTOP_CONFIGS };
