import React from 'react';
import { 
  AppMode, 
  SystemStatus 
} from '../types/translator';
import { 
  Languages, 
  Sparkles, 
  MessageSquare, 
  Settings, 
  HelpCircle, 
  Volume2, 
  VolumeX, 
  Mic 
} from 'lucide-react';

interface HeaderProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  status: SystemStatus;
  statusMessage?: string;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onToggleMic?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentMode,
  onModeChange,
  status,
  statusMessage,
  autoSpeak,
  onToggleAutoSpeak,
  onOpenSettings,
  onOpenHelp,
  onToggleMic,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'listening':
        return (
          <button
            type="button"
            onClick={onToggleMic}
            title="Đang nghe - Nhấn vào đây để tạm dừng mic nghe nói ngay lập tức"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-600 hover:bg-red-500/25 border border-red-500/30 transition-all cursor-pointer animate-pulse shadow-xs active:scale-95 group"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <Mic className="w-3.5 h-3.5 text-red-600" />
            <span>{statusMessage || 'Đang nghe...'}</span>
            <span className="text-[10px] bg-red-100 group-hover:bg-red-200 text-red-700 px-1.5 py-0.2 rounded font-semibold ml-0.5">
              Tạm dừng
            </span>
          </button>
        );
      case 'recognizing':
        return (
          <button
            type="button"
            onClick={onToggleMic}
            title="Nhấn để dừng"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-spin" />
            <span>{statusMessage || 'Đang nhận diện...'}</span>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.2 rounded font-semibold ml-0.5">
              Dừng
            </span>
          </button>
        );
      case 'translating':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            {statusMessage || 'Đang dịch...'}
          </span>
        );
      case 'speaking':
        return (
          <button
            type="button"
            onClick={onToggleMic}
            title="Nhấn để dừng phát âm thanh"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-xs active:scale-95 animate-pulse"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{statusMessage || 'Đang phát âm thanh...'}</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded font-semibold ml-0.5">
              Dừng
            </span>
          </button>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            {statusMessage || 'Có lỗi'}
          </span>
        );
      default:
        return (
          <button
            type="button"
            onClick={onToggleMic}
            title="Chế độ sẵn sàng - Nhấn vào đây để bật mic nghe nói"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 transition-all cursor-pointer shadow-2xs active:scale-95 group"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{statusMessage === 'Đã tạm dừng' ? 'Đã tạm dừng' : 'Sẵn sàng'}</span>
            <span className="text-[10px] text-emerald-600 group-hover:text-emerald-800 font-semibold ml-0.5">
              {statusMessage === 'Đã tạm dừng' ? '(Chạm để nghe)' : '(Chạm để nói)'}
            </span>
          </button>
        );
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-5xl mx-auto px-4 py-3">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                EasyTalk Translator
                <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/50">
                  5 Ngôn ngữ
                </span>
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Phiên dịch trực tiếp 2 chiều & Đàm thoại song song
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden xs:block">
              {getStatusBadge()}
            </div>

            {/* Quick sound toggle */}
            <button
              onClick={onToggleAutoSpeak}
              title={autoSpeak ? 'Tắt tự động đọc' : 'Bật tự động đọc'}
              className={`p-2 rounded-lg border transition-all ${
                autoSpeak
                  ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                  : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
              }`}
            >
              {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Help guide */}
            <button
              onClick={onOpenHelp}
              title="Hướng dẫn sử dụng & Micro"
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              title="Cài đặt"
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile status indicator if not visible above */}
        <div className="xs:hidden mt-2 flex justify-center">
          {getStatusBadge()}
        </div>

        {/* Mode Navigation Tabs: Đưa Giao tiếp lên vị trí số 1 */}
        <div className="mt-3 grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => onModeChange('conversation')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              currentMode === 'conversation'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span>1. Giao tiếp</span>
          </button>

          <button
            onClick={() => onModeChange('two_way')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              currentMode === 'two_way'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Languages className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span>2. Dịch 2 chiều</span>
          </button>

          <button
            onClick={() => onModeChange('auto_detect')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              currentMode === 'auto_detect'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span>3. Tự phát hiện</span>
          </button>
        </div>
      </div>
    </header>
  );
};
