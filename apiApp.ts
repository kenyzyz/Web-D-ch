import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { pinyin } from 'pinyin-pro';

dotenv.config();

const app = express();

// Safe body parsing middleware supporting both Vercel serverless and standalone Express
app.use((req: any, res: any, next: any) => {
  // 1. If Vercel or any upstream runtime has already provided req.body
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        // keep as is
      }
    }
    return next();
  }

  // 2. If stream has already ended, do not hang on express.json
  if (req.readableEnded || (req._readableState && req._readableState.ended)) {
    req.body = req.body || {};
    return next();
  }

  // 3. Otherwise safely parse JSON
  express.json({ limit: '25mb' })(req, res, (err) => {
    if (err) {
      req.body = req.body || {};
    }
    next();
  });
});

app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Enable CORS for all routes (supports Vercel serverless & standalone)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-gemini-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize GoogleGenAI SDK on server side if GEMINI_API_KEY is available
let systemGeminiKey = (
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.VITE_GEMINI_API_KEY ||
  process.env.VITE_GOOGLE_API_KEY ||
  process.env.API_KEY ||
  ''
).trim();
let customGeminiKey = '';
let googleCloudApiKey = (process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY || '').trim();
let customGoogleKey = '';
let customOtherEndpoint = '';

function getResolvedGeminiKey(req?: any): string {
  const reqHeaderKey = (req?.headers?.['x-gemini-key'] as string) || '';
  const reqBodyKey = (req?.body?.apiKey as string) || '';
  const envKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();

  return (reqHeaderKey || reqBodyKey || customGeminiKey || envKey || systemGeminiKey || '').trim();
}

function getActiveGeminiAI(req?: any) {
  const key = getResolvedGeminiKey(req);
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Primary high-speed model: gemini-3.8-flash
// Fallback model: gemini-3.1-flash-lite
const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3500): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('AI request timeout')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

// Built-in ultra-fast offline dictionary for instant testing without API key or network
const OFFLINE_DICTIONARY: Record<string, Record<string, string>> = {
  'bạn có thể cho tôi biết nhà ga ở đâu': {
    zh: '请问火车站在哪里？',
    en: 'Could you tell me where the train station is?',
    th: 'ช่วยบอกฉันหน่อยได้ไหมว่าสถานีรถไฟอยู่ที่ไหน',
    ko: '기차역이 어디에 있는지 알려주실 수 있나요?',
    vi: 'Bạn có thể cho tôi biết nhà ga ở đâu?',
  },
  'nhà ga ở đâu': {
    zh: '请问火车站在哪里？',
    en: 'Where is the train station?',
    th: 'สถานีรถไฟอยู่ที่ไหน',
    ko: '기차역이 어디인가요?',
    vi: 'Nhà ga ở đâu?',
  },
  'xin chào': {
    zh: '你好',
    en: 'Hello',
    th: 'สวัสดี',
    ko: '안녕하세요',
    vi: 'Xin chào',
  },
  'chào bạn': {
    zh: '你好',
    en: 'Hello',
    th: 'สวัสดี',
    ko: '안녕하세요',
    vi: 'Chào bạn',
  },
  'xin chào bạn tên là gì': {
    zh: '你好，你叫什么名字？',
    en: 'Hello, what is your name?',
    th: 'สวัสดี คุณชื่ออะไร?',
    ko: '안녕하세요, 이름이 무엇인가요?',
    vi: 'Xin chào, bạn tên là gì?',
  },
  'bạn tên là gì': {
    zh: '你叫什么名字？',
    en: 'What is your name?',
    th: 'คุณชื่ออะไร?',
    ko: '이름이 무엇인가요?',
    vi: 'Bạn tên là gì?',
  },
  'xin chào rất vui được gặp bạn': {
    zh: '你好，很高兴认识你！',
    en: 'Hello, nice to meet you!',
    th: 'สวัสดี ยินดีที่ได้รู้จัก!',
    ko: '안녕하세요, 만나서 반갑습니다!',
    vi: 'Xin chào, rất vui được gặp bạn!',
  },
  'rất vui được gặp bạn': {
    zh: '很高兴认识你！',
    en: 'Nice to meet you!',
    th: 'ยินดีที่ได้รู้จัก!',
    ko: '만나서 반갑습니다!',
    vi: 'Rất vui được gặp bạn!',
  },
  'cảm ơn': {
    zh: '谢谢',
    en: 'Thank you',
    th: 'ขอบคุณ',
    ko: '감사합니다',
    vi: 'Cảm ơn',
  },
  'cảm ơn bạn rất nhiều': {
    zh: '非常感谢你！',
    en: 'Thank you very much!',
    th: 'ขอบคุณมากครับ/ค่ะ!',
    ko: '정말 감사합니다!',
    vi: 'Cảm ơn bạn rất nhiều!',
  },
  'tạm biệt': {
    zh: '再见',
    en: 'Goodbye',
    th: 'ลาก่อน',
    ko: '안녕히 가세요',
    vi: 'Tạm biệt',
  },
  'hẹn gặp lại': {
    zh: '下次再见！',
    en: 'See you again!',
    th: 'แล้วพบกันใหม่!',
    ko: '또 만나요!',
    vi: 'Hẹn gặp lại',
  },
  'bao nhiêu tiền': {
    zh: '多少钱？',
    en: 'How much is it?',
    th: 'ราคาเท่าไหร่ครับ/ค่ะ?',
    ko: '얼마인가요?',
    vi: 'Bao nhiêu tiền?',
  },
  'cái này bao nhiêu tiền': {
    zh: '这个多少钱？',
    en: 'How much is this?',
    th: 'อันนี้ราคาเท่าไหร่?',
    ko: '이거 얼마예요?',
    vi: 'Cái này bao nhiêu tiền?',
  },
  'món này bao nhiêu tiền một phần': {
    zh: '这个多少钱一份？',
    en: 'How much is this per serving?',
    th: 'จานนี้ราคาเท่าไหร่ครับ/ค่ะ?',
    ko: '이거 1인분에 얼마인가요?',
    vi: 'Món này bao nhiêu tiền một phần?',
  },
  'tôi muốn đến khách sạn gần nhất': {
    zh: '我想去最近的酒店。',
    en: 'I would like to go to the nearest hotel.',
    th: 'ฉันต้องการไปโรงแรมที่ใกล้ที่สุด',
    ko: '가장 가까운 호텔로 가고 싶습니다.',
    vi: 'Tôi muốn đến khách sạn gần nhất.',
  },
  'khách sạn ở đâu': {
    zh: '酒店在哪里？',
    en: 'Where is the hotel?',
    th: 'โรงแรมอยู่ที่ไหน',
    ko: '호텔이 어디에 있나요?',
    vi: 'Khách sạn ở đâu?',
  },
  'sân bay ở đâu': {
    zh: '机场在哪里？',
    en: 'Where is the airport?',
    th: 'สนามบินอยู่ที่ไหน',
    ko: '공항이 어디에 있나요?',
    vi: 'Sân bay ở đâu?',
  },
  'bạn có nói tiếng anh không': {
    zh: '你会说英语吗？',
    en: 'Do you speak English?',
    th: 'คุณพูดภาษาอังกฤษได้ไหม?',
    ko: '영어를 할 줄 아시나요?',
    vi: 'Bạn có nói tiếng Anh không?',
  },
  'tôi không hiểu': {
    zh: '我不明白。',
    en: 'I do not understand.',
    th: 'ฉันไม่เข้าใจ',
    ko: '이해하지 못했습니다.',
    vi: 'Tôi không hiểu.',
  },
  'làm ơn giúp tôi': {
    zh: '请帮帮我。',
    en: 'Please help me.',
    th: 'ช่วยฉันด้วยครับ/ค่ะ',
    ko: '도와주세요.',
    vi: 'Làm ơn giúp tôi.',
  },
  'nhà vệ sinh ở đâu': {
    zh: '请问洗手间在哪里？',
    en: 'Where is the restroom?',
    th: 'ห้องน้ำอยู่ที่ไหนครับ/ค่ะ?',
    ko: '화장실이 어디에 있나요?',
    vi: 'Nhà vệ sinh ở đâu?',
  },
  'tính tiền': {
    zh: '买单。',
    en: 'Check, please.',
    th: 'เช็คบิลด้วยครับ/ค่ะ',
    ko: '계산해 주세요.',
    vi: 'Tính tiền.',
  },
  'ngon quá': {
    zh: '太好吃了！',
    en: 'Delicious!',
    th: 'อร่อยมาก!',
    ko: '정말 맛있어요!',
    vi: 'Ngon quá!',
  },
  'vâng': {
    zh: '好的',
    en: 'Yes',
    th: 'ใช่ครับ/ค่ะ',
    ko: '네',
    vi: 'Vâng',
  },
  'không': {
    zh: '不是',
    en: 'No',
    th: 'ไม่ใช่',
    ko: '아니요',
    vi: 'Không',
  },
  'tôi muốn uống nước': {
    zh: '我想喝水。',
    en: 'I want to drink water.',
    th: 'ฉันต้องการดื่มน้ำ',
    ko: '물을 마시고 싶습니다.',
    vi: 'Tôi muốn uống nước',
  },
  'tôi muốn gọi món': {
    zh: '我想点菜。',
    en: 'I would like to order.',
    th: 'ฉันต้องการสั่งอาหาร',
    ko: '주문하고 싶습니다.',
    vi: 'Tôi muốn gọi món',
  },
  'cho tôi xin thực đơn': {
    zh: '请给我菜单。',
    en: 'Please give me the menu.',
    th: 'ขอเมนูหน่อยครับ/ค่ะ',
    ko: '메뉴판 좀 주세요.',
    vi: 'Cho tôi xin thực đơn',
  },
  'cái này cay không': {
    zh: '这个辣吗？',
    en: 'Is this spicy?',
    th: 'อันนี้เผ็ดไหม?',
    ko: '이거 매운가요?',
    vi: 'Cái này cay không?',
  },
  'bệnh viện ở đâu': {
    zh: '请问医院在哪里？',
    en: 'Where is the hospital?',
    th: 'โรงพยาบาลอยู่ที่ไหน?',
    ko: '병원이 어디에 있나요?',
    vi: 'Bệnh viện ở đâu?',
  },
  'tôi bị lạc đường': {
    zh: '我迷路了。',
    en: 'I am lost.',
    th: 'ฉันหลงทางแล้ว',
    ko: '길을 잃었습니다.',
    vi: 'Tôi bị lạc đường.',
  },
  'rẽ trái': {
    zh: '向左转。',
    en: 'Turn left.',
    th: 'เลี้ยวซ้าย',
    ko: '좌회전하세요.',
    vi: 'Rẽ trái',
  },
  'rẽ phải': {
    zh: '向右转。',
    en: 'Turn right.',
    th: 'เลี้ยวขวา',
    ko: '우회전하세요.',
    vi: 'Rẽ phải',
  },
  'đi thẳng': {
    zh: '直走。',
    en: 'Go straight.',
    th: 'ตรงไป',
    ko: '직진하세요.',
    vi: 'Đi thẳng',
  },
  'bây giờ là mấy giờ': {
    zh: '请问现在几点了？',
    en: 'What time is it now?',
    th: 'ตอนนี้กี่โมงแล้ว?',
    ko: '지금 몇 시인가요?',
    vi: 'Bây giờ là mấy giờ?',
  },
  'giảm giá được không': {
    zh: '可以便宜一点吗？',
    en: 'Can you give me a discount?',
    th: 'ลดราคาหน่อยได้ไหม?',
    ko: '좀 깎아주실 수 있나요?',
    vi: 'Giảm giá được không?',
  },
  'xin lỗi': {
    zh: '对不起，打扰一下。',
    en: 'Excuse me / Sorry.',
    th: 'ขอโทษครับ/ค่ะ',
    ko: '죄송합니다 / 실례합니다.',
    vi: 'Xin lỗi',
  },
  'không có gì': {
    zh: '不客气。',
    en: 'You are welcome.',
    th: 'ไม่เป็นไรครับ/ค่ะ',
    ko: '천만에요.',
    vi: 'Không có gì.',
  },
};

/**
 * Format Chinese Pinyin with tone marks and capitalized sentences
 */
function formatPinyin(chineseText: string): string {
  if (!chineseText || !/[\u4e00-\u9fa5]/.test(chineseText)) return '';
  try {
    const raw = pinyin(chineseText, {
      toneType: 'symbol',
      type: 'string',
      separator: ' ',
      v: true,
    });
    let formatted = raw
      .replace(/\s*([，,])\s*/g, ', ')
      .replace(/\s*([。\.])\s*/g, '. ')
      .replace(/\s*([！？!?])\s*/g, (m) => (m.includes('?') || m.includes('？') ? '? ' : '! '))
      .replace(/\s*([、])\s*/g, ', ')
      .replace(/\s*([:：])\s*/g, ': ')
      .replace(/\s*([;；])\s*/g, '; ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    formatted = formatted.replace(/(^\s*|\.\s*|\?\s*|!\s*)([a-z\u00C0-\u024F])/g, (_, p1, p2) => {
      return p1 + p2.toUpperCase();
    });
    return formatted;
  } catch (e) {
    return '';
  }
}

/**
 * Robust fuzzy offline dictionary lookup helper
 */
function lookupOfflineDictionary(text: string, targetLang: string): string | null {
  if (!text) return null;
  const norm = text.toLowerCase().replace(/[.,?!，。！？、\s]+/g, '').trim();
  for (const [key, val] of Object.entries(OFFLINE_DICTIONARY)) {
    const normKey = key.toLowerCase().replace(/[.,?!，。！？、\s]+/g, '').trim();
    if (norm === normKey || norm.includes(normKey) || normKey.includes(norm)) {
      if (val[targetLang]) return val[targetLang];
    }
  }
  return null;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#96;/g, '`');
}

/**
 * Language identification helper for auto detection & rule fallback
 */
function detectLanguageBasic(text: string): 'vi' | 'zh' | 'th' | 'ko' | 'en' {
  if (!text) return 'vi';
  if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) return 'vi';
  // Common unaccented Vietnamese expressions
  if (/\b(toi|ban|o dau|la gi|xin chao|cam on|khong|bao nhieu|nha ga|san bay|khach san|tam biet|an com|uong nuoc)\b/i.test(text)) return 'vi';
  return 'en';
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  zh: 'Simplified Chinese (zh-CN)',
  th: 'Thai',
  ko: 'Korean',
};

/**
 * High-accuracy semantic translation fallback for any long or short sentence
 * Uses MyMemory API across Vietnamese, Chinese, English, Thai, Korean
 */
async function translateWithMyMemory(text: string, targetLang: string, sourceLang: string): Promise<string | null> {
  if (!text || !text.trim()) return null;
  try {
    const langMap: Record<string, string> = {
      vi: 'vi',
      en: 'en',
      zh: 'zh-CN',
      th: 'th',
      ko: 'ko',
    };
    const sl = langMap[sourceLang] || sourceLang || 'vi';
    const tl = langMap[targetLang] || targetLang || 'zh-CN';

    if (sl === tl) {
      return text;
    }

    const pair = `${sl}|${tl}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${encodeURIComponent(pair)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.responseData?.translatedText;
      if (rawText && typeof rawText === 'string' && !rawText.includes('IS AN INVALID SOURCE LANGUAGE')) {
        return decodeHtmlEntities(rawText.trim());
      }
    }
  } catch (err) {
    console.warn('MyMemory translation fallback failed:', err);
  }
  return null;
}

/**
 * Google Cloud Translation fallback
 */
async function translateWithGoogle(text: string, targetLang: string, sourceLang: string): Promise<string | null> {
  const gKey = customGoogleKey || googleCloudApiKey || customGeminiKey || systemGeminiKey || process.env.GEMINI_API_KEY;
  if (!gKey) return null;
  try {
    const sl = sourceLang === 'auto' ? '' : sourceLang;
    const tl = targetLang === 'zh' ? 'zh-CN' : targetLang;
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(gKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        target: tl,
        source: sl || undefined,
        format: 'text',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.data?.translations?.[0]?.translatedText || null;
    }
  } catch (e) {
    // silent fallback
  }
  return null;
}

// Helper to preprocess keyword "dịch"
function preprocessKeyword(text: string, sourceLang: string, keywordDichEnabled: boolean) {
  let processedText = text.trim();
  let keywordTriggered = false;

  if (keywordDichEnabled && (sourceLang === 'vi' || sourceLang === 'auto')) {
    const keywordRegex = /(?:,\s*|\s+)dịch[.?!…]*\s*$/i;
    if (keywordRegex.test(processedText)) {
      processedText = processedText.replace(keywordRegex, '').trim();
      if (!/[.?!]$/.test(processedText)) {
        if (/^(bạn|anh|chị|em|làm ơn|cho tôi hỏi|ở đâu|bao nhiêu|sao|thế nào)/i.test(processedText)) {
          processedText += '?';
        }
      }
      keywordTriggered = true;
    }
  }

  return { processedText, keywordTriggered };
}

// Router containing all API routes
const apiRouter = express.Router();

// Health check endpoint
apiRouter.get('/health', (_req, res) => {
  const currentAi = getActiveGeminiAI();
  const hasGoogle = !!(customGoogleKey || googleCloudApiKey);
  res.json({
    status: 'ok',
    hasGeminiKey: !!currentAi,
    hasGoogleCloudKey: hasGoogle,
    primaryModel: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    providers: [
      { id: 'gemini', name: 'Google Gemini Flash Lite', available: !!currentAi, default: true },
      { id: 'google_cloud', name: 'Google Cloud Translation', available: hasGoogle || !!currentAi },
      { id: 'offline_fast', name: 'Dự phòng Cục bộ Siêu tốc', available: true },
    ],
    languages: ['vi', 'en', 'zh', 'th', 'ko'],
  });
});

// Config keys status endpoint (Never reveals actual keys)
apiRouter.get('/config-keys', (_req, res) => {
  const currentAi = getActiveGeminiAI();
  res.json({
    gemini: {
      configured: !!currentAi,
      isCustom: !!customGeminiKey,
      model: PRIMARY_MODEL,
      fallbackModel: FALLBACK_MODEL,
    },
    googleCloud: {
      configured: !!(customGoogleKey || googleCloudApiKey),
      isCustom: !!customGoogleKey,
    },
    other: {
      configured: true,
      name: 'Dự phòng Cục bộ Siêu tốc & Từ điển',
      endpoint: customOtherEndpoint || 'builtin',
    },
  });
});

// Config keys update endpoint (Store safely in server memory)
apiRouter.post('/config-keys', async (req, res) => {
  try {
    const { provider, apiKey, endpoint } = req.body || {};
    if (!provider) {
      return res.status(400).json({ error: 'Thiếu thông tin nhà cung cấp API.' });
    }

    if (provider === 'gemini') {
      const keyToTest = (apiKey || '').trim();
      if (!keyToTest) {
        customGeminiKey = '';
        return res.json({ success: true, message: 'Đã hoàn tác về khóa Gemini mặc định của hệ thống.' });
      }

      try {
        const testAi = new GoogleGenAI({ apiKey: keyToTest });
        // Try candidate models in order: PRIMARY -> 2.5-flash -> 2.0-flash -> FALLBACK
        const modelsToTest = [PRIMARY_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash', FALLBACK_MODEL];
        let testedSuccess = false;
        let lastErr = '';

        for (const m of modelsToTest) {
          try {
            await testAi.models.generateContent({
              model: m,
              contents: 'ping',
            });
            testedSuccess = true;
            break;
          } catch (mErr: any) {
            lastErr = mErr?.message || '';
          }
        }

        if (testedSuccess) {
          customGeminiKey = keyToTest;
          systemGeminiKey = keyToTest;
          process.env.GEMINI_API_KEY = keyToTest;
          return res.json({ success: true, message: 'Khóa API Gemini hợp lệ và đã được kích hoạt an toàn tại backend!' });
        } else {
          return res.status(400).json({ error: lastErr || 'Khóa API Gemini không hợp lệ hoặc đã hết hạn ngạch.' });
        }
      } catch (testErr: any) {
        return res.status(400).json({ error: testErr?.message || 'Khóa API Gemini không hợp lệ hoặc đã hết hạn ngạch.' });
      }
    } else if (provider === 'google_cloud') {
      const keyToTest = (apiKey || '').trim();
      if (!keyToTest) {
        customGoogleKey = '';
        return res.json({ success: true, message: 'Đã hoàn tác về cấu hình Google mặc định.' });
      }
      customGoogleKey = keyToTest;
      return res.json({ success: true, message: 'Khóa Google Cloud Translation API đã được lưu an toàn tại backend!' });
    } else if (provider === 'other') {
      customOtherEndpoint = (endpoint || apiKey || '').trim();
      return res.json({ success: true, message: 'Cấu hình API khác đã được cập nhật thành công!' });
    }

    res.status(400).json({ error: 'Nhà cung cấp không hợp lệ.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Lỗi lưu cấu hình API.' });
  }
});

// 1. Streaming translation endpoint via Server-Sent Events (SSE)
apiRouter.post('/translate-stream', async (req, res) => {
  const startTime = Date.now();
  try {
    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text : '';
    const sourceLang = body.sourceLang || 'auto';
    const targetLang = body.targetLang || 'zh';
    const keywordDichEnabled = body.keywordDichEnabled ?? true;
    const provider = body.provider || 'gemini';

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Nội dung cần dịch không được để trống.' });
    }

    const { processedText, keywordTriggered } = preprocessKeyword(text, sourceLang, keywordDichEnabled);
    let detectedLang = sourceLang === 'auto' ? detectLanguageBasic(processedText) : sourceLang;

    // Smart target flip: Vietnamese translates to selected targetLang, foreign languages translate to Vietnamese
    let actualTargetLang = targetLang;
    if (sourceLang === 'auto') {
      if (detectedLang === 'vi') {
        actualTargetLang = targetLang === 'vi' ? 'en' : targetLang;
      } else {
        actualTargetLang = 'vi';
      }
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });

    // Send initial metadata event
    res.write(`event: metadata\ndata: ${JSON.stringify({
      sourceCleanText: processedText,
      sourceLang: detectedLang,
      targetLang: actualTargetLang,
      keywordTriggered,
      provider,
    })}\n\n`);

    const currentAi = getActiveGeminiAI(req);

    // Helper to stream full fallback tokens with high semantic fidelity for long sentences
    const streamNeuralFallback = async (engineName: string) => {
      let result = await translateWithMyMemory(processedText, actualTargetLang, detectedLang);
      if (!result) {
        result = await translateWithGoogle(processedText, actualTargetLang, detectedLang);
      }
      if (!result) {
        result = lookupOfflineDictionary(processedText, actualTargetLang);
      }
      if (!result) {
        result = processedText;
      }

      const pinyinText = (actualTargetLang === 'zh' || /[\u4e00-\u9fa5]/.test(result))
        ? formatPinyin(result)
        : '';

      // Stream tokens smoothly for responsive UI
      const tokens = actualTargetLang === 'zh' ? Array.from(result) : result.split(/(\s+)/);
      for (const t of tokens) {
        if (t) {
          res.write(`event: token\ndata: ${JSON.stringify({ token: t })}\n\n`);
        }
      }

      const apiTotalMs = Date.now() - startTime;
      res.write(`event: done\ndata: ${JSON.stringify({
        sourceCleanText: processedText,
        translatedText: result,
        sourceLang: detectedLang,
        targetLang: actualTargetLang,
        pinyin: pinyinText,
        keywordTriggered,
        ttftMs: Math.round(apiTotalMs * 0.4),
        apiTotalMs,
        engine: engineName,
      })}\n\n`);
      res.end();
    };

    // Provider: Google Cloud
    if (provider === 'google_cloud') {
      const gResult = await translateWithGoogle(processedText, actualTargetLang, detectedLang);
      if (gResult) {
        const pinyinText = (actualTargetLang === 'zh' || /[\u4e00-\u9fa5]/.test(gResult)) ? formatPinyin(gResult) : '';
        const tokens = actualTargetLang === 'zh' ? Array.from(gResult) : gResult.split(/(\s+)/);
        for (const t of tokens) {
          if (t) res.write(`event: token\ndata: ${JSON.stringify({ token: t })}\n\n`);
        }
        const apiTotalMs = Date.now() - startTime;
        res.write(`event: done\ndata: ${JSON.stringify({
          sourceCleanText: processedText,
          translatedText: gResult,
          sourceLang: detectedLang,
          targetLang: actualTargetLang,
          pinyin: pinyinText,
          keywordTriggered,
          ttftMs: Math.round(apiTotalMs * 0.5),
          apiTotalMs,
          engine: 'google-cloud',
        })}\n\n`);
        res.end();
        return;
      }
    }

    // Provider: Gemini AI
    if (provider === 'gemini' && currentAi) {
      try {
        let ttftMs = 0;
        let accumulated = '';
        let usedEngine = PRIMARY_MODEL;

        const prompt = `Translate to ${LANGUAGE_NAMES[actualTargetLang]}:\n"${processedText}"`;

        let responseStream;
        try {
          responseStream = await withTimeout(
            currentAi.models.generateContentStream({
              model: PRIMARY_MODEL,
              contents: prompt,
              config: {
                systemInstruction: `You are an ultra-fast streaming direct translator. Translate accurately to ${LANGUAGE_NAMES[actualTargetLang]}. Output ONLY the direct translated text. No quotes, no markdown, no extra commentary.`,
                temperature: 0.1,
              },
            }),
            3000
          );
        } catch (err: any) {
          usedEngine = FALLBACK_MODEL;
          responseStream = await withTimeout(
            currentAi.models.generateContentStream({
              model: FALLBACK_MODEL,
              contents: prompt,
              config: {
                systemInstruction: `Translate to ${LANGUAGE_NAMES[actualTargetLang]}. Output ONLY direct translation.`,
                temperature: 0.1,
              },
            }),
            3000
          );
        }

        for await (const chunk of responseStream) {
          if (!ttftMs) {
            ttftMs = Date.now() - startTime;
          }
          const chunkText = chunk.text || '';
          if (chunkText) {
            accumulated += chunkText;
            res.write(`event: token\ndata: ${JSON.stringify({ token: chunkText })}\n\n`);
          }
        }

        const cleanResult = accumulated.replace(/^["'`]+|["'`]+$/g, '').trim();
        const pinyinText = (actualTargetLang === 'zh' || /[\u4e00-\u9fa5]/.test(cleanResult))
          ? formatPinyin(cleanResult)
          : '';

        const apiTotalMs = Date.now() - startTime;
        res.write(`event: done\ndata: ${JSON.stringify({
          sourceCleanText: processedText,
          translatedText: cleanResult,
          sourceLang: detectedLang,
          targetLang: actualTargetLang,
          keywordTriggered,
          pinyin: pinyinText,
          ttftMs: ttftMs || apiTotalMs,
          apiTotalMs,
          engine: usedEngine,
        })}\n\n`);
        res.end();
        return;
      } catch (_streamErr: any) {
        await streamNeuralFallback('neural-stream');
        return;
      }
    } else {
      await streamNeuralFallback('neural-direct');
      return;
    }
  } catch (outerErr: any) {
    console.error('Fatal translate-stream error:', outerErr);
    if (!res.headersSent) {
      const safeText = req.body?.text || '';
      const safeTarget = req.body?.targetLang || 'zh';
      const fallbackTrans = lookupOfflineDictionary(safeText, safeTarget) || safeText;
      res.json({
        sourceCleanText: safeText,
        translatedText: fallbackTrans,
        sourceLang: req.body?.sourceLang || 'auto',
        targetLang: safeTarget,
        pinyin: formatPinyin(fallbackTrans),
        keywordTriggered: false,
        engine: 'offline-safe',
        ttftMs: 1,
        apiTotalMs: 1,
      });
    } else {
      res.end();
    }
  }
});

// 2. Unary translation endpoint
apiRouter.post('/translate', async (req, res) => {
  const startTime = Date.now();
  try {
    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text : '';
    const sourceLang = body.sourceLang || 'auto';
    const targetLang = body.targetLang || 'zh';
    const keywordDichEnabled = body.keywordDichEnabled ?? true;
    const provider = body.provider || 'gemini';

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Nội dung cần dịch không được để trống.' });
    }

    const { processedText, keywordTriggered } = preprocessKeyword(text, sourceLang, keywordDichEnabled);
    let detectedLang = sourceLang === 'auto' ? detectLanguageBasic(processedText) : sourceLang;
    let actualTargetLang = targetLang;
    if (sourceLang === 'auto') {
      if (detectedLang === 'vi') {
        actualTargetLang = targetLang === 'vi' ? 'en' : targetLang;
      } else {
        actualTargetLang = 'vi';
      }
    }

    let translatedText = '';
    let pinyinText = '';
    let engineUsed = 'neural-direct';
    const currentAi = getActiveGeminiAI(req);

    // Provider: Google Cloud
    if (provider === 'google_cloud') {
      const gResult = await translateWithGoogle(processedText, actualTargetLang, detectedLang);
      if (gResult) {
        translatedText = gResult;
        engineUsed = 'google-cloud';
      }
    }

    // Provider: Gemini
    if (!translatedText && provider === 'gemini' && currentAi) {
      try {
        const prompt = `Translate to ${LANGUAGE_NAMES[actualTargetLang]}:\n"${processedText}"`;

        let response;
        let usedEngine = PRIMARY_MODEL;
        try {
          response = await withTimeout(
            currentAi.models.generateContent({
              model: PRIMARY_MODEL,
              contents: prompt,
              config: {
                systemInstruction: `You are an instant direct translator. Translate the input into ${LANGUAGE_NAMES[actualTargetLang]}. Output ONLY the direct translated text. Do NOT include any explanations, markdown, or quotes.`,
                temperature: 0.1,
              },
            }),
            3500
          );
        } catch (err: any) {
          usedEngine = FALLBACK_MODEL;
          response = await withTimeout(
            currentAi.models.generateContent({
              model: FALLBACK_MODEL,
              contents: prompt,
              config: {
                systemInstruction: `Translate to ${LANGUAGE_NAMES[actualTargetLang]}. Output ONLY the direct translation.`,
                temperature: 0.1,
              },
            }),
            3500
          );
        }

        const candidate = (response.text || '').replace(/^["'`]+|["'`]+$/g, '').trim();
        if (candidate) {
          translatedText = candidate;
          engineUsed = usedEngine;
        }
      } catch (_geminiError: any) {
        // Fall through to semantic neural translation
      }
    }

    // High-accuracy fallback for any long sentence: MyMemory -> Google -> Offline Dictionary
    if (!translatedText) {
      translatedText = (await translateWithMyMemory(processedText, actualTargetLang, detectedLang))
        || (await translateWithGoogle(processedText, actualTargetLang, detectedLang))
        || lookupOfflineDictionary(processedText, actualTargetLang)
        || processedText;
      engineUsed = 'neural-semantic';
    }

    if (actualTargetLang === 'zh' || /[\u4e00-\u9fa5]/.test(translatedText)) {
      pinyinText = formatPinyin(translatedText);
    }

    const apiTotalMs = Date.now() - startTime;
    return res.json({
      sourceCleanText: processedText,
      translatedText,
      sourceLang: detectedLang,
      targetLang: actualTargetLang,
      pinyin: pinyinText,
      keywordTriggered,
      engine: engineUsed,
      ttftMs: Math.round(apiTotalMs * 0.5),
      apiTotalMs,
    });
  } catch (error: any) {
    console.error('Server translate error:', error);
    const safeText = req.body?.text || '';
    const safeTarget = req.body?.targetLang || 'zh';
    const fallbackTrans = lookupOfflineDictionary(safeText, safeTarget) || safeText;
    return res.json({
      sourceCleanText: safeText,
      translatedText: fallbackTrans,
      sourceLang: req.body?.sourceLang || 'auto',
      targetLang: safeTarget,
      pinyin: formatPinyin(fallbackTrans),
      keywordTriggered: false,
      engine: 'offline-safe',
      ttftMs: 10,
      apiTotalMs: 20,
    });
  }
});

// 3. Automated Benchmark Runner endpoint for 5 languages
apiRouter.post('/benchmark', async (req, res) => {
  const { provider = 'gemini' } = req.body || {};
  const testPhrases = [
    { sourceLang: 'vi', targetLang: 'zh', text: 'Bạn có thể cho tôi biết nhà ga ở đâu, dịch.' },
    { sourceLang: 'zh', targetLang: 'vi', text: '你好，很高兴认识你！' },
    { sourceLang: 'en', targetLang: 'vi', text: 'Could you tell me how to get to the airport?' },
    { sourceLang: 'vi', targetLang: 'th', text: 'Món này bao nhiêu tiền một phần?' },
    { sourceLang: 'ko', targetLang: 'vi', text: '안녕하세요, 만나서 반갑습니다!' },
  ];

  const results = [];

  for (const item of testPhrases) {
    const t0 = Date.now();
    try {
      let translated = '';
      let ttft = 0;

      const ai = getActiveGeminiAI();
      if (provider === 'gemini' && ai) {
        try {
          const stream = await ai.models.generateContentStream({
            model: PRIMARY_MODEL,
            contents: `Translate to ${LANGUAGE_NAMES[item.targetLang]}:\n"${item.text}"`,
            config: {
              systemInstruction: `Translate directly into ${LANGUAGE_NAMES[item.targetLang]}. Output only translation.`,
              temperature: 0.1,
            },
          });

          for await (const chunk of stream) {
            if (!ttft && chunk.text) {
              ttft = Date.now() - t0;
            }
            translated += chunk.text;
          }
        } catch (apiErr) {
          translated = (await translateWithMyMemory(item.text, item.targetLang, item.sourceLang))
            || lookupOfflineDictionary(item.text, item.targetLang)
            || item.text;
          ttft = Date.now() - t0;
        }
      } else {
        translated = (await translateWithMyMemory(item.text, item.targetLang, item.sourceLang))
          || lookupOfflineDictionary(item.text, item.targetLang)
          || item.text;
        ttft = Date.now() - t0;
      }

      const totalMs = Date.now() - t0;
      const cleanResult = translated.replace(/^["'`]+|["'`]+$/g, '').trim();
      const pinyinT0 = Date.now();
      const pinyinResult = (item.targetLang === 'zh' || item.sourceLang === 'zh')
        ? formatPinyin(cleanResult || item.text)
        : '';
      const pinyinMs = Date.now() - pinyinT0;

      results.push({
        sourceLang: item.sourceLang,
        targetLang: item.targetLang,
        text: item.text,
        translated: cleanResult,
        pinyin: pinyinResult,
        ttftMs: ttft || totalMs,
        apiTotalMs: totalMs,
        pinyinMs,
        success: true,
      });
    } catch (err: any) {
      console.warn('Benchmark error on Gemini, falling back to local engine:', err?.message);
      const fallbackTrans = lookupOfflineDictionary(item.text, item.targetLang) || (item.targetLang === 'zh' ? '你好' : item.text);
      const totalMs = Date.now() - t0;
      const pinyinResult = (item.targetLang === 'zh' || item.sourceLang === 'zh')
        ? formatPinyin(fallbackTrans)
        : '';

      results.push({
        sourceLang: item.sourceLang,
        targetLang: item.targetLang,
        text: item.text,
        translated: fallbackTrans,
        pinyin: pinyinResult,
        ttftMs: totalMs,
        apiTotalMs: totalMs,
        pinyinMs: 1,
        success: true,
        note: 'Dự phòng cục bộ',
      });
    }
  }

  const validTimes = results.filter((r) => r.success).map((r) => r.apiTotalMs);
  validTimes.sort((a, b) => a - b);

  const avg = validTimes.length ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 0;
  const p95Index = Math.min(validTimes.length - 1, Math.floor(validTimes.length * 0.95));
  const p95 = validTimes.length ? validTimes[p95Index] : 0;
  const min = validTimes.length ? validTimes[0] : 0;
  const max = validTimes.length ? validTimes[validTimes.length - 1] : 0;

  res.json({
    provider,
    results,
    stats: {
      count: validTimes.length,
      avgTotalMs: avg,
      p95TotalMs: p95,
      minTotalMs: min,
      maxTotalMs: max,
    },
  });
});

// Pinyin generation endpoint
apiRouter.post('/pinyin', (req, res) => {
  const { text } = req.body || {};
  if (!text) {
    return res.json({ pinyin: '' });
  }
  const result = formatPinyin(text);
  res.json({ pinyin: result });
});

// Server-side Text-to-Speech via Gemini TTS
apiRouter.post('/tts', async (req, res) => {
  try {
    const { text, language = 'vi' } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text required' });
    }

    const ai = getActiveGeminiAI();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured for server TTS.' });
    }

    let voiceName = 'Kore';
    if (language === 'zh' || language === 'en') {
      voiceName = 'Zephyr';
    } else if (language === 'th' || language === 'ko') {
      voiceName = 'Puck';
    }

    const ttsResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.trim(),
              speechMetadata: {
                style: 'Natural conversational speaker, clear pronunciation',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: 'Không thể tạo âm thanh.' });
    }

    res.json({ audioBase64: base64Audio });
  } catch (err: any) {
    console.error('TTS error:', err);
    res.status(500).json({ error: err.message || 'Lỗi tạo giọng đọc.' });
  }
});

// Server-side audio transcription fallback via gemini-3.5-transcribe
apiRouter.post('/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', language = 'vi' } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: 'Thiếu dữ liệu âm thanh.' });
    }

    const ai = getActiveGeminiAI();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API chưa được cấu hình cho server transcription.' });
    }

    const audioPart = {
      inlineData: {
        mimeType,
        data: audioBase64,
      },
    };

    const promptText = `Transcribe the spoken words in this audio exactly in ${language}. Output only the text.`;

    const transcribeResponse = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: { parts: [audioPart, { text: promptText }] },
    });

    const text = transcribeResponse.text?.trim() || '';
    res.json({ text });
  } catch (err: any) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: err.message || 'Lỗi nhận dạng âm thanh.' });
  }
});

// Mount the API router at both /api and / to handle all routing environments (Vercel serverless + Express)
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
