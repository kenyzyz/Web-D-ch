export type LanguageCode = 'vi' | 'en' | 'zh' | 'th' | 'ko';

export interface LanguageInfo {
  code: LanguageCode;
  bcp47: string;
  name: string;
  nativeName: string;
  flag: string;
  samplePhrases: string[];
}

export const SUPPORTED_LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  vi: {
    code: 'vi',
    bcp47: 'vi-VN',
    name: 'Tiếng Việt',
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳',
    samplePhrases: [
      'Bạn có thể cho tôi biết nhà ga ở đâu, dịch.',
      'Xin chào, rất vui được gặp bạn!',
      'Món này bao nhiêu tiền một phần?',
      'Làm ơn cho tôi hỏi đường đến sân bay gần nhất.'
    ]
  },
  zh: {
    code: 'zh',
    bcp47: 'zh-CN',
    name: 'Tiếng Trung',
    nativeName: '普通话',
    flag: '🇨🇳',
    samplePhrases: [
      '请问火车站在哪里？',
      '你好，很高兴认识你！',
      '这个多少钱一份？',
      '请问去最近的机场怎么走？'
    ]
  },
  en: {
    code: 'en',
    bcp47: 'en-US',
    name: 'Tiếng Anh',
    nativeName: 'English',
    flag: '🇺🇸',
    samplePhrases: [
      'Could you tell me where the train station is?',
      'Hello, nice to meet you!',
      'How much is this per serving?',
      'Could you tell me how to get to the nearest airport?'
    ]
  },
  th: {
    code: 'th',
    bcp47: 'th-TH',
    name: 'Tiếng Thái',
    nativeName: 'ภาษาไทย',
    flag: '🇹🇭',
    samplePhrases: [
      'ช่วยบอกฉันหน่อยได้ไหมว่าสถานีรถไฟอยู่ที่ไหน',
      'สวัสดี ยินดีที่ได้รู้จัก!',
      'จานนี้ราคาเท่าไหร่ครับ/ค่ะ?',
      'ช่วยบอกทางไปสนามบินที่ใกล้ที่สุดหน่อยได้ไหม'
    ]
  },
  ko: {
    code: 'ko',
    bcp47: 'ko-KR',
    name: 'Tiếng Hàn',
    nativeName: '한국어',
    flag: '🇰🇷',
    samplePhrases: [
      '기차역이 어디에 있는지 알려주실 수 있나요?',
      '안녕하세요, 만나서 반갑습니다!',
      '이거 1인분에 얼마인가요?',
      '가장 가까운 공항으로 가는 길을 알려주시겠어요?'
    ]
  }
};

export type AppMode = 'two_way' | 'auto_detect' | 'conversation';

export type SystemStatus = 
  | 'idle' 
  | 'listening' 
  | 'recognizing' 
  | 'translating' 
  | 'speaking' 
  | 'error';

export type ApiProvider = 'gemini' | 'google_cloud' | 'offline_fast';

export interface LatencyBreakdown {
  id: string;
  timestamp: number;
  sourceLang: LanguageCode | 'auto';
  targetLang: LanguageCode;
  textLength: number;
  provider: ApiProvider;
  sttMs: number;          // Speech-to-Text recognition time
  apiSendMs: number;      // Request network flight time
  ttftMs: number;         // Time To First Token (streaming)
  apiTotalMs: number;     // Full translation response time
  pinyinMs: number;       // Pinyin computation latency
  ttsStartMs: number;     // TTS audio preparation & start
  totalE2EMs: number;     // Total end-to-end latency
}

export interface AggregatedStats {
  count: number;
  avgTotalMs: number;
  p95TotalMs: number;
  minTotalMs: number;
  maxTotalMs: number;
  avgTtftMs: number;
  avgSttMs: number;
  avgPinyinMs: number;
  avgTtsMs: number;
}

export interface TranslateRequest {
  text: string;
  sourceLang: LanguageCode | 'auto';
  targetLang: LanguageCode;
  keywordDichEnabled?: boolean;
  provider?: ApiProvider;
}

export interface TranslateResponse {
  sourceCleanText: string;
  translatedText: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  pinyin?: string;
  keywordTriggered?: boolean;
  engine?: string;
  ttftMs?: number;
  apiTotalMs?: number;
}

export interface ConversationMessage {
  id: string;
  timestamp: number;
  speaker: 'user_a' | 'user_b';
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  originalText: string;
  translatedText: string;
  pinyin?: string;
  keywordTriggered?: boolean;
  latencyBreakdown?: LatencyBreakdown;
}

export interface AppSettings {
  autoSpeak: boolean;
  keywordDichEnabled: boolean;
  speechRate: number; // 0.8, 1.0, 1.2
  voiceEngine: 'browser' | 'gemini_fallback';
  apiProvider: ApiProvider;
  enableStreaming: boolean;
  quickSilenceTimeoutMs: number; // default 650ms for low latency
  allowBargeIn: boolean; // Barge-in interrupt
}
