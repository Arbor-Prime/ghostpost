/**
 * Learning Scheduler
 * 
 * The always-on loop. Runs conversation harvesting every 6 hours,
 * pattern extraction every 12 hours, and pattern retirement weekly.
 * 
 * The brain gets smarter every day without anyone touching it.
 */

const ConversationHarvester = require('./conversation-harvester');
const PatternExtractor = require('./pattern-extractor');
const db = require('../../config/database');

class LearningScheduler {
  constructor(io) {
    this.io = io;
    this.harvester = new ConversationHarvester();
    this.extractor = new PatternExtractor();
    this.harvestInterval = null;
    this.extractInterval = null;
    this.isHarvesting = false;
    this.isExtracting = false;
  }

  /**
   * Start the learning loop
   */
  start() {
    console.log('[Learning] Scheduler started');

    // Harvest every 6 hours
    this.harvestInterval = setInterval(() => this.runHarvest(), 6 * 60 * 60 * 1000);

    // Extract patterns every 12 hours
    this.extractInterval = setInterval(() => this.runExtraction(), 12 * 60 * 60 * 1000);

    // Run initial harvest after 2 minute delay (let server settle)
    setTimeout(() => this.runHarvest(), 2 * 60 * 1000);

    // Run initial extraction after 30 minutes (give harvest time to populate)
    setTimeout(() => this.runExtraction(), 30 * 60 * 1000);
  }

  /**
   * Run a full harvest cycle across all platforms
   */
  async runHarvest() {
    if (this.isHarvesting) {
      console.log('[Learning] Harvest already running, skipping');
      return;
    }

    this.isHarvesting = true;
    console.log('[Learning] Starting harvest cycle');

    const results = { x: null, instagram: null, linkedin: null };

    try {
      // X — watch reply chains
      results.x = await this.harvester.harvestX({
        profiles: ['elonmusk', 'paulg', 'ycombinator', 'naval', 'levaboris'],
        queries: [
          'restaurant owner',
          'small business payments',
          'card processing fees',
          'independent cafe',
          'local business'
        ],
        maxThreads: 15
      });
    } catch (err) {
      console.error('[Learning] X harvest failed:', err.message);
    }

    // Wait between platform harvests
    await new Promise(r => setTimeout(r, 30000));

    try {
      // Instagram — watch business post comments
      results.instagram = await this.harvester.harvestInstagram({
        hashtags: [
          'nottinghamfood', 'nottinghamrestaurants', 'sheffieldfood',
          'independentcafe', 'smallbusinessuk', 'ukrestaurant',
          'supportlocal', 'independentrestaurant', 'cafestyle'
        ],
        maxThreads: 12
      });
    } catch (err) {
      console.error('[Learning] Instagram harvest failed:', err.message);
    }

    await new Promise(r => setTimeout(r, 30000));

    try {
      // LinkedIn — watch business discussion comments
      results.linkedin = await this.harvester.harvestLinkedIn({
        queries: [
          'restaurant owner challenges',
          'small business payments uk',
          'independent cafe',
          'card processing fees',
          'hospitality technology'
        ],
        maxThreads: 8
      });
    } catch (err) {
      console.error('[Learning] LinkedIn harvest failed:', err.message);
    }

    this.isHarvesting = false;

    // Emit results
    if (this.io) {
      this.io.emit('learning:harvest-complete', results);
    }

    console.log('[Learning] Harvest cycle complete:', JSON.stringify(results));
    return results;
  }

  /**
   * Run pattern extraction on all unprocessed conversations
   */
  async runExtraction() {
    if (this.isExtracting) {
      console.log('[Learning] Extraction already running, skipping');
      return;
    }

    this.isExtracting = true;
    console.log('[Learning] Starting pattern extraction');

    const results = { x: [], instagram: [], linkedin: [] };

    try {
      // Batch extract per platform
      for (const platform of ['x', 'instagram', 'linkedin']) {
        const convCount = await db.query(
          'SELECT COUNT(*) FROM observed_conversations WHERE platform = $1',
          [platform]
        );

        if (parseInt(convCount.rows[0].count) >= 3) {
          const patterns = await this.extractor.extractBatch(platform, 10);
          results[platform] = patterns;
        }
      }

      // Also run individual extraction on high-engagement conversations
      const highEngagement = await db.query(`
        SELECT id FROM observed_conversations 
        WHERE engagement_score > 0 OR total_replies >= 5
        ORDER BY total_replies DESC
        LIMIT 5
      `);

      for (const conv of highEngagement.rows) {
        await this.extractor.extractFromConversation(conv.id);
      }

      // Retire stale patterns (not validated in 30 days, low confidence)
      await db.query(`
        UPDATE learned_patterns
        SET status = 'retired'
        WHERE status = 'active'
          AND confidence < 0.3
          AND last_validated_at < NOW() - INTERVAL '30 days'
      `);

    } catch (err) {
      console.error('[Learning] Extraction failed:', err.message);
    }

    this.isExtracting = false;

    if (this.io) {
      this.io.emit('learning:extraction-complete', {
        x: results.x.length,
        instagram: results.instagram.length,
        linkedin: results.linkedin.length
      });
    }

    console.log('[Learning] Extraction complete');
    return results;
  }

  /**
   * Get current learning stats
   */
  async getStats() {
    const conversations = await db.query(`
      SELECT platform, COUNT(*) as count, SUM(total_replies) as total_messages
      FROM observed_conversations
      GROUP BY platform
    `);

    const patterns = await db.query(`
      SELECT platform, context, COUNT(*) as count, AVG(confidence) as avg_confidence
      FROM learned_patterns
      WHERE status = 'active'
      GROUP BY platform, context
    `);

    const totals = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM observed_conversations) as total_conversations,
        (SELECT COUNT(*) FROM observed_messages) as total_messages,
        (SELECT COUNT(*) FROM learned_patterns WHERE status = 'active') as active_patterns,
        (SELECT COUNT(*) FROM harvest_log) as total_harvests,
        (SELECT MAX(completed_at) FROM harvest_log) as last_harvest
    `);

    return {
      conversations: conversations.rows,
      patterns: patterns.rows,
      totals: totals.rows[0],
      isHarvesting: this.isHarvesting,
      isExtracting: this.isExtracting
    };
  }

  stop() {
    if (this.harvestInterval) clearInterval(this.harvestInterval);
    if (this.extractInterval) clearInterval(this.extractInterval);
    console.log('[Learning] Scheduler stopped');
  }
}

module.exports = LearningScheduler;
