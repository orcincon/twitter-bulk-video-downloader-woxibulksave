export const metadata = {
  title: 'Kamikaze — Yönetim Paneli',
  robots: 'noindex, nofollow',
};

export default function KamikazeLayout({ children }) {
  return (
    <div className="min-h-screen w-full max-w-[1920px] mx-auto">
      {children}
    </div>
  );
}
