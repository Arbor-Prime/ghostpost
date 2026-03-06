/**
 * Ollama System Prompt Builder
 * 
 * Constructs a persona-aware prompt that makes Mistral write
 * as if it IS the customer. Uses voice profile for vocabulary,
 * emotional range, and communication style.
 */

/**
 * Build the system prompt for a reply generation.
 */
function buildSystemPrompt(voiceProfile, persona, circadianTone, replyConfig) {
  const vp = voiceProfile && typeof voiceProfile === 'object' ? voiceProfile : {};
  const ct = circadianTone && typeof circadianTone === 'object' ? circadianTone : { energy: 0.5, mood: 'relaxed', emoji_boost: 0 };
  const {
    responseType,
    targetWordCount,
    tweetContent,
    tweetAuthor,
    tweetTopic,
  } = replyConfig;

  const formality = Math.round((Number(vp.formality) || 0.5) * 10);
  const directness = Math.round((Number(vp.directness) || 0.5) * 10);
  const energy = Math.round((Number(ct.energy) || 0.5) * 10);

  const emotionalRange = vp.emotional_range || {};
  const emotionLines = Object.entries(emotionalRange)
    .map(([key, val]) => `${key}: ${Math.round(val * 10)}/10`)
    .join(', ');

  const signatureWords = (vp.signature_words || []).join(', ');
  const antiWords = (vp.anti_words || []).join(', ');
  const primaryTopics = (vp.primary_topics || []).join(', ');
  const excitementTriggers = (vp.emotional_triggers?.excitement || []).join(', ');
  const frustrationTriggers = (vp.emotional_triggers?.frustration || []).join(', ');
  const offLimits = (vp.off_limits || []).join(', ');

  // Emoji rule based on energy + expressiveness
  const expressiveness = Number(vp.expressiveness) || 0.5;
  let emojiRule = 'NO emojis';
  if (expressiveness > 0.5 && (Number(ct.energy) || 0.5) > 0.5) {
    emojiRule = 'ONE emoji MAX, only if it fits naturally';
  }
  if (expressiveness > 0.7 && (Number(ct.emoji_boost) || 0) > 0.1) {
    emojiRule = 'Emoji OK if natural, max 2';
  }

  // Profanity rule
  const profanityRule = vp.format_prefs?.swearing
    ? 'Mild profanity OK if it fits the moment'
    : 'NO profanity';

  return `=== WHO YOU ARE ===
${vp.summary_quote || 'You communicate naturally in your own style.'}
Topics you know: ${primaryTopics || 'general topics'}
What excites you: ${excitementTriggers || 'interesting ideas'}
What frustrates you: ${frustrationTriggers || 'nothing specific'}

=== HOW YOU TALK ===
Formality: ${formality}/10
Directness: ${directness}/10
Words you USE: ${signatureWords || 'your natural vocabulary'}
Words you NEVER use: ${antiWords || 'corporate jargon'}
Emotional style: ${emotionLines || 'balanced'}

=== RIGHT NOW ===
Time mood: ${ct.mood}
Energy: ${energy}/10

=== THIS REPLY ===
Response type: ${responseType}
Target length: ${targetWordCount} words (HARD LIMIT — do not exceed)
${responseType === 'agreement_zinger' ? 'Write 1-3 words ONLY. Examples: "This." "100%" "Bang on" "Absolutely"' : ''}
${responseType === 'emoji_only' ? 'Reply with EXACTLY one emoji. Nothing else.' : ''}

=== TWEET YOU ARE REPLYING TO ===
Author: @${tweetAuthor}
Content: "${tweetContent}"
${tweetTopic ? `Topic: ${tweetTopic}` : ''}

=== HARD RULES ===
1. Write EXACTLY as this person would — match their vocabulary and rhythm
2. Use signature words naturally when they fit
3. NEVER use any of the anti-words listed above
4. Reference something SPECIFIC from the tweet — no generic responses
5. ${emojiRule}
6. ${profanityRule}
7. NO hashtags
8. NO URLs
9. NO "I think" or "In my opinion" openers — just state it
10. Do NOT sound like AI. No "Great point!" No "This is so important!" No "Absolutely love this!"
11. Write the reply and NOTHING ELSE — no explanations, no alternatives
${offLimits ? `12. NEVER mention or reference: ${offLimits}` : ''}`;
}

module.exports = { buildSystemPrompt };
