import React from 'react';
import { LanguageCode, SUPPORTED_LANGUAGES } from '../types/translator';
import { ArrowLeftRight } from 'lucide-react';

interface LanguageSelectorProps {
  sourceLang: LanguageCode | 'auto';
  targetLang: LanguageCode;
  onSourceChange: (lang: LanguageCode | 'auto') => void;
  onTargetChange: (lang: LanguageCode) => void;
  onSwap: () => void;
  disabled?: boolean;
  isAutoDetectMode?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  sourceLang,
  targetLang,
  onSourceChange,
  onTargetChange,
  onSwap,
  disabled = false,
  isAutoDetectMode = false,
}) => {
  const languageList = Object.values(SUPPORTED_LANGUAGES);

  return (
    <div className="bg-white rounded-2xl p-2.5 sm:p-3 shadow-xs border border-slate-200">
      <div className="flex items-center justify-between gap-2">
        {/* Source language */}
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 px-1">
            Ngôn ngữ gốc
          </label>
          {isAutoDetectMode ? (
            <div className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-blue-50/70 border border-blue-200/60 text-blue-900 font-medium text-sm">
              <span className="text-lg">🌐</span>
              <span className="truncate">Tự động phát hiện</span>
            </div>
          ) : (
            <select
              value={sourceLang}
              onChange={(e) => onSourceChange(e.target.value as LanguageCode)}
              disabled={disabled}
              className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-800 transition-all focus:outline-hidden focus:ring-2 focus:ring-blue-100"
            >
              {languageList.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Swap button */}
        <div className="pt-5 shrink-0">
          <button
            type="button"
            onClick={onSwap}
            disabled={disabled || isAutoDetectMode}
            title={isAutoDetectMode ? 'Không hỗ trợ đổi vị trí khi tự động phát hiện' : 'Đổi nhanh hai ngôn ngữ'}
            className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
              isAutoDetectMode || disabled
                ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400'
                : 'bg-slate-50 hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-600 shadow-xs'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>

        {/* Target language */}
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 px-1">
            Ngôn ngữ đích
          </label>
          <select
            value={targetLang}
            onChange={(e) => onTargetChange(e.target.value as LanguageCode)}
            disabled={disabled}
            className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-800 transition-all focus:outline-hidden focus:ring-2 focus:ring-blue-100"
          >
            {languageList.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name} ({lang.nativeName})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
