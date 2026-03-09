/**
 * GhostPost AI Outreach Service
 * 
 * Handles chat commands from the GhostPost Computer:
 * - "find cafes in Nottingham" → browser searches Instagram
 * - "draft a DM for this business" → generates personalised message
 * - "what Dojo products suit a pub?" → product knowledge lookup
 * 
 * Uses xAI (Grok) for fast chat/DM generation
 * Ollama/Mistral stays for background voice profile processing
 */

const fs = require('fs');
const path = require('path');
const db = require('../../config/database');

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_MODEL = 'grok-3-mini';

// Load Dojo knowledge
const dojoKnowledge = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/dojo-knowledge.json'), 'utf-8')
);

/**
 * Fast AI generation via xAI (Grok). Falls back to Ollama if no key.
 * 
 * SAFETY: This is for CHAT ASSISTANT ONLY — answering questions,
 * intent detection, product lookups, navigation commands.
 * NEVER for content that represents the user to another person.
 */
async function aiGenerate(prompt, options = {}) {
  const { temperature = 0.5, maxTokens = 500 } = options;

  if (XAI_API_KEY) {
    // xAI — fast cloud
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'xAI API error');
    return data.choices?.[0]?.message?.content || '';
  }

  // Fallback: Ollama local
  return ollamaGenerate(prompt, temperature);
}

/**
 * Ollama-only generation. Used for ALL content that represents the user.
 * 
 * SAFETY: DMs, replies, outreach messages — anything sent to another person
 * MUST go through Ollama. This keeps content generation local, controlled
 * by Voice DNA, emotional state, and circadian persona.
 * Grok NEVER writes content that leaves the system.
 */
async function ollamaGenerate(prompt, temperature = 0.7) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral',
      prompt,
      stream: false,
      options: { temperature },
    }),
  });
  const data = await response.json();
  return data.response || '';
}

/**
 * Process a chat message from the user.
 * Returns an AI response + optional browser action.
 */
async function processChat(userId, message, ollamaUrl = 'http://localhost:11434') {
  const msg = message.toLowerCase().trim();

  // Get user's voice profile for DM generation
  const userResult = await db.query(
    'SELECT name, voice_profile FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  const voiceProfile = user?.voice_profile || {};

  // Detect intent
  const intent = detectIntent(msg);

  switch (intent.type) {
    case 'search_prospects':
      return await handleSearchProspects(userId, intent, ollamaUrl);

    case 'draft_dm':
      return await handleDraftDM(userId, intent, voiceProfile, ollamaUrl);

    case 'product_info':
      return handleProductInfo(intent);

    case 'sector_info':
      return handleSectorInfo(intent);

    case 'qualify_business':
      return handleQualifyBusiness(intent);

    case 'general':
    default:
      return await handleGeneral(userId, message, voiceProfile, ollamaUrl);
  }
}

/**
 * Detect what the user wants to do from their message.
 */
function detectIntent(msg) {
  // Search patterns
  const searchPatterns = [
    /(?:find|search|look for|show me|get)\s+(.+?)\s+(?:in|near|around|from)\s+(.+)/i,
    /(?:find|search)\s+(.+)/i,
  ];
  for (const pattern of searchPatterns) {
    const match = msg.match(pattern);
    if (match) {
      // Strip filler words from category
      let category = match[1]?.trim() || '';
      category = category.replace(/^(me|us|some|a few|all|all the|the)\s+/gi, '');
      category = category.replace(/\s+(me|us|some|a few|please)$/gi, '');
      category = category.trim();

      return {
        type: 'search_prospects',
        category,
        location: match[2]?.trim() || 'Nottingham',
      };
    }
  }

  // DM draft patterns
  if (/(?:draft|write|compose|create)\s+(?:a\s+)?(?:dm|message|outreach)/i.test(msg)) {
    return { type: 'draft_dm', target: msg };
  }

  // Product info
  if (/(?:what|which|tell me about)\s+(?:dojo\s+)?(?:product|machine|terminal|funding|pricing)/i.test(msg)) {
    return { type: 'product_info', query: msg };
  }

  // Sector info
  const sectorMatch = msg.match(/(?:what|how|pitch)\s+(?:do we|should I|to)\s+(?:pitch|sell|offer)\s+(?:to\s+)?(?:a\s+)?(.+)/i);
  if (sectorMatch) {
    return { type: 'sector_info', sector: sectorMatch[1].trim() };
  }

  // Qualify a business
  if (/(?:can we|is|does|would)\s+(?:dojo\s+)?(?:accept|support|work with|onboard)/i.test(msg)) {
    return { type: 'qualify_business', query: msg };
  }

  return { type: 'general', query: msg };
}

/**
 * Handle "find cafes in Nottingham" type commands.
 * Returns browser action to search Instagram/Google.
 */
async function handleSearchProspects(userId, intent, ollamaUrl) {
  const { category, location } = intent;

  // Match against Dojo sectors
  const sectorMatch = findSectorMatch(category);
  const isProhibited = checkProhibited(category);

  if (isProhibited) {
    return {
      response: `${category} is a prohibited category for Dojo. We can't onboard businesses in that sector. Try a different category.`,
      browserAction: null,
    };
  }

  const searchQuery = `${category} ${location}`;
  const platform = 'instagram';

  // Store as a campaign
  await db.query(
    `INSERT INTO campaigns (user_id, platform, name, target_category, target_location, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW())
     ON CONFLICT DO NOTHING`,
    [userId, platform, `${category} in ${location}`, category, location]
  );

  const sectorInfo = sectorMatch
    ? `\n\nSector: **${sectorMatch.label}**\nLead with: ${sectorMatch.lead_products.map(p => dojoKnowledge.products[p]?.name).join(', ')}\nPain points: ${sectorMatch.pain_points.join(', ')}`
    : '';

  return {
    response: `Searching for ${category} in ${location} on Instagram.${sectorInfo}\n\nI'll navigate to the search now. Once you find a business profile, tell me to "draft a DM" and I'll write a personalised message.`,
    browserAction: {
      type: 'navigate',
      url: `https://www.google.co.uk/search?q=${encodeURIComponent(`${category} ${location} instagram`)}&hl=en&gl=uk`,
    },
  };
}

/**
 * Generate a personalised DM for a prospect.
 */
async function handleDraftDM(userId, intent, voiceProfile, ollamaUrl) {
  // Get the most recent campaign for context
  const campaign = await db.query(
    'SELECT target_category, target_location FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  const cat = campaign.rows[0]?.target_category || 'business';
  const loc = campaign.rows[0]?.target_location || 'your area';
  const sectorMatch = findSectorMatch(cat);

  // Build the prompt
  const antiWords = (voiceProfile.anti_words || []).join(', ');
  const sigWords = (voiceProfile.signature_words || []).join(', ');
  const style = voiceProfile.formality < 0.4 ? 'casual and conversational' : voiceProfile.formality < 0.7 ? 'friendly but professional' : 'professional';
  const directness = voiceProfile.directness > 0.6 ? 'direct and to the point' : 'warm and approachable';

  const products = sectorMatch
    ? sectorMatch.lead_products.map(p => dojoKnowledge.products[p]?.name + ' — ' + dojoKnowledge.products[p]?.description).join('\n')
    : 'Dojo Go card machine — portable with receipt printer, Wi-Fi and 4G';

  const painPoints = sectorMatch
    ? sectorMatch.pain_points.join('\n')
    : 'High fees, slow payouts, locked into contracts';

  const openerAngles = sectorMatch
    ? sectorMatch.opener_angles.join('\n')
    : 'Reference something specific about their business';

  const prompt = `You are writing a cold outreach DM on Instagram to a ${cat} in ${loc}.

VOICE STYLE:
- Tone: ${style}, ${directness}
- Words to USE naturally: ${sigWords || 'none specified'}
- Words to NEVER use: ${antiWords || 'synergy, leverage, utilize, bespoke'}
- Swearing: ${voiceProfile.format_prefs?.swearing ? 'acceptable occasionally' : 'no'}
- Sentence style: ${voiceProfile.format_prefs?.sentence_style || 'conversational'}

DOJO PRODUCTS TO MENTION:
${products}

KEY SELLING POINTS:
- Next-day payouts 7 days a week including weekends
- We cover exit fees up to £3,000 when switching
- 30-day trial, no commitment
- Business funding available (£1k-£1M)

THEIR PAIN POINTS:
${painPoints}

OPENER APPROACH:
${openerAngles}

RULES:
1. NO links in the first message (Instagram flags this as spam)
2. Reference something SPECIFIC about their business (you'll need to make up a plausible detail since we don't have their profile yet)
3. Keep it under 150 words
4. Must feel like a real human typed it, not a template
5. End with a soft question, not a hard sell
6. Use British English

Write ONLY the DM text, nothing else.`;

  try {
    // SAFETY: Content creation ALWAYS through Ollama — controlled by Voice DNA
    // Grok NEVER writes content that gets sent to another person
    let dm = await ollamaGenerate(prompt, 0.7);

    // Clean up any markdown or quotes
    dm = dm.replace(/^["']|["']$/g, '').replace(/^#+\s*/gm, '').trim();

    // Store as draft
    await db.query(
      `INSERT INTO outreach_messages (user_id, platform, message_text, pitch_angle, status, created_at)
       VALUES ($1, 'instagram', $2, $3, 'draft', NOW())`,
      [userId, dm, cat]
    );

    return {
      response: `Here's a draft DM for a ${cat} in ${loc}:\n\n---\n${dm}\n---\n\nSay "approve" to queue it for sending, "edit" to adjust, or "draft another" for a different version.`,
      browserAction: null,
    };
  } catch (err) {
    return {
      response: `Failed to generate DM: ${err.message}. Is Ollama running?`,
      browserAction: null,
    };
  }
}

/**
 * Product info lookup.
 */
function handleProductInfo(intent) {
  const products = Object.values(dojoKnowledge.products)
    .map(p => `**${p.name}** (${p.type}) — ${p.description}. ${p.price}`)
    .join('\n\n');

  return {
    response: `Dojo's full product range:\n\n${products}\n\nKey selling points:\n${dojoKnowledge.selling_points.map(s => `• ${s}`).join('\n')}`,
    browserAction: null,
  };
}

/**
 * Sector-specific pitch advice.
 */
function handleSectorInfo(intent) {
  const sector = findSectorMatch(intent.sector);
  if (!sector) {
    return {
      response: `I don't have a specific pitch guide for "${intent.sector}". Try: cafe, pub, barber, mechanic, retail, hotel, dentist, takeaway, bakery, or grocery.`,
      browserAction: null,
    };
  }

  const products = sector.lead_products.map(p => dojoKnowledge.products[p]?.name).join(', ');
  const extras = (sector.extras || []).map(p => dojoKnowledge.products[p]?.name).join(', ');

  return {
    response: `**Pitching to: ${sector.label}**\n\nLead with: ${products}\nAlso mention: ${extras}\n\nPain points to address:\n${sector.pain_points.map(p => `• ${p}`).join('\n')}\n\nOpener ideas:\n${sector.opener_angles.map(a => `• ${a}`).join('\n')}\n\nRemember: card machine is always the lead. Funding applies to every business.`,
    browserAction: null,
  };
}

/**
 * Check if a business type is Dojo-prohibited.
 */
function handleQualifyBusiness(intent) {
  const query = intent.query.toLowerCase();
  const prohibited = dojoKnowledge.prohibited_categories.find(c =>
    query.includes(c.toLowerCase())
  );
  if (prohibited) {
    return {
      response: `**Prohibited.** "${prohibited}" is on Dojo's prohibited list. We cannot onboard this type of business.`,
      browserAction: null,
    };
  }

  const review = dojoKnowledge.review_categories.find(c =>
    query.includes(c.toLowerCase())
  );
  if (review) {
    return {
      response: `**Review required.** "${review}" needs extra documentation for Dojo underwriting. We can still pitch them, but flag that additional info will be needed during onboarding.`,
      browserAction: null,
    };
  }

  return {
    response: `Based on Dojo's acceptance guide, this looks like a supported category. Green light to prospect.`,
    browserAction: null,
  };
}

/**
 * General AI conversation with Dojo context.
 */
async function handleGeneral(userId, message, voiceProfile, ollamaUrl) {
  const prompt = `You are GhostPost AI, a sales assistant for Dojo payment solutions. You help payment consultants find and message potential business customers.

You know everything about Dojo's products:
${JSON.stringify(dojoKnowledge.products, null, 2).substring(0, 1500)}

Key selling points: ${dojoKnowledge.selling_points.join('. ')}

The user is a Dojo Payment Consultant prospecting businesses in Nottingham and East Midlands.

Available commands you can suggest:
- "find [category] in [location]" — search for businesses on Instagram
- "draft a DM" — write a personalised outreach message
- "what products suit a [sector]?" — get pitch guidance
- "can Dojo accept [business type]?" — check if supported

User message: ${message}

Respond helpfully and concisely. British English. No corporate jargon.`;

  try {
    const result = await aiGenerate(prompt, { temperature: 0.5, maxTokens: 400 });
    return {
      response: result.trim() || 'Sorry, I couldn\'t process that.',
      browserAction: null,
    };
  } catch (err) {
    return {
      response: `AI is not responding: ${err.message}`,
      browserAction: null,
    };
  }
}

// ── Helper Functions ──

function findSectorMatch(query) {
  if (!query) return null;
  const q = query.toLowerCase();
  for (const [key, sector] of Object.entries(dojoKnowledge.sector_pitches)) {
    if (sector.keywords.some(kw => q.includes(kw))) {
      return { key, ...sector };
    }
  }
  return null;
}

function checkProhibited(query) {
  if (!query) return false;
  const q = query.toLowerCase();
  return dojoKnowledge.prohibited_categories.some(c => q.includes(c.toLowerCase()));
}

module.exports = { processChat, detectIntent, findSectorMatch, checkProhibited };
