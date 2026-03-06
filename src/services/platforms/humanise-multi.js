/**
 * Human Behavior Simulator
 * Multi-platform human-like interaction patterns.
 * Extends GhostPost's existing humanise.js for Instagram/LinkedIn.
 * 
 * Key principle: Gaussian distributions, not uniform random.
 * Platforms detect uniform delays as bot signatures.
 */

/**
 * Gaussian random with Box-Muller transform
 */
function gaussian(mean, stdDev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(mean + z * stdDev));
}

/**
 * Human-like typing with variable speed, typos, and corrections
 */
async function humanType(page, selector, text, options = {}) {
    const {
        baseDelay = 100,       // ms between keystrokes
        delayVariance = 30,    // stddev of delay
        typoRate = 0.05,       // 5% chance of typo per char
        thinkPause = 0.08,     // 8% chance of thinking pause
        wordBoundaryPause = 80 // extra ms at word boundaries
    } = options;

    // Click the input field first
    if (selector) {
        await page.click(selector);
        await delay(gaussian(200, 50));
    }

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        // Word boundary — extra pause
        if (char === ' ') {
            await delay(gaussian(baseDelay + wordBoundaryPause, 30));
            await page.keyboard.type(' ', { delay: 0 });
            continue;
        }

        // Thinking pause (longer hesitation)
        if (Math.random() < thinkPause) {
            await delay(gaussian(800, 300));
        }

        // Typo simulation
        if (Math.random() < typoRate && i > 0) {
            const adjacentKeys = getAdjacentKey(char);
            if (adjacentKeys) {
                // Type wrong key
                await page.keyboard.type(adjacentKeys, { delay: 0 });
                await delay(gaussian(150, 50));
                // Pause (notice mistake)
                await delay(gaussian(300, 100));
                // Backspace
                await page.keyboard.press('Backspace');
                await delay(gaussian(100, 30));
            }
        }

        // Type the actual character
        await page.keyboard.type(char, { delay: 0 });
        await delay(gaussian(baseDelay, delayVariance));
    }
}

/**
 * Get adjacent key for typo simulation (QWERTY layout)
 */
function getAdjacentKey(char) {
    const adjacency = {
        'a': 'sq', 'b': 'vn', 'c': 'xv', 'd': 'sf', 'e': 'wr',
        'f': 'dg', 'g': 'fh', 'h': 'gj', 'i': 'uo', 'j': 'hk',
        'k': 'jl', 'l': 'k;', 'm': 'n,', 'n': 'bm', 'o': 'ip',
        'p': 'o[', 'q': 'w', 'r': 'et', 's': 'ad', 't': 'ry',
        'u': 'yi', 'v': 'cb', 'w': 'qe', 'x': 'zc', 'y': 'tu',
        'z': 'x'
    };
    const adj = adjacency[char.toLowerCase()];
    if (!adj) return null;
    return adj[Math.floor(Math.random() * adj.length)];
}

/**
 * Human-like mouse movement using Bezier curves
 */
async function humanMouseMove(page, targetX, targetY, options = {}) {
    const { steps = null } = options;

    // Get current mouse position (approximate from viewport center if unknown)
    const startX = options.startX || 960;
    const startY = options.startY || 540;

    const distance = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);
    const numSteps = steps || Math.max(10, Math.floor(distance / 15));

    // Generate Bezier control points with overshoot
    const cp1x = startX + (targetX - startX) * 0.3 + gaussian(0, 30);
    const cp1y = startY + (targetY - startY) * 0.1 + gaussian(0, 30);
    const cp2x = startX + (targetX - startX) * 0.7 + gaussian(0, 20);
    const cp2y = startY + (targetY - startY) * 0.9 + gaussian(0, 20);

    // Slight overshoot on distant targets
    const overshootX = distance > 200 ? gaussian(0, 5) : 0;
    const overshootY = distance > 200 ? gaussian(0, 5) : 0;

    for (let i = 0; i <= numSteps; i++) {
        const t = i / numSteps;
        const u = 1 - t;

        // Cubic Bezier
        const x = u*u*u * startX + 3*u*u*t * cp1x + 3*u*t*t * cp2x + t*t*t * (targetX + overshootX);
        const y = u*u*u * startY + 3*u*u*t * cp1y + 3*u*t*t * cp2y + t*t*t * (targetY + overshootY);

        await page.mouse.move(Math.round(x), Math.round(y));
        
        // Variable speed — slower at start and end (ease in/out)
        const speedMultiplier = 4 * t * (1 - t); // Parabola, max at t=0.5
        await delay(Math.max(2, gaussian(8, 3) / Math.max(0.3, speedMultiplier)));
    }

    // Correct overshoot if applied
    if (overshootX || overshootY) {
        await delay(gaussian(50, 20));
        await page.mouse.move(targetX, targetY, { steps: 3 });
    }
}

/**
 * Human-like click with hover pause and variable hold duration
 */
async function humanClick(page, selector, options = {}) {
    try {
        const element = await page.waitForSelector(selector, { timeout: 10000 });
        const box = await element.boundingBox();
        if (!box) return false;

        // Click at random position within element bounds (not dead center)
        const clickX = box.x + box.width * (0.3 + Math.random() * 0.4);
        const clickY = box.y + box.height * (0.3 + Math.random() * 0.4);

        // Move mouse to element
        await humanMouseMove(page, clickX, clickY);

        // Hesitate before clicking (visual processing time)
        await delay(gaussian(150, 50));

        // Click with realistic mousedown-mouseup gap
        await page.mouse.down();
        await delay(gaussian(90, 20)); // Human average ~80-120ms
        await page.mouse.up();

        return true;
    } catch (err) {
        console.warn(`[Humanise] Click failed on ${selector}:`, err.message);
        return false;
    }
}

/**
 * Human-like scrolling
 */
async function humanScroll(page, options = {}) {
    const {
        direction = 'down',
        distance = null,
        duration = null
    } = options;

    const scrollDistance = distance || gaussian(400, 150);
    const scrollSteps = Math.max(3, Math.floor(scrollDistance / 50));
    const stepDelay = (duration || gaussian(800, 200)) / scrollSteps;

    for (let i = 0; i < scrollSteps; i++) {
        const stepAmount = (scrollDistance / scrollSteps) * (direction === 'down' ? 1 : -1);
        await page.mouse.wheel(0, stepAmount);
        await delay(Math.max(20, gaussian(stepDelay, stepDelay * 0.3)));
    }

    // Reading pause after scroll
    await delay(gaussian(1500, 500));
}

/**
 * Wait between major actions (DMs, connection requests)
 * Uses Poisson-like distribution for more realistic timing
 */
async function actionDelay(minSeconds = 30, maxSeconds = 120) {
    const mean = (minSeconds + maxSeconds) / 2 * 1000;
    const stdDev = (maxSeconds - minSeconds) / 4 * 1000;
    const ms = gaussian(mean, stdDev);
    const clamped = Math.max(minSeconds * 1000, Math.min(maxSeconds * 1000, ms));
    
    console.log(`[Humanise] Action delay: ${(clamped / 1000).toFixed(1)}s`);
    await delay(clamped);
}

/**
 * Micro-break (between related actions in a sequence)
 */
async function microBreak() {
    await delay(gaussian(2500, 800));
}

/**
 * Macro-break (every N actions, simulate looking away)
 */
async function macroBreak() {
    const breakMs = gaussian(45000, 15000); // ~30-60 seconds
    console.log(`[Humanise] Macro break: ${(breakMs / 1000).toFixed(1)}s`);
    await delay(breakMs);
}

/**
 * Check if current time is within active hours
 */
function isActiveHour(activeHours = { start: 9, end: 18 }) {
    const hour = new Date().getHours();
    return hour >= activeHours.start && hour < activeHours.end;
}

/**
 * Promise-based delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

module.exports = {
    humanType,
    humanClick,
    humanMouseMove,
    humanScroll,
    actionDelay,
    microBreak,
    macroBreak,
    isActiveHour,
    gaussian,
    delay
};
