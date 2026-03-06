/**
 * Dynamic Reply Length Calculator
 * 
 * Generates natural reply lengths from the persona's voice profile,
 * NOT from fixed word counts. Each reply length is unique.
 * 
 * Research backing:
 * - Schwartz 2013: sentence length is strongest personality marker
 * - Ng & Carley 2025: uniform tweet length is #1 bot signature
 * - V3 Research: 18-28 word average but huge individual variance
 */

const { logNormalRandom, randomBetween } = require('../../utils/humanise');

/** Default response type weights when persona is incomplete */
const DEFAULT_RESPONSE_TYPES = { agreement_zinger: 0.15, emoji_only: 0.05, short_take: 0.25, standard: 0.40, deep: 0.15 };

/**
 * Select a response type based on persona weights.
 */
function selectResponseType(persona, hour, circadianTone, threadContext = {}) {
  const responseTypes = (persona?.response_types && typeof persona.response_types === 'object')
    ? persona.response_types
    : DEFAULT_RESPONSE_TYPES;
  const weights = { ...DEFAULT_RESPONSE_TYPES, ...responseTypes };
  // Ensure all weights are numbers
  for (const k of Object.keys(weights)) {
    const v = weights[k];
    weights[k] = typeof v === 'number' && !isNaN(v) ? v : (DEFAULT_RESPONSE_TYPES[k] ?? 0.2);
  }

  const energy = Number(circadianTone?.energy);
  const safeEnergy = !isNaN(energy) ? energy : 0.5;

  // Energy modifiers
  if (safeEnergy < 0.3) {
    weights.agreement_zinger += 0.1;
    weights.emoji_only += 0.05;
    weights.deep -= 0.1;
    weights.standard -= 0.05;
  }
  if (safeEnergy > 0.7) {
    weights.standard += 0.05;
    weights.deep += 0.05;
    weights.agreement_zinger -= 0.05;
    weights.emoji_only -= 0.05;
  }

  // Thread context modifiers
  if (threadContext.isHotDebate) {
    weights.deep += 0.1;
    weights.agreement_zinger -= 0.1;
  }
  if (threadContext.isQuickAgreement) {
    weights.agreement_zinger += 0.15;
    weights.deep -= 0.1;
    weights.standard -= 0.05;
  }

  // Normalise weights
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const safeTotal = total > 0 && !isNaN(total) ? total : 1;
  const normalised = {};
  for (const [key, val] of Object.entries(weights)) {
    const v = typeof val === 'number' && !isNaN(val) ? val : 0;
    normalised[key] = Math.max(0, v) / safeTotal;
  }

  // Weighted random selection
  const roll = Math.random();
  let cumulative = 0;
  for (const [type, weight] of Object.entries(normalised)) {
    cumulative += weight;
    if (roll <= cumulative) return type;
  }
  return 'standard';
}

/**
 * Calculate target reply length in words.
 */
function calculateReplyLength(persona, responseType, circadianTone, threadContext = {}) {
  const ranges = {
    agreement_zinger: { min: 1, max: 3 },
    emoji_only: { min: 0, max: 0 },
    short_take: { min: 4, max: 8 },
    standard: { min: 10, max: 25 },
    deep: { min: 25, max: 46 },
  };

  if (responseType === 'emoji_only') return 0;
  if (responseType === 'agreement_zinger') return randomBetween(1, 3);

  // Log-normal sentence length from persona
  const median = Number(persona?.sentence_length_median);
  const sigma = Number(persona?.sentence_length_sigma);
  const safeMedian = !isNaN(median) && median > 0 ? median : 14;
  const safeSigma = !isNaN(sigma) && sigma > 0 ? sigma : 5;
  const cv = safeSigma / safeMedian;
  const sentLen = logNormalRandom(safeMedian, Math.min(1, Math.max(0.1, cv)));

  // Number of sentences
  let numSentences;
  if (responseType === 'short_take') {
    numSentences = 1;
  } else if (responseType === 'standard') {
    numSentences = Math.random() < 0.6 ? 1 : 2;
  } else {
    numSentences = randomBetween(2, 4);
  }

  let totalWords = Math.round(sentLen * numSentences);

  // Circadian modifier
  const lengthMod = Number(circadianTone?.length_modifier);
  const safeLengthMod = !isNaN(lengthMod) && lengthMod > 0 ? lengthMod : 1.0;
  totalWords = Math.round(totalWords * safeLengthMod);

  // Thread context modifiers
  if (threadContext.isHotDebate) totalWords = Math.round(totalWords * 1.3);
  if (threadContext.parentLength && threadContext.parentLength < 20) {
    totalWords = Math.round(totalWords * 0.7);
  }

  // Clamp to response type range
  const range = ranges[responseType];
  return Math.max(range.min, Math.min(range.max, totalWords));
}

module.exports = { selectResponseType, calculateReplyLength };
