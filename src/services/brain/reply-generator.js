/**
 * Reply Generator
 * 
 * Takes a scored opportunity and generates a draft reply using Ollama.
 * The draft goes to the approval queue — NEVER posted automatically.
 */

const { selectResponseType, calculateReplyLength } = require('./reply-length');
const { buildSystemPrompt } = require('./prompt-builder');
const db = require('../../config/database');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Socket.io instance — set by server.js via setSchedulerIo or directly
let _io = null;
function setIo(ioInstance) { _io = ioInstance; }
function emit(event, data) { if (_io) _io.emit(event, data); }

/**
 * Generate a draft reply for an opportunity.
 */
async function generateReply(userId, opportunityId) {
  console.log('[Draft Gen] Starting - userId:', userId, 'oppId:', opportunityId);

  // Normalize IDs (API may send strings)
  const uid = parseInt(userId, 10);
  const oid = parseInt(opportunityId, 10);
  if (isNaN(uid) || isNaN(oid)) {
    throw new Error(`Invalid IDs: userId=${userId}, opportunityId=${opportunityId}`);
  }

  // Get user data
  const userResult = await db.query(
    'SELECT voice_profile, persona FROM users WHERE id = $1',
    [uid]
  );
  if (!userResult.rows[0]) throw new Error(`User ${uid} not found`);
  const { voice_profile: rawVoice, persona: rawPersona } = userResult.rows[0];
  const voiceProfile = (typeof rawVoice === 'object' && rawVoice !== null) ? rawVoice : { summary_quote: 'You communicate naturally.', formality: 0.5, directness: 0.5, expressiveness: 0.5 };
  const persona = (typeof rawPersona === 'object' && rawPersona !== null) ? rawPersona : {
    response_types: { agreement_zinger: 0.15, emoji_only: 0.05, short_take: 0.25, standard: 0.40, deep: 0.15 },
    sentence_length_median: 14,
    sentence_length_sigma: 5,
  };

  // Get opportunity + tweet
  const oppResult = await db.query(
    `SELECT o.*, ot.content as tweet_content, ot.author_handle, ot.likes_count, ot.replies_count
     FROM opportunities o
     JOIN observed_tweets ot ON ot.tweet_id = o.tweet_id
     WHERE o.id = $1`,
    [oid]
  );
  const opportunity = oppResult.rows[0];
  if (!opportunity) throw new Error(`Opportunity ${oid} not found`);
  console.log('[Draft Gen] Opportunity:', JSON.stringify({ id: opportunity.id, tweet_content: opportunity.tweet_content?.slice(0, 80) }));

  // Get current circadian tone
  const currentHour = new Date().getHours();
  const toneResult = await db.query(
    'SELECT * FROM circadian_tones WHERE user_id = $1 AND hour = $2',
    [uid, currentHour]
  );
  const rawTone = toneResult.rows[0];
  const circadianTone = rawTone ? {
    energy: Number(rawTone.energy) || 0.5,
    mood: rawTone.mood || 'relaxed',
    length_modifier: Number(rawTone.length_modifier) || 1.0,
    emoji_boost: Number(rawTone.emoji_boost) || 0,
  } : { energy: 0.5, mood: 'relaxed', length_modifier: 1.0, emoji_boost: 0 };

  // Thread context
  const threadContext = {
    parentLength: opportunity.tweet_content.split(/\s+/).length,
    isHotDebate: !!opportunity.tweet_content.match(/\b(disagree|wrong|debate|controversial)\b/i),
    isQuickAgreement: !!(opportunity.tweet_content.match(/\b(right|exactly|agree|true)\b/i) && opportunity.tweet_content.split(/\s+/).length < 15),
  };

  // Select response type and calculate length
  const responseType = selectResponseType(persona, currentHour, circadianTone, threadContext);
  const targetWordCount = calculateReplyLength(persona, responseType, circadianTone, threadContext);

  // Handle emoji-only responses without Ollama
  if (responseType === 'emoji_only') {
    const emojis = ['\uD83D\uDD25', '\uD83D\uDCAF', '\uD83D\uDE02', '\uD83D\uDC4F', '\uD83C\uDFAF', '\uD83D\uDCAA', '\uD83D\uDE4C', '\u2764\uFE0F', '\uD83D\uDC40', '\u26A1'];
    const replyText = emojis[Math.floor(Math.random() * emojis.length)];

    const draftId = await storeDraft(uid, oid, replyText, responseType, targetWordCount, 0, circadianTone, '', '');
    await db.query("UPDATE opportunities SET status = 'drafted' WHERE id = $1", [oid]);
    return { draftId, replyText, responseType, targetWordCount, actualWordCount: 0 };
  }

  // Handle agreement zingers without Ollama
  if (responseType === 'agreement_zinger') {
    const zingers = ['This.', '100%', 'Bang on.', 'Absolutely.', 'Facts.', 'Nailed it.', 'Spot on.', 'Exactly this.', 'Hard agree.', 'Real talk.'];
    const replyText = zingers[Math.floor(Math.random() * zingers.length)];

    const draftId = await storeDraft(uid, oid, replyText, responseType, targetWordCount, replyText.split(/\s+/).length, circadianTone, '', '');
    await db.query("UPDATE opportunities SET status = 'drafted' WHERE id = $1", [oid]);
    return { draftId, replyText, responseType, targetWordCount, actualWordCount: replyText.split(/\s+/).length };
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(voiceProfile, persona, circadianTone, {
    responseType,
    targetWordCount,
    tweetContent: opportunity.tweet_content,
    tweetAuthor: opportunity.author_handle,
    tweetTopic: opportunity.scoring_reasons?.relevance?.detail,
  });

  // Call Ollama
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral',
      system: systemPrompt,
      prompt: `Write a reply to this tweet. Follow ALL the rules above. Write ONLY the reply text, nothing else.\n\nTweet: "${opportunity.tweet_content}"`,
      stream: false,
      options: {
        temperature: 0.8,
        top_p: 0.9,
        num_predict: Math.max(50, Math.min(150, (targetWordCount || 20) * 3)),
      },
    }),
  });

  const data = await response.json();
  let replyText = (data.response || '').trim();

  // Clean up: remove quotes, explanations, prefixes
  replyText = replyText
    .replace(/^["']|["']$/g, '')
    .replace(/^(Here'?s?\s*(my|a|the)\s*reply:?\s*)/i, '')
    .replace(/^(Reply:?\s*)/i, '')
    .replace(/\n.*/s, '')
    .trim();

  // Enforce hard word limit
  const words = replyText.split(/\s+/);
  if (words.length > targetWordCount + 5) {
    replyText = words.slice(0, targetWordCount).join(' ');
  }

  const actualWordCount = replyText.split(/\s+/).length;

  // Store draft
  const draftId = await storeDraft(
    uid, oid, replyText, responseType,
    targetWordCount, actualWordCount, circadianTone, systemPrompt, data.response
  );

  // Update opportunity status
  await db.query("UPDATE opportunities SET status = 'drafted' WHERE id = $1", [oid]);

  emit('draft:generated', { userId: uid, draftId, opportunityId: oid, persona: circadianTone.mood });

  console.log(`[Brain] Draft ${draftId}: "${replyText}" (${responseType}, ${actualWordCount}/${targetWordCount} words, ${circadianTone.mood} mood)`);

  return { draftId, replyText, responseType, targetWordCount, actualWordCount };
}

async function storeDraft(userId, opportunityId, replyText, responseType, targetWordCount, actualWordCount, circadianTone, systemPrompt, rawResponse) {
  const result = await db.query(
    `INSERT INTO drafts (user_id, opportunity_id, reply_text, response_type, target_word_count, actual_word_count, circadian_mood, energy_level, system_prompt, raw_ollama_response, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
     RETURNING id`,
    [userId, opportunityId, replyText, responseType, targetWordCount, actualWordCount, circadianTone.mood, circadianTone.energy, systemPrompt, rawResponse || '']
  );
  return result.rows[0].id;
}

module.exports = { generateReply, setIo };
