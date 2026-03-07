/**
 * Pattern Extractor
 * 
 * Takes harvested conversations and runs them through Ollama/Mistral
 * to extract communication patterns — what works, what doesn't,
 * how people in specific verticals and regions talk.
 * 
 * This is the brain's learning loop. It doesn't change the model,
 * it changes the knowledge the model is given.
 */

const db = require('../../config/database');
const { generate: generateWithOllama } = require('../../config/ollama');

const EXTRACTION_PROMPT = `You are analysing real conversations from social media to extract communication patterns.

CONVERSATION DATA:
{conversation_data}

ANALYSIS REQUIRED:
Look at how people interact in this conversation and extract specific, actionable patterns.

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "patterns": [
    {
      "context": "cold_dm|reply|follow_up|engagement|opener|closer",
      "pattern": "A specific, actionable pattern described in one sentence",
      "confidence": 0.0-1.0,
      "example": "A real message from the conversation that demonstrates this pattern",
      "anti_example": "A message that did NOT work well (low engagement)",
      "reasoning": "Why this pattern works"
    }
  ],
  "platform_norms": {
    "avg_message_length": number,
    "tone": "casual|professional|warm|direct|playful",
    "uses_emoji": true|false,
    "uses_questions": true|false,
    "formality_level": 0.0-1.0
  },
  "thread_classification": "cold_outreach|warm_reply|business_to_customer|customer_to_business|peer_to_peer|pitch|support",
  "vertical": "restaurant|cafe|salon|retail|general|unknown",
  "what_opened_conversation": "The specific message or technique that started genuine back-and-forth",
  "what_killed_conversation": "What caused people to stop replying, if visible"
}`;

const BATCH_EXTRACTION_PROMPT = `You are studying communication patterns across multiple conversations on {platform}.

CONVERSATIONS:
{conversations}

TASK:
Identify CROSS-CONVERSATION patterns. What works consistently? What fails consistently?
Focus on:
1. Opening lines that get responses vs ones that get ignored
2. Message length that performs best
3. Tone and formality that gets engagement
4. Whether questions outperform statements
5. How business owners talk vs how customers talk
6. Regional or vertical-specific language patterns

Return ONLY a JSON object:
{
  "patterns": [
    {
      "context": "cold_dm|reply|follow_up|engagement|opener|closer",
      "pattern": "Specific pattern described in one sentence",
      "confidence": 0.0-1.0,
      "examples": ["real message 1", "real message 2"],
      "anti_examples": ["bad message 1"],
      "evidence_count": number_of_conversations_supporting_this
    }
  ],
  "platform_summary": "One paragraph describing how people communicate on this platform in this context",
  "best_opener_style": "Description of the most effective opening message style",
  "optimal_length": number_of_words,
  "tone_that_works": "Description of the tone that gets the best engagement"
}`;

class PatternExtractor {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Extract patterns from a single conversation
   */
  async extractFromConversation(conversationId) {
    const conv = await db.query(
      'SELECT * FROM observed_conversations WHERE id = $1',
      [conversationId]
    );
    if (!conv.rows[0]) return null;

    const messages = await db.query(
      'SELECT * FROM observed_messages WHERE conversation_id = $1 ORDER BY reply_depth, id',
      [conversationId]
    );

    if (messages.rows.length < 2) return null;

    // Format conversation for the prompt
    const conversationData = this.formatConversation(conv.rows[0], messages.rows);

    const prompt = EXTRACTION_PROMPT.replace('{conversation_data}', conversationData);

    try {
      const response = await generateWithOllama(prompt, {
        temperature: 0.3,
        maxTokens: 2000
      });

      const parsed = this.parseJSON(response);
      if (!parsed || !parsed.patterns) return null;

      // Update conversation classification
      if (parsed.thread_classification) {
        await db.query(
          'UPDATE observed_conversations SET thread_type = $1, vertical = $2 WHERE id = $3',
          [parsed.thread_classification, parsed.vertical || null, conversationId]
        );
      }

      // Mark which messages opened conversations
      if (parsed.what_opened_conversation) {
        for (const msg of messages.rows) {
          if (msg.content.includes(parsed.what_opened_conversation.substring(0, 30))) {
            await db.query(
              'UPDATE observed_messages SET opens_conversation = TRUE, tone = $1, intent = $2 WHERE id = $3',
              [parsed.platform_norms?.tone || null, 'opener', msg.id]
            );
          }
        }
      }

      // Store extracted patterns
      const storedPatterns = [];
      for (const pattern of parsed.patterns) {
        const stored = await this.storePattern(
          conv.rows[0].platform,
          parsed.vertical || null,
          null, // region — TODO: detect from content
          pattern,
          conversationId
        );
        if (stored) storedPatterns.push(stored);
      }

      console.log(`[Extractor] Conversation ${conversationId}: ${storedPatterns.length} patterns extracted`);
      return { patterns: storedPatterns, analysis: parsed };

    } catch (err) {
      console.error(`[Extractor] Conversation ${conversationId} failed:`, err.message);
      return null;
    }
  }

  /**
   * Batch extract patterns from multiple conversations on the same platform
   */
  async extractBatch(platform, limit = 10) {
    console.log(`[Extractor] Batch extraction for ${platform}, limit ${limit}`);

    // Get unprocessed conversations with enough messages
    const conversations = await db.query(`
      SELECT oc.*, 
        (SELECT COUNT(*) FROM observed_messages om WHERE om.conversation_id = oc.id) as msg_count
      FROM observed_conversations oc
      WHERE oc.platform = $1
        AND oc.id NOT IN (
          SELECT DISTINCT (jsonb_array_elements_text(source_conversation_ids))::int 
          FROM learned_patterns 
          WHERE platform = $1 AND source_conversation_ids != '[]'::jsonb
        )
      HAVING (SELECT COUNT(*) FROM observed_messages om WHERE om.conversation_id = oc.id) >= 3
      ORDER BY oc.engagement_score DESC
      LIMIT $2
    `, [platform, limit]);

    if (conversations.rows.length === 0) {
      console.log(`[Extractor] No unprocessed conversations for ${platform}`);
      return [];
    }

    // Build batch conversation summaries
    const convSummaries = [];
    for (const conv of conversations.rows) {
      const messages = await db.query(
        'SELECT * FROM observed_messages WHERE conversation_id = $1 ORDER BY reply_depth, id',
        [conv.id]
      );
      convSummaries.push(this.formatConversation(conv, messages.rows));
    }

    const prompt = BATCH_EXTRACTION_PROMPT
      .replace('{platform}', platform)
      .replace('{conversations}', convSummaries.join('\n\n---\n\n'));

    try {
      const response = await generateWithOllama(prompt, {
        temperature: 0.3,
        maxTokens: 3000
      });

      const parsed = this.parseJSON(response);
      if (!parsed || !parsed.patterns) return [];

      const storedPatterns = [];
      const convIds = conversations.rows.map(c => c.id);

      for (const pattern of parsed.patterns) {
        const stored = await this.storePattern(
          platform,
          null, // vertical — batch patterns are cross-vertical
          null,
          pattern,
          convIds
        );
        if (stored) storedPatterns.push(stored);
      }

      console.log(`[Extractor] Batch ${platform}: ${storedPatterns.length} patterns from ${conversations.rows.length} conversations`);
      return storedPatterns;

    } catch (err) {
      console.error(`[Extractor] Batch extraction failed:`, err.message);
      return [];
    }
  }

  /**
   * Store or reinforce a pattern
   */
  async storePattern(platform, vertical, region, pattern, conversationIds) {
    const convIds = Array.isArray(conversationIds) ? conversationIds : [conversationIds];

    // Check for similar existing pattern
    const existing = await db.query(`
      SELECT id, confidence, evidence_count, examples, anti_examples, source_conversation_ids
      FROM learned_patterns
      WHERE platform = $1
        AND (vertical = $2 OR (vertical IS NULL AND $2 IS NULL))
        AND context = $3
        AND status = 'active'
        AND pattern_text % $4
      ORDER BY similarity(pattern_text, $4) DESC
      LIMIT 1
    `, [platform, vertical, pattern.context, pattern.pattern]).catch(() => ({ rows: [] }));

    // If trigram similarity search fails (extension not installed), try LIKE
    let existingRow = existing.rows[0];
    if (!existingRow) {
      const fallback = await db.query(`
        SELECT id, confidence, evidence_count, examples, anti_examples, source_conversation_ids
        FROM learned_patterns
        WHERE platform = $1
          AND (vertical = $2 OR (vertical IS NULL AND $2 IS NULL))
          AND context = $3
          AND status = 'active'
          AND LOWER(pattern_text) LIKE $4
        LIMIT 1
      `, [platform, vertical, pattern.context, `%${pattern.pattern.substring(0, 40).toLowerCase()}%`]);
      existingRow = fallback.rows[0];
    }

    if (existingRow) {
      // Reinforce existing pattern
      const newExamples = [...(existingRow.examples || []), ...(pattern.examples || [pattern.example])].slice(-10);
      const newAntiExamples = [...(existingRow.anti_examples || []), ...(pattern.anti_examples || [pattern.anti_example])].filter(Boolean).slice(-5);
      const newConvIds = [...new Set([...(existingRow.source_conversation_ids || []), ...convIds])];
      const newConfidence = Math.min(0.95, existingRow.confidence + 0.05);

      await db.query(`
        UPDATE learned_patterns SET
          confidence = $1,
          evidence_count = evidence_count + $2,
          examples = $3,
          anti_examples = $4,
          source_conversation_ids = $5,
          updated_at = NOW(),
          last_validated_at = NOW()
        WHERE id = $6
      `, [
        newConfidence,
        pattern.evidence_count || 1,
        JSON.stringify(newExamples),
        JSON.stringify(newAntiExamples),
        JSON.stringify(newConvIds),
        existingRow.id
      ]);

      return { id: existingRow.id, reinforced: true, confidence: newConfidence };

    } else {
      // Create new pattern
      const result = await db.query(`
        INSERT INTO learned_patterns (platform, vertical, region, context, pattern_text, examples, anti_examples, confidence, evidence_count, source_conversation_ids)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        platform, vertical, region,
        pattern.context,
        pattern.pattern,
        JSON.stringify(pattern.examples || [pattern.example].filter(Boolean)),
        JSON.stringify(pattern.anti_examples || [pattern.anti_example].filter(Boolean)),
        pattern.confidence || 0.5,
        pattern.evidence_count || 1,
        JSON.stringify(convIds)
      ]);

      return { id: result.rows[0].id, reinforced: false, confidence: pattern.confidence || 0.5 };
    }
  }

  /**
   * Format a conversation for the LLM prompt
   */
  formatConversation(conv, messages) {
    let text = `[${conv.platform.toUpperCase()}] @${conv.root_author}:\n"${conv.root_content}"\n`;
    text += `(${conv.total_replies} replies, ${conv.total_participants} participants)\n\n`;

    for (const msg of messages) {
      const indent = '  '.repeat(msg.reply_depth);
      const engagement = msg.likes > 0 ? ` [${msg.likes} likes]` : '';
      text += `${indent}@${msg.author}: "${msg.content}"${engagement}\n`;
    }

    return text;
  }

  /**
   * Parse JSON from LLM response, handling common issues
   */
  parseJSON(response) {
    try {
      // Strip markdown code fences if present
      const cleaned = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      // Find the JSON object
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) return null;

      return JSON.parse(cleaned.substring(start, end + 1));
    } catch (err) {
      console.warn('[Extractor] JSON parse failed:', err.message);
      return null;
    }
  }
}

module.exports = PatternExtractor;
