import React, { useState, useRef, useEffect } from 'react';
import { 
  LanguageCode, 
  SUPPORTED_LANGUAGES, 
  AppSettings, 
  SystemStatus, 
  ConversationMessage,
  LatencyBreakdown 
} from '../types/translator';
import { 
  startSpeechRecognition, 
  startContinuousStorySpeechRecognition,
  speakText, 
  stopSpeaking, 
  interruptPlayback,
  SpeechRecognitionController,
  ContinuousStoryController
} from '../utils/speech';
import { getChinesePinyin } from '../utils/pinyin';
import { streamTranslate } from '../utils/streamingTranslate';
import { directClientTranslateFallback } from '../utils/clientTranslateFallback';
import { 
  Mic, 
  Square, 
  Volume2, 
  Trash2, 
  Sparkles, 
  Copy, 
  Check, 
  Zap,
  MessageSquare,
  ArrowRightLeft,
  VolumeX,
  Radio,
  CheckCircle2,
  Clock,
  FileText
} from 'lucide-react';

interface ConversationModeProps {
  partnerLang: LanguageCode;
  onPartnerLangChange: (lang: LanguageCode) => void;
  settings: AppSettings;
  status: SystemStatus;
  setStatus: (status: SystemStatus, msg?: string) => void;
  onError: (msg: string) => void;
  onRecordMetrics?: (metrics: LatencyBreakdown) => void;
  toggleMicTrigger?: number;
}

/**
 * Tự động phát hiện xem người nói đang nói Tiếng Việt hay Ngôn ngữ đối thoại (Trung, Anh, Thái, Hàn)
 */
function detectSpokenLanguage(text: string, fallbackLang: LanguageCode, partner: LanguageCode): LanguageCode {
  if (!text || !text.trim()) return fallbackLang;
  const clean = text.trim();

  // 1. Chữ Hán (Tiếng Trung)
  if (/[\u4e00-\u9fa5]/.test(clean)) return 'zh';

  // 2. Chữ Thái
  if (/[\u0e00-\u0e7f]/.test(clean)) return 'th';

  // 3. Chữ Hangul (Tiếng Hàn)
  if (/[\uac00-\ud7af]/.test(clean)) return 'ko';

  // 4. Ký tự nguyên âm có dấu đặc trưng Tiếng Việt
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(clean)) return 'vi';

  // 5. Từ vựng tiếng Việt không dấu phổ biến
  if (/\b(toi|ban|o dau|la gi|xin chao|cam on|khong|bao nhieu|nha ga|san bay|khach san|tam biet|an com|uong nuoc|duoc|chao|anh|chi|em|gi|sao|the|nao|chua|roi|di|ve|an|uong|tien|dong|muon|co|khong)\b/i.test(clean)) {
    return 'vi';
  }

  // 6. Từ vựng tiếng Anh phổ biến nếu đối thoại là tiếng Anh
  if (partner === 'en') {
    if (/\b(hello|hi|how|what|where|when|why|who|is|are|you|i|my|the|this|that|thank|thanks|please|good|yes|no|can|want|would|hotel|airport|station|much|cost|price|bill|check|help|need|ok|fine)\b/i.test(clean)) {
      return 'en';
    }
  }

  return fallbackLang;
}

export const ConversationMode: React.FC<ConversationModeProps> = ({
  partnerLang,
  onPartnerLangChange,
  settings,
  status,
  setStatus,
  onError,
  onRecordMetrics,
  toggleMicTrigger,
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  // Current speaker who will speak when the single button is pressed
  // user_a = Bạn (Tiếng Việt) -> dịch sang partnerLang
  // user_b = Người đối thoại (partnerLang) -> dịch sang Tiếng Việt
  const [currentSpeaker, setCurrentSpeaker] = useState<'user_a' | 'user_b'>('user_a');
  const [isRecording, setIsRecording] = useState(false);
  const [autoSwitchTurn, setAutoSwitchTurn] = useState(true);
  
  // Chế độ hỗn hợp: Tự động lắng nghe & nhận diện ngôn ngữ của cả 2 người nói (mặc định bật)
  const [isMixedMode, setIsMixedMode] = useState(true);
  const [mixedListeningLang, setMixedListeningLang] = useState<LanguageCode>('vi');
  const [liveDetectedLang, setLiveDetectedLang] = useState<LanguageCode>('vi');
  const isContinuousListeningRef = useRef<boolean>(false);

  // Chế độ tự động dịch câu chuyện dài (5 - 10 phút liên tục)
  const [isAutoTranslateMode, setIsAutoTranslateMode] = useState<boolean>(true);
  const [maxRecordingDurationMinutes, setMaxRecordingDurationMinutes] = useState<number>(10);
  const continuousControllerRef = useRef<ContinuousStoryController | null>(null);

  const formatDuration = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  
  // Real-time interim text & live parallel translation while talking
  const [interimText, setInterimText] = useState('');
  const [liveParallelText, setLiveParallelText] = useState('');
  const [liveParallelPinyin, setLiveParallelPinyin] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Auto-speak in conversation: turned off by default as requested
  const [autoSpeakInConversation, setAutoSpeakInConversation] = useState(false);

  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [latestCompletedTurn, setLatestCompletedTurn] = useState<ConversationMessage | null>(null);

  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const latestResultRef = useRef<HTMLDivElement | null>(null);
  const isInitialMount = useRef<boolean>(true);
  const lastSttDurationRef = useRef<number>(0);
  const liveAbortControllerRef = useRef<AbortController | null>(null);
  const parallelDebounceTimerRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  const partnerLangInfo = SUPPORTED_LANGUAGES[partnerLang] || SUPPORTED_LANGUAGES.zh;

  // Luôn đảm bảo kết quả câu dịch vừa xong tự động nằm trọn trong tầm mắt mà không cần cuộn
  useEffect(() => {
    if (latestCompletedTurn) {
      const timer = setTimeout(() => {
        if (latestResultRef.current) {
          const rect = latestResultRef.current.getBoundingClientRect();
          const vh = window.innerHeight || document.documentElement.clientHeight;
          // Tự động cuộn để kết quả dịch nằm ngay giữa vùng nhìn thấy nếu bị khuất
          if (rect.top < 60 || rect.bottom > vh - 20) {
            latestResultRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }
        }
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [latestCompletedTurn?.id, latestCompletedTurn?.translatedText]);

  // Luôn đảm bảo cuộn màn hình lên đầu trang khi vào chế độ giao tiếp (như 2 tab còn lại)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    isInitialMount.current = false;
  }, []);

  // Chỉ cuộn nội bộ bên trong khung tin nhắn khi có tin nhắn mới (KHÔNG cuộn thanh cuộn toàn trang web)
  useEffect(() => {
    if (isInitialMount.current) return;
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages.length]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      continuousControllerRef.current?.abort();
      continuousControllerRef.current = null;
      recognitionRef.current?.abort();
      liveAbortControllerRef.current?.abort();
      clearTimeout(parallelDebounceTimerRef.current);
      clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Timer for active recording duration
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      if (!isAutoTranslateMode) {
        timerIntervalRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      }
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isRecording, isAutoTranslateMode]);

  // Live parallel translation debounced helper: translates speech in real time as the person talks
  const requestParallelTranslation = (text: string, srcLang: LanguageCode, tgtLang: LanguageCode) => {
    const clean = text.trim();
    if (!clean || clean.length < 2) {
      setLiveParallelText('');
      setLiveParallelPinyin('');
      return;
    }

    clearTimeout(parallelDebounceTimerRef.current);
    parallelDebounceTimerRef.current = setTimeout(async () => {
      try {
        liveAbortControllerRef.current?.abort();
        liveAbortControllerRef.current = new AbortController();

        const customApiKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('easytalk_gemini_key') : '') || '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (customApiKey) headers['x-gemini-key'] = customApiKey;

        const response = await fetch('/api/translate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: clean,
            sourceLang: srcLang,
            targetLang: tgtLang,
            keywordDichEnabled: false,
            provider: settings.apiProvider,
            apiKey: customApiKey,
          }),
          signal: liveAbortControllerRef.current.signal,
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.translatedText) {
            setLiveParallelText(data.translatedText);
            const resolvedPinyin = data.pinyin || (tgtLang === 'zh' ? getChinesePinyin(data.translatedText) : '');
            setLiveParallelPinyin(resolvedPinyin);
            return;
          }
        }

        // Fast fallback if backend unreachable
        const fallback = await directClientTranslateFallback(clean, srcLang, tgtLang);
        if (fallback?.text) {
          setLiveParallelText(fallback.text);
          setLiveParallelPinyin(fallback.pinyin || (tgtLang === 'zh' ? getChinesePinyin(fallback.text) : ''));
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // Silent catch for background live preview
        }
      }
    }, 320);
  };

  // Process and stream final translation turn
  const handleConversationTurn = async (
    speaker: 'user_a' | 'user_b', 
    rawText: string, 
    sttMs: number = 0,
    isAutoContinuous: boolean = false
  ) => {
    if (!rawText.trim()) {
      if (!isAutoContinuous) {
        setIsRecording(false);
        isContinuousListeningRef.current = false;
        setStatus('idle');
      }
      return;
    }

    let sourceLang: LanguageCode = speaker === 'user_a' ? 'vi' : partnerLang;
    let targetLang: LanguageCode = speaker === 'user_a' ? partnerLang : 'vi';
    let actualSpeaker: 'user_a' | 'user_b' = speaker;

    // Trong Chế độ hỗn hợp: Tự động phát hiện xem người nói đang nói Tiếng Việt hay Ngôn ngữ đối thoại
    if (isMixedMode) {
      const detected = detectSpokenLanguage(rawText, sourceLang, partnerLang);
      if (detected === 'vi') {
        sourceLang = 'vi';
        targetLang = partnerLang;
        actualSpeaker = 'user_a';
      } else {
        sourceLang = partnerLang;
        targetLang = 'vi';
        actualSpeaker = 'user_b';
      }
    }

    setStatus('translating', 'Đang phiên dịch...');

    const tempMsgId = `msg-${Date.now()}`;
    setStreamingMessageId(tempMsgId);

    // Initial placeholder message for real-time streaming display
    const pendingMsg: ConversationMessage = {
      id: tempMsgId,
      timestamp: Date.now(),
      speaker: actualSpeaker,
      sourceLang,
      targetLang,
      originalText: rawText,
      translatedText: liveParallelText || '',
      pinyin: liveParallelPinyin || '',
    };

    setMessages((prev) => [...prev, pendingMsg]);
    setLatestCompletedTurn(pendingMsg);

    const startTranslateTime = Date.now();

    await streamTranslate({
      text: rawText,
      sourceLang,
      targetLang,
      keywordDichEnabled: actualSpeaker === 'user_a' ? settings.keywordDichEnabled : false,
      provider: settings.apiProvider,
      enableStreaming: settings.enableStreaming,
      onMetadata: (meta) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsgId
              ? {
                  ...m,
                  originalText: meta.sourceCleanText,
                  keywordTriggered: meta.keywordTriggered,
                }
              : m
          )
        );
        setLatestCompletedTurn((prev) =>
          prev && prev.id === tempMsgId
            ? {
                ...prev,
                originalText: meta.sourceCleanText,
                keywordTriggered: meta.keywordTriggered,
              }
            : prev
        );
      },
      onToken: (_token, currentFullText, currentPinyin) => {
        const resolvedTokenPinyin = currentPinyin || ((targetLang === 'zh' || /[\u4e00-\u9fa5]/.test(currentFullText)) ? getChinesePinyin(currentFullText) : '');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsgId
              ? {
                  ...m,
                  translatedText: currentFullText,
                  pinyin: resolvedTokenPinyin,
                }
              : m
          )
        );
        setLatestCompletedTurn((prev) =>
          prev && prev.id === tempMsgId
            ? {
                ...prev,
                translatedText: currentFullText,
                pinyin: resolvedTokenPinyin,
              }
            : prev
        );
      },
      onDone: (result) => {
        const totalTranslateMs = Date.now() - startTranslateTime;
        const totalE2E = (sttMs || lastSttDurationRef.current) + totalTranslateMs;

        const fullMetrics: LatencyBreakdown = {
          ...result.breakdown,
          sttMs: sttMs || lastSttDurationRef.current || 0,
          ttsStartMs: 0,
          totalE2EMs: totalE2E,
        };

        const resolvedPinyin = result.pinyin || ((targetLang === 'zh' || /[\u4e00-\u9fa5]/.test(result.translatedText)) ? getChinesePinyin(result.translatedText) : '');

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsgId
              ? {
                  ...m,
                  originalText: result.sourceCleanText,
                  translatedText: result.translatedText,
                  pinyin: resolvedPinyin,
                  keywordTriggered: result.keywordTriggered,
                  latencyBreakdown: fullMetrics,
                }
              : m
          )
        );

        const finalFinishedMessage: ConversationMessage = {
          id: tempMsgId,
          timestamp: Date.now(),
          speaker: actualSpeaker,
          sourceLang,
          targetLang,
          originalText: result.sourceCleanText,
          translatedText: result.translatedText,
          pinyin: resolvedPinyin,
          keywordTriggered: result.keywordTriggered,
          latencyBreakdown: fullMetrics,
        };

        setLatestCompletedTurn(finalFinishedMessage);

        // Đảm bảo kết quả hiển thị tự động vào tầm nhìn ngay lập tức không cần người dùng cuộn
        setTimeout(() => {
          if (latestResultRef.current) {
            latestResultRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }
        }, 50);

        setInterimText('');
        setLiveParallelText('');
        setLiveParallelPinyin('');
        setStreamingMessageId(null);

        const nextSpeaker: 'user_a' | 'user_b' = actualSpeaker === 'user_a' ? 'user_b' : 'user_a';

        // Auto speak for recipient if enabled
        if (autoSpeakInConversation && result.translatedText) {
          handlePlayMessage(tempMsgId, result.translatedText, targetLang, fullMetrics);
        } else if (onRecordMetrics) {
          onRecordMetrics(fullMetrics);
        }

        // NẾU ĐANG TRONG CHẾ ĐỘ TỰ ĐỘNG DỊCH DÀI (5 - 10 PHÚT LIÊN TỤC):
        if (isAutoContinuous) {
          if (isMixedMode) {
            const nextLang: LanguageCode = actualSpeaker === 'user_a' ? partnerLang : 'vi';
            setMixedListeningLang(nextLang);
            continuousControllerRef.current?.switchLanguage(nextLang);
          }
          setStatus('listening', isMixedMode 
            ? `Đang tự động dịch song song cả 2 người (${maxRecordingDurationMinutes} phút)...` 
            : `Đang tự động dịch câu chuyện (${maxRecordingDurationMinutes} phút)...`);
          return;
        }

        // Trong Chế độ hỗn hợp thường (từng lượt)
        if (isMixedMode) {
          const nextLang: LanguageCode = actualSpeaker === 'user_a' ? partnerLang : 'vi';
          setMixedListeningLang(nextLang);
          if (isContinuousListeningRef.current) {
            setTimeout(() => {
              if (isContinuousListeningRef.current) {
                handleStartSpeaking(nextSpeaker);
              }
            }, 650);
          }
        } else {
          // Chỉ đổi lượt người nói thủ công khi tắt Chế độ hỗn hợp và bật Tự đổi lượt
          if (autoSwitchTurn) {
            setCurrentSpeaker(nextSpeaker);
          }
          setIsRecording(false);
          setStatus('idle');
        }
      },
      onError: (err) => {
        console.error('Conversation turn error:', err);
        setStatus('error', 'Lỗi xử lý câu thoại');
        onError(err.message || 'Lỗi xử lý câu thoại.');
        if (!isAutoContinuous) {
          setIsRecording(false);
          isContinuousListeningRef.current = false;
        }
        setInterimText('');
        setLiveParallelText('');
        setLiveParallelPinyin('');
        setStreamingMessageId(null);
      },
    });
  };

  // Chuyển đổi kênh nghe trong Chế độ hỗn hợp mà không làm mất trạng thái phiên
  const handleSwitchMixedListening = (lang: LanguageCode) => {
    setMixedListeningLang(lang);
    if (isRecording) {
      stopSpeaking();
      if (isAutoTranslateMode && continuousControllerRef.current) {
        continuousControllerRef.current.switchLanguage(lang);
      } else {
        recognitionRef.current?.abort();
        setTimeout(() => {
          handleStartSpeaking(lang === 'vi' ? 'user_a' : 'user_b');
        }, 100);
      }
    }
  };

  // Start listening with the single button
  const handleStartSpeaking = (overrideSpeaker?: 'user_a' | 'user_b') => {
    // Barge-in: Stop any current speech playback immediately
    interruptPlayback();
    setPlayingMessageId(null);
    isContinuousListeningRef.current = true;

    let speaker = overrideSpeaker || currentSpeaker;
    if (isMixedMode) {
      if (overrideSpeaker) {
        speaker = overrideSpeaker;
      } else {
        speaker = mixedListeningLang === 'vi' ? 'user_a' : 'user_b';
      }
    }
    const lang: LanguageCode = speaker === 'user_a' ? 'vi' : partnerLang;
    const targetLang: LanguageCode = speaker === 'user_a' ? partnerLang : 'vi';

    setIsRecording(true);
    setInterimText('');
    setLiveParallelText('');
    setLiveParallelPinyin('');
    setLiveDetectedLang(lang);
    
    const speakerLabel = speaker === 'user_a' ? 'Bạn (Tiếng Việt)' : partnerLangInfo.name;

    // CHẾ ĐỘ TỰ ĐỘNG DỊCH DÀI THEO CÂU CHUYỆN (5 - 10 PHÚT LIÊN TỤC)
    if (isAutoTranslateMode) {
      setStatus('listening', isMixedMode 
        ? `Đang tự động dịch song song cả 2 người (${maxRecordingDurationMinutes} phút)...` 
        : `Đang tự động dịch câu chuyện (${maxRecordingDurationMinutes} phút)...`);

      continuousControllerRef.current = startContinuousStorySpeechRecognition({
        language: lang,
        maxDurationSeconds: maxRecordingDurationMinutes * 60,
        sentenceSilenceTimeoutMs: 1800,
        allowBargeIn: settings.allowBargeIn,
        onStart: () => {
          setStatus('listening', isMixedMode
            ? `Đang tự động dịch song song cả 2 người (${maxRecordingDurationMinutes} phút)...`
            : `Đang tự động dịch câu chuyện (${maxRecordingDurationMinutes} phút)...`);
        },
        onInterim: (interim) => {
          setInterimText(interim);
          let srcLang = lang;
          let tgtLang = targetLang;
          if (isMixedMode) {
            srcLang = detectSpokenLanguage(interim, lang, partnerLang);
            tgtLang = srcLang === 'vi' ? partnerLang : 'vi';
            setLiveDetectedLang(srcLang);
          }
          // Dịch song song trực tiếp theo thời gian thực khi đang nói
          requestParallelTranslation(interim, srcLang, tgtLang);
        },
        onSentenceComplete: (sentenceText, durationMs) => {
          // Tự động chốt từng câu và phiên dịch song song tức thì
          setInterimText('');
          setLiveParallelText('');
          setLiveParallelPinyin('');
          lastSttDurationRef.current = durationMs;
          setStatus('recognizing', 'Đang nhận diện câu...');
          handleConversationTurn(speaker, sentenceText, durationMs, true /* isAutoContinuous */);
        },
        onTick: (sec) => {
          setRecordingSeconds(sec);
        },
        onTimeout: () => {
          setIsRecording(false);
          isContinuousListeningRef.current = false;
          setStatus('idle', `Đã hoàn tất thời gian ghi âm tự động (${maxRecordingDurationMinutes} phút)`);
        },
        onError: (errMsg) => {
          setIsRecording(false);
          isContinuousListeningRef.current = false;
          setInterimText('');
          setLiveParallelText('');
          setLiveParallelPinyin('');
          setStatus('error', errMsg);
          onError(errMsg);
        },
        onEnd: () => {
          if (!isContinuousListeningRef.current) {
            setIsRecording(false);
            setStatus('idle');
          }
        },
      });
      return;
    }

    // Chế độ nhận dạng câu ngắn chuẩn (từng câu)
    setStatus('listening', isMixedMode ? `Đang nghe cả 2 người nói...` : `Đang nghe ${speakerLabel}...`);

    // Tăng thời lượng nghe phát hiện ngôn ngữ lên như 1 cuộc nói chuyện ngắn:
    const conversationSilenceTimeout = 2500;

    recognitionRef.current = startSpeechRecognition({
      language: lang,
      keywordDichEnabled: speaker === 'user_a' ? settings.keywordDichEnabled : false,
      quickSilenceTimeoutMs: conversationSilenceTimeout,
      allowBargeIn: settings.allowBargeIn,
      onStart: () => {
        setStatus('listening', isMixedMode ? `Đang nghe cả 2 người nói...` : `Đang nghe ${speakerLabel}...`);
      },
      onInterim: (interim) => {
        setInterimText(interim);
        let srcLang = lang;
        let tgtLang = targetLang;
        if (isMixedMode) {
          srcLang = detectSpokenLanguage(interim, lang, partnerLang);
          tgtLang = srcLang === 'vi' ? partnerLang : 'vi';
          setLiveDetectedLang(srcLang);
        }
        // Dịch song song trực tiếp khi nói chuyện
        requestParallelTranslation(interim, srcLang, tgtLang);
      },
      onResult: (finalText, sttMs) => {
        setInterimText(finalText);
        lastSttDurationRef.current = sttMs;
        setStatus('recognizing', 'Đang nhận diện...');
        handleConversationTurn(speaker, finalText, sttMs);
      },
      onError: (errMsg) => {
        setIsRecording(false);
        isContinuousListeningRef.current = false;
        setInterimText('');
        setLiveParallelText('');
        setLiveParallelPinyin('');
        setStatus('error', errMsg);
        onError(errMsg);
      },
      onEnd: () => {
        if (status === 'listening' && !isContinuousListeningRef.current) {
          setIsRecording(false);
          setStatus('idle');
        }
      },
    });
  };

  // Stop listening manually with the same button
  const handleStopSpeaking = () => {
    isContinuousListeningRef.current = false;
    if (continuousControllerRef.current) {
      continuousControllerRef.current.stop();
      continuousControllerRef.current = null;
    }
    recognitionRef.current?.stop();
    setIsRecording(false);
    setStatus('idle', 'Đã tạm dừng');
  };

  // Đồng bộ trạng thái khi thanh Header bấm tạm dừng mic
  useEffect(() => {
    if (status === 'idle' && isRecording) {
      setIsRecording(false);
      isContinuousListeningRef.current = false;
      if (continuousControllerRef.current) {
        continuousControllerRef.current.stop();
        continuousControllerRef.current = null;
      }
      recognitionRef.current?.stop();
    }
  }, [status]);

  // Nhận tín hiệu bấm nút Trạng thái / Sẵn sàng trên Header để bắt đầu/tạm dừng mic
  const prevTriggerRef = useRef<number>(0);
  useEffect(() => {
    if (toggleMicTrigger && toggleMicTrigger > prevTriggerRef.current) {
      prevTriggerRef.current = toggleMicTrigger;
      if (isRecording) {
        handleStopSpeaking();
      } else {
        handleStartSpeaking();
      }
    }
  }, [toggleMicTrigger, isRecording]);

  // Toggle speaker manually
  const handleToggleSpeaker = () => {
    if (isRecording) {
      handleStopSpeaking();
    }
    setCurrentSpeaker((prev) => (prev === 'user_a' ? 'user_b' : 'user_a'));
  };

  const handlePlayMessage = (
    msgId: string,
    text: string,
    lang: LanguageCode,
    currentMetrics?: LatencyBreakdown
  ) => {
    stopSpeaking();
    setPlayingMessageId(msgId);
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
        setPlayingMessageId(null);
        setStatus('idle');
      },
      onError: (err) => {
        setPlayingMessageId(null);
        setStatus('idle');
        onError(err);
      },
    });
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    stopSpeaking();
    recognitionRef.current?.abort();
    setMessages([]);
    setIsRecording(false);
    setInterimText('');
    setLiveParallelText('');
    setLiveParallelPinyin('');
    setLatestCompletedTurn(null);
    setStatus('idle');
  };

  const isUserASpeaking = currentSpeaker === 'user_a';
  const activeLangInfo = isUserASpeaking ? SUPPORTED_LANGUAGES.vi : partnerLangInfo;
  const targetLangInfo = isUserASpeaking ? partnerLangInfo : SUPPORTED_LANGUAGES.vi;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. THANH CHỌN NGÔN NGỮ GỌN GÀNG Ở TRÊN CÙNG & CHÚ THÍCH MÀU SẮC NHẬN DẠNG */}
      <div className="bg-white rounded-xl px-3 py-2 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide">
            Dịch:
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/80">
            🇻🇳 Tiếng Việt
          </span>
          <span className="text-slate-400 font-bold text-xs">⇄</span>
          <select
            value={partnerLang}
            onChange={(e) => onPartnerLangChange(e.target.value as LanguageCode)}
            disabled={isRecording}
            className="bg-blue-50/60 hover:bg-blue-100/60 border border-blue-200 rounded-lg py-1 px-2 text-xs sm:text-sm font-bold text-blue-800 transition-all focus:outline-hidden focus:ring-2 focus:ring-blue-200 cursor-pointer disabled:opacity-50"
          >
            {Object.values(SUPPORTED_LANGUAGES)
              .filter((l) => l.code !== 'vi')
              .map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} ({lang.nativeName})
                </option>
              ))}
          </select>
        </div>

        {/* Chú thích màu sắc nhận diện 2 ngôn ngữ */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] font-bold flex-wrap">
          <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-300 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            🇻🇳 Chữ Xanh Lá
          </span>
          <span className="inline-flex items-center gap-1 text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-300 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            {partnerLangInfo.flag} Chữ Xanh Dương
          </span>

          {/* Tự đọc toggle */}
          <button
            type="button"
            onClick={() => setAutoSpeakInConversation(!autoSpeakInConversation)}
            title={autoSpeakInConversation ? 'Tự động đọc bản dịch: Đang bật' : 'Tự động đọc bản dịch: Đang tắt'}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              autoSpeakInConversation
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
          >
            {autoSpeakInConversation ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Xóa lịch sử khi có tin nhắn */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={isRecording}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer"
              title="Xóa tất cả tin nhắn đối thoại"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. KHU VỰC NHẤN ĐỂ NÓI CHÍNH - HIỂN THỊ NGAY TRÊN MÀN HÌNH ĐIỆN THOẠI KHÔNG CẦN CUỘN */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        {/* Thanh chọn người nói & Chế độ hỗn hợp: Thể hiện trực quan giao tiếp 2 chiều */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* NẾU ĐANG BẬT CHẾ ĐỘ HỖN HỢP: HIỂN THỊ RÕ RÀNG GIAO TIẾP 2 CHIỀU, KHÔNG HIỂN THỊ ĐỔI LƯỢT THÀNH NGƯỜI THỨ 2 */}
          {isMixedMode ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-100 via-indigo-100 to-blue-100 border border-purple-300 text-purple-900 font-extrabold shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-700" />
                </span>
                <span>🔀 Giao tiếp hỗn hợp:</span>
                <span className="text-emerald-800 font-black">🇻🇳 Việt</span>
                <span className="text-purple-400 font-bold">⇄</span>
                <span className="text-blue-800 font-black">{partnerLangInfo.flag} {partnerLangInfo.name}</span>
              </div>

              {/* Bộ chọn kênh mic trong chế độ hỗn hợp */}
              <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[11px]">
                <span className="text-slate-400 font-medium px-1.5">Kênh mic:</span>
                <button
                  type="button"
                  onClick={() => handleSwitchMixedListening('vi')}
                  className={`px-2 py-0.8 rounded-lg font-bold transition-all cursor-pointer ${
                    mixedListeningLang === 'vi'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                  title="Ưu tiên nhận diện Tiếng Việt"
                >
                  🇻🇳 Tiếng Việt
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMixedListening(partnerLang)}
                  className={`px-2 py-0.8 rounded-lg font-bold transition-all cursor-pointer ${
                    mixedListeningLang === partnerLang
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                  title={`Ưu tiên nhận diện ${partnerLangInfo.name}`}
                >
                  {partnerLangInfo.flag} {partnerLangInfo.name}
                </button>
              </div>
            </div>
          ) : (
            /* KHI TẮT CHẾ ĐỘ HỖN HỢP: HIỂN THỊ ĐỔI LƯỢT THỦ CÔNG */
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Lượt nói:</span>
              <button
                type="button"
                onClick={handleToggleSpeaker}
                disabled={isRecording}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  isUserASpeaking
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-200'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs ring-2 ring-blue-200'
                }`}
                title="Bấm để đổi lượt người nói giữa Bạn và Người đối thoại"
              >
                <span>{activeLangInfo.flag}</span>
                <span>{isUserASpeaking ? 'Bạn (Tiếng Việt)' : `Đối thoại (${partnerLangInfo.name})`}</span>
                <ArrowRightLeft className="w-3 h-3 opacity-80 ml-0.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Chế độ hỗn hợp */}
            <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer select-none ${
              isMixedMode
                ? 'bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border-purple-300 text-purple-900 shadow-xs ring-2 ring-purple-100'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="Lắng nghe cả 2 người nói chuyện, tự động phát hiện Tiếng Việt hoặc Ngôn ngữ đối thoại để dịch chéo 2 chiều">
              <input
                type="checkbox"
                checked={isMixedMode}
                onChange={(e) => {
                  setIsMixedMode(e.target.checked);
                }}
                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 border-purple-300"
              />
              <span className="flex items-center gap-1">
                <span>🔀 Chế độ hỗn hợp</span>
                <span className="hidden xs:inline text-[10px] text-purple-700 font-semibold bg-purple-100/80 px-1.5 py-0.2 rounded-full">
                  Nghe 2 người
                </span>
              </span>
            </label>

            {/* CHẾ ĐỘ TỰ ĐỘNG DỊCH CÂU CHUYỆN SONG SONG (5 - 10 PHÚT) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer select-none ${
                isAutoTranslateMode
                  ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 border-amber-300 text-amber-950 shadow-xs ring-2 ring-amber-200'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title="Ghi âm dài liên tục 5 - 10 phút, tự động bắt từng câu và phiên dịch song song theo dòng câu chuyện">
                <input
                  type="checkbox"
                  checked={isAutoTranslateMode}
                  onChange={(e) => setIsAutoTranslateMode(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 border-amber-300"
                />
                <span className="flex items-center gap-1">
                  <span>⚡ Tự động dịch dài</span>
                  <span className="text-[10px] text-amber-700 font-black bg-amber-100 px-1.5 py-0.2 rounded-full">
                    {maxRecordingDurationMinutes}p
                  </span>
                </span>
              </label>

              {/* Lựa chọn thời lượng 5 phút / 10 phút / 15 phút */}
              {isAutoTranslateMode && (
                <div className="inline-flex items-center gap-0.5 bg-amber-100/70 p-0.5 rounded-xl border border-amber-300/80 text-[11px]">
                  {[5, 10, 15].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setMaxRecordingDurationMinutes(mins)}
                      disabled={isRecording}
                      className={`px-1.5 py-0.5 rounded-lg font-black text-[10px] sm:text-[11px] transition-all cursor-pointer ${
                        maxRecordingDurationMinutes === mins
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'text-amber-900/80 hover:bg-amber-200/60'
                      }`}
                      title={`Thời lượng ghi âm tự động tối đa ${mins} phút`}
                    >
                      {mins}p
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tự đổi lượt (chỉ hiển thị khi tắt chế độ hỗn hợp) */}
            {!isMixedMode && (
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSwitchTurn}
                  onChange={(e) => setAutoSwitchTurn(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="hidden xs:inline">Tự đổi lượt</span>
                <span className="xs:hidden">Tự đổi</span>
              </label>
            )}
          </div>
        </div>

        {/* NÚT NHẤN ĐỂ NÓI DUY NHẤT VÀ NỔI BẬT */}
        {isRecording ? (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={handleStopSpeaking}
              className="w-full py-4 sm:py-5 rounded-2xl font-bold text-base sm:text-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-3 shadow-lg shadow-red-500/30 active:scale-98 transition-all cursor-pointer animate-pulse"
            >
              <Square className="w-5 h-5 sm:w-6 sm:h-6 fill-white" />
              <span>
                {isAutoTranslateMode ? (
                  <>Đang tự động dịch song song ({formatDuration(recordingSeconds)} / {maxRecordingDurationMinutes}:00) • Chạm để Dừng</>
                ) : isMixedMode ? (
                  'Đang nghe cả 2 người... Chạm để Dừng'
                ) : (
                  'Đang nghe... Chạm để Dừng & Dịch'
                )}
              </span>
            </button>
            {/* Thanh tiến trình thời lượng ghi âm khi ở chế độ tự động dịch dài */}
            {isAutoTranslateMode && (
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-red-500 h-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, (recordingSeconds / (maxRecordingDurationMinutes * 60)) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleStartSpeaking()}
            className={`w-full py-4 sm:py-5 rounded-2xl font-bold text-base sm:text-lg text-white flex items-center justify-center gap-3 shadow-lg active:scale-98 transition-all cursor-pointer ${
              isAutoTranslateMode
                ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-indigo-700 hover:from-amber-700 hover:to-indigo-800 shadow-orange-500/25'
                : isMixedMode
                ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 shadow-indigo-600/25'
                : isUserASpeaking
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/25'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-600/25'
            }`}
          >
            <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>
              {isAutoTranslateMode ? (
                <>Nhấn để nói (Tự động dịch câu chuyện song song {maxRecordingDurationMinutes} phút)</>
              ) : isMixedMode ? (
                <>Nhấn để nói (Chế độ hỗn hợp: 🇻🇳 ⇄ {partnerLangInfo.flag} {partnerLangInfo.name})</>
              ) : isUserASpeaking ? (
                <>Nhấn để nói (Bạn - Tiếng Việt → {partnerLangInfo.name})</>
              ) : (
                <>Nhấn để nói ({partnerLangInfo.name} → Tiếng Việt)</>
              )}
            </span>
          </button>
        )}

        {/* Thông tin hỗ trợ ngắn gọn bên dưới nút */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-0.5 flex-wrap gap-1">
          <span>
            {isAutoTranslateMode
              ? `🎙️ Tự động dịch dài: Ghi âm liên tục ${maxRecordingDurationMinutes} phút • Tự động chốt từng câu và phiên dịch song song theo câu chuyện`
              : isMixedMode
              ? 'Lắng nghe tự nhiên cả 2 bên (Nói tiếng Việt dịch sang ngoại ngữ, nói ngoại ngữ dịch sang tiếng Việt)'
              : 'Thời lượng nghe tự nhiên (ngắt quãng 2.5s)'}
          </span>
          {settings.keywordDichEnabled && isUserASpeaking && !isAutoTranslateMode && (
            <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
              <Sparkles className="w-3 h-3" /> Nói &quot;dịch&quot; để chốt câu
            </span>
          )}
        </div>

        {/* DỊCH SONG SONG KHI NÓI CHUYỆN (Chỉ hiển thị khi đang có câu nói thực tế) */}
        {isRecording && (interimText || liveParallelText) && (
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-3 sm:p-3.5 shadow-sm space-y-2.5 mt-2 animate-fadeIn">
            {/* Header trạng thái nghe */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                {isMixedMode ? (
                  <span className="text-purple-900 font-extrabold">
                    🔀 Đang nghe cả 2 người ({SUPPORTED_LANGUAGES[mixedListeningLang]?.flag} {SUPPORTED_LANGUAGES[mixedListeningLang]?.name})
                  </span>
                ) : (
                  <span className={liveDetectedLang === 'vi' ? 'text-emerald-800' : 'text-blue-800'}>
                    Đang nghe: {SUPPORTED_LANGUAGES[liveDetectedLang]?.flag} {SUPPORTED_LANGUAGES[liveDetectedLang]?.name}
                  </span>
                )}
                <span className="font-mono text-slate-500 text-[11px] ml-1">
                  ({String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')})
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-100/90 px-2 py-0.5 rounded-full">
                <Radio className="w-3 h-3 animate-pulse text-purple-600" />
                <span>Dịch song song trực tiếp</span>
              </div>
            </div>

            {/* Câu nói đang nhận diện (Màu phân biệt theo ngôn ngữ người nói) */}
            <div className={`rounded-xl p-2.5 border min-h-[38px] text-xs sm:text-sm font-semibold transition-all ${
              liveDetectedLang === 'vi'
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                : 'bg-blue-50/80 border-blue-300 text-blue-950'
            }`}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className={liveDetectedLang === 'vi' ? 'text-emerald-800 font-bold' : 'text-blue-800 font-bold'}>
                  {liveDetectedLang === 'vi' ? '🇻🇳 Đang nói (Tiếng Việt):' : `${partnerLangInfo.flag} Đang nói (${partnerLangInfo.name}):`}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Đang nhận diện giọng nói</span>
              </div>
              <div>
                {interimText || <span className="text-slate-400 font-normal italic">Đang lắng nghe câu nói...</span>}
              </div>
            </div>

            {/* Kết quả DỊCH SONG SONG cập nhật tức thì (Màu tương phản của ngôn ngữ đích) */}
            <div className={`rounded-xl p-3 shadow-xs text-white transition-all ${
              liveDetectedLang === 'vi'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-semibold text-white/80 mb-1">
                <span>
                  {liveDetectedLang === 'vi'
                    ? `${partnerLangInfo.flag} Bản dịch sang ${partnerLangInfo.name} (Chữ Xanh Dương):`
                    : '🇻🇳 Bản dịch sang Tiếng Việt (Chữ Xanh Lá):'}
                </span>
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
              </div>
              <div className="text-sm sm:text-base font-extrabold text-white tracking-wide min-h-[22px]">
                {liveParallelText || (
                  <span className="text-white/70 font-normal italic text-xs">
                    Bản dịch xuất hiện song song ngay khi bạn đang nói...
                  </span>
                )}
              </div>

              {/* Pinyin song song nếu là tiếng Trung */}
              {liveParallelPinyin && (
                <div className="mt-2 pt-2 border-t border-white/20 text-xs font-bold text-amber-200 select-all">
                  <span className="text-amber-300 text-[10px] mr-1 uppercase font-bold">Pinyin:</span>
                  {liveParallelPinyin}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trạng thái mic đang lắng nghe chờ người nói (gọn gàng, không che khuất kết quả dịch) */}
        {isRecording && !interimText && !liveParallelText && (
          <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold animate-pulse mt-2 ${
            isAutoTranslateMode
              ? 'bg-amber-50/80 border-amber-300 text-amber-950'
              : 'bg-purple-50/80 border-purple-200 text-purple-900'
          }`}>
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isAutoTranslateMode ? 'bg-amber-500' : 'bg-purple-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isAutoTranslateMode ? 'bg-amber-600' : 'bg-purple-600'
              }`} />
            </span>
            <span>
              {isAutoTranslateMode ? (
                <>🎙️ Đang tự động dịch câu chuyện ({formatDuration(recordingSeconds)} / {maxRecordingDurationMinutes}:00)... Hãy nói tự nhiên, từng câu sẽ tự động dịch song song</>
              ) : isMixedMode ? (
                `🔀 Đang nghe cả 2 người (Kênh mic: ${SUPPORTED_LANGUAGES[mixedListeningLang]?.flag} ${SUPPORTED_LANGUAGES[mixedListeningLang]?.name})... Hãy nói tự nhiên`
              ) : (
                `Đang nghe ${activeLangInfo.name}... Hãy bắt đầu nói`
              )}
            </span>
          </div>
        )}

        {/* KẾT QUẢ DỊCH HOÀN TẤT - LUÔN HIỂN THỊ TỨC THÌ NGAY DƯỚI NÚT NÓI, XEM ĐƯỢC LUÔN KHÔNG CẦN CUỘN XUỐNG */}
        {latestCompletedTurn && (
          <div 
            ref={latestResultRef}
            className={`rounded-2xl p-3.5 sm:p-4 border-2 shadow-sm space-y-2.5 mt-2 animate-fadeIn transition-all ${
              latestCompletedTurn.targetLang === 'vi'
                ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-100'
                : 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-100'
            }`}
          >
            {/* Header thông báo vừa dịch xong */}
            <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200">
              <div className="flex items-center gap-1.5 font-bold">
                {streamingMessageId === latestCompletedTurn.id || status === 'translating' ? (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-600 animate-spin" />
                    <span className="text-purple-900 font-extrabold">ĐANG PHIÊN DỊCH TRỰC TIẾP...</span>
                  </>
                ) : isMixedMode ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-purple-950 font-extrabold">🔀 BẢN DỊCH HỖN HỢP:</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-slate-800 font-extrabold">KẾT QUẢ VỪA DỊCH:</span>
                  </>
                )}
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                  latestCompletedTurn.sourceLang === 'vi' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}>
                  {latestCompletedTurn.sourceLang === 'vi' ? '🇻🇳 Bạn vừa nói' : `${partnerLangInfo.flag} Đối thoại vừa nói`}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                <span>Tự động xem được luôn</span>
              </div>
            </div>

            {/* Câu nói gốc */}
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-400 mr-1">Nguyên văn:</span>
              <span className="italic font-medium text-slate-700">&quot;{latestCompletedTurn.originalText}&quot;</span>
            </div>

            {/* BẢN DỊCH CHÍNH TO RÕ RÀNG */}
            <div className={`p-3 rounded-xl border ${
              latestCompletedTurn.targetLang === 'vi'
                ? 'bg-white border-emerald-200'
                : 'bg-white border-blue-200'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className={latestCompletedTurn.targetLang === 'vi' ? 'text-emerald-800' : 'text-blue-800'}>
                  {latestCompletedTurn.targetLang === 'vi' 
                    ? '🇻🇳 Bản dịch sang Tiếng Việt (Chữ Xanh Lá):' 
                    : `${partnerLangInfo.flag} Bản dịch sang ${partnerLangInfo.name} (Chữ Xanh Dương):`}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                  latestCompletedTurn.targetLang === 'vi' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {latestCompletedTurn.targetLang === 'vi' ? 'Tiếng Việt' : partnerLangInfo.name}
                </span>
              </div>

              <div className={`text-base sm:text-xl font-extrabold leading-snug tracking-wide select-all ${
                latestCompletedTurn.targetLang === 'vi' ? 'text-emerald-700' : 'text-blue-700'
              }`}>
                {latestCompletedTurn.translatedText || (
                  <span className="text-slate-400 font-normal italic text-sm animate-pulse">
                    Đang tạo bản dịch trực tiếp...
                  </span>
                )}
              </div>

              {/* Pinyin phiên âm chuẩn nếu liên quan tiếng Trung */}
              {(latestCompletedTurn.targetLang === 'zh' || latestCompletedTurn.sourceLang === 'zh' || latestCompletedTurn.pinyin || /[\u4e00-\u9fa5]/.test(latestCompletedTurn.translatedText)) && (
                <div className="mt-2 pt-2 border-t border-amber-200/80 bg-amber-50/90 p-2 sm:p-2.5 rounded-xl border border-amber-300">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-amber-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>🇨🇳</span> PINYIN (Phiên âm chuẩn thanh điệu):
                    </span>
                    <button
                      type="button"
                      disabled={!latestCompletedTurn.pinyin && !latestCompletedTurn.translatedText}
                      onClick={() => {
                        const p = latestCompletedTurn.pinyin || getChinesePinyin(latestCompletedTurn.targetLang === 'zh' ? latestCompletedTurn.translatedText : latestCompletedTurn.originalText);
                        navigator.clipboard.writeText(p);
                      }}
                      className="text-[10px] text-amber-700 hover:text-amber-900 font-bold hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Sao chép Pinyin
                    </button>
                  </div>
                  <div className="text-xs sm:text-sm font-bold font-mono text-amber-950 select-all">
                    {latestCompletedTurn.pinyin || getChinesePinyin(latestCompletedTurn.targetLang === 'zh' ? latestCompletedTurn.translatedText : latestCompletedTurn.originalText) || (
                      <span className="text-amber-700/60 font-normal italic text-xs">Đang nạp pinyin...</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Thanh thao tác nhanh: Nghe & Sao chép */}
            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                disabled={!latestCompletedTurn.translatedText}
                onClick={() => handlePlayMessage(latestCompletedTurn.id, latestCompletedTurn.translatedText, latestCompletedTurn.targetLang)}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  playingMessageId === latestCompletedTurn.id
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                <span>{playingMessageId === latestCompletedTurn.id ? 'Đang đọc...' : 'Nghe phát âm'}</span>
              </button>

              <button
                type="button"
                disabled={!latestCompletedTurn.translatedText}
                onClick={() => handleCopyMessage(latestCompletedTurn.id, latestCompletedTurn.translatedText)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiedId === latestCompletedTurn.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedId === latestCompletedTurn.id ? 'Đã sao chép' : 'Sao chép bản dịch'}</span>
              </button>
            </div>

            {/* Thông báo duy trì Chế độ hỗn hợp */}
            {isMixedMode && (
              <div className="mt-1 text-[11px] text-center text-purple-800 bg-purple-50/90 border border-purple-200/80 py-1 px-2 rounded-xl font-medium">
                🔀 Đang sẵn sàng nhận diện 2 chiều (Kênh mic: {SUPPORTED_LANGUAGES[mixedListeningLang]?.flag} {SUPPORTED_LANGUAGES[mixedListeningLang]?.name}) — Cả 2 bên đều có thể nói tự nhiên
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. LỊCH SỬ HỘI THOẠI (CHỈ XUẤT HIỆN KHI CÓ CÂU NÓI - KHÔNG TỐN DIỆN TÍCH KHI CHƯA NÓI) */}
      {messages.length === 0 ? (
        <div className="text-center py-2 text-xs text-slate-400">
          Chạm nút <span className="font-semibold text-slate-600">Nhấn để nói</span> ở trên để bắt đầu đàm thoại. Dịch song song hai chiều tức thì.
        </div>
      ) : (
        <div className="space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-semibold">
            <span>Cuộc trò chuyện ({messages.length} câu)</span>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={isRecording}
              className="text-[11px] text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa hội thoại</span>
            </button>
          </div>

          <div 
            ref={messagesContainerRef}
            className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-3 sm:p-4 max-h-[420px] overflow-y-auto space-y-3"
          >
            {messages.map((msg) => {
              const isVietnameseSpoken = msg.sourceLang === 'vi';
              const isPlayingThis = playingMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isVietnameseSpoken ? 'items-start' : 'items-end'}`}
                >
                  {/* Speaker Header with distinct badge */}
                  <div className={`flex items-center gap-1.5 mb-1 text-xs font-bold ${
                    isVietnameseSpoken ? 'text-emerald-700' : 'text-blue-700'
                  }`}>
                    <span className="text-sm">{SUPPORTED_LANGUAGES[msg.sourceLang]?.flag}</span>
                    <span>{isVietnameseSpoken ? 'Bạn (Tiếng Việt)' : `Đối thoại (${partnerLangInfo.name})`}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.latencyBreakdown && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-md font-mono flex items-center gap-0.5 font-normal">
                        <Zap className="w-2.5 h-2.5 text-amber-500" />
                        {msg.latencyBreakdown.totalE2EMs || msg.latencyBreakdown.apiTotalMs}ms
                      </span>
                    )}
                    {msg.keywordTriggered && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md font-medium">
                        Từ khóa &quot;dịch&quot;
                      </span>
                    )}
                  </div>

                  {/* Message Bubble Card with distinctive language border & font color */}
                  <div className={`max-w-[94%] sm:max-w-[84%] rounded-2xl p-3 sm:p-3.5 shadow-xs border-2 ${
                    isVietnameseSpoken
                      ? 'bg-white border-emerald-300 rounded-tl-sm'
                      : 'bg-white border-blue-300 rounded-tr-sm'
                  }`}>
                    {/* Phần 1: Câu nói gốc */}
                    <div className="mb-2 pb-1.5 border-b border-slate-100">
                      <div className="flex items-center justify-between text-[11px] font-bold mb-0.5">
                        <span className={isVietnameseSpoken ? 'text-emerald-800' : 'text-blue-800'}>
                          {isVietnameseSpoken ? '🇻🇳 Câu nói (Tiếng Việt):' : `${partnerLangInfo.flag} Câu nói (${partnerLangInfo.name}):`}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">Nguyên bản</span>
                      </div>
                      <div className={`text-xs sm:text-sm font-medium italic ${
                        isVietnameseSpoken ? 'text-emerald-950' : 'text-blue-950'
                      }`}>
                        &quot;{msg.originalText}&quot;
                      </div>
                    </div>

                    {/* Phần 2: Bản dịch với MÀU CHỮ ĐẶC TRƯNG để nhận dạng dễ:
                        - Bản dịch sang Ngoại ngữ (Tiếng Trung, Tiếng Anh...): CHỮ XANH DƯƠNG (text-blue-700)
                        - Bản dịch sang Tiếng Việt: CHỮ XANH LÁ (text-emerald-700) */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold mb-0.5">
                        <span className={isVietnameseSpoken ? 'text-blue-800' : 'text-emerald-800'}>
                          {isVietnameseSpoken
                            ? `${partnerLangInfo.flag} Bản dịch sang ${partnerLangInfo.name} (Chữ Xanh Dương):`
                            : '🇻🇳 Bản dịch sang Tiếng Việt (Chữ Xanh Lá):'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                          isVietnameseSpoken ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isVietnameseSpoken ? partnerLangInfo.name : 'Tiếng Việt'}
                        </span>
                      </div>
                      <div className={`text-sm sm:text-base font-extrabold leading-snug tracking-wide ${
                        isVietnameseSpoken ? 'text-blue-700' : 'text-emerald-700'
                      }`}>
                        {msg.translatedText || (
                          <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs italic font-normal">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                            Đang tạo bản dịch...
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Phần 3: Pinyin tiếng Trung (Chữ Vàng Hổ Phách text-amber-900) */}
                    {(msg.targetLang === 'zh' || msg.sourceLang === 'zh' || /[\u4e00-\u9fa5]/.test(msg.translatedText) || /[\u4e00-\u9fa5]/.test(msg.originalText)) && (
                      <div className="mt-2 pt-2 border-t border-amber-200/80 bg-amber-50/90 p-2 sm:p-2.5 rounded-xl border border-amber-300/80">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-amber-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <span>🇨🇳</span> PINYIN (Phiên âm chuẩn thanh điệu):
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const p = msg.pinyin || getChinesePinyin(msg.targetLang === 'zh' ? msg.translatedText : msg.originalText);
                              navigator.clipboard.writeText(p);
                            }}
                            className="text-[10px] text-amber-700 hover:text-amber-900 font-bold hover:underline cursor-pointer"
                          >
                            Sao chép Pinyin
                          </button>
                        </div>
                        <div className="text-xs sm:text-sm font-bold font-mono select-all text-amber-950">
                          {msg.pinyin || getChinesePinyin(msg.targetLang === 'zh' ? msg.translatedText : msg.originalText)}
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    {msg.translatedText && (
                      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handlePlayMessage(msg.id, msg.translatedText, msg.targetLang)}
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                            isPlayingThis
                              ? 'bg-rose-500 text-white animate-pulse'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>{isPlayingThis ? 'Đang đọc...' : 'Nghe'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.translatedText)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Sao chép bản dịch"
                        >
                          {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedId === msg.id ? 'Đã chép' : 'Sao chép'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
