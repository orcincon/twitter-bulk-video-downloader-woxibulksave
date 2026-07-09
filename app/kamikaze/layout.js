export const metadata = {
  title: { absolute: 'Kamikaze — Yönetim Paneli' },
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '48x48' },
    ],
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
};

export default function KamikazeLayout({ children }) {
  return (
    <div className="min-h-screen w-full max-w-[1920px] mx-auto">
      {children}
    </div>
  );
}
