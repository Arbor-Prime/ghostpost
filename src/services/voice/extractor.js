/**
 * Voice Profile NLP Extractor
 * 
 * Takes a transcription and extracts communication patterns:
 * 1. Vocabulary — signature words, anti-words, lexical richness
 * 2. Communication style — formality, directness, expressiveness
 * 3. Topics & interests — what they talk about, what excites/frustrates them
 * 4. Emotional range — humour, passion, sarcasm, vulnerability
 * 5. Formatting preferences — fragments, emoji tendency, caps usage
 * 
 * Uses: natural (tokenization, frequency), compromise (sentence splitting, POS),
 *        Ollama/Mistral (semantic extraction for topics and anti-words)
 */

const natural = require('natural');
const nlp = require('compromise');

const tokenizer = new natural.WordTokenizer();

/**
 * Run full NLP extraction on a voice transcription.
 * 
 * @param {string} text - The transcribed voice recording
 * @param {string} ollamaUrl - Ollama API endpoint (usually http://localhost:11434)
 * @returns {Object} Complete voice profile
 */
async function extractVoiceProfile(text, ollamaUrl = 'http://localhost:11434') {
  console.log('[Voice Extractor] Starting NLP extraction, transcript length:', text.length);

  // --- Stage 1: Vocabulary ---
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const totalWords = tokens.length;
  const uniqueWords = new Set(tokens);
  const totalUniqueWords = uniqueWords.size;

  // TF-IDF to find signature words (high frequency relative to general English)
  // MUST create fresh instance per call — module-level TfIdf leaks between users
  const tfidf = new natural.TfIdf();
  tfidf.addDocument(text.toLowerCase());
  const tfidfScores = [];
  tfidf.listTerms(0).forEach(item => {
    if (item.term.length > 3) {
      tfidfScores.push({ word: item.term, score: item.tfidf });
    }
  });
  tfidfScores.sort((a, b) => b.score - a.score);
  const signatureWords = tfidfScores.slice(0, 15).map(s => s.word);
  console.log('[Voice Extractor] Signature words extracted:', signatureWords.length);

  // Anti-words via Ollama (words this person would NEVER use)
  const antiWords = await extractAntiWords(text, ollamaUrl);
  console.log('[Voice Extractor] Anti-words extracted:', antiWords.length);

  // --- Stage 2: Communication Style ---
  const doc = nlp(text);
  const sentences = doc.sentences().out('array');
  const sentenceLengths = sentences.map(s => tokenizer.tokenize(s).length);

  const avgSentenceLength = sentenceLengths.length > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 10;
  const sentenceLengthSigma = sentenceLengths.length > 0
    ? Math.sqrt(
        sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgSentenceLength, 2), 0) / sentenceLengths.length
      )
    : 5;

  // Formality (0-1): contractions reduce formality, complex words increase it
  const contractions = (text.match(/\b(don't|can't|won't|isn't|I'm|I've|they're|we're|it's|that's|there's|what's|how's)\b/gi) || []).length;
  const contractionRate = sentences.length > 0 ? contractions / sentences.length : 0;
  const avgWordLength = totalWords > 0 ? tokens.reduce((sum, t) => sum + t.length, 0) / totalWords : 4;
  const formality = Math.max(0, Math.min(1, (avgWordLength - 3) / 3 - contractionRate * 0.3));

  // Directness (0-1): hedge words reduce, assertions increase
  const hedges = (text.match(/\b(maybe|perhaps|kind of|sort of|I think|I guess|probably|might|could be|not sure)\b/gi) || []).length;
  const assertions = (text.match(/\b(definitely|absolutely|clearly|obviously|always|never|must|certainly)\b/gi) || []).length;
  const hedgeRate = sentences.length > 0 ? hedges / sentences.length : 0;
  const assertRate = sentences.length > 0 ? assertions / sentences.length : 0;
  const directness = Math.max(0, Math.min(1, 0.5 + (assertRate - hedgeRate) * 2));

  // Expressiveness (0-1): exclamations, intensifiers, emotional words
  const exclamations = (text.match(/!/g) || []).length;
  const intensifiers = (text.match(/\b(really|very|so|super|incredibly|amazingly|absolutely|totally)\b/gi) || []).length;
  const expressiveness = sentences.length > 0
    ? Math.max(0, Math.min(1, (exclamations + intensifiers) / sentences.length * 0.3))
    : 0.3;

  // Fragment detection (sentences <= 4 words)
  const fragmentCount = sentenceLengths.filter(len => len <= 4).length;
  const usesFragments = sentences.length > 0 ? fragmentCount / sentences.length : 0;

  // --- Stage 3: Topics & Interests (via Ollama) ---
  const topicsAndEmotions = await extractTopicsAndEmotions(text, ollamaUrl);

  // --- Stage 4: Emotional Range ---
  const emotionalRange = await extractEmotionalRange(text, ollamaUrl);

  // --- Stage 5: Formatting Preferences ---
  const formatPrefs = {
    emoji_tendency: expressiveness > 0.6 ? 'frequent' : expressiveness > 0.3 ? 'moderate' : 'rare',
    sentence_style: avgSentenceLength < 10 ? 'punchy' : avgSentenceLength < 18 ? 'conversational' : 'elaborate',
    hashtag_use: 'rarely',
    caps_for_emphasis: !!(text.match(/[A-Z]{3,}/g) || []).length,
    swearing: !!(text.match(/\b(fuck|shit|damn|hell|ass|crap|bloody)\b/gi) || []).length,
  };

  // --- Build summary quote ---
  const summaryQuote = await generateSummaryQuote(text, ollamaUrl);

  console.log('[Voice Extractor] ✓ NLP extraction complete:', {
    signature_words: signatureWords.length,
    anti_words: antiWords.length,
    primary_topics: topicsAndEmotions.primary_topics.length,
    secondary_topics: topicsAndEmotions.secondary_topics.length,
    has_emotional_range: !!emotionalRange,
    has_summary: !!summaryQuote
  });

  return {
    signature_words: signatureWords,
    anti_words: antiWords,
    formality: Math.round(formality * 10) / 10,
    directness: Math.round(directness * 10) / 10,
    expressiveness: Math.round(expressiveness * 10) / 10,
    avg_sentence_length: Math.round(avgSentenceLength * 10) / 10,
    sentence_length_sigma: Math.round(sentenceLengthSigma * 10) / 10,
    uses_fragments: Math.round(usesFragments * 100) / 100,
    primary_topics: topicsAndEmotions.primary_topics,
    secondary_topics: topicsAndEmotions.secondary_topics,
    emotional_triggers: topicsAndEmotions.emotional_triggers,
    emotional_range: emotionalRange,
    off_limits: topicsAndEmotions.off_limits,
    format_prefs: formatPrefs,
    speech_pace_wpm: null, // Calculated in profile-builder.js from duration
    summary_quote: summaryQuote,
    total_words: totalWords,
    total_unique_words: totalUniqueWords,
  };
}

// --- Ollama Helper Functions ---

async function ollamaGenerate(prompt, ollamaUrl) {
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral',
      prompt,
      stream: false,
      options: { temperature: 0.3 },
    }),
  });
  const data = await response.json();
  return data.response || '';
}

async function extractAntiWords(text, ollamaUrl) {
  const prompt = `Based on this person's speech style, list 10-15 words or phrases they would NEVER use. 
These should be words that would feel completely wrong coming from this person — corporate jargon, 
overly formal language, slang they'd never touch, etc.

Their speech:
"${text.substring(0, 2000)}"

Return ONLY a JSON array of strings, nothing else. Example: ["synergy","leverage","utilize","bespoke"]`;

  try {
    const response = await ollamaGenerate(prompt, ollamaUrl);
    const match = response.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.warn('[Voice Extractor] Anti-words: No JSON array found in Ollama response');
      console.warn('[Voice Extractor] Response was:', response.substring(0, 200));
    }
    return match ? JSON.parse(match[0]) : [];
  } catch (err) {
    console.error('[Voice Extractor] Anti-words extraction failed:', err.message);
    return ['synergy', 'leverage', 'utilize', 'bespoke', 'circle back', 'deep dive'];
  }
}

async function extractTopicsAndEmotions(text, ollamaUrl) {
  const prompt = `Analyze this person's speech and extract their interests and emotional triggers.

Their speech:
"${text.substring(0, 2000)}"

Return ONLY valid JSON with this exact structure:
{
  "primary_topics": ["topic1", "topic2", "topic3"],
  "secondary_topics": ["topic1", "topic2"],
  "emotional_triggers": {
    "excitement": ["what excites them"],
    "frustration": ["what frustrates them"]
  },
  "off_limits": ["topics they explicitly avoid or seem uncomfortable with"]
}`;

  try {
    const response = await ollamaGenerate(prompt, ollamaUrl);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('[Voice Extractor] Topics/Emotions: No JSON object found in Ollama response');
      console.warn('[Voice Extractor] Response was:', response.substring(0, 200));
    }
    const parsed = match ? JSON.parse(match[0]) : null;
    if (parsed) {
      console.log('[Voice Extractor] Topics extracted:', {
        primary: parsed.primary_topics?.length || 0,
        secondary: parsed.secondary_topics?.length || 0,
        excitement: parsed.emotional_triggers?.excitement?.length || 0,
        frustration: parsed.emotional_triggers?.frustration?.length || 0,
        off_limits: parsed.off_limits?.length || 0
      });
    }
    return parsed || {
      primary_topics: [], secondary_topics: [],
      emotional_triggers: { excitement: [], frustration: [] },
      off_limits: [],
    };
  } catch (err) {
    console.error('[Voice Extractor] Topics/Emotions extraction failed:', err.message);
    return {
      primary_topics: [], secondary_topics: [],
      emotional_triggers: { excitement: [], frustration: [] },
      off_limits: [],
    };
  }
}

async function extractEmotionalRange(text, ollamaUrl) {
  const prompt = `Rate this person's emotional communication style based on their speech.

Their speech:
"${text.substring(0, 2000)}"

Return ONLY valid JSON with scores from 0.0 to 1.0:
{
  "humour": 0.0,
  "passion": 0.0,
  "supportive": 0.0,
  "sarcasm": 0.0,
  "vulnerability": 0.0
}`;

  try {
    const response = await ollamaGenerate(prompt, ollamaUrl);
    const match = response.match(/\{[\s\S]*?\}/);
    if (!match) {
      console.warn('[Voice Extractor] Emotional range: No JSON object found in Ollama response');
      console.warn('[Voice Extractor] Response was:', response.substring(0, 200));
    }
    const parsed = match ? JSON.parse(match[0]) : null;
    if (parsed) {
      console.log('[Voice Extractor] Emotional range extracted:', parsed);
    }
    return parsed || {
      humour: 0.3, passion: 0.5, supportive: 0.3, sarcasm: 0.2, vulnerability: 0.2,
    };
  } catch (err) {
    console.error('[Voice Extractor] Emotional range extraction failed:', err.message);
    return { humour: 0.3, passion: 0.5, supportive: 0.3, sarcasm: 0.2, vulnerability: 0.2 };
  }
}

async function generateSummaryQuote(text, ollamaUrl) {
  const prompt = `Write a single sentence (max 20 words) that captures how this person communicates. 
Write it in second person, like "You're a direct, technical communicator who leads with facts."

Their speech:
"${text.substring(0, 2000)}"

Return ONLY the sentence, nothing else.`;

  try {
    const summary = (await ollamaGenerate(prompt, ollamaUrl)).trim().replace(/^"|"$/g, '');
    console.log('[Voice Extractor] Summary quote generated:', summary.substring(0, 100));
    return summary;
  } catch (err) {
    console.error('[Voice Extractor] Summary quote generation failed:', err.message);
    return 'You communicate naturally with your own unique style.';
  }
}

module.exports = { extractVoiceProfile };
