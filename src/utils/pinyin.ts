import { pinyin } from 'pinyin-pro';

/**
 * Converts Chinese text into tone-marked Pinyin (e.g. Nǐ hǎo, nǐ jiào shénme míngzi?)
 * Properly formats punctuation, word spacing, and capitalization.
 */
export function getChinesePinyin(text: string): string {
  if (!text || !text.trim()) return '';
  
  // Quick check if text contains Chinese characters (CJK Unified Ideographs: 0x4E00 - 0x9FFF)
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  if (!hasChinese) return '';

  try {
    // Generate pinyin with tone marks
    const rawPinyin = pinyin(text, {
      toneType: 'symbol', // Tone marks like ā, á, ǎ, à
      type: 'string',
      separator: ' ',
      v: true
    });

    if (!rawPinyin) return '';

    // Convert full-width Chinese punctuation to standard punctuation with appropriate spacing
    let formatted = rawPinyin
      .replace(/\s*([，,])\s*/g, ', ')
      .replace(/\s*([。\.])\s*/g, '. ')
      .replace(/\s*([！？!?])\s*/g, (m) => (m.includes('?') || m.includes('？') ? '? ' : '! '))
      .replace(/\s*([、])\s*/g, ', ')
      .replace(/\s*([:：])\s*/g, ': ')
      .replace(/\s*([;；])\s*/g, '; ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Capitalize the first letter of each sentence
    formatted = formatted.replace(/(^\s*|\.\s*|\?\s*|!\s*)([a-z\u00C0-\u024F])/g, (_, p1, p2) => {
      return p1 + p2.toUpperCase();
    });

    return formatted;
  } catch (err) {
    console.error('Error generating pinyin:', err);
    return '';
  }
}
