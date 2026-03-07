/**
 * LinkedIn Content Engine
 * Ported from ReeveOS CC (Python/FastAPI) to GhostPost (Node.js)
 * 
 * Generates LinkedIn posts using Lara Acosta's FULL methodology:
 * - SLAY framework (Story → Lesson → Actionable → You)
 * - PAS framework (Problem → Agitate → Solution)
 * - 4-3-2-1 system (4 posts/week, 3 pillars, 2 frameworks, 1 brand)
 * - 8-word hooks, rehooks, broad→narrow→niche
 * - Edu-selling: educate without CTA, build trust before asking
 * - ICP (ideal client persona) vs IFP (ideal follower persona) targeting
 * - Waitlist nurture sequences (10 emails before launch, no selling)
 * - Webinar/live prep and announcement posts
 * - Scarcity, FOMO, and urgency mechanics for launches
 * 
 * Based on the Cleo launch playbook ($0 → $60K MRR in 2 months).
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

EDU-SELLING (THE CLEO METHOD):
- The highest-converting posts have ZERO call to action
- You educate people on a problem. You answer their biggest questions. You tell them what they need to know.
- There is no "check out my product" or "link in comments"
- The post simply builds trust and takes mindshare
- People find your product because they trust you, not because you linked it
- When in "edu_sell" mode, the post must NOT contain any CTA, product plug, or link reference
- Just educate. Just be useful. That's it.

TWO AUDIENCES (ICP vs IFP):
- ICP (Ideal Client Persona): These are potential BUYERS. Content for them focuses on their problems, the cost of inaction, specific solutions, and social proof.
- IFP (Ideal Follower Persona): These are your COMMUNITY. Content for them focuses on education, entertainment, behind-the-scenes, and engagement. They may never buy but they amplify your reach, comment daily, and eventually some convert.
- Every post should know which audience it targets. ICP posts drive leads. IFP posts drive engagement.

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

SCARCITY AND LAUNCH PSYCHOLOGY:
- Limited spots create urgency ("Only 500 beta spots")
- Lifetime discounts incentivise early action ("50% off forever if you join now")
- Waitlist exclusivity builds FOMO ("You can't buy this. You have to be invited.")
- Beta access feels like a secret club, not a product launch
- The best launches feel like you're letting people IN, not pushing something OUT

WHAT MAKES POSTS VIRAL:
- Personal stories with business lessons
- Specific numbers and metrics (not vague claims)
- Contrarian takes ("The industry has it backwards")
- Behind-the-scenes of building something
- Underdog vs giant narratives
- Real vulnerability mixed with determination
- Edu-selling posts that give away the playbook

WHAT KILLS POSTS:
- Generic advice anyone could give
- Corporate speak (synergy, leverage, ecosystem)
- Starting with "I'm thrilled/excited/proud to announce"
- Lists without context or story
- Anything that sounds like ChatGPT default output
- Too many emojis or hashtags
- Hard selling in the first line
- CTAs in every single post (kills trust over time)

OUTPUT FORMAT:
Return ONLY valid JSON:
{
  "hook": "8 words max first line",
  "rehook": "compelling second line",
  "body": "full post body with \\n\\n for line breaks",
  "full_post": "complete formatted post",
  "framework": "SLAY or PAS",
  "pillar": "growth, tam, or sales",
  "target_audience": "icp or ifp",
  "has_cta": true or false,
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

WEEKLY SCHEDULE WITH AUDIENCE TARGETING:
- Monday: TAM content (broad industry topic) using SLAY — TARGET: IFP (followers, community, engagement). This is an edu-sell post. NO CTA. Just educate. Build trust and mindshare.
- Tuesday: Growth content (business-specific story) using PAS — TARGET: IFP (community, behind-the-scenes fans). Share the journey. Be vulnerable. Still NO hard CTA — soft at most ("thoughts?").
- Thursday: Growth content (feature, partner, milestone) using SLAY — TARGET: ICP (potential buyers). This can have a soft CTA. Show what you've built and why it matters to THEM.
- Friday: Sales content (pitch, comparison, case study) using PAS — TARGET: ICP (buyers). This is the ONE post per week that can directly pitch. Use social proof, specific numbers, and scarcity.

CRITICAL: Only 1 out of 4 posts should directly sell. The other 3 build trust, educate, and create demand BEFORE people even know what you're selling. This is the Cleo method — the best SaaS launches pre-build trust for weeks before asking for money.

Each post must include "target_audience": "icp" or "ifp" and "has_cta": true or false.

Return as a JSON array of 4 posts. Each post must have completely different topics.`;

const NURTURE_EMAIL_PROMPT = `Generate a waitlist nurture email sequence. These emails go out BEFORE a product launch to build trust, educate, and create desire.

THE CLEO METHOD — 10 EMAILS BEFORE LAUNCH:
- Emails 1-3: Emphasise the PROBLEM. Why does the current solution fail? What are people struggling with? Make them nod and say "yes, exactly."
- Emails 4-6: Show WHY you're different. Not what your product does — why your APPROACH is different. Challenge assumptions.
- Emails 7-8: Social proof and behind-the-scenes. Early tester feedback, building journey, real numbers.
- Email 9: The "it's almost here" tease. Build maximum anticipation. Still don't sell.
- Email 10: LAUNCH. "It's live. Try it now." Direct, urgent, short. No preamble. The trust is already built.

CRITICAL RULES:
- Emails 1-9 have ZERO sales CTA. No "buy now", no pricing, no product links.
- Each email should feel like advice from a friend, not marketing from a company.
- Use the founder's voice (punchy, direct, real examples, no corporate fluff).
- Subject lines must create curiosity — under 6 words.
- Each email is 150-300 words max. Nobody reads long emails.

Return as a JSON array of 10 email objects:
{
  "email_number": 1-10,
  "subject": "6 words max",
  "preview_text": "the preview line in inbox",
  "body": "the email body with \\n\\n for paragraphs",
  "purpose": "what this email achieves",
  "has_cta": false (true only for email 10),
  "send_day": "day relative to launch (e.g. day -28, day -1, day 0)"
}`;

const WEBINAR_PREP_PROMPT = `Generate a LinkedIn Live / webinar preparation pack.

THE CLEO METHOD — WEBINARS CONVERT:
The structure is 20-20-20:
- First 20 minutes: Pure education on ONE topic. Give away your best stuff.
- Next 20 minutes: Live demo/walkthrough of the product. Show, don't tell.
- Final 20 minutes: Pitch + Q&A. Send the link. Tell them where to buy.

When you show up as a human — your mannerisms, your voice, how you look, where you live — people connect with you in a way content never achieves. This is the highest-converting channel.

Generate:
1. An announcement post (LinkedIn post format, 8-word hook, builds anticipation)
2. A reminder post (for the day of the live, creates urgency)
3. A topic outline (the 20-minute education section — 5 key talking points)
4. Demo script bullet points (what to show, in what order)
5. Pitch framework (how to transition from demo to offer without being salesy)
6. Follow-up post (for after the live — recap + link for those who missed it)

Return as JSON:
{
  "announcement_post": { "hook", "rehook", "body", "full_post" },
  "reminder_post": { "hook", "rehook", "body", "full_post" },
  "topic_outline": ["point 1", "point 2", ...],
  "demo_script": ["show X", "show Y", ...],
  "pitch_framework": "how to transition from demo to offer",
  "followup_post": { "hook", "rehook", "body", "full_post" }
}`;


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
    const { pillar = 'tam', framework = 'slay', topic = null, tone = 'default', customPrompt = null, mode = 'standard', targetAudience = null } = options;

    const voiceContext = await this.getUserContext(userId);

    const toneInstructions = {
      default: '',
      bold: 'Write with extra boldness and confidence. Take a strong contrarian stance.',
      vulnerable: 'Write with more vulnerability and personal honesty. Share struggles and doubts.',
      'data-driven': 'Lead heavily with specific numbers, statistics, and financial breakdowns.',
      'story-heavy': 'Make this predominantly a personal story with the lesson woven in subtly.',
    };

    const modeInstructions = {
      standard: 'End with a question or engagement CTA.',
      edu_sell: 'CRITICAL: This is an edu-sell post. There must be ZERO call to action. No product mention. No link. No "check out". No "DM me". Just educate. Just be useful. The post ends with a thought-provoking statement or question about the TOPIC, not about your product. This is how you build trust — by giving away your best knowledge for free.',
      launch: 'This is a launch announcement. Create urgency and scarcity. Limited spots. Exclusive access. Time-sensitive.',
      waitlist: 'Drive people to a waitlist. Build curiosity about something they cannot yet buy. Make exclusivity the selling point.',
    };

    const audienceInstruction = targetAudience === 'icp' 
      ? 'TARGET AUDIENCE: ICP (Ideal Client Persona). These are potential BUYERS. Focus on their pain points, the cost of their current approach, and why they need to act.'
      : targetAudience === 'ifp'
      ? 'TARGET AUDIENCE: IFP (Ideal Follower Persona). These are your COMMUNITY. Focus on education, entertainment, relatability. They amplify your reach and build social proof.'
      : '';

    const systemPrompt = `${voiceContext}\n${LINKEDIN_RULES}`;
    const userPrompt = `Generate a single LinkedIn post.
Pillar: ${pillar.toUpperCase()}
Framework: ${framework.toUpperCase()}
${topic ? `Topic/angle: ${topic}` : 'Choose the most compelling topic'}
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}
${toneInstructions[tone] || ''}
${modeInstructions[mode] || modeInstructions.standard}
${audienceInstruction}

Remember: 8-word hook, compelling rehook, broad to narrow to niche structure.
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
    result.mode = mode;
    result.target_audience = targetAudience || result.target_audience;
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

  /**
   * Generate a waitlist nurture email sequence (10 emails, Cleo method)
   * Builds trust over 4 weeks before launch. Emails 1-9 have ZERO sales CTA.
   */
  async generateNurtureSequence(userId, options = {}) {
    const { productName = 'the product', launchDate = null, problemStatement = null, customPrompt = null } = options;

    const voiceContext = await this.getUserContext(userId);
    const systemPrompt = `${voiceContext}\n\n${NURTURE_EMAIL_PROMPT}`;
    const userPrompt = `Generate a 10-email waitlist nurture sequence.

Product: ${productName}
${launchDate ? `Launch date: ${launchDate}` : 'Launch date: 4 weeks from now'}
${problemStatement ? `Core problem we solve: ${problemStatement}` : ''}
${customPrompt ? `Additional context: ${customPrompt}` : ''}

Remember: Emails 1-9 have ZERO sales CTA. Just educate and build trust.
Email 10 is the launch email — short, direct, urgent.

Return as a JSON array of 10 email objects.`;

    const result = await this.callAI(systemPrompt, userPrompt);
    const emails = Array.isArray(result) ? result : [result];

    // Store each email in the linkedin_posts table with type 'nurture'
    const saved = [];
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const insert = await db.query(`
        INSERT INTO linkedin_posts (user_id, hook, body, full_post, post_type, topic_angle, status, notes)
        VALUES ($1, $2, $3, $4, 'nurture', $5, 'draft', $6)
        RETURNING id
      `, [
        userId,
        email.subject || `Email ${i + 1}`,
        email.body || '',
        `Subject: ${email.subject || ''}\n\n${email.body || ''}`,
        email.purpose || `Nurture email ${i + 1}`,
        JSON.stringify({ email_number: email.email_number || i + 1, send_day: email.send_day, has_cta: email.has_cta, preview_text: email.preview_text })
      ]);
      email.id = insert.rows[0].id;
      saved.push(email);
    }

    return { emails: saved, total: saved.length };
  }

  /**
   * Generate a webinar/LinkedIn Live preparation pack (Cleo method)
   * Announcement post, reminder post, topic outline, demo script, pitch framework, follow-up post
   */
  async generateWebinarPrep(userId, options = {}) {
    const { topic, productName = null, webinarDate = null, customPrompt = null } = options;

    if (!topic) throw new Error('topic required for webinar prep');

    const voiceContext = await this.getUserContext(userId);
    const systemPrompt = `${voiceContext}\n${LINKEDIN_RULES}\n\n${WEBINAR_PREP_PROMPT}`;
    const userPrompt = `Generate a complete LinkedIn Live / webinar preparation pack.

Topic for the 20-minute education section: ${topic}
${productName ? `Product to demo: ${productName}` : ''}
${webinarDate ? `Date: ${webinarDate}` : 'Date: next week'}
${customPrompt ? `Additional context: ${customPrompt}` : ''}

Remember the 20-20-20 structure: educate → demo → pitch.
Return as valid JSON.`;

    const result = await this.callAI(systemPrompt, userPrompt);

    // Store the announcement and follow-up posts
    if (result.announcement_post) {
      const ann = result.announcement_post;
      const insert = await db.query(`
        INSERT INTO linkedin_posts (user_id, hook, rehook, body, full_post, post_type, topic_angle, status)
        VALUES ($1, $2, $3, $4, $5, 'single', $6, 'draft')
        RETURNING id
      `, [userId, ann.hook || '', ann.rehook || '', ann.body || '', ann.full_post || '', `Webinar announcement: ${topic}`]);
      result.announcement_post.id = insert.rows[0].id;
    }

    if (result.followup_post) {
      const fu = result.followup_post;
      const insert = await db.query(`
        INSERT INTO linkedin_posts (user_id, hook, rehook, body, full_post, post_type, topic_angle, status)
        VALUES ($1, $2, $3, $4, $5, 'single', $6, 'draft')
        RETURNING id
      `, [userId, fu.hook || '', fu.rehook || '', fu.body || '', fu.full_post || '', `Webinar follow-up: ${topic}`]);
      result.followup_post.id = insert.rows[0].id;
    }

    return result;
  }

  /**
   * Convenience: Generate an edu-sell post (no CTA, pure education)
   */
  async generateEduSell(userId, options = {}) {
    return this.generatePost(userId, { ...options, mode: 'edu_sell', targetAudience: 'ifp' });
  }

  /**
   * Convenience: Generate a launch post (scarcity, urgency, FOMO)
   */
  async generateLaunchPost(userId, options = {}) {
    return this.generatePost(userId, { ...options, mode: 'launch', pillar: 'sales', targetAudience: 'icp' });
  }

  /**
   * Convenience: Generate a waitlist post (curiosity, exclusivity)
   */
  async generateWaitlistPost(userId, options = {}) {
    return this.generatePost(userId, { ...options, mode: 'waitlist', targetAudience: 'icp' });
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
