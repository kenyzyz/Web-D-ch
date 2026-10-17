import React from 'react';
import { X, Mic, ShieldAlert, Smartphone, Chrome, HelpCircle } from 'lucide-react';

interface MicrophoneGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTestMicrophone: () => void;
}

export const MicrophoneGuideModal: React.FC<MicrophoneGuideModalProps> = ({
  isOpen,
  onClose,
  onTestMicrophone,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">
              Hướng dẫn cấp quyền Micro & Khắc phục lỗi
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/60 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-blue-900 mb-0.5">
                Yêu cầu HTTPS & Quyền bảo mật
              </div>
              <p>
                Trình duyệt chỉ cho phép truy cập Micro trên các trang web có kết nối bảo mật <b>HTTPS</b> hoặc <b>localhost</b>.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <Chrome className="w-4 h-4 text-emerald-600" />
              1. Cho phép Micro trên Máy tính (Chrome, Edge, Cốc Cốc)
            </h4>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Nhìn vào thanh địa chỉ của trình duyệt (cạnh tên miền).</li>
              <li>Bấm vào biểu tượng <b>Ổ khóa 🔒</b> hoặc <b>Cài đặt trang web</b>.</li>
              <li>Tìm mục <b>Microphone (Micro)</b> và chuyển sang <b>Cho phép (Allow)</b>.</li>
              <li>Tải lại trang (F5) để áp dụng.</li>
            </ol>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-blue-600" />
              2. Cho phép Micro trên Điện thoại (Android / iOS)
            </h4>
            <div className="space-y-2">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-800">Trên Android (Chrome):</span> Nhấn vào dấu 3 chấm góc phải &gt; Cài đặt &gt; Cài đặt trang web &gt; Micro &gt; Chọn Cho phép.
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-800">Trên iPhone / iPad (Safari):</span> Vào Cài đặt máy &gt; Safari &gt; Micro &gt; Cho phép; hoặc bấm chữ aA trên thanh địa chỉ &gt; Cài đặt trang web &gt; Micro.
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              3. Mẹo nhận diện giọng nói chuẩn nhất
            </h4>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-600">
              <li>Nói to, rõ ràng, giảm bớt tiếng ồn xung quanh.</li>
              <li>Khi kết thúc câu bằng từ &quot;dịch&quot;, hệ thống sẽ tự động gửi dịch ngay!</li>
              <li>Bạn cũng có thể gõ chữ trực tiếp vào ô để sửa hoặc dịch mà không cần micro.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => {
              onTestMicrophone();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Thử Micro ngay</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
