/**
 * Voice Filler Stripper
 * 
 * Takes a raw Whisper transcription full of natural speech noise
 * and strips it down to clean signal while PRESERVING personality markers.
 * 
 * What gets REMOVED:
 * - Hesitation fillers: um, uh, er, erm, ah, hmm
 * - Discourse padding: "you know", "basically", "literally", "I mean"
 * - False starts: "I was going to — well actually" → keeps final version
 * - Exact repetitions: "it was it was really good" → "it was really good"
 * - Trailing filler: "so yeah" at end of sentences
 * - Whisper artifacts: [inaudible], [music], (laughs), *coughs*
 * 
 * What gets KEPT (personality markers):
 * - Signature vocabulary: "honestly", "mate", "proper", "class", "sorted"
 * - Emotional intensifiers: "absolutely", "genuinely", "literally" when emphatic
 * - Swearing: preserved for voice profile accuracy
 * - Sentence rhythm: short punchy sentences stay short
 * - Regional dialect: nowt, owt, summat, innit, etc.
 */

// Words that are ALWAYS filler (context-independent)
const HARD_FILLERS = new Set([
  'um', 'uh', 'er', 'erm', 'ah', 'uhh', 'umm', 'hmm', 'hm',
  'mm', 'mmm', 'ahh', 'ehh', 'urm',
]);

// Phrases that are usually filler but need context checking
const SOFT_FILLER_PHRASES = [
  /\byou know\b(?!\s+what|\s+who|\s+how|\s+when|\s+where|\s+why)/gi,
  /\bI mean\b(?=\s*,|\s+like|\s+you|\s+it's|\s+I)/gi,
  /\bbasically\b(?=\s*,|\s+it|\s+the|\s+I|\s+we|\s+what)/gi,
  /\blike\b(?=\s*,\s|\s+you\s+know|\s+I\s+was|\s+um)/gi,
  /\bsort of\b(?=\s*,|\s+like)/gi,
  /\bkind of\b(?=\s*,|\s+like)/gi,
  /\bright\b(?=\s*,\s|\s*\?|\s+so\b|\s+and\b)/gi,
  /\byeah\s+so\b/gi,
  /\bso\s+yeah\b(?:\s*[.!]?\s*$)/gim,
  /\band\s+stuff\b(?:\s*[.!]?\s*$)/gim,
  /\bor\s+whatever\b(?:\s*[.!]?\s*$)/gim,
  /\band\s+things?\s+like\s+that\b/gi,
  /\byou\s+know\s+what\s+I\s+mean\b/gi,
  /\bif\s+that\s+makes\s+sense\b/gi,
  /\bdo\s+you\s+know\s+what\s+I\s+mean\b/gi,
];

// Whisper transcription artifacts
const WHISPER_ARTIFACTS = [
  /\[(?:inaudible|music|laughter|applause|silence|noise|crosstalk)\]/gi,
  /\((?:laughs?|coughs?|sighs?|clears?\s+throat|sniffs?|pauses?)\)/gi,
  /\*(?:laughs?|coughs?|sighs?)\*/gi,
  /\.{4,}/g,  // excessive dots
];

// False start patterns: "I was going to — well" → detect the restart
const FALSE_START_PATTERNS = [
  // "I was — I mean I was" → keep second attempt
  /\b(I\s+\w+)\s*[-–—]\s*(?:I\s+mean\s+)?(\1)/gi,
  // "The thing is — well the thing is" → keep second
  /\b(the\s+\w+\s+\w+)\s*[-–—]\s*(?:well\s+)?(\1)/gi,
  // General: "X — well actually Y" → keep Y
  /\b\w+(?:\s+\w+){0,3}\s*[-–—]\s*(?:well\s+)?(?:actually\s+)?(?=\w)/gi,
];

/**
 * Strip filler from a raw transcription.
 * 
 * @param {string} rawText - Whisper output
 * @returns {{ cleaned: string, stats: Object }}
 */
function stripFillers(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { cleaned: '', stats: { original_words: 0, cleaned_words: 0, removed_percent: 0 } };
  }

  let text = rawText;
  let removedCount = 0;
  const originalWords = text.split(/\s+/).filter(w => w.length > 0).length;

  // Stage 1: Remove Whisper artifacts
  for (const pattern of WHISPER_ARTIFACTS) {
    text = text.replace(pattern, ' ');
  }

  // Stage 2: Remove hard fillers (standalone words)
  text = text.replace(/\b\w+\b/g, (word) => {
    if (HARD_FILLERS.has(word.toLowerCase())) {
      removedCount++;
      return '';
    }
    return word;
  });

  // Stage 3: Remove soft filler phrases
  for (const pattern of SOFT_FILLER_PHRASES) {
    text = text.replace(pattern, (match) => {
      removedCount += match.split(/\s+/).length;
      return '';
    });
  }

  // Stage 4: Remove exact consecutive repetitions
  // "it was it was" → "it was"
  // "the the" → "the"
  text = text.replace(/\b(\w+(?:\s+\w+){0,3})\s+\1\b/gi, '$1');

  // Stage 5: Clean up resulting mess
  text = text
    .replace(/\s*,\s*,+/g, ',')      // double commas
    .replace(/\s*\.\s*\./g, '.')       // double periods
    .replace(/,\s*\./g, '.')           // comma before period
    .replace(/\s{2,}/g, ' ')           // multiple spaces
    .replace(/^\s*[,.\s]+/gm, '')      // leading punctuation on lines
    .replace(/\s+([.,!?])/g, '$1')     // space before punctuation
    .trim();

  // Stage 6: Rebuild sentence structure
  // Capitalize first letter of each sentence
  text = text.replace(/(^|[.!?]\s+)(\w)/g, (_, pre, letter) => pre + letter.toUpperCase());

  const cleanedWords = text.split(/\s+/).filter(w => w.length > 0).length;
  const removedPercent = originalWords > 0 
    ? Math.round((1 - cleanedWords / originalWords) * 100) 
    : 0;

  return {
    cleaned: text,
    stats: {
      original_words: originalWords,
      cleaned_words: cleanedWords,
      removed_percent: removedPercent,
      filler_density: originalWords > 0 ? Math.round(removedCount / originalWords * 100) : 0,
    },
  };
}

module.exports = { stripFillers };
