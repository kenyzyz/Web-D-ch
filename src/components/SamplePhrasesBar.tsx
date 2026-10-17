import React from 'react';
import { Sparkles } from 'lucide-react';
import { LanguageCode } from '../types/translator';

interface SamplePhrasesBarProps {
  sourceLang: LanguageCode | 'auto';
  onSelectPhrase: (text: string) => void;
}

export const SamplePhrasesBar: React.FC<SamplePhrasesBarProps> = ({
  sourceLang,
  onSelectPhrase,
}) => {
  const getPhrases = () => {
    if (sourceLang === 'vi' || sourceLang === 'auto') {
      return [
        { label: 'Từ khóa "dịch"', text: 'Bạn có thể cho tôi biết nhà ga ở đâu, dịch.' },
        { label: 'Chào hỏi', text: 'Xin chào, rất vui được gặp bạn!' },
        { label: 'Hỏi giá', text: 'Món này bao nhiêu tiền một phần?' },
        { label: 'Hỏi đường', text: 'Làm ơn cho tôi hỏi đường đến sân bay gần nhất.' },
      ];
    }
    if (sourceLang === 'zh') {
      return [
        { label: 'Hỏi đường ga tàu', text: '请问火车站在哪里？' },
        { label: 'Chào hỏi', text: '你好，很高兴认识你！' },
        { label: 'Hỏi giá tiền', text: '这个多少钱一份？' },
      ];
    }
    if (sourceLang === 'en') {
      return [
        { label: 'Train station', text: 'Could you tell me where the train station is?' },
        { label: 'Greeting', text: 'Hello, nice to meet you!' },
        { label: 'Price check', text: 'How much is this per serving?' },
      ];
    }
    if (sourceLang === 'th') {
      return [
        { label: 'ถามทางสถานีรถไฟ', text: 'ช่วยบอกฉันหน่อยได้ไหมว่าสถานีรถไฟอยู่ที่ไหน' },
        { label: 'ทักทาย', text: 'สวัสดี ยินดีที่ได้รู้จัก!' },
      ];
    }
    if (sourceLang === 'ko') {
      return [
        { label: '기차역 문의', text: '기차역이 어디에 있는지 알려주실 수 있나요?' },
        { label: '인사', text: '안녕하세요, 만나서 반갑습니다!' },
      ];
    }
    return [];
  };

  const phrases = getPhrases();

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none text-xs">
      <span className="shrink-0 flex items-center gap-1 text-slate-500 font-medium">
        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
        Mẫu thử:
      </span>
      {phrases.map((p, idx) => (
        <button
          key={idx}
          onClick={() => onSelectPhrase(p.text)}
          className="shrink-0 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 hover:border-blue-200 transition-colors cursor-pointer"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
};
