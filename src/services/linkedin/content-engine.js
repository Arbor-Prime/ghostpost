/**
 * LinkedIn Content Engine
 * Ported from ReeveOS CC (Python/FastAPI) to GhostPost (Node.js)
 * 
 * Generates LinkedIn posts using Lara Acosta's methodology:
 * - SLAY framework (Story → Lesson → Actionable → You)
 * - PAS framework (Problem → Agitate → Solution)
 * - 4-3-2-1 system (4 posts/week, 3 pillars, 2 frameworks, 1 brand)
 * - 8-word hooks, rehooks, broad→narrow→niche
 * 
 * Uses the user's GhostPost voice profile to match their actual tone.
 */

const db = require('../../config/database');
const { generate: ollamaGenerate } = require('../../config/ollama');

// Brand context — the founder's story and voice for ReeveOS posts
// This gets overridden per-user when voice profiles are connected
const DEFAULT_BRAND_CONTEXT = `
YOUR IDENTITY — WHO IS WRITING THESE POSTS

You are writing LinkedIn posts AS a business founder. Here's the voice:

- British, warm, direct, no corporate fluff
- Speaks from experience — real numbers, real businesses, real problems
- Self-deprecating humour
- Passionate about fairness — gets fired up about exploitation
- Uses concrete examples with real numbers
- NOT preachy, NOT guru-like, NOT corporate LinkedIn speak
- Punchy sentences. Short paragraphs. Says what needs saying and moves on.
`;

const LINKEDIN_RULES = `
LINKEDIN WRITING RULES (NON-NEGOTIABLE)

HOOK RULES:
- First line MUST be 8 words or fewer — mobile cutoff
- Must create curiosity, shock, or promise a specific outcome
- Use numbers, specifics, and "how I" instead of "how to"
- Second line (rehook) must be equally compelling — "See more" appears here
- Never start with "I'm excited to announce" or similar corporate speak

FORMATTING RULES:
- One sentence per line with a blank line between each
- Vary sentence lengths: short punchy mixed with slightly longer
- Keep total post between 800-1200 characters
- NO emojis in the hook or first 3 lines
- Minimal emojis overall (max 2-3, only at end)
- NO hashtags (they reduce reach on LinkedIn in 2026)
- End with a question or feel-good statement

SLAY FRAMEWORK:
S = Story: Start with a personal anecdote or real event
L = Lesson: Pivot to the key insight
A = Actionable: Give specific, implementable steps or numbers
Y = You: Point it back at the reader — ask them a question

PAS FRAMEWORK:
P = Problem: State a painful problem your audience has
A = Agitate: Make it worse — show the real cost of inaction
S = Solution: Present the solution with specifics

THE 3 CONTENT PILLARS:
1. GROWTH — Business-specific stories, features, behind-the-scenes, milestones
2. TAM — Broad industry topics, market trends, economics, tech disruption
3. SALES — Direct pitch with social proof, comparisons, case studies, savings

WHAT MAKES POSTS VIRAL:
- Personal stories with business lessons
- Specific numbers and metrics
- Contrarian takes
- Behind-the-scenes of building something
- Underdog vs giant narratives
- Real vulnerability mixed with determination

WHAT KILLS POSTS:
- Generic advice anyone could give
- Corporate speak (synergy, leverage, ecosystem)
- Starting with "I'm thrilled/excited/proud to announce"
- Lists without context or story
- Anything that sounds like ChatGPT default output
- Too many emojis or hashtags

OUTPUT FORMAT:
Return ONLY valid JSON:
{
  "hook": "8 words max first line",
  "rehook": "compelling second line",
  "body": "full post body with \\n\\n for line breaks",
  "full_post": "complete formatted post",
  "framework": "SLAY or PAS",
  "pillar": "growth, tam, or sales",
  "estimated_impressions": "low/medium/high/viral",
  "hook_score": 1-10,
  "reasoning": "why this should perform well"
}
`;

const WEEKLY_PROMPT_TEMPLATE = `Generate a full week's LinkedIn content calendar (4 posts).

THE 4-3-2-1 SYSTEM:
- 4 posts per week (Monday, Tuesday, Thursday, Friday)
- 3 content pillars used across the week
- 2 frameworks alternated (SLAY and PAS)
- 1 consistent brand voice

WEEKLY SCHEDULE:
- Monday: TAM content (broad industry topic) using SLAY
- Tuesday: Growth content (business-specific story) using PAS
- Thursday: Growth content (behind-the-scenes, feature, partner) using SLAY
- Friday: Sales content (pitch, comparison, case study) using PAS

Return as a JSON array of 4 posts. Each post must have completely different topics.`;


class LinkedInContentEngine {

  /**
   * Get the user's voice profile formatted as brand context
   */
  async getUserContext(userId) {
    const user = await db.query(
      'SELECT voice_profile, persona FROM users WHERE id = $1',
      [userId]
    );
    const vp = user.rows[0]?.voice_profile;
    if (!vp || !vp.summary_quote) return DEFAULT_BRAND_CONTEXT;

    return `
YOUR VOICE (from your voice profile):
${vp.summary_quote}

Words you use: ${(vp.signature_words || []).join(', ')}
Words you never use: ${(vp.anti_words || []).join(', ')}
Topics you know: ${(vp.primary_topics || []).join(', ')}
Formality: ${Math.round((vp.formality || 0.5) * 10)}/10
Humour: ${Math.round((vp.emotional_range?.humour || 0.5) * 10)}/10
Directness: ${Math.round((vp.directness || 0.5) * 10)}/10

Write LinkedIn posts that sound like THIS person — not a generic ghostwriter.
`;
  }

  /**
   * Call Ollama (or Claude if API key is set)
   */
  async callAI(systemPrompt, userPrompt) {
    const claudeKey = process.env.ANTHROPIC_API_KEY;

    if (claudeKey) {
      // Use Claude for higher quality
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      return this.parseJSON(text);
    }

    // Fallback to Ollama
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const response = await ollamaGenerate(fullPrompt, { temperature: 0.7, maxTokens: 2000 });
    return this.parseJSON(response);
  }

  /**
   * Generate a single LinkedIn post
   */
  async generatePost(userId, options = {}) {
    const { pillar = 'tam', framework = 'slay', topic = null, tone = 'default', customPrompt = null } = options;

    const voiceContext = await this.getUserContext(userId);

    const toneInstructions = {
      default: '',
      bold: 'Write with extra boldness and confidence. Take a strong contrarian stance.',
      vulnerable: 'Write with more vulnerability and personal honesty. Share struggles and doubts.',
      'data-driven': 'Lead heavily with specific numbers, statistics, and financial breakdowns.',
      'story-heavy': 'Make this predominantly a personal story with the lesson woven in subtly.',
    };

    const systemPrompt = `${voiceContext}\n${LINKEDIN_RULES}`;
    const userPrompt = `Generate a single LinkedIn post.
Pillar: ${pillar.toUpperCase()}
Framework: ${framework.toUpperCase()}
${topic ? `Topic/angle: ${topic}` : 'Choose the most compelling topic'}
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}
${toneInstructions[tone] || ''}

Remember: 8-word hook, compelling rehook, end with engagement CTA.
Return as valid JSON.`;

    const result = await this.callAI(systemPrompt, userPrompt);

    // Store in DB
    const insert = await db.query(`
      INSERT INTO linkedin_posts (user_id, hook, rehook, body, full_post, post_type, pillar, framework, tone, topic_angle, hook_score, estimated_impressions, reasoning, status)
      VALUES ($1, $2, $3, $4, $5, 'single', $6, $7, $8, $9, $10, $11, $12, 'draft')
      RETURNING id
    `, [
      userId,
      result.hook || '', result.rehook || '', result.body || '', result.full_post || '',
      pillar, framework, tone, topic || result.topic_angle || null,
      result.hook_score || null, result.estimated_impressions || null, result.reasoning || null
    ]);

    result.id = insert.rows[0].id;
    result.status = 'draft';
    return result;
  }

  /**
   * Generate a full week's calendar (4 posts)
   */
  async generateWeek(userId, options = {}) {
    const { weekOf = null, customTopics = null, customPrompt = null } = options;

    const voiceContext = await this.getUserContext(userId);
    const weekLabel = weekOf || new Date().toISOString().split('T')[0];

    const systemPrompt = `${voiceContext}\n${LINKEDIN_RULES}\n\n${WEEKLY_PROMPT_TEMPLATE}`;
    const userPrompt = `Generate 4 posts for the week of ${weekLabel}.
${customTopics ? `Include these topics: ${customTopics.join(', ')}` : ''}
${customPrompt ? `Voice context: ${customPrompt}` : ''}

Return as a JSON array of 4 post objects.`;

    const result = await this.callAI(systemPrompt, userPrompt);
    const posts = Array.isArray(result) ? result : [result];
    const days = ['monday', 'tuesday', 'thursday', 'friday'];

    const saved = [];
    for (let i = 0; i < Math.min(posts.length, 4); i++) {
      const post = posts[i];
      const insert = await db.query(`
        INSERT INTO linkedin_posts (user_id, hook, rehook, body, full_post, post_type, pillar, framework, week_of, day_of_week, day_index, hook_score, estimated_impressions, reasoning, topic_angle, status)
        VALUES ($1, $2, $3, $4, $5, 'weekly', $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft')
        RETURNING id
      `, [
        userId,
        post.hook || '', post.rehook || '', post.body || '', post.full_post || '',
        post.pillar || days[i] === 'monday' ? 'tam' : days[i] === 'friday' ? 'sales' : 'growth',
        post.framework || (i % 2 === 0 ? 'slay' : 'pas'),
        weekLabel, post.day || days[i], i,
        post.hook_score || null, post.estimated_impressions || null, post.reasoning || null,
        post.topic_angle || null
      ]);
      post.id = insert.rows[0].id;
      post.status = 'draft';
      saved.push(post);
    }

    return { weekOf: weekLabel, posts: saved };
  }

  /**
   * Trend-jack a topic
   */
  async trendJack(userId, options = {}) {
    const { trendTopic, newsUrl = null, angle = null, customPrompt = null } = options;

    const voiceContext = await this.getUserContext(userId);
    const systemPrompt = `${voiceContext}\n${LINKEDIN_RULES}`;
    const userPrompt = `A trending topic has emerged. Write a trend-jacking LinkedIn post.

Trending topic: ${trendTopic}
${newsUrl ? `Source: ${newsUrl}` : ''}
${angle ? `Angle: ${angle}` : 'Choose the most compelling angle'}
${customPrompt ? `Voice context: ${customPrompt}` : ''}

This needs to feel timely and reactive. Return as valid JSON.`;

    const result = await this.callAI(systemPrompt, userPrompt);

    const insert = await db.query(`
      INSERT INTO linkedin_posts (user_id, hook, rehook, body, full_post, post_type, pillar, framework, trend_topic, news_url, hook_score, estimated_impressions, reasoning, status)
      VALUES ($1, $2, $3, $4, $5, 'trend', $6, $7, $8, $9, $10, $11, $12, 'draft')
      RETURNING id
    `, [
      userId,
      result.hook || '', result.rehook || '', result.body || '', result.full_post || '',
      result.pillar || 'tam', result.framework || 'slay',
      trendTopic, newsUrl,
      result.hook_score || null, result.estimated_impressions || null, result.reasoning || null
    ]);

    result.id = insert.rows[0].id;
    result.status = 'draft';
    return result;
  }

  /**
   * Scan for trending topics
   */
  async scanTrends(userId) {
    const voiceContext = await this.getUserContext(userId);
    const systemPrompt = `${voiceContext}\n${LINKEDIN_RULES}`;
    const userPrompt = `Scan for the most current trending topics in your industry space. Return a JSON array of 5 topics, each with:
{
  "topic": "The trending topic",
  "why_trending": "Brief explanation",
  "your_angle": "How you could uniquely comment on this",
  "suggested_hook": "An 8-word hook",
  "urgency": "high/medium/low"
}`;

    const result = await this.callAI(systemPrompt, userPrompt);
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Rewrite a post
   */
  async rewrite(userId, originalPost, instructions = 'Make it better') {
    const voiceContext = await this.getUserContext(userId);
    const systemPrompt = `${voiceContext}\n${LINKEDIN_RULES}`;
    const userPrompt = `Rewrite this LinkedIn post:

---
${originalPost}
---

Instructions: ${instructions}

Keep the core message but improve hook, structure, and engagement. Return as valid JSON.`;

    return this.callAI(systemPrompt, userPrompt);
  }

  parseJSON(text) {
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : cleaned.indexOf('[');
      const end = cleaned.lastIndexOf('}') !== -1 ? cleaned.lastIndexOf('}') : cleaned.lastIndexOf(']');
      if (start === -1 || end === -1) return { full_post: text, error: 'Could not parse' };
      return JSON.parse(cleaned.substring(start, end + 1));
    } catch (err) {
      return { full_post: text, error: 'JSON parse failed' };
    }
  }
}

module.exports = LinkedInContentEngine;
