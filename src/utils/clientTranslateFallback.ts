import { LanguageCode } from '../types/translator';
import { getChinesePinyin } from './pinyin';

const CLIENT_OFFLINE_DICTIONARY: Record<string, Record<string, string>> = {
  'xin chào': { zh: '你好', en: 'Hello', th: 'สวัสดี', ko: '안녕하세요', vi: 'Xin chào' },
  'chào bạn': { zh: '你好', en: 'Hello', th: 'สวัสดี', ko: '안녕하세요', vi: 'Chào bạn' },
  'cảm ơn': { zh: '谢谢', en: 'Thank you', th: 'ขอบคุณ', ko: '감사합니다', vi: 'Cảm ơn' },
  'cảm ơn bạn': { zh: '谢谢你', en: 'Thank you', th: 'ขอบคุณครับ/ค่ะ', ko: '감사합니다', vi: 'Cảm ơn bạn' },
  'tạm biệt': { zh: '再见', en: 'Goodbye', th: 'ลาก่อน', ko: '안녕히 가세요', vi: 'Tạm biệt' },
  'hẹn gặp lại': { zh: '下次再见！', en: 'See you again!', th: 'แล้วพบกันใหม่!', ko: '또 만나요!', vi: 'Hẹn gặp lại' },
  'bao nhiêu tiền': { zh: '多少钱？', en: 'How much is it?', th: 'ราคาเท่าไหร่?', ko: '얼마인가요?', vi: 'Bao nhiêu tiền?' },
  'cái này bao nhiêu tiền': { zh: '这个多少钱？', en: 'How much is this?', th: 'อันนี้ราคาเท่าไหร่?', ko: '이거 얼마예요?', vi: 'Cái này bao nhiêu tiền?' },
  'nhà vệ sinh ở đâu': { zh: '请问洗手间在哪里？', en: 'Where is the restroom?', th: 'ห้องน้ำอยู่ที่ไหน?', ko: '화장실이 어디에 있나요?', vi: 'Nhà vệ sinh ở đâu?' },
  'nhà ga ở đâu': { zh: '请问火车站在哪里？', en: 'Where is the train station?', th: 'สถานีรถไฟอยู่ที่ไหน', ko: '기차역이 어디인가요?', vi: 'Nhà ga ở đâu?' },
  'khách sạn ở đâu': { zh: '酒店在哪里？', en: 'Where is the hotel?', th: 'โรงแรมอยู่ที่ไหน', ko: '호텔이 어디에 있나요?', vi: 'Khách sạn ở đâu?' },
  'sân bay ở đâu': { zh: '机场在哪里？', en: 'Where is the airport?', th: 'สนามบินอยู่ที่ไหน', ko: '공항이 어디에 있나요?', vi: 'Sân bay ở đâu?' },
  'tính tiền': { zh: '买单。', en: 'Check, please.', th: 'เช็คบิลด้วยครับ/ค่ะ', ko: '계산해 주세요.', vi: 'Tính tiền.' },
  'làm ơn giúp tôi': { zh: '请帮帮我。', en: 'Please help me.', th: 'ช่วยฉันด้วย', ko: '도와주세요.', vi: 'Làm ơn giúp tôi.' },
  'tôi không hiểu': { zh: '我不明白。', en: 'I do not understand.', th: 'ฉันไม่เข้าใจ', ko: '이해하지 못했습니다.', vi: 'Tôi không hiểu.' },
  'vâng': { zh: '好的', en: 'Yes', th: 'ใช่', ko: '네', vi: 'Vâng' },
  'không': { zh: '不是', en: 'No', th: 'ไม่ใช่', ko: '아니요', vi: 'Không' },
};

function lookupClientOfflineDict(text: string, targetLang: string): string | null {
  const norm = text.toLowerCase().replace(/[.,?!，。！？、\s]+/g, '').trim();
  for (const [key, val] of Object.entries(CLIENT_OFFLINE_DICTIONARY)) {
    const normKey = key.toLowerCase().replace(/[.,?!，。！？、\s]+/g, '').trim();
    if (norm === normKey || norm.includes(normKey) || normKey.includes(norm)) {
      if (val[targetLang]) return val[targetLang];
    }
  }
  return null;
}

/**
 * Direct client-side translation fallback that runs directly in the browser
 * if the backend API is unreachable or experiences network errors.
 */
export async function directClientTranslateFallback(
  text: string,
  sourceLang: LanguageCode | 'auto',
  targetLang: LanguageCode
): Promise<{ text: string; pinyin: string; engine: string }> {
  const clean = text.trim();
  if (!clean) return { text: '', pinyin: '', engine: 'empty' };

  // 1. Check client offline dictionary first (instant 1ms)
  const dictHit = lookupClientOfflineDict(clean, targetLang);
  if (dictHit) {
    return {
      text: dictHit,
      pinyin: targetLang === 'zh' ? getChinesePinyin(dictHit) : '',
      engine: 'client-offline-dictionary',
    };
  }

  const sLang = sourceLang === 'auto' ? 'vi' : sourceLang;
  const langMap: Record<string, string> = {
    vi: 'vi',
    zh: 'zh-CN',
    en: 'en',
    th: 'th',
    ko: 'ko',
  };

  const sl = langMap[sLang] || sLang;
  const tl = langMap[targetLang] || targetLang;

  // 2. Query public Google Translate client API
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(gtxUrl);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.[0])) {
        const fullTranslation = data[0].map((item: any) => item?.[0] || '').join('').trim();
        if (fullTranslation) {
          return {
            text: fullTranslation,
            pinyin: targetLang === 'zh' ? getChinesePinyin(fullTranslation) : '',
            engine: 'client-direct-neural',
          };
        }
      }
    }
  } catch (e) {
    // try MyMemory
  }

  // 3. Query MyMemory fallback
  try {
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${encodeURIComponent(`${sl}|${tl}`)}`;
    const res = await fetch(mmUrl);
    if (res.ok) {
      const data = await res.json();
      const raw = data?.responseData?.translatedText;
      if (raw && typeof raw === 'string' && !raw.includes('INVALID SOURCE')) {
        return {
          text: raw.trim(),
          pinyin: targetLang === 'zh' ? getChinesePinyin(raw) : '',
          engine: 'client-mymemory',
        };
      }
    }
  } catch (e) {
    // fallback to original text
  }

  return {
    text: clean,
    pinyin: targetLang === 'zh' ? getChinesePinyin(clean) : '',
    engine: 'client-fallback-echo',
  };
}
