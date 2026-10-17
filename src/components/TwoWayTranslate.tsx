import React, { useState, useRef, useEffect } from 'react';
import { 
  LanguageCode, 
  SUPPORTED_LANGUAGES, 
  AppSettings, 
  SystemStatus,
  LatencyBreakdown
} from '../types/translator';
import { PinyinDisplay } from './PinyinDisplay';
import { SamplePhrasesBar } from './SamplePhrasesBar';
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
  ArrowRight, 
  Sparkles,
  Zap
} from 'lucide-react';

interface TwoWayTranslateProps {
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  settings: AppSettings;
  status: SystemStatus;
  setStatus: (status: SystemStatus, msg?: string) => void;
  onError: (msg: string) => void;
  onRecordMetrics?: (metrics: LatencyBreakdown) => void;
}

export const TwoWayTranslate: React.FC<TwoWayTranslateProps> = ({
  sourceLang,
  targetLang,
  settings,
  status,
  setStatus,
  onError,
  onRecordMetrics,
}) => {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [pinyinText, setPinyinText] = useState('');
  const [keywordNotice, setKeywordNotice] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [isSpeakingTarget, setIsSpeakingTarget] = useState(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  // Auto-speak in two-way translate mode is turned off by default as requested
  const [autoSpeakInTwoWay, setAutoSpeakInTwoWay] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const lastSttDurationRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resultCardRef = useRef<HTMLDivElement | null>(null);

  // Auto-resize textarea: starts 1 line, expands to 2 lines when speaking longer
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      const nextHeight = Math.max(38, Math.min(scrollH, 88));
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  }, [sourceText]);

  // Ensure translation result is immediately visible on mobile screen without scrolling
  useEffect(() => {
    if (translatedText && resultCardRef.current) {
      resultCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [translatedText]);

  // Stop any speech when switching languages or unmounting
  useEffect(() => {
    return () => {
      stopSpeaking();
      recognitionRef.current?.abort();
    };
  }, [sourceLang, targetLang]);

  // Execute streaming translation
  const handleTranslate = async (textToTranslate?: string, sttMs: number = 0) => {
    const rawInput = typeof textToTranslate === 'string' ? textToTranslate : sourceText;
    if (!rawInput.trim()) {
      onError('Vui lòng nhập văn bản hoặc bấm micro để nói.');
      return;
    }

    setStatus('translating', 'Đang nhận diện & dịch siêu tốc...');
    setKeywordNotice(null);
    setTranslatedText('');
    setPinyinText('');

    const startTranslateTime = Date.now();

    await streamTranslate({
      text: rawInput,
      sourceLang,
      targetLang,
      keywordDichEnabled: settings.keywordDichEnabled,
      provider: settings.apiProvider,
      enableStreaming: settings.enableStreaming,
      onMetadata: (meta) => {
        setSourceText(meta.sourceCleanText);
        if (meta.keywordTriggered) {
          setKeywordNotice('Đã kích hoạt lệnh dịch bằng từ khóa "dịch". Từ điều khiển đã được lược bỏ khỏi câu dịch.');
        }
      },
      onToken: (_token, currentFullText, currentPinyin) => {
        setTranslatedText(currentFullText);
        if (targetLang === 'zh' || currentPinyin || /[\u4e00-\u9fa5]/.test(currentFullText)) {
          setPinyinText(currentPinyin || getChinesePinyin(currentFullText));
        }
      },
      onDone: (result) => {
        setSourceText(result.sourceCleanText);
        setTranslatedText(result.translatedText);
        const resolvedPinyin = result.pinyin || ((targetLang === 'zh' || /[\u4e00-\u9fa5]/.test(result.translatedText)) ? getChinesePinyin(result.translatedText) : '');
        setPinyinText(resolvedPinyin);

        const totalTranslateMs = Date.now() - startTranslateTime;
        const totalE2E = (sttMs || lastSttDurationRef.current) + totalTranslateMs;
        setLastLatencyMs(totalE2E);

        // Record metrics
        const fullMetrics: LatencyBreakdown = {
          ...result.breakdown,
          sttMs: sttMs || lastSttDurationRef.current || 0,
          ttsStartMs: 0,
          totalE2EMs: totalE2E,
        };

        setStatus('idle');

        // Tự động đọc bản dịch bên dịch 2 chiều: mặc định tắt theo yêu cầu, chỉ đọc nếu người dùng chủ động bật công tắc
        if (autoSpeakInTwoWay && result.translatedText) {
          handleSpeak(result.translatedText, targetLang, fullMetrics);
        } else if (onRecordMetrics) {
          onRecordMetrics(fullMetrics);
        }
      },
      onError: (err) => {
        console.error('Translation error:', err);
        setStatus('error', 'Lỗi dịch');
        onError(err.message || 'Không thể kết nối đến máy chủ dịch thuật.');
      },
    });
  };

  // Start speech recognition with ultra-low latency & quick silence cutoff
  const handleStartListening = () => {
    stopSpeaking();
    setIsSpeakingTarget(false);
    setStatus('listening', `Đang nghe ${SUPPORTED_LANGUAGES[sourceLang].name}...`);

    recognitionRef.current = startSpeechRecognition({
      language: sourceLang,
      keywordDichEnabled: settings.keywordDichEnabled,
      quickSilenceTimeoutMs: settings.quickSilenceTimeoutMs,
      allowBargeIn: settings.allowBargeIn,
      onStart: () => {
        setStatus('listening', `Đang nghe (${SUPPORTED_LANGUAGES[sourceLang].name})...`);
      },
      onInterim: (interim) => {
        setSourceText(interim);
      },
      onResult: (finalText, sttDurationMs) => {
        setSourceText(finalText);
        lastSttDurationRef.current = sttDurationMs;
        setStatus('recognizing', 'Đã ghi nhận xong');
        // Immediately translate the spoken sentence without delay
        handleTranslate(finalText, sttDurationMs);
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

  // Speak translation
  const handleSpeak = (text: string, lang: LanguageCode, currentMetrics?: LatencyBreakdown) => {
    if (!text.trim()) return;

    setIsSpeakingTarget(true);
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
        setIsSpeakingTarget(false);
        setStatus('idle');
      },
      onError: (err) => {
        setIsSpeakingTarget(false);
        setStatus('idle');
        onError(err);
      },
    });
  };

  const handleStopSpeaking = () => {
    stopSpeaking();
    setIsSpeakingTarget(false);
    setStatus('idle');
  };

  const handleCopyTarget = async () => {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText);
    setCopiedTarget(true);
    setTimeout(() => setCopiedTarget(false), 2000);
  };

  const handleClear = () => {
    stopSpeaking();
    recognitionRef.current?.abort();
    setSourceText('');
    setTranslatedText('');
    setPinyinText('');
    setKeywordNotice(null);
    setLastLatencyMs(null);
    setStatus('idle');
  };

  const isListening = status === 'listening';

  return (
    <div className="space-y-4">
      {/* Sample phrases */}
      <SamplePhrasesBar
        sourceLang={sourceLang}
        onSelectPhrase={(phrase) => {
          setSourceText(phrase);
          handleTranslate(phrase);
        }}
      />

      {/* Main card grid: Source and Target */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
        {/* Source Card */}
        <div className={`bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border transition-all flex flex-col justify-between ${
          isListening ? 'border-red-400 ring-3 ring-red-100' : 'border-slate-200 shadow-xs'
        }`}>
          <div>
            <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg">{SUPPORTED_LANGUAGES[sourceLang].flag}</span>
                <span className="font-bold text-slate-800 text-xs sm:text-sm">
                  {SUPPORTED_LANGUAGES[sourceLang].name}
                </span>
                <span className="text-[11px] text-slate-400 hidden xs:inline">
                  ({SUPPORTED_LANGUAGES[sourceLang].nativeName})
                </span>
              </div>
              {sourceText && (
                <button
                  onClick={handleClear}
                  title="Xóa văn bản"
                  className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>

            {/* Text input area: starts 1 line, wraps to 2 lines when speaking longer */}
            <div className="mt-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Nhập văn bản hoặc bấm 'Nói ngay'..."
                className="w-full min-h-[38px] max-h-[88px] text-sm sm:text-base text-slate-900 bg-transparent placeholder-slate-400 resize-none focus:outline-hidden leading-relaxed transition-all"
              />
            </div>

            {/* Source Pinyin if source is Chinese */}
            {sourceLang === 'zh' && sourceText && getChinesePinyin(sourceText) && (
              <div className="mt-1.5 p-2 rounded-lg bg-amber-50/80 border border-amber-200/70 text-xs text-amber-950 font-medium">
                <span className="text-amber-800 uppercase font-bold text-[10px] mr-1.5 tracking-wider">
                  Pinyin:
                </span>
                {getChinesePinyin(sourceText)}
              </div>
            )}

            {/* Keyword notice banner */}
            {keywordNotice && (
              <div className="mt-1.5 p-1.5 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-900 text-xs flex items-center gap-1.5 animate-fadeIn">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{keywordNotice}</span>
              </div>
            )}
          </div>

          {/* Source controls */}
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
              disabled={status === 'translating' || !sourceText.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-semibold text-xs sm:text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all active:scale-95 cursor-pointer"
            >
              <span>Dịch</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Target Card: immediately visible on phone screen */}
        <div 
          ref={resultCardRef}
          className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg">{SUPPORTED_LANGUAGES[targetLang].flag}</span>
                <span className="font-bold text-slate-800 text-xs sm:text-sm">
                  {SUPPORTED_LANGUAGES[targetLang].name}
                </span>
                <span className="text-[11px] text-slate-400 hidden xs:inline">
                  ({SUPPORTED_LANGUAGES[targetLang].nativeName})
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
                    onClick={handleCopyTarget}
                    title="Sao chép bản dịch"
                    className="p-1 px-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copiedTarget ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span className="text-[11px]">{copiedTarget ? 'Đã chép' : 'Chép'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Translation Output */}
            <div className="mt-2 min-h-[46px] sm:min-h-[64px]">
              {targetLang === 'zh' || /[\u4e00-\u9fa5]/.test(translatedText) ? (
                translatedText ? (
                  <PinyinDisplay
                    chineseText={translatedText}
                    pinyinText={pinyinText || getChinesePinyin(translatedText)}
                    onSpeak={() => handleSpeak(translatedText, 'zh')}
                    isSpeaking={isSpeakingTarget}
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

          {/* Target controls */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <div>
              {translatedText && (
                isSpeakingTarget ? (
                  <button
                    onClick={handleStopSpeaking}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-rose-600" />
                    <span>Dừng đọc</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleSpeak(translatedText, targetLang)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Nghe bản dịch</span>
                  </button>
                )
              )}
            </div>

            {/* Công tắc tự động đọc bản dịch bên dịch 2 chiều - Mặc định tắt */}
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSpeakInTwoWay}
                  onChange={(e) => setAutoSpeakInTwoWay(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-3 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 relative"></div>
                <span className="text-[11px] text-slate-500 font-medium">
                  Tự đọc: {autoSpeakInTwoWay ? (
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
