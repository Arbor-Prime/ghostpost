/**
 * Human Typing Simulator
 * 
 * Types text into X's reply box with realistic human timing.
 * 
 * Research backing:
 * - Karat 1999: average typing 33 WPM, corrected 19 WPM
 * - Log-normal inter-key intervals
 * - Occasional pauses at word boundaries
 * - Micro-corrections (type wrong char, backspace, retype) at 3-5% rate
 * - Speed varies by character: space is faster, punctuation slower
 */

const { logNormalRandom, randomBetween, sleep, gaussianRandom } = require('../../utils/humanise');

/**
 * Type text into a Playwright page element with human-like timing.
 * 
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} selector - CSS selector for the input element
 * @param {string} text - Text to type
 * @param {Object} persona - Customer's persona (for typing speed)
 * @returns {Promise<{ totalMs: number, corrections: number }>}
 */
async function humanType(page, selector, text, persona) {
  const baseWpm = persona.base_typing_wpm || 20;
  const typingSigma = persona.typing_sigma || 0.15;

  // WPM: words per minute. Average word = 5 chars. So chars per minute = WPM * 5.
  // Inter-key ms = 60000 / (WPM * 5)
  const baseDelayMs = 60000 / (baseWpm * 5);

  const startTime = Date.now();
  let corrections = 0;

  // Click the input first
  await page.click(selector);
  await sleep(randomBetween(200, 500));

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Calculate delay for this keystroke
    let delay = logNormalRandom(baseDelayMs, typingSigma);

    // Character-specific modifiers
    if (char === ' ') {
      delay *= 0.7; // Spaces are faster (thumb hits spacebar)
    } else if ('.!?,;:'.includes(char)) {
      delay *= 1.5; // Punctuation is slower (shift + key)
    } else if (char === char.toUpperCase() && char !== char.toLowerCase()) {
      delay *= 1.3; // Capital letters (shift held)
    }

    // Word boundary pause (longer pause at start of new word)
    if (i > 0 && text[i - 1] === ' ') {
      delay += randomBetween(50, 200); // Think about next word
    }

    // Occasional longer  thinking pause (2-5% chance)
    if (Math.random() < 0.03) {
      await sleep(randomBetween(500, 2000));
    }

    // Micro-correction simulation (3-5% chance)
    if (Math.random() < 0.04 && char.match(/[a-zA-Z]/)) {
      // Type wrong character
      const offset = randomBetween(-2, 2) || 1;
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + offset);
      await page.keyboard.type(wrongChar, { delay: 0 });
      await sleep(randomBetween(100, 300)); // Realise mistake
      await page.keyboard.press('Backspace');
      await sleep(randomBetween(50, 150)); // Correct
      corrections++;
    }

    // Type the correct character
    await page.keyboard.type(char, { delay: 0 });
    await sleep(Math.max(30, delay));
  }

  const totalMs = Date.now() - startTime;
  return { totalMs, corrections };
}

/**
 * Type text using mobile-style behaviour (slower, more corrections).
 */
async function humanTypeMobile(page, selector, text, persona) {
  const mobilePersona = {
    ...persona,
    base_typing_wpm: Math.round((persona.base_typing_wpm || 20) * 0.7),
    typing_sigma: (persona.typing_sigma || 0.15) * 1.3,
  };
  return humanType(page, selector, text, mobilePersona);
}

module.exports = { humanType, humanTypeMobile };
