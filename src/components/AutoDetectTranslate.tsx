import React, { useState, useRef, useEffect } from 'react';
import { 
  LanguageCode, 
  SUPPORTED_LANGUAGES, 
  AppSettings, 
  SystemStatus,
  LatencyBreakdown 
} from '../types/translator';
import { PinyinDisplay } from './PinyinDisplay';
import { 
  startSpeechRecognition, 
  speakText, 
  stopSpeaking, 
  SpeechRecognitionController 
} from '../utils/speech';
import { getChinesePinyin } from '../utils/pinyin';
import { streamTranslate } from '../utils/streamingTranslate';
import { 
  Mic, 
  Square, 
  Volume2, 
  Copy, 
  Check, 
  Trash2, 
  Sparkles, 
  ArrowRight,
  Zap
} from 'lucide-react';

interface AutoDetectTranslateProps {
  targetLang: LanguageCode;
  onTargetLangChange: (lang: LanguageCode) => void;
  settings: AppSettings;
  status: SystemStatus;
  setStatus: (status: SystemStatus, msg?: string) => void;
  onError: (msg: string) => void;
  onRecordMetrics?: (metrics: LatencyBreakdown) => void;
}

export const AutoDetectTranslate: React.FC<AutoDetectTranslateProps> = ({
  targetLang,
  onTargetLangChange,
  settings,
  status,
  setStatus,
  onError,
  onRecordMetrics,
}) => {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [detectedLang, setDetectedLang] = useState<LanguageCode | null>(null);
  const [pinyinText, setPinyinText] = useState('');
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [keywordNotice, setKeywordNotice] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  // Auto-speak in auto-detect mode is turned off by default as requested
  const [autoSpeakInAutoDetect, setAutoSpeakInAutoDetect] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const lastSttDurationRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resultCardRef = useRef<HTMLDivElement | null>(null);

  // Auto-resize textarea: starts 1 line (~38px), smoothly wraps to line 2 when speech/text gets longer
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      // 38px for 1 line, expands up to 88px (~2-3 lines), then clean internal scroll
      const nextHeight = Math.max(38, Math.min(scrollH, 88));
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  }, [inputText]);

  // Ensure translation result is immediately visible on mobile screen without scrolling
  useEffect(() => {
    if (translatedText && resultCardRef.current) {
      resultCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [translatedText]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      recognitionRef.current?.abort();
    };
  }, []);

  const handleTranslate = async (textToProcess?: string, sttMs: number = 0) => {
    const rawInput = typeof textToProcess === 'string' ? textToProcess : inputText;
    if (!rawInput.trim()) {
      onError('Vui lòng nhập câu nói hoặc bấm micro.');
      return;
    }

    setStatus('translating', 'Đang nhận diện ngôn ngữ & dịch...');
    setKeywordNotice(null);
    setTranslatedText('');
    setPinyinText('');

    const startTranslateTime = Date.now();

    await streamTranslate({
      text: rawInput,
      sourceLang: 'auto',
      targetLang,
      keywordDichEnabled: settings.keywordDichEnabled,
      provider: settings.apiProvider,
      enableStreaming: settings.enableStreaming,
      onMetadata: (meta) => {
        setInputText(meta.sourceCleanText);
        setDetectedLang(meta.sourceLang);
        if (meta.keywordTriggered) {
          setKeywordNotice('Đã nhận diện từ khóa "dịch" kết thúc câu và tự động kích hoạt dịch.');
        }
      },
      onToken: (_token, currentFullText, currentPinyin) => {
        setTranslatedText(currentFullText);
        if (targetLang === 'zh' || currentPinyin || /[\u4e00-\u9fa5]/.test(currentFullText)) {
          setPinyinText(currentPinyin || getChinesePinyin(currentFullText));
        }
      },
      onDone: (result) => {
        setInputText(result.sourceCleanText);
        setTranslatedText(result.translatedText);
        setDetectedLang(result.sourceLang);
        const resolvedPinyin = result.pinyin || ((targetLang === 'zh' || /[\u4e00-\u9fa5]/.test(result.translatedText)) ? getChinesePinyin(result.translatedText) : '');
        setPinyinText(resolvedPinyin);

        const totalTranslateMs = Date.now() - startTranslateTime;
        const totalE2E = (sttMs || lastSttDurationRef.current) + totalTranslateMs;
        setLastLatencyMs(totalE2E);

        const fullMetrics: LatencyBreakdown = {
          ...result.breakdown,
          sttMs: sttMs || lastSttDurationRef.current || 0,
          ttsStartMs: 0,
          totalE2EMs: totalE2E,
        };

        setStatus('idle');

        // Tắt tự động đọc khi dịch xong trong Tự phát hiện (mặc định tắt hoàn toàn, chỉ đọc nếu người dùng chủ động bật công tắc)
        if (autoSpeakInAutoDetect && result.translatedText) {
          handleSpeak(result.translatedText, targetLang, fullMetrics);
        } else if (onRecordMetrics) {
          onRecordMetrics(fullMetrics);
        }
      },
      onError: (err) => {
        console.error('Auto detect translation error:', err);
        setStatus('error', 'Lỗi xử lý');
        onError(err.message || 'Lỗi kết nối máy chủ dịch.');
      },
    });
  };

  const handleStartListening = () => {
    stopSpeaking();
    setIsSpeaking(false);
    const listenLang = targetLang === 'vi' ? 'en' : 'vi';
    setStatus('listening', 'Đang nghe...');

    recognitionRef.current = startSpeechRecognition({
      language: listenLang,
      keywordDichEnabled: settings.keywordDichEnabled,
      quickSilenceTimeoutMs: settings.quickSilenceTimeoutMs,
      allowBargeIn: settings.allowBargeIn,
      onStart: () => {
        setStatus('listening', 'Đang nghe giọng nói...');
      },
      onInterim: (interim) => {
        setInputText(interim);
      },
      onResult: (finalText, sttMs) => {
        setInputText(finalText);
        lastSttDurationRef.current = sttMs;
        setStatus('recognizing', 'Đang nhận diện...');
        handleTranslate(finalText, sttMs);
      },
      onError: (errMsg) => {
        setStatus('error', errMsg);
        onError(errMsg);
      },
      onEnd: () => {
        if (status === 'listening') {
          setStatus('idle');
        }
      },
    });
  };

  const handleStopListening = () => {
    recognitionRef.current?.stop();
    setStatus('idle');
  };

  const handleSpeak = (text: string, lang: LanguageCode, currentMetrics?: LatencyBreakdown) => {
    if (!text.trim()) return;

    setIsSpeaking(true);
    setStatus('speaking', 'Đang phát âm...');

    speakText({
      text,
      language: lang,
      rate: settings.speechRate,
      useGeminiFallback: settings.voiceEngine === 'gemini_fallback',
      onAudioStart: (ttsPrepMs) => {
        if (currentMetrics && onRecordMetrics) {
          onRecordMetrics({
            ...currentMetrics,
            ttsStartMs: ttsPrepMs,
            totalE2EMs: currentMetrics.totalE2EMs + ttsPrepMs,
          });
        }
      },
      onEnd: () => {
        setIsSpeaking(false);
        setStatus('idle');
      },
      onError: (err) => {
        setIsSpeaking(false);
        setStatus('idle');
        onError(err);
      },
    });
  };

  const handleCopy = async () => {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText);
    setCopiedTarget(true);
    setTimeout(() => setCopiedTarget(false), 2000);
  };

  const handleClear = () => {
    stopSpeaking();
    recognitionRef.current?.abort();
    setInputText('');
    setTranslatedText('');
    setPinyinText('');
    setDetectedLang(null);
    setKeywordNotice(null);
    setLastLatencyMs(null);
    setStatus('idle');
  };

  const isListening = status === 'listening';

  return (
    <div className="space-y-2.5 sm:space-y-4">
      {/* Target language selector bar - compact for mobile */}
      <div className="bg-white rounded-xl p-2 sm:p-2.5 border border-slate-200/90 shadow-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 shrink-0">
          <span className="text-blue-600 font-bold">🎯 Dịch sang:</span>
        </div>
        <select
          value={targetLang}
          onChange={(e) => onTargetLangChange(e.target.value as LanguageCode)}
          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1 px-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-hidden focus:ring-2 focus:ring-blue-100 cursor-pointer"
        >
          {Object.values(SUPPORTED_LANGUAGES).map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.name} ({lang.nativeName})
            </option>
          ))}
        </select>
      </div>

      {/* Two columns: Input and Output - tight gap on mobile so both fit comfortably on screen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
        {/* Input box */}
        <div className={`bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border transition-all flex flex-col justify-between ${
          isListening ? 'border-red-400 ring-3 ring-red-100' : 'border-slate-200 shadow-xs'
        }`}>
          <div>
            <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-base sm:text-lg">🌐</span>
                <span className="font-bold text-slate-800 text-xs sm:text-sm">
                  Tự phát hiện ngôn ngữ
                </span>
                {detectedLang && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold animate-fadeIn">
                    <span>{SUPPORTED_LANGUAGES[detectedLang]?.flag}</span>
                    <span>{SUPPORTED_LANGUAGES[detectedLang]?.name}</span>
                  </span>
                )}
              </div>

              {inputText && (
                <button
                  onClick={handleClear}
                  title="Xóa"
                  className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>

            {/* Input area: starts 1 line, expands to 2 lines when speaking longer */}
            <div className="mt-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Chạm 'Nói ngay' hoặc gõ chữ..."
                className="w-full min-h-[38px] max-h-[88px] text-sm sm:text-base text-slate-900 bg-transparent placeholder-slate-400 resize-none focus:outline-hidden leading-relaxed transition-all"
              />
            </div>

            {/* Source Pinyin if input has Chinese */}
            {inputText && /[\u4e00-\u9fa5]/.test(inputText) && (
              <div className="mt-1.5 p-2 rounded-lg bg-amber-50/80 border border-amber-200/70 text-xs text-amber-950 font-medium">
                <span className="text-amber-800 uppercase font-bold text-[10px] mr-1.5 tracking-wider">
                  Pinyin:
                </span>
                {getChinesePinyin(inputText)}
              </div>
            )}

            {keywordNotice && (
              <div className="mt-1.5 p-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{keywordNotice}</span>
              </div>
            )}
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <div>
              {isListening ? (
                <button
                  type="button"
                  onClick={handleStopListening}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl font-semibold text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white" />
                  <span>Dừng nghe</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartListening}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl font-semibold text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Nói ngay</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleTranslate()}
              disabled={status === 'translating' || !inputText.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-semibold text-xs sm:text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white transition-all active:scale-95 cursor-pointer"
            >
              <span>Dịch</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Output box: instantly visible without scrolling */}
        <div 
          ref={resultCardRef}
          className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg">{SUPPORTED_LANGUAGES[targetLang]?.flag}</span>
                <span className="font-bold text-slate-800 text-xs sm:text-sm">
                  {SUPPORTED_LANGUAGES[targetLang]?.name}
                </span>
                <span className="text-[11px] text-slate-400 hidden xs:inline">
                  ({SUPPORTED_LANGUAGES[targetLang]?.nativeName})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {lastLatencyMs && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600" />
                    {lastLatencyMs} ms
                  </span>
                )}
                {translatedText && (
                  <button
                    onClick={handleCopy}
                    className="p-1 px-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copiedTarget ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span className="text-[11px]">{copiedTarget ? 'Đã chép' : 'Chép'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 min-h-[46px] sm:min-h-[64px]">
              {targetLang === 'zh' || /[\u4e00-\u9fa5]/.test(translatedText) ? (
                translatedText ? (
                  <PinyinDisplay
                    chineseText={translatedText}
                    pinyinText={pinyinText || getChinesePinyin(translatedText)}
                    onSpeak={() => handleSpeak(translatedText, 'zh')}
                    isSpeaking={isSpeaking}
                  />
                ) : (
                  <div className="text-slate-400 text-xs sm:text-sm italic py-2.5 text-center">
                    Bản dịch chữ Hán &amp; Pinyin sẽ xuất hiện tại đây...
                  </div>
                )
              ) : (
                translatedText ? (
                  <div className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 leading-relaxed select-all">
                    {translatedText}
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs sm:text-sm italic py-2.5 text-center">
                    Bản dịch sẽ xuất hiện tại đây...
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              {translatedText && (
                <button
                  onClick={() => handleSpeak(translatedText, targetLang === 'zh' || /[\u4e00-\u9fa5]/.test(translatedText) ? 'zh' : targetLang)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Nghe bản dịch</span>
                </button>
              )}
            </div>

            {/* Công tắc tự động đọc bản dịch - Mặc định tắt */}
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSpeakInAutoDetect}
                  onChange={(e) => setAutoSpeakInAutoDetect(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-3 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 relative"></div>
                <span className="text-[11px] text-slate-500 font-medium">
                  Tự đọc: {autoSpeakInAutoDetect ? (
                    <span className="text-blue-600 font-bold">Bật</span>
                  ) : (
                    <span className="text-slate-500 font-medium">Tắt</span>
                  )}
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
