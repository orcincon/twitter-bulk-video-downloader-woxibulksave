export default function SecurityBanner({ layout = {} }) {
  const { label = '', text = '' } = layout.security || {};
  if (!text) return null;
  return (
    <div className="mb-4 sm:mb-6 md:mb-8 bg-[#E7F3FF] border border-[#1d9bf0]/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex gap-3 sm:gap-4 items-start">
      <svg className="w-5 h-5 text-[#1d9bf0] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
        <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
      </svg>
      <p className="text-sm text-blue-900/90 leading-relaxed">
        <strong>{label}</strong> {text}
      </p>
    </div>
  );
}
