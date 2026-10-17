import { LanguageCode, ApiProvider, LatencyBreakdown } from '../types/translator';
import { getChinesePinyin } from './pinyin';

export interface StreamTranslationParams {
  text: string;
  sourceLang: LanguageCode | 'auto';
  targetLang: LanguageCode;
  keywordDichEnabled?: boolean;
  provider?: ApiProvider;
  enableStreaming?: boolean;
  onMetadata?: (meta: { sourceCleanText: string; sourceLang: LanguageCode; keywordTriggered: boolean }) => void;
  onToken?: (token: string, currentFullText: string, pinyin: string, ttftMs: number) => void;
  onDone?: (result: {
    sourceCleanText: string;
    translatedText: string;
    pinyin: string;
    sourceLang: LanguageCode;
    targetLang: LanguageCode;
    keywordTriggered: boolean;
    breakdown: Omit<LatencyBreakdown, 'sttMs' | 'ttsStartMs' | 'totalE2EMs'>;
  }) => void;
  onError?: (err: Error) => void;
}

/**
 * Performs low-latency streaming translation via SSE or fallback unary
 */
export async function streamTranslate({
  text,
  sourceLang,
  targetLang,
  keywordDichEnabled = true,
  provider = 'gemini',
  enableStreaming = true,
  onMetadata,
  onToken,
  onDone,
  onError,
}: StreamTranslationParams): Promise<void> {
  const t0 = Date.now();
  let firstTokenTime = 0;
  let accumulated = '';
  let cleanSource = text;
  let resolvedSourceLang: LanguageCode = sourceLang === 'auto' ? 'vi' : sourceLang;
  let keywordTriggered = false;

  try {
    if (enableStreaming && typeof fetch !== 'undefined') {
      const response = await fetch('/api/translate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLang,
          targetLang,
          keywordDichEnabled,
          provider,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventMatch = block.match(/^event:\s*(\w+)/m);
          const dataMatch = block.match(/^data:\s*(.+)$/m);

          const eventType = eventMatch ? eventMatch[1] : 'message';
          const dataStr = dataMatch ? dataMatch[1] : '';

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === 'metadata') {
              cleanSource = data.sourceCleanText || cleanSource;
              resolvedSourceLang = data.sourceLang || resolvedSourceLang;
              keywordTriggered = !!data.keywordTriggered;
              onMetadata?.({
                sourceCleanText: cleanSource,
                sourceLang: resolvedSourceLang,
                keywordTriggered,
              });
            } else if (eventType === 'token') {
              if (!firstTokenTime) {
                firstTokenTime = Date.now();
              }
              accumulated += data.token;
              const ttftMs = firstTokenTime - t0;
              const currentPinyin = (targetLang === 'zh' || resolvedSourceLang === 'zh')
                ? getChinesePinyin(accumulated)
                : '';
              onToken?.(data.token, accumulated, currentPinyin, ttftMs);
            } else if (eventType === 'done') {
              const apiTotalMs = Date.now() - t0;
              const ttftMs = firstTokenTime ? firstTokenTime - t0 : (data.ttftMs || apiTotalMs);
              const finalTranslated = data.fullText || accumulated;
              
              const pinyinT0 = Date.now();
              const finalPinyin = (targetLang === 'zh' || resolvedSourceLang === 'zh')
                ? (data.pinyin || getChinesePinyin(finalTranslated))
                : '';
              const pinyinMs = Date.now() - pinyinT0;

              onDone?.({
                sourceCleanText: cleanSource,
                translatedText: finalTranslated,
                pinyin: finalPinyin,
                sourceLang: resolvedSourceLang,
                targetLang,
                keywordTriggered,
                breakdown: {
                  id: `lat-${Date.now()}`,
                  timestamp: Date.now(),
                  sourceLang: resolvedSourceLang,
                  targetLang,
                  textLength: text.length,
                  provider,
                  apiSendMs: Math.max(10, Math.round(ttftMs * 0.2)),
                  ttftMs,
                  apiTotalMs,
                  pinyinMs,
                },
              });
              return;
            }
          } catch (jsonErr) {
            console.warn('SSE JSON parse error:', jsonErr);
          }
        }
      }

      // Stream closed
      const apiTotalMs = Date.now() - t0;
      const ttftMs = firstTokenTime ? firstTokenTime - t0 : apiTotalMs;
      const pinyinT0 = Date.now();
      const pinyinResult = (targetLang === 'zh' || resolvedSourceLang === 'zh')
        ? getChinesePinyin(accumulated)
        : '';
      const pinyinMs = Date.now() - pinyinT0;

      onDone?.({
        sourceCleanText: cleanSource,
        translatedText: accumulated,
        pinyin: pinyinResult,
        sourceLang: resolvedSourceLang,
        targetLang,
        keywordTriggered,
        breakdown: {
          id: `lat-${Date.now()}`,
          timestamp: Date.now(),
          sourceLang: resolvedSourceLang,
          targetLang,
          textLength: text.length,
          provider,
          apiSendMs: Math.max(10, Math.round(ttftMs * 0.2)),
          ttftMs,
          apiTotalMs,
          pinyinMs,
        },
      });
      return;
    }

    // Unary Fallback
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang,
        keywordDichEnabled,
        provider,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const apiTotalMs = Date.now() - t0;
    const ttftMs = data.ttftMs || apiTotalMs;
    const pinyinT0 = Date.now();
    const pinyinResult = (targetLang === 'zh' || data.sourceLang === 'zh')
      ? (data.pinyin || getChinesePinyin(data.translatedText))
      : '';
    const pinyinMs = Date.now() - pinyinT0;

    onDone?.({
      sourceCleanText: data.sourceCleanText || text,
      translatedText: data.translatedText,
      pinyin: pinyinResult,
      sourceLang: data.sourceLang,
      targetLang,
      keywordTriggered: !!data.keywordTriggered,
      breakdown: {
        id: `lat-${Date.now()}`,
        timestamp: Date.now(),
        sourceLang: data.sourceLang,
        targetLang,
        textLength: text.length,
        provider,
        apiSendMs: Math.max(10, Math.round(ttftMs * 0.25)),
        ttftMs,
        apiTotalMs,
        pinyinMs,
      },
    });
  } catch (err: any) {
    onError?.(err);
  }
}
