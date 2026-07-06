'use client';

import { signIn } from 'next-auth/react';

/** Tıklanınca X (Twitter) girişine yönlendiren buton (erişilebilirlik: aksiyon için <button> kullanılıyor). */
export default function SignInLink({ children, className = '' }) {
  const handleClick = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '/';
    signIn('twitter', { callbackUrl: url });
  };

  const fullClass = `text-[#1d9bf0] hover:text-[#1686d4] font-medium underline cursor-pointer bg-transparent border-0 p-0 inline ${className}`.trim();

  return (
    <button type="button" onClick={handleClick} className={fullClass}>
      {children}
    </button>
  );
}
