import { LanguageCode, SUPPORTED_LANGUAGES } from '../types/translator';

// Augment window for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

/**
 * Checks if browser supports native Web Speech Recognition
 */
export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Checks if browser supports Speech Synthesis (TTS)
 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Helper to test and request microphone permissions
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Trình duyệt không hỗ trợ truy cập thiết bị âm thanh.');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error('Bạn đã từ chối quyền truy cập Micro. Vui lòng nhấn vào biểu tượng ổ khóa cạnh địa chỉ web và cho phép Micro.');
    }
    throw new Error(err.message || 'Không thể kết nối với Micro.');
  }
}

export interface SpeechRecognitionController {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

// Global flag to track playback state & avoid browser feedback loop (hearing itself)
let isSpeakingGlobal = false;
let currentAudioElement: HTMLAudioElement | null = null;
let activeRecognitionGlobal: any = null;

export function isCurrentlySpeaking(): boolean {
  return isSpeakingGlobal;
}

export function isRecognitionActive(): boolean {
  return !!activeRecognitionGlobal;
}

/**
 * Tạm dừng hoặc hủy phiên nhận diện giọng nói đang hoạt động
 */
export function stopActiveRecognition(): void {
  if (activeRecognitionGlobal) {
    try {
      activeRecognitionGlobal.abort();
    } catch (e) {
      // Ignored
    }
    activeRecognitionGlobal = null;
  }
}

/**
 * Barge-in / Interrupt helper: immediately halts any audio playback
 */
export function interruptPlayback(): void {
  stopSpeaking();
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.currentTime = 0;
    currentAudioElement = null;
  }
  isSpeakingGlobal = false;
}

/**
 * Creates and starts an ultra-low latency SpeechRecognition session
 */
export function startSpeechRecognition({
  language,
  keywordDichEnabled = true,
  quickSilenceTimeoutMs = 650,
  allowBargeIn = true,
  onResult,
  onInterim,
  onError,
  onStart,
  onEnd,
}: {
  language: LanguageCode;
  keywordDichEnabled?: boolean;
  quickSilenceTimeoutMs?: number;
  allowBargeIn?: boolean;
  onResult: (finalText: string, sttDurationMs: number) => void;
  onInterim?: (interimText: string) => void;
  onError: (errorMsg: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}): SpeechRecognitionController {
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    onError('Trình duyệt không hỗ trợ nhận dạng giọng nói trực tiếp (Web Speech API). Bạn có thể nhập văn bản bằng bàn phím hoặc sử dụng trình duyệt Chrome/Edge.');
    return {
      start: () => {},
      stop: () => {},
      abort: () => {},
    };
  }

  // Barge-in: if audio is currently playing and user starts talking, interrupt playback
  if (allowBargeIn && isSpeakingGlobal) {
    interruptPlayback();
  }

  const recognition = new SpeechRecognitionClass();
  activeRecognitionGlobal = recognition;
  const langConfig = SUPPORTED_LANGUAGES[language];
  recognition.lang = langConfig?.bcp47 || 'vi-VN';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let latestFullText = '';
  let hasEnded = false;
  let hasTriggeredResult = false;
  let silenceTimer: any = null;
  let speechStartTime = Date.now();

  const triggerResultNow = (textToUse: string) => {
    if (hasTriggeredResult) return;
    const clean = textToUse.trim();
    if (!clean) return;
    hasTriggeredResult = true;
    clearTimeout(silenceTimer);
    const duration = Date.now() - speechStartTime;
    try {
      recognition.stop();
    } catch (e) {
      // Ignored
    }
    onResult(clean, duration);
  };

  recognition.onstart = () => {
    speechStartTime = Date.now();
    hasTriggeredResult = false;
    latestFullText = '';
    onStart?.();
  };

  recognition.onresult = (event: any) => {
    // If audio is playing when sound arrives, halt it immediately
    if (allowBargeIn && isSpeakingGlobal) {
      interruptPlayback();
    }

    let finalParts = '';
    let interimParts = '';

    for (let i = 0; i < event.results.length; ++i) {
      const res = event.results[i];
      const transcript = res[0]?.transcript || '';
      if (res.isFinal) {
        finalParts += (finalParts ? ' ' : '') + transcript.trim();
      } else {
        interimParts += (interimParts ? ' ' : '') + transcript.trim();
      }
    }

    const currentBestText = (finalParts + (interimParts ? (finalParts ? ' ' : '') + interimParts : '')).trim();
    if (currentBestText) {
      latestFullText = currentBestText;
    }

    if (currentBestText && onInterim) {
      onInterim(currentBestText);
    }

    // Fast Keyword "dịch" cutoff:
    // If speaking Vietnamese and sentence ends with "dịch", trigger IMMEDIATELY without waiting!
    if (keywordDichEnabled && (language === 'vi')) {
      const keywordRegex = /(?:,\s*|\s+)dịch[.?!…]*\s*$/i;
      if (keywordRegex.test(currentBestText)) {
        triggerResultNow(currentBestText);
        return;
      }
    }

    // Silence timer for long sentences: wait until speaker pauses for quickSilenceTimeoutMs before finalizing
    if (currentBestText) {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (!hasTriggeredResult && latestFullText) {
          triggerResultNow(latestFullText);
        }
      }, quickSilenceTimeoutMs);
    }
  };

  recognition.onerror = (event: any) => {
    clearTimeout(silenceTimer);
    console.warn('SpeechRecognition error:', event.error);
    let msg = 'Lỗi nhận diện âm thanh.';
    switch (event.error) {
      case 'not-allowed':
        msg = 'Quyền truy cập Micro bị từ chối. Vui lòng cho phép Micro trên trình duyệt.';
        break;
      case 'no-speech':
        msg = 'Không nghe thấy giọng nói. Vui lòng nói to và rõ hơn gần micro.';
        break;
      case 'audio-capture':
        msg = 'Không tìm thấy microphone trên thiết bị.';
        break;
      case 'network':
        msg = 'Lỗi kết nối mạng khi nhận dạng giọng nói.';
        break;
      case 'aborted':
        return; // User intentionally stopped
      default:
        msg = `Lỗi nhận diện: ${event.error}`;
    }
    onError(msg);
  };

  recognition.onend = () => {
    clearTimeout(silenceTimer);
    if (activeRecognitionGlobal === recognition) {
      activeRecognitionGlobal = null;
    }
    // If we have text that was not triggered yet, trigger it
    if (!hasTriggeredResult && latestFullText) {
      triggerResultNow(latestFullText);
    }
    if (!hasEnded) {
      hasEnded = true;
      onEnd?.();
    }
  };

  try {
    recognition.start();
  } catch (err: any) {
    if (activeRecognitionGlobal === recognition) {
      activeRecognitionGlobal = null;
    }
    console.error('Failed to start recognition:', err);
    onError('Không thể khởi động nhận dạng giọng nói: ' + (err.message || 'Lỗi không xác định'));
  }

  return {
    start: () => {
      try {
        recognition.start();
      } catch (e) {
        // Ignored
      }
    },
    stop: () => {
      clearTimeout(silenceTimer);
      if (!hasTriggeredResult && latestFullText) {
        triggerResultNow(latestFullText);
      }
      try {
        recognition.stop();
      } catch (e) {
        // Ignored
      }
    },
    abort: () => {
      clearTimeout(silenceTimer);
      if (activeRecognitionGlobal === recognition) {
        activeRecognitionGlobal = null;
      }
      try {
        recognition.abort();
      } catch (e) {
        // Ignored
      }
    },
  };
}

/**
 * Speaks text using browser SpeechSynthesis or falls back to Gemini TTS API
 * Accurately tracks preparation latency to audio start
 */
export async function speakText({
  text,
  language,
  rate = 1.0,
  useGeminiFallback = false,
  onStart,
  onAudioStart,
  onEnd,
  onError,
}: {
  text: string;
  language: LanguageCode;
  rate?: number;
  useGeminiFallback?: boolean;
  onStart?: () => void;
  onAudioStart?: (ttsPreparationMs: number) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}): Promise<void> {
  if (!text || !text.trim()) return;

  const t0 = Date.now();
  stopSpeaking();
  isSpeakingGlobal = true;
  onStart?.();

  // If Gemini TTS is explicitly requested
  if (useGeminiFallback) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          currentAudioElement = audio;
          audio.playbackRate = rate;

          audio.onplay = () => {
            onAudioStart?.(Date.now() - t0);
          };

          audio.onended = () => {
            isSpeakingGlobal = false;
            currentAudioElement = null;
            onEnd?.();
          };

          audio.onerror = () => {
            isSpeakingGlobal = false;
            currentAudioElement = null;
            onError?.('Lỗi phát âm thanh từ máy chủ.');
          };

          await audio.play();
          return;
        }
      }
    } catch (err) {
      console.warn('Gemini TTS failed, falling back to browser synthesis', err);
    }
  }

  // Use browser SpeechSynthesis
  if (!isSpeechSynthesisSupported()) {
    isSpeakingGlobal = false;
    onError?.('Trình duyệt này không hỗ trợ phát âm thanh trực tiếp.');
    onEnd?.();
    return;
  }

  const bcp47 = SUPPORTED_LANGUAGES[language]?.bcp47 || 'vi-VN';
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = bcp47;
  utterance.rate = Math.max(0.5, Math.min(2.0, rate));

  const voices = window.speechSynthesis.getVoices();
  const matchingVoice = voices.find((v) => v.lang === bcp47 || v.lang.replace('_', '-').startsWith(bcp47.split('-')[0]));
  if (matchingVoice) {
    utterance.voice = matchingVoice;
  }

  utterance.onstart = () => {
    onAudioStart?.(Date.now() - t0);
  };

  utterance.onend = () => {
    isSpeakingGlobal = false;
    onEnd?.();
  };

  utterance.onerror = (e) => {
    isSpeakingGlobal = false;
    if (e.error !== 'canceled') {
      onError?.(`Không thể phát âm thanh: ${e.error}`);
    }
    onEnd?.();
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch (err: any) {
    isSpeakingGlobal = false;
    onError?.('Lỗi khi kích hoạt giọng đọc: ' + err.message);
    onEnd?.();
  }
}

export interface ContinuousStoryController {
  stop: () => void;
  abort: () => void;
  switchLanguage: (newLang: LanguageCode) => void;
}

/**
 * Ghi âm liên tục thời lượng dài (5 - 10 phút) cho Chế độ tự động dịch theo câu chuyện song song.
 * Tự động nhận diện ngắt câu để phiên dịch song song trong khi microphone vẫn tiếp tục ghi âm.
 */
export function startContinuousStorySpeechRecognition({
  language,
  maxDurationSeconds = 600, // 10 phút mặc định
  sentenceSilenceTimeoutMs = 1700, // Khoảng ngắt nghỉ câu tự nhiên (1.7s)
  allowBargeIn = true,
  onSentenceComplete,
  onInterim,
  onTick,
  onTimeout,
  onError,
  onStart,
  onEnd,
}: {
  language: LanguageCode;
  maxDurationSeconds?: number;
  sentenceSilenceTimeoutMs?: number;
  allowBargeIn?: boolean;
  onSentenceComplete: (sentenceText: string, durationMs: number) => void;
  onInterim?: (interimText: string) => void;
  onTick?: (secondsElapsed: number) => void;
  onTimeout?: () => void;
  onError: (errorMsg: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}): ContinuousStoryController {
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    onError('Trình duyệt không hỗ trợ Web Speech API trực tiếp.');
    return {
      stop: () => {},
      abort: () => {},
      switchLanguage: () => {},
    };
  }

  let activeLang = language;
  let isRunning = true;
  let hasUserStopped = false;
  let secondsElapsed = 0;
  let sentenceStartTime = Date.now();
  let currentInterim = '';
  let silenceTimer: any = null;
  let timerInterval: any = null;
  let recognitionInstance: any = null;
  let isRestartingForNextSentence = false;

  // Xử lý gửi câu hoàn tất và dọn dẹp để nhận câu tiếp theo trong câu chuyện
  const commitCurrentSentence = () => {
    clearTimeout(silenceTimer);
    const clean = currentInterim.trim();
    if (clean.length > 0) {
      const duration = Date.now() - sentenceStartTime;
      currentInterim = '';
      sentenceStartTime = Date.now();
      onSentenceComplete(clean, duration);

      // Nhẹ nhàng tái khởi động bộ nhận dạng để làm sạch bộ nhớ đệm cho câu tiếp theo
      if (isRunning && !hasUserStopped) {
        isRestartingForNextSentence = true;
        try {
          recognitionInstance?.abort();
        } catch (e) {
          // ignore
        }
      }
    }
  };

  const createAndStartRecognition = () => {
    if (!isRunning || hasUserStopped) return;

    try {
      if (recognitionInstance) {
        try {
          recognitionInstance.abort();
        } catch (e) {
          // ignore
        }
      }

      const rec = new SpeechRecognitionClass();
      recognitionInstance = rec;
      activeRecognitionGlobal = rec;

      const langConfig = SUPPORTED_LANGUAGES[activeLang];
      rec.lang = langConfig?.bcp47 || 'vi-VN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        isRestartingForNextSentence = false;
      };

      rec.onresult = (event: any) => {
        if (allowBargeIn && isSpeakingGlobal) {
          interruptPlayback();
        }

        let finalParts = '';
        let interimParts = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcript = res[0]?.transcript || '';
          if (res.isFinal) {
            finalParts += (finalParts ? ' ' : '') + transcript.trim();
          } else {
            interimParts += (interimParts ? ' ' : '') + transcript.trim();
          }
        }

        const spokenChunk = (finalParts + (interimParts ? (finalParts ? ' ' : '') + interimParts : '')).trim();
        if (spokenChunk) {
          currentInterim = spokenChunk;
          onInterim?.(spokenChunk);

          // Phát hiện câu hoàn thành sau khoảng nghỉ tự nhiên của người nói (~1.7s)
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            if (isRunning && !hasUserStopped && currentInterim.trim().length > 0) {
              commitCurrentSentence();
            }
          }, sentenceSilenceTimeoutMs);
        }
      };

      rec.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // Bình thường khi người nói ngắt nghỉ để suy nghĩ, không báo lỗi
          return;
        }
        console.warn('Continuous speech error:', event.error);
        if (event.error === 'not-allowed') {
          isRunning = false;
          hasUserStopped = true;
          onError('Quyền truy cập Micro bị từ chối.');
        }
      };

      rec.onend = () => {
        // Tự động kết nối lại liền mạch nếu đang trong phiên ghi âm liên tục dài
        if (isRunning && !hasUserStopped) {
          const delay = isRestartingForNextSentence ? 60 : 150;
          isRestartingForNextSentence = false;
          setTimeout(() => {
            if (isRunning && !hasUserStopped) {
              createAndStartRecognition();
            }
          }, delay);
        }
      };

      rec.start();
    } catch (err: any) {
      console.warn('Continuous start error:', err);
    }
  };

  // Bắt đầu đếm thời lượng ghi âm liên tục đến maxDurationSeconds
  timerInterval = setInterval(() => {
    if (!isRunning || hasUserStopped) {
      clearInterval(timerInterval);
      return;
    }
    secondsElapsed += 1;
    onTick?.(secondsElapsed);

    if (secondsElapsed >= maxDurationSeconds) {
      clearInterval(timerInterval);
      commitCurrentSentence();
      hasUserStopped = true;
      isRunning = false;
      try {
        recognitionInstance?.stop();
      } catch (e) {}
      onTimeout?.();
      onEnd?.();
    }
  }, 1000);

  // Kích hoạt phiên ghi âm
  onStart?.();
  sentenceStartTime = Date.now();
  createAndStartRecognition();

  return {
    stop: () => {
      hasUserStopped = true;
      isRunning = false;
      clearInterval(timerInterval);
      commitCurrentSentence();
      try {
        recognitionInstance?.stop();
      } catch (e) {}
      onEnd?.();
    },
    abort: () => {
      hasUserStopped = true;
      isRunning = false;
      clearInterval(timerInterval);
      clearTimeout(silenceTimer);
      try {
        recognitionInstance?.abort();
      } catch (e) {}
      onEnd?.();
    },
    switchLanguage: (newLang: LanguageCode) => {
      if (activeLang !== newLang) {
        commitCurrentSentence();
        activeLang = newLang;
        createAndStartRecognition();
      }
    },
  };
}
