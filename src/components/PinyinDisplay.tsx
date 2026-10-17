import React, { useState } from 'react';
import { Copy, Check, Volume2 } from 'lucide-react';
import { getChinesePinyin } from '../utils/pinyin';

interface PinyinDisplayProps {
  chineseText: string;
  pinyinText?: string;
  onSpeak?: () => void;
  isSpeaking?: boolean;
}

export const PinyinDisplay: React.FC<PinyinDisplayProps> = ({
  chineseText,
  pinyinText,
  onSpeak,
  isSpeaking = false,
}) => {
  const [copiedHanzi, setCopiedHanzi] = useState(false);
  const [copiedPinyin, setCopiedPinyin] = useState(false);

  // Compute pinyin with tone marks if not provided
  const displayPinyin = pinyinText || getChinesePinyin(chineseText);

  if (!chineseText && !displayPinyin) return null;

  const copyHanzi = async () => {
    if (!chineseText) return;
    await navigator.clipboard.writeText(chineseText);
    setCopiedHanzi(true);
    setTimeout(() => setCopiedHanzi(false), 2000);
  };

  const copyPinyin = async () => {
    if (!displayPinyin) return;
    await navigator.clipboard.writeText(displayPinyin);
    setCopiedPinyin(true);
    setTimeout(() => setCopiedPinyin(false), 2000);
  };

  return (
    <div className="mt-2 p-2.5 sm:p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl sm:rounded-2xl space-y-2 sm:space-y-3 shadow-xs animate-fadeIn">
      <div className="flex items-center justify-between gap-1.5 border-b border-amber-200/60 pb-1.5">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-amber-500 animate-pulse" />
          Chữ Hán &amp; Pinyin
        </span>

        {onSpeak && (
          <button
            type="button"
            onClick={onSpeak}
            className={`inline-flex items-center gap-1 text-[11px] sm:text-xs px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              isSpeaking
                ? 'bg-amber-600 text-white animate-pulse shadow-xs'
                : 'bg-amber-200/80 hover:bg-amber-300 text-amber-950'
            }`}
          >
            <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>{isSpeaking ? 'Đang đọc...' : 'Phát âm'}</span>
          </button>
        )}
      </div>

      {/* Hanzi (Chữ Hán) display line */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="text-xl sm:text-2xl md:text-3xl font-serif text-slate-900 leading-snug tracking-wider select-all">
          {chineseText}
        </div>
        <button
          type="button"
          onClick={copyHanzi}
          title="Sao chép Chữ Hán"
          className="shrink-0 p-1 px-1.5 sm:px-2 rounded-lg border border-amber-300/80 bg-white hover:bg-amber-100/60 text-amber-900 transition-colors text-[11px] sm:text-xs flex items-center gap-1 cursor-pointer font-medium"
        >
          {copiedHanzi ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          <span>{copiedHanzi ? 'Đã chép' : 'Chữ Hán'}</span>
        </button>
      </div>

      {/* Pinyin with tone marks line */}
      {displayPinyin && (
        <div className="flex items-start justify-between gap-2.5 pt-1.5 border-t border-amber-200/60">
          <div className="text-sm sm:text-base md:text-lg font-sans font-semibold text-amber-950 tracking-wide select-all leading-normal">
            <span className="text-amber-700/80 font-normal mr-1.5 text-[10px] sm:text-xs uppercase tracking-wider">
              Pinyin:
            </span>
            {displayPinyin}
          </div>
          <button
            type="button"
            onClick={copyPinyin}
            title="Sao chép Pinyin"
            className="shrink-0 p-1.5 px-2 rounded-lg border border-amber-300/80 bg-white hover:bg-amber-100/60 text-amber-900 transition-colors text-xs flex items-center gap-1 cursor-pointer font-medium"
          >
            {copiedPinyin ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPinyin ? 'Đã chép' : 'Pinyin'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
