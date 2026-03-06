/**
 * Voice-to-Persona Mapper
 * 
 * Takes a voice profile + manual inputs (chronotype, work_pattern, age, gender)
 * and generates the complete persona that drives all automated behaviour.
 * 
 * Key research backing:
 * - Karat 1999: speech 145 WPM -> typing ~20 WPM (0.14 ratio)
 * - Oulasvirta 2012: smartphone checking 34x/day, 1.5 min avg session
 * - Golder & Macy 2011: circadian mood curves from 509M tweets
 * - Deng 2019: 5-12 app sessions per day
 * - Pew 2023: 8-15 min daily active time on social media
 */

const { logNormalRandom, randomBetween, gaussianRandom } = require('../../utils/humanise');

/**
 * Generate a complete persona from voice profile and demographics.
 */
function generatePersona(voiceProfile, options = {}) {
  const {
    chronotype = 'intermediate',
    work_pattern = 'office_9to5',
    age_bracket = '25-34',
    gender = 'neutral',
  } = options;

  // --- Typing Speed (from speech pace) ---
  const speechWpm = voiceProfile.speech_pace_wpm || 145;
  const baseTypingWpm = Math.round(speechWpm * 0.14);
  const ageModifier = {
    '18-24': 1.15, '25-34': 1.0, '35-44': 0.9, '45-54': 0.8, '55+': 0.7,
  }[age_bracket] || 1.0;
  const typingWpm = Math.round(baseTypingWpm * ageModifier);

  // --- Daily Activity Budget ---
  const dailyActiveMinutes = {
    mean: 12,
    sigma: 3,
    min: 5,
    max: 25,
  };

  // --- Session Config ---
  const sessionsPerDay = {
    mean: work_pattern === 'office_9to5' ? 7 : work_pattern === 'remote_flex' ? 9 : 8,
    sigma: 2,
    min: 3,
    max: 15,
  };
  const sessionDuration = {
    median_seconds: 90,
    sigma: 0.6,
    min_seconds: 30,
    max_seconds: 300,
  };

  // --- Reply Length (from voice profile) ---
  const sentenceLengthMedian = voiceProfile.avg_sentence_length || 14;
  const sentenceLengthSigma = voiceProfile.sentence_length_sigma || 5;

  // --- Emoji Rate ---
  const emojiRate = Math.round(voiceProfile.expressiveness * 0.4 * 100) / 100;

  // --- Scroll-Only Ratio ---
  const scrollOnlyRatio = 0.72;

  // --- Response Type Distribution ---
  const responseTypes = {
    agreement_zinger: 0.15,
    emoji_only: 0.05,
    short_take: 0.25,
    standard: 0.40,
    deep: 0.15,
  };

  if (voiceProfile.uses_fragments > 0.3) {
    responseTypes.agreement_zinger += 0.05;
    responseTypes.standard -= 0.05;
  }
  if (voiceProfile.directness > 0.7) {
    responseTypes.short_take += 0.05;
    responseTypes.deep -= 0.05;
  }
  if (voiceProfile.expressiveness > 0.7) {
    responseTypes.emoji_only += 0.03;
    responseTypes.agreement_zinger -= 0.03;
  }

  // --- Device Switching ---
  const mobileHours = chronotype === 'early_bird' ? [5, 6, 7, 8, 12, 13, 20, 21]
    : chronotype === 'night_owl' ? [9, 10, 12, 13, 14, 22, 23, 0]
    : [7, 8, 12, 13, 18, 19, 20, 21];

  // --- Weekend Modifier ---
  const weekendReduction = 0.4;

  // --- Zero-Activity Days ---
  const zeroDaysPerMonth = randomBetween(1, 4);

  // --- Circadian Curve ---
  const circadianCurve = generateCircadianCurve(chronotype, work_pattern);

  return {
    base_typing_wpm: typingWpm,
    typing_sigma: 0.15,

    daily_active_minutes: dailyActiveMinutes,
    sessions_per_day: sessionsPerDay,
    session_duration: sessionDuration,

    sentence_length_median: sentenceLengthMedian,
    sentence_length_sigma: sentenceLengthSigma,
    emoji_rate: emojiRate,
    scroll_only_ratio: scrollOnlyRatio,
    response_types: responseTypes,

    mobile_hours: mobileHours,
    chronotype,
    work_pattern,
    weekend_reduction: weekendReduction,
    zero_days_per_month: zeroDaysPerMonth,
    circadian_curve: circadianCurve,

    age_bracket,
    gender,

    formality: voiceProfile.formality,
    directness: voiceProfile.directness,
    expressiveness: voiceProfile.expressiveness,
    uses_fragments: voiceProfile.uses_fragments,
  };
}

/**
 * Generate 24-hour circadian energy/mood curve.
 * Based on Golder & Macy 2011 (509M tweets, 84 countries).
 */
function generateCircadianCurve(chronotype, workPattern) {
  const shift = chronotype === 'early_bird' ? -2 : chronotype === 'night_owl' ? 2 : 0;

  const baseCurve = [
    { hour: 0, energy: 0.15, mood: 'tired', length_modifier: 0.4, emoji_boost: 0.0 },
    { hour: 1, energy: 0.05, mood: 'tired', length_modifier: 0.3, emoji_boost: 0.0 },
    { hour: 2, energy: 0.02, mood: 'tired', length_modifier: 0.3, emoji_boost: 0.0 },
    { hour: 3, energy: 0.01, mood: 'tired', length_modifier: 0.3, emoji_boost: 0.0 },
    { hour: 4, energy: 0.02, mood: 'tired', length_modifier: 0.3, emoji_boost: 0.0 },
    { hour: 5, energy: 0.10, mood: 'groggy', length_modifier: 0.4, emoji_boost: 0.0 },
    { hour: 6, energy: 0.25, mood: 'groggy', length_modifier: 0.5, emoji_boost: 0.0 },
    { hour: 7, energy: 0.45, mood: 'focused', length_modifier: 0.7, emoji_boost: 0.0 },
    { hour: 8, energy: 0.60, mood: 'focused', length_modifier: 0.8, emoji_boost: 0.05 },
    { hour: 9, energy: 0.75, mood: 'focused', length_modifier: 0.9, emoji_boost: 0.05 },
    { hour: 10, energy: 0.85, mood: 'focused', length_modifier: 1.1, emoji_boost: 0.1 },
    { hour: 11, energy: 0.80, mood: 'focused', length_modifier: 1.0, emoji_boost: 0.1 },
    { hour: 12, energy: 0.65, mood: 'relaxed', length_modifier: 0.9, emoji_boost: 0.15 },
    { hour: 13, energy: 0.55, mood: 'relaxed', length_modifier: 0.8, emoji_boost: 0.1 },
    { hour: 14, energy: 0.50, mood: 'relaxed', length_modifier: 0.6, emoji_boost: 0.05 },
    { hour: 15, energy: 0.55, mood: 'focused', length_modifier: 0.7, emoji_boost: 0.05 },
    { hour: 16, energy: 0.60, mood: 'focused', length_modifier: 0.7, emoji_boost: 0.05 },
    { hour: 17, energy: 0.55, mood: 'relaxed', length_modifier: 0.8, emoji_boost: 0.1 },
    { hour: 18, energy: 0.65, mood: 'playful', length_modifier: 1.0, emoji_boost: 0.2 },
    { hour: 19, energy: 0.70, mood: 'playful', length_modifier: 1.0, emoji_boost: 0.2 },
    { hour: 20, energy: 0.65, mood: 'playful', length_modifier: 1.1, emoji_boost: 0.15 },
    { hour: 21, energy: 0.50, mood: 'relaxed', length_modifier: 0.9, emoji_boost: 0.1 },
    { hour: 22, energy: 0.35, mood: 'tired', length_modifier: 0.6, emoji_boost: 0.05 },
    { hour: 23, energy: 0.20, mood: 'tired', length_modifier: 0.4, emoji_boost: 0.0 },
  ];

  if (shift !== 0) {
    return baseCurve.map(entry => ({
      ...entry,
      hour: ((entry.hour + shift) + 24) % 24,
    })).sort((a, b) => a.hour - b.hour);
  }

  return baseCurve;
}

module.exports = { generatePersona, generateCircadianCurve };
