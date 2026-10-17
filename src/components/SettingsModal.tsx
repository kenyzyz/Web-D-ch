import React from 'react';
import { AppSettings, SUPPORTED_LANGUAGES, ApiProvider } from '../types/translator';
import { 
  X, 
  Volume2, 
  Sparkles, 
  Gauge, 
  Cpu, 
  Zap, 
  Radio, 
  ShieldAlert, 
  Timer, 
  VolumeX 
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              Cài đặt & Tối ưu hóa độ trễ
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Requirement 16: 3 API Provider Buttons / Radios */}
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900 mb-1">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>Nhà cung cấp API dịch thuật (3 Engine)</span>
            </div>
            <p className="text-xs text-slate-500 mb-2.5">
              Khóa API được lưu trữ và bảo vệ an toàn tại backend (.env / Secrets), tuyệt đối không để lộ ở client.
            </p>

            <div className="space-y-2">
              <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                settings.apiProvider === 'gemini'
                  ? 'bg-blue-50/80 border-blue-400 text-blue-900 ring-2 ring-blue-100'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
              }`}>
                <input
                  type="radio"
                  name="apiProvider"
                  checked={settings.apiProvider === 'gemini'}
                  onChange={() => onUpdateSettings({ apiProvider: 'gemini' })}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    Google Gemini Flash (Khuyến nghị)
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-semibold">
                      Tối ưu nhất
                    </span>
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Model <code>gemini-3.8-flash</code> với ThinkingLevel LOW, truyền luồng SSE với TTFT ~200ms.
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                settings.apiProvider === 'google_cloud'
                  ? 'bg-blue-50/80 border-blue-400 text-blue-900 ring-2 ring-blue-100'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
              }`}>
                <input
                  type="radio"
                  name="apiProvider"
                  checked={settings.apiProvider === 'google_cloud'}
                  onChange={() => onUpdateSettings({ apiProvider: 'google_cloud' })}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900">
                    Google Cloud Translation Proxy
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Cổng dịch thuật Google Cloud chuyên dụng (Cấu hình qua <code>GOOGLE_CLOUD_TRANSLATE_API_KEY</code>).
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                settings.apiProvider === 'offline_fast'
                  ? 'bg-blue-50/80 border-blue-400 text-blue-900 ring-2 ring-blue-100'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
              }`}>
                <input
                  type="radio"
                  name="apiProvider"
                  checked={settings.apiProvider === 'offline_fast'}
                  onChange={() => onUpdateSettings({ apiProvider: 'offline_fast' })}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    Dự phòng Cục bộ Siêu tốc (Local Fast Engine)
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                      &lt; 5ms
                    </span>
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Từ điển cục bộ đàm thoại thông dụng, hoạt động ngay cả khi không có mạng hoặc chưa nạp API key.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Low-latency Streaming Toggle */}
          <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                <Radio className="w-4 h-4 text-emerald-600" />
                <span>Truyền luồng ký tự trực tiếp (Streaming SSE)</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Hiển thị từng từ ngay khi model sinh ra, giảm độ trễ thấy chữ (TTFT) xuống dưới 300ms.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={settings.enableStreaming}
                onChange={(e) => onUpdateSettings({ enableStreaming: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Quick Silence Timeout */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                <Timer className="w-4 h-4 text-amber-500" />
                <span>Thời gian phát hiện dứt câu (Silence Cutoff)</span>
              </div>
              <span className="font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                {settings.quickSilenceTimeoutMs} ms
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Thời gian im lặng để hệ thống chốt câu và gửi dịch ngay (Chuẩn tối ưu: 1200ms để nói trọn vẹn câu dài mà không bị ngắt quãng giữa chừng).
            </p>
            <input
              type="range"
              min={500}
              max={2500}
              step={50}
              value={settings.quickSilenceTimeoutMs}
              onChange={(e) => onUpdateSettings({ quickSilenceTimeoutMs: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Nhanh (500ms)</span>
              <span>Chuẩn câu dài (1200ms)</span>
              <span>Thoải mái (2500ms)</span>
            </div>
          </div>

          {/* Barge-in / Interrupt */}
          <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                <VolumeX className="w-4 h-4 text-rose-500" />
                <span>Cho phép ngắt lời (Barge-in Support)</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Khi loa đang phát âm thanh, nếu bạn bấm micro hoặc bắt đầu nói, âm thanh sẽ tự động dừng ngay lập tức.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={settings.allowBargeIn}
                onChange={(e) => onUpdateSettings({ allowBargeIn: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Toggle: Auto Speak */}
          <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                <Volume2 className="w-4 h-4 text-blue-600" />
                <span>Tự động phát âm thanh bản dịch</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Đọc thành tiếng bản dịch ngay sau khi hoàn tất dịch câu.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={settings.autoSpeak}
                onChange={(e) => onUpdateSettings({ autoSpeak: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Toggle: Keyword "dịch" */}
          <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Dịch khi nói từ khóa &quot;dịch&quot;</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Khi nói tiếng Việt kết thúc bằng từ &quot;dịch&quot;, hệ thống bóc tách từ điều khiển và dịch tức thì.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={settings.keywordDichEnabled}
                onChange={(e) => onUpdateSettings({ keywordDichEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Speech Rate */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900 mb-2">
              <Gauge className="w-4 h-4 text-indigo-600" />
              <span>Tốc độ đọc giọng nói</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '0.8x (Chậm)', val: 0.8 },
                { label: '1.0x (Chuẩn)', val: 1.0 },
                { label: '1.2x (Nhanh)', val: 1.2 },
              ].map((rate) => (
                <button
                  key={rate.val}
                  type="button"
                  onClick={() => onUpdateSettings({ speechRate: rate.val })}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    settings.speechRate === rate.val
                      ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {rate.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
