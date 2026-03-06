/**
 * Platform Browser Manager
 * Manages persistent Playwright browser contexts per platform account.
 * Each account gets its own profile directory, fingerprint, and proxy.
 * Runs headed browsers inside Xvfb for visible streaming via noVNC.
 * 
 * Extends GhostPost's existing launcher.js pattern for multi-platform use.
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

chromium.use(StealthPlugin());

const PROFILES_DIR = path.join(__dirname, '../../../data/browser-profiles');
const SCREENSHOTS_DIR = path.join(__dirname, '../../../data/screenshots');

// Ensure dirs exist
[PROFILES_DIR, SCREENSHOTS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

class PlatformBrowserManager extends EventEmitter {
    constructor(io) {
        super();
        this.db = require('../../config/database');
        this.io = io;
        this.activeBrowsers = new Map(); // accountId -> { browser, context, page }
        this.xvfbDisplays = new Map();   // accountId -> display number
        this.nextDisplay = 10;           // Start Xvfb displays at :10
    }

    /**
     * Get or create a profile directory for an account
     */
    getProfileDir(accountId, platform) {
        const dir = path.join(PROFILES_DIR, `${platform}-${accountId}`);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    /**
     * Start Xvfb display for a browser session
     * Returns the display number
     */
    async startXvfbDisplay(accountId) {
        const { execSync } = require('child_process');
        const display = this.nextDisplay++;
        
        try {
            // Kill any existing display on this number
            try { execSync(`kill $(cat /tmp/.X${display}-lock 2>/dev/null) 2>/dev/null`); } catch(e) {}
            
            // Start Xvfb
            execSync(`Xvfb :${display} -screen 0 1920x1080x24 -ac &`, {
                env: { ...process.env },
                stdio: 'ignore'
            });
            
            this.xvfbDisplays.set(accountId, display);
            console.log(`[BrowserManager] Xvfb started on :${display} for account ${accountId}`);
            return display;
        } catch (err) {
            console.error(`[BrowserManager] Failed to start Xvfb:`, err.message);
            throw err;
        }
    }

    /**
     * Launch a persistent browser context for a platform account.
     * This is the core "Manus Computer" equivalent — a real browser
     * with persistent state, running visually.
     */
    async launchBrowser(accountId, options = {}) {
        // Check if already running
        if (this.activeBrowsers.has(accountId)) {
            const existing = this.activeBrowsers.get(accountId);
            if (existing.page && !existing.page.isClosed()) {
                return existing;
            }
            // Clean up stale reference
            await this.closeBrowser(accountId);
        }

        // Get account from DB
        const account = await this.db.query(
            'SELECT * FROM platform_accounts WHERE id = $1',
            [accountId]
        ).then(r => r.rows[0]);

        if (!account) throw new Error(`Account ${accountId} not found`);

        const profileDir = this.getProfileDir(accountId, account.platform);
        const fingerprint = account.fingerprint_profile || {};
        const proxy = account.proxy_config || {};

        // Start Xvfb display for this session
        let display;
        if (!options.headless) {
            display = await this.startXvfbDisplay(accountId);
        }

        // Build launch options
        const launchOptions = {
            headless: options.headless || false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1920,1080',
                `--window-position=0,0`,
            ],
            ignoreDefaultArgs: ['--enable-automation'],
        };

        // Set display for headed mode
        if (display) {
            launchOptions.env = {
                ...process.env,
                DISPLAY: `:${display}`
            };
        }

        // Add proxy if configured
        if (proxy.server) {
            launchOptions.args.push(`--proxy-server=${proxy.server}`);
        }

        // Launch persistent context (keeps cookies, localStorage, etc.)
        const context = await chromium.launchPersistentContext(profileDir, {
            ...launchOptions,
            viewport: this.getViewport(account.platform),
            userAgent: fingerprint.userAgent || this.getDefaultUA(account.platform),
            locale: fingerprint.locale || 'en-GB',
            timezoneId: fingerprint.timezone || 'Europe/London',
            geolocation: fingerprint.geolocation || { latitude: 51.5074, longitude: -0.1278 },
            permissions: ['geolocation'],
            // Proxy auth
            ...(proxy.username ? {
                httpCredentials: {
                    username: proxy.username,
                    password: proxy.password
                }
            } : {})
        });

        // Apply additional stealth patches
        await this.applyStealthPatches(context);

        // Get or create page
        const pages = context.pages();
        const page = pages.length > 0 ? pages[0] : await context.newPage();

        // Store reference
        const session = {
            browser: null, // persistent context doesn't expose browser separately
            context,
            page,
            accountId,
            platform: account.platform,
            display,
            startedAt: new Date()
        };
        this.activeBrowsers.set(accountId, session);

        // Log to DB
        const dbSession = await this.db.query(`
            INSERT INTO browser_sessions (account_id, platform, session_type, status, vnc_port)
            VALUES ($1, $2, $3, 'running', $4)
            RETURNING id
        `, [accountId, account.platform, options.sessionType || 'outreach', display ? 5900 + display : null]);
        
        session.dbSessionId = dbSession.rows[0].id;

        // Update account last active
        await this.db.query(
            'UPDATE platform_accounts SET last_active_at = NOW() WHERE id = $1',
            [accountId]
        );

        this.emit('browser:launched', { accountId, platform: account.platform, display });
        console.log(`[BrowserManager] Browser launched for ${account.platform}:${account.username} on display :${display}`);

        return session;
    }

    /**
     * Take a screenshot of a running browser session
     */
    async takeScreenshot(accountId) {
        const session = this.activeBrowsers.get(accountId);
        if (!session || session.page.isClosed()) return null;

        const screenshotPath = path.join(SCREENSHOTS_DIR, `${accountId}-${Date.now()}.png`);
        await session.page.screenshot({ path: screenshotPath, fullPage: false });
        
        // Update DB
        if (session.dbSessionId) {
            await this.db.query(
                'UPDATE browser_sessions SET last_screenshot_path = $1 WHERE id = $2',
                [screenshotPath, session.dbSessionId]
            );
        }

        return screenshotPath;
    }

    /**
     * Stream screenshots via WebSocket for real-time viewing
     * This is the lightweight alternative to noVNC — send JPEG frames
     * via WebSocket, similar to Sprint 11's CDP screencast approach
     */
    async startScreenStream(accountId, ws, fps = 2) {
        const session = this.activeBrowsers.get(accountId);
        if (!session || session.page.isClosed()) {
            ws.send(JSON.stringify({ error: 'No active browser session' }));
            return;
        }

        const interval = setInterval(async () => {
            try {
                if (session.page.isClosed()) {
                    clearInterval(interval);
                    ws.send(JSON.stringify({ type: 'session_ended' }));
                    return;
                }

                const screenshot = await session.page.screenshot({
                    type: 'jpeg',
                    quality: 60,
                    fullPage: false
                });

                ws.send(screenshot); // Send raw JPEG buffer
            } catch (err) {
                // Page closed or navigating
            }
        }, 1000 / fps);

        ws.on('close', () => clearInterval(interval));
        
        return interval;
    }

    /**
     * Relay user input to the browser (click, type, scroll)
     * Enables manual intervention — user logs in, solves CAPTCHA, etc.
     */
    async relayInput(accountId, action) {
        const session = this.activeBrowsers.get(accountId);
        if (!session || session.page.isClosed()) return false;

        const page = session.page;

        switch (action.type) {
            case 'click':
                await page.mouse.click(action.x, action.y);
                break;
            case 'type':
                await page.keyboard.type(action.text, { delay: 50 });
                break;
            case 'press':
                await page.keyboard.press(action.key);
                break;
            case 'scroll':
                await page.mouse.wheel(0, action.deltaY || 100);
                break;
            case 'navigate':
                await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                break;
            default:
                console.warn(`[BrowserManager] Unknown input action: ${action.type}`);
                return false;
        }

        return true;
    }

    /**
     * Save browser state (cookies + localStorage) for persistence
     */
    async saveState(accountId) {
        const session = this.activeBrowsers.get(accountId);
        if (!session) return;

        try {
            const state = await session.context.storageState();
            const statePath = path.join(PROFILES_DIR, `${session.platform}-${accountId}`, 'state.json');
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

            await this.db.query(
                'UPDATE platform_accounts SET storage_state_path = $1, updated_at = NOW() WHERE id = $2',
                [statePath, accountId]
            );

            console.log(`[BrowserManager] State saved for account ${accountId}`);
        } catch (err) {
            console.error(`[BrowserManager] Failed to save state:`, err.message);
        }
    }

    /**
     * Close a browser session cleanly
     */
    async closeBrowser(accountId) {
        const session = this.activeBrowsers.get(accountId);
        if (!session) return;

        // Save state first
        await this.saveState(accountId);

        try {
            await session.context.close();
        } catch (e) {}

        // Kill Xvfb display
        const display = this.xvfbDisplays.get(accountId);
        if (display) {
            try {
                const { execSync } = require('child_process');
                execSync(`kill $(cat /tmp/.X${display}-lock 2>/dev/null) 2>/dev/null`);
            } catch (e) {}
            this.xvfbDisplays.delete(accountId);
        }

        // Update DB
        if (session.dbSessionId) {
            const duration = Date.now() - session.startedAt.getTime();
            await this.db.query(`
                UPDATE browser_sessions 
                SET status = 'completed', ended_at = NOW(), duration_ms = $1
                WHERE id = $2
            `, [duration, session.dbSessionId]);
        }

        this.activeBrowsers.delete(accountId);
        this.emit('browser:closed', { accountId, platform: session.platform });
        console.log(`[BrowserManager] Browser closed for account ${accountId}`);
    }

    /**
     * Close all active browsers
     */
    async closeAll() {
        for (const accountId of this.activeBrowsers.keys()) {
            await this.closeBrowser(accountId);
        }
    }

    /**
     * Get all active sessions
     */
    getActiveSessions() {
        const sessions = [];
        for (const [accountId, session] of this.activeBrowsers) {
            sessions.push({
                accountId,
                platform: session.platform,
                display: session.display,
                startedAt: session.startedAt,
                isPageOpen: session.page && !session.page.isClosed()
            });
        }
        return sessions;
    }

    // --- Helpers ---

    getViewport(platform) {
        switch (platform) {
            case 'instagram':
                return { width: 390, height: 844 }; // iPhone viewport
            case 'linkedin':
                return { width: 1280, height: 720 }; // Desktop
            case 'x':
                return { width: 1280, height: 720 };
            default:
                return { width: 1280, height: 720 };
        }
    }

    getDefaultUA(platform) {
        switch (platform) {
            case 'instagram':
                return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
            case 'linkedin':
                return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
            case 'x':
                return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
            default:
                return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
        }
    }

    async applyStealthPatches(context) {
        // Remove webdriver flag
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // Patch chrome.runtime
            window.chrome = { runtime: {} };
            // Patch plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            // Patch languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-GB', 'en-US', 'en']
            });
        });
    }
}

module.exports = PlatformBrowserManager;
