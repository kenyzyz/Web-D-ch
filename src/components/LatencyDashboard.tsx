import React, { useState } from 'react';
import { 
  LanguageCode,
  LatencyBreakdown, 
  AggregatedStats, 
  ApiProvider, 
  SUPPORTED_LANGUAGES 
} from '../types/translator';
import { 
  Zap, 
  Clock, 
  Activity, 
  Play, 
  CheckCircle, 
  Cpu, 
  ShieldCheck, 
  TrendingUp, 
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface LatencyDashboardProps {
  currentMetrics: LatencyBreakdown | null;
  history: LatencyBreakdown[];
  selectedProvider: ApiProvider;
  onSelectProvider: (provider: ApiProvider) => void;
  onClearHistory: () => void;
}

export const LatencyDashboard: React.FC<LatencyDashboardProps> = ({
  currentMetrics,
  history,
  selectedProvider,
  onSelectProvider,
  onClearHistory,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResults, setBenchmarkResults] = useState<any[]>([]);

  // Calculate stats from history
  const calculateStats = (): AggregatedStats => {
    if (!history.length) {
      return {
        count: 0,
        avgTotalMs: 0,
        p95TotalMs: 0,
        minTotalMs: 0,
        maxTotalMs: 0,
        avgTtftMs: 0,
        avgSttMs: 0,
        avgPinyinMs: 0,
        avgTtsMs: 0,
      };
    }

    const totals = history.map((h) => h.totalE2EMs || h.apiTotalMs).sort((a, b) => a - b);
    const count = totals.length;
    const avgTotal = Math.round(totals.reduce((a, b) => a + b, 0) / count);
    const p95Idx = Math.min(count - 1, Math.floor(count * 0.95));
    const p95 = totals[p95Idx];
    const min = totals[0];
    const max = totals[count - 1];

    const avgTtft = Math.round(history.reduce((a, b) => a + (b.ttftMs || 0), 0) / count);
    const avgStt = Math.round(history.reduce((a, b) => a + (b.sttMs || 0), 0) / count);
    const avgPinyin = Math.round(history.reduce((a, b) => a + (b.pinyinMs || 0), 0) / count);
    const avgTts = Math.round(history.reduce((a, b) => a + (b.ttsStartMs || 0), 0) / count);

    return {
      count,
      avgTotalMs: avgTotal,
      p95TotalMs: p95,
      minTotalMs: min,
      maxTotalMs: max,
      avgTtftMs: avgTtft,
      avgSttMs: avgStt,
      avgPinyinMs: avgPinyin,
      avgTtsMs: avgTts,
    };
  };

  const stats = calculateStats();

  // Run benchmark test on 5 languages
  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchmarkResults([]);

    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider }),
      });

      if (res.ok) {
        const data = await res.json();
        setBenchmarkResults(data.results || []);
      }
    } catch (e) {
      console.error('Benchmark failed:', e);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const latest = currentMetrics || history[0];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Zap className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Bảng Đo Độ Trễ & Đánh Giá Tốc Độ (Real-time Latency & Benchmark)
            </h3>
            <p className="text-xs text-slate-500">
              Phân tích chi tiết từng giai đoạn: STT, API flight, First Token (TTFT), Pinyin và TTS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Requirement 16: 3 API Provider Selection Buttons */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Chọn Nhà Cung Cấp API (Engine Tối Ưu Độ Trễ)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSelectProvider('gemini')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedProvider === 'gemini'
                    ? 'bg-blue-50/80 border-blue-400 text-blue-900 shadow-xs ring-2 ring-blue-100'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <SparklesIcon className="w-3.5 h-3.5 text-blue-600" />
                    1. Google Gemini Flash
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    Khuyến nghị
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Streaming SSE, TTFT cực thấp (~200ms), ngữ cảnh tự nhiên.
                </p>
              </button>

              <button
                type="button"
                onClick={() => onSelectProvider('google_cloud')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedProvider === 'google_cloud'
                    ? 'bg-blue-50/80 border-blue-400 text-blue-900 shadow-xs ring-2 ring-blue-100'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                    2. Google Cloud Translate
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    Chuyên dụng
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Dịch thuật chuẩn xác qua cổng proxy backend.
                </p>
              </button>

              <button
                type="button"
                onClick={() => onSelectProvider('offline_fast')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedProvider === 'offline_fast'
                    ? 'bg-blue-50/80 border-blue-400 text-blue-900 shadow-xs ring-2 ring-blue-100'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    3. Dự Phòng Cục Bộ (Fast)
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    &lt; 5ms
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Từ điển tốc độ cao &amp; không phụ thuộc mạng.
                </p>
              </button>
            </div>
          </div>

          {/* Aggregated Latency Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Độ trễ trung bình (Avg)
              </span>
              <div className="text-xl font-bold text-slate-900 mt-0.5 flex items-baseline gap-1">
                <span>{stats.avgTotalMs || '—'}</span>
                <span className="text-xs font-normal text-slate-500">ms</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Min: {stats.minTotalMs || 0}ms • Max: {stats.maxTotalMs || 0}ms
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Phân vị 95 (p95)
              </span>
              <div className="text-xl font-bold text-indigo-700 mt-0.5 flex items-baseline gap-1">
                <span>{stats.p95TotalMs || '—'}</span>
                <span className="text-xs font-normal text-slate-500">ms</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Độ ổn định cao nhất 95% phiên
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                First Token (TTFT)
              </span>
              <div className="text-xl font-bold text-emerald-700 mt-0.5 flex items-baseline gap-1">
                <span>{stats.avgTtftMs || '—'}</span>
                <span className="text-xs font-normal text-slate-500">ms</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Chữ đầu tiên xuất hiện
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Tạo Pinyin
              </span>
              <div className="text-xl font-bold text-amber-700 mt-0.5 flex items-baseline gap-1">
                <span>{stats.avgPinyinMs || '< 2'}</span>
                <span className="text-xs font-normal text-slate-500">ms</span>
              </div>
              <span className="text-[10px] text-slate-400">
                pinyin-pro tức thời (Client-side)
              </span>
            </div>
          </div>

          {/* Phase Waterfall Breakdown of Latest Translation */}
          {latest && (
            <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-950 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  Đo lường chi tiết lần dịch gần nhất ({latest.sourceLang.toUpperCase()} → {latest.targetLang.toUpperCase()}):
                </span>
                <span className="font-bold text-blue-900 bg-blue-100/70 px-2 py-0.5 rounded-md">
                  Tổng: {latest.totalE2EMs || latest.apiTotalMs} ms
                </span>
              </div>

              {/* Phase visual pill bars */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-slate-400">1. Nhận diện giọng nói (STT)</div>
                  <div className="font-bold text-slate-800">{latest.sttMs || 0} ms</div>
                </div>

                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-slate-400">2. Gửi yêu cầu (Flight)</div>
                  <div className="font-bold text-slate-800">{latest.apiSendMs || 10} ms</div>
                </div>

                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-slate-400">3. Ký tự đầu (TTFT)</div>
                  <div className="font-bold text-emerald-600">{latest.ttftMs || 0} ms</div>
                </div>

                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-slate-400">4. Tạo Pinyin</div>
                  <div className="font-bold text-amber-700">{latest.pinyinMs || '< 2'} ms</div>
                </div>

                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-slate-400">5. Kích hoạt đọc (TTS)</div>
                  <div className="font-bold text-blue-700">{latest.ttsStartMs || 0} ms</div>
                </div>
              </div>
            </div>
          )}

          {/* Automated Benchmark Runner Button & Results */}
          <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-slate-900 block">
                  Kiểm thử thực tế 5 ngôn ngữ (Benchmark)
                </span>
                <span className="text-[11px] text-slate-500">
                  Chạy đo độ trễ thực tế qua câu thoại mẫu bằng cả 5 ngôn ngữ với Engine hiện tại.
                </span>
              </div>

              <button
                type="button"
                onClick={handleRunBenchmark}
                disabled={isBenchmarking}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{isBenchmarking ? 'Đang kiểm thử 5 ngôn ngữ...' : 'Chạy kiểm thử 5 ngôn ngữ'}</span>
              </button>
            </div>

            {/* Benchmark results table */}
            {benchmarkResults.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Cặp ngôn ngữ</th>
                      <th className="py-2 px-3">Câu nói kiểm thử</th>
                      <th className="py-2 px-3">Bản dịch</th>
                      <th className="py-2 px-3">TTFT</th>
                      <th className="py-2 px-3">Tổng trễ</th>
                      <th className="py-2 px-3">Pinyin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {benchmarkResults.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-bold text-slate-800 whitespace-nowrap">
                          {SUPPORTED_LANGUAGES[r.sourceLang as LanguageCode]?.flag || '🌐'} → {SUPPORTED_LANGUAGES[r.targetLang as LanguageCode]?.flag || '🌐'}
                        </td>
                        <td className="py-2 px-3 text-slate-600 max-w-[150px] truncate">
                          {r.text}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900 max-w-[180px] truncate">
                          {r.translated}
                        </td>
                        <td className="py-2 px-3 text-emerald-600 font-semibold">
                          {r.ttftMs} ms
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {r.apiTotalMs} ms
                        </td>
                        <td className="py-2 px-3 text-amber-700 font-medium">
                          {r.pinyin ? `${r.pinyinMs} ms` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function SparklesIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      <path d="M5 3v4"/>
      <path d="M19 17v4"/>
      <path d="M3 5h4"/>
      <path d="M17 19h4"/>
    </svg>
  );
}
