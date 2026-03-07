/**
 * Prompt Enricher
 * 
 * The bridge between the learning engine and the reply/DM generator.
 * Queries learned patterns that are relevant to the current context
 * and injects them into the system prompt so the LLM generates
 * better, more human-like messages.
 * 
 * This is where observation becomes action. Every time the brain
 * writes a message, it draws on real conversation patterns it's
 * watched across platforms.
 */

const db = require('../../config/database');
const { getActionKnowledge } = require('../brain/knowledge/linkedin-methodology');

class PromptEnricher {

  /**
   * Get relevant patterns for enriching a reply/DM prompt
   * 
   * @param {Object} options
   * @param {string} options.platform - 'x', 'instagram', 'linkedin'
   * @param {string} options.context - 'cold_dm', 'reply', 'follow_up', 'engagement'
   * @param {string} options.vertical - business vertical (optional)
   * @param {string} options.region - target region (optional)
   * @param {number} options.limit - max patterns to return (default 5)
   * @returns {Object} enrichment data to inject into prompt
   */
  async getEnrichment(options = {}) {
    const {
      platform = null,
      context = 'reply',
      vertical = null,
      region = null,
      limit = 5
    } = options;

    // Query patterns with cascading specificity:
    // 1. Exact match (platform + vertical + context)
    // 2. Platform + context (any vertical)
    // 3. Context only (cross-platform)
    const patterns = await db.query(`
      SELECT * FROM learned_patterns
      WHERE status = 'active'
        AND confidence >= 0.3
        AND context = $1
        AND (
          (platform = $2 AND vertical = $3) OR
          (platform = $2 AND vertical IS NULL) OR
          (platform IS NULL)
        )
      ORDER BY
        CASE 
          WHEN platform = $2 AND vertical = $3 THEN 1
          WHEN platform = $2 AND vertical IS NULL THEN 2
          WHEN platform IS NULL THEN 3
        END,
        confidence DESC,
        evidence_count DESC
      LIMIT $4
    `, [context, platform, vertical, limit]);

    // Get conversation examples that match the context
    const examples = await this.getConversationExamples(platform, vertical, context, 3);

    // Build the enrichment block
    return this.buildEnrichmentBlock(patterns.rows, examples);
  }

  /**
   * Get real conversation examples that demonstrate good communication
   */
  async getConversationExamples(platform, vertical, context, limit = 3) {
    // Find messages that opened real conversations (got replies)
    const query = `
      SELECT om.content, om.author, om.likes, om.word_count, om.tone,
             oc.platform, oc.vertical, oc.thread_type,
             (SELECT COUNT(*) FROM observed_messages om2 
              WHERE om2.conversation_id = om.conversation_id AND om2.reply_depth > om.reply_depth) as response_count
      FROM observed_messages om
      JOIN observed_conversations oc ON om.conversation_id = oc.id
      WHERE om.opens_conversation = TRUE
        AND ($1::varchar IS NULL OR oc.platform = $1)
        AND ($2::varchar IS NULL OR oc.vertical = $2)
      ORDER BY om.likes DESC, response_count DESC
      LIMIT $3
    `;

    const result = await db.query(query, [platform, vertical, limit]);
    return result.rows;
  }

  /**
   * Build the prompt enrichment block that gets injected into the system prompt
   */
  buildEnrichmentBlock(patterns, examples) {
    if (patterns.length === 0 && examples.length === 0) {
      return { text: '', hasPatterns: false, patternCount: 0 };
    }

    let block = '\n=== LEARNED COMMUNICATION PATTERNS ===\n';
    block += 'These patterns were extracted from observing real human conversations.\n';
    block += 'Use them to guide your tone and approach — don\'t copy them literally.\n\n';

    // Add patterns
    if (patterns.length > 0) {
      block += 'WHAT WORKS:\n';
      for (const p of patterns) {
        const conf = Math.round(p.confidence * 100);
        block += `• ${p.pattern_text} (${conf}% confidence, from ${p.evidence_count} conversations)\n`;

        // Add one example if available
        const exs = p.examples || [];
        if (exs.length > 0) {
          block += `  Example: "${exs[0]}"\n`;
        }
      }
      block += '\n';
    }

    // Add anti-patterns
    const antiPatterns = patterns.filter(p => (p.anti_examples || []).length > 0);
    if (antiPatterns.length > 0) {
      block += 'WHAT DOES NOT WORK:\n';
      for (const p of antiPatterns) {
        const antis = p.anti_examples || [];
        if (antis.length > 0) {
          block += `• Avoid: "${antis[0]}"\n`;
        }
      }
      block += '\n';
    }

    // Add real conversation examples
    if (examples.length > 0) {
      block += 'REAL MESSAGES THAT STARTED CONVERSATIONS:\n';
      for (const ex of examples) {
        const platform = ex.platform ? `[${ex.platform}]` : '';
        block += `${platform} "${ex.content}" (${ex.response_count} responses, ${ex.likes} likes)\n`;
      }
      block += '\n';
    }

    block += 'Remember: adapt these patterns to your own voice. Don\'t parrot them.\n';

    return {
      text: block,
      hasPatterns: true,
      patternCount: patterns.length,
      exampleCount: examples.length
    };
  }

  /**
   * Enrich an existing system prompt with learned patterns.
   * This is the main integration point — call this from the reply generator.
   * 
   * @param {string} existingPrompt - the current system prompt
   * @param {Object} context - { platform, context, vertical, region }
   * @returns {string} enriched prompt
   */
  async enrichPrompt(existingPrompt, context = {}) {
    let additions = '';

    // Layer 1: Learned patterns from observation database
    const enrichment = await this.getEnrichment(context);
    if (enrichment.hasPatterns) {
      additions += enrichment.text;
    }

    // Layer 2: Platform-specific methodology knowledge
    if (context.platform === 'linkedin') {
      // Map context to LinkedIn action type
      const actionMap = {
        'cold_dm': 'send_dm',
        'reply': 'write_comment',
        'follow_up': 'send_dm',
        'engagement': 'write_comment',
        'connection_request': 'send_connection',
        'post': 'create_post'
      };
      const action = actionMap[context.context] || 'send_dm';
      additions += '\n' + getActionKnowledge(action);
    }

    if (!additions) {
      return existingPrompt;
    }

    // Insert before HARD RULES if present
    const hardRulesIndex = existingPrompt.indexOf('=== HARD RULES ===');
    if (hardRulesIndex !== -1) {
      return existingPrompt.substring(0, hardRulesIndex) + additions + '\n' + existingPrompt.substring(hardRulesIndex);
    }

    return existingPrompt + '\n' + additions;
  }

  /**
   * Get a summary of all learned patterns for a platform
   */
  async getPatternSummary(platform = null) {
    const where = platform ? 'WHERE platform = $1 AND status = \'active\'' : 'WHERE status = \'active\'';
    const params = platform ? [platform] : [];

    const summary = await db.query(`
      SELECT 
        platform,
        context,
        COUNT(*) as pattern_count,
        AVG(confidence) as avg_confidence,
        SUM(evidence_count) as total_evidence
      FROM learned_patterns
      ${where}
      GROUP BY platform, context
      ORDER BY platform, context
    `, params);

    const total = await db.query(`
      SELECT COUNT(*) as total FROM learned_patterns ${where}
    `, params);

    const topPatterns = await db.query(`
      SELECT id, platform, context, vertical, pattern_text, confidence, evidence_count
      FROM learned_patterns
      ${where}
      ORDER BY confidence DESC, evidence_count DESC
      LIMIT 10
    `, params);

    return {
      breakdown: summary.rows,
      totalPatterns: parseInt(total.rows[0].total),
      topPatterns: topPatterns.rows
    };
  }
}

module.exports = PromptEnricher;
