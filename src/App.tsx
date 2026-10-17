import React, { useState } from 'react';
import { 
  AppMode, 
  LanguageCode, 
  AppSettings, 
  SystemStatus, 
  LatencyBreakdown,
  ApiProvider
} from './types/translator';
import { Header } from './components/Header';
import { LanguageSelector } from './components/LanguageSelector';
import { TwoWayTranslate } from './components/TwoWayTranslate';
import { AutoDetectTranslate } from './components/AutoDetectTranslate';
import { ConversationMode } from './components/ConversationMode';
import { LatencyDashboard } from './components/LatencyDashboard';
import { SettingsModal } from './components/SettingsModal';
import { MicrophoneGuideModal } from './components/MicrophoneGuideModal';
import { requestMicrophonePermission, stopActiveRecognition, stopSpeaking } from './utils/speech';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function App() {
  const [currentMode, setCurrentMode] = useState<AppMode>('conversation');
  const [sourceLang, setSourceLang] = useState<LanguageCode>('vi');
  const [targetLang, setTargetLang] = useState<LanguageCode>('zh');
  const [partnerLang, setPartnerLang] = useState<LanguageCode>('zh');

  const [settings, setSettings] = useState<AppSettings>({
    autoSpeak: false,
    keywordDichEnabled: true,
    speechRate: 1.0,
    voiceEngine: 'browser',
    apiProvider: 'gemini',
    enableStreaming: true,
    quickSilenceTimeoutMs: 1200,
    allowBargeIn: true,
  });

  const [status, setStatusState] = useState<SystemStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Latency metrics tracking
  const [currentMetrics, setCurrentMetrics] = useState<LatencyBreakdown | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<LatencyBreakdown[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const setStatus = (st: SystemStatus, msg: string = '') => {
    setStatusState(st);
    setStatusMessage(msg);
  };

  const handleRecordMetrics = (metrics: LatencyBreakdown) => {
    setCurrentMetrics(metrics);
    setLatencyHistory((prev) => [metrics, ...prev.slice(0, 49)]); // keep last 50
  };

  const handleShowError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage((prev) => (prev === msg ? null : prev));
    }, 6000);
  };

  const handleShowSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleSwapLanguages = () => {
    const prevSource = sourceLang;
    const prevTarget = targetLang;
    setSourceLang(prevTarget);
    setTargetLang(prevSource);
  };

  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const handleSelectProvider = (provider: ApiProvider) => {
    handleUpdateSettings({ apiProvider: provider });
    handleShowSuccess(`Đã chuyển sang Engine dịch: ${
      provider === 'gemini' ? 'Google Gemini Flash (Streaming SSE)' :
      provider === 'google_cloud' ? 'Google Cloud Translation' : 'Dự phòng Cục bộ Siêu tốc'
    }`);
  };

  const handleTestMicrophone = async () => {
    try {
      await requestMicrophonePermission();
      handleShowSuccess('Microphone hoạt động tốt! Bạn đã có thể bắt đầu phiên dịch giọng nói.');
    } catch (err: any) {
      handleShowError(err.message || 'Không thể truy cập Microphone.');
    }
  };

  const [toggleMicTrigger, setToggleMicTrigger] = useState<number>(0);

  const handleModeChange = (mode: AppMode) => {
    setCurrentMode(mode);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleToggleMic = () => {
    if (status === 'listening' || status === 'recognizing' || status === 'speaking') {
      stopActiveRecognition();
      stopSpeaking();
      setStatus('idle', 'Đã tạm dừng');
    } else {
      setToggleMicTrigger((prev) => prev + 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-100">
      {/* Header bar */}
      <Header
        currentMode={currentMode}
        onModeChange={handleModeChange}
        status={status}
        statusMessage={statusMessage}
        autoSpeak={settings.autoSpeak}
        onToggleAutoSpeak={() => handleUpdateSettings({ autoSpeak: !settings.autoSpeak })}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onToggleMic={handleToggleMic}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-2.5 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
        {/* Error Notification Toast */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-start justify-between gap-3 text-xs md:text-sm animate-fadeIn shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Thông báo: </span>
                {errorMessage}
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Success Toast */}
        {successMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-between gap-3 text-xs md:text-sm animate-fadeIn shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-500 hover:text-emerald-700 font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Language Selector for Mode 1 (Two-Way) */}
        {currentMode === 'two_way' && (
          <LanguageSelector
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceChange={(lang) => {
              if (lang !== 'auto') setSourceLang(lang);
            }}
            onTargetChange={setTargetLang}
            onSwap={handleSwapLanguages}
            disabled={status === 'listening' || status === 'translating'}
          />
        )}

        {/* Mode 1: Two-Way Direct Translation */}
        {currentMode === 'two_way' && (
          <TwoWayTranslate
            sourceLang={sourceLang}
            targetLang={targetLang}
            settings={settings}
            status={status}
            setStatus={setStatus}
            onError={handleShowError}
            onRecordMetrics={handleRecordMetrics}
          />
        )}

        {/* Mode 2: Auto Detect Language */}
        {currentMode === 'auto_detect' && (
          <AutoDetectTranslate
            targetLang={targetLang}
            onTargetLangChange={setTargetLang}
            settings={settings}
            status={status}
            setStatus={setStatus}
            onError={handleShowError}
            onRecordMetrics={handleRecordMetrics}
          />
        )}

        {/* Mode 3: Direct Two-Way Conversation */}
        {currentMode === 'conversation' && (
          <ConversationMode
            partnerLang={partnerLang}
            onPartnerLangChange={setPartnerLang}
            settings={settings}
            status={status}
            setStatus={setStatus}
            onError={handleShowError}
            onRecordMetrics={handleRecordMetrics}
            toggleMicTrigger={toggleMicTrigger}
          />
        )}

        {/* Requirement 1, 14, 16: Latency Measurement & Benchmark Dashboard */}
        <LatencyDashboard
          currentMetrics={currentMetrics}
          history={latencyHistory}
          selectedProvider={settings.apiProvider}
          onSelectProvider={handleSelectProvider}
          onClearHistory={() => {
            setCurrentMetrics(null);
            setLatencyHistory([]);
          }}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">EasyTalk Translator</span>
            <span>•</span>
            <span>5 Ngôn ngữ: 🇻🇳 Tiếng Việt, 🇨🇳 Tiếng Trung, 🇺🇸 Tiếng Anh, 🇹🇭 Tiếng Thái, 🇰🇷 Tiếng Hàn</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsHelpOpen(true)}
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              Quyền Micro
            </button>
            <span>•</span>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              Cài đặt & Tối ưu trễ
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      <MicrophoneGuideModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onTestMicrophone={handleTestMicrophone}
      />
    </div>
  );
}
