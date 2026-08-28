import NextAuth from 'next-auth';
import { getServerSession } from 'next-auth';
import TwitterProvider from 'next-auth/providers/twitter';
import { createSupabaseClient } from './supabase.js';
import { encryptToken } from './token-crypto.js';

// Local'de NEXTAUTH_URL (localhost) kullan; yoksa production site URL
const siteUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const authOptions = {
  providers: [
    TwitterProvider({
      clientId: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID || process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
      version: '2.0',
      checks: ['pkce', 'state'],
      authorization: {
        // twitter.com/i/oauth2 SPA now blanks/loops (especially mobile).
        // Auth.js and X docs use x.com; keep PKCE token exchange on api.x.com.
        url: 'https://x.com/i/oauth2/authorize',
        params: { scope: 'users.read tweet.read offline.access users.email' },
      },
      token: {
        url: 'https://api.x.com/2/oauth2/token',
        async request({ client, params, checks, provider }) {
          const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID || process.env.TWITTER_CLIENT_ID;
          const response = await client.oauthCallback(provider.callbackUrl, params, checks, {
            exchangeBody: { client_id: clientId },
          });
          return { tokens: response };
        },
      },
      userinfo: {
        url: 'https://api.x.com/2/users/me',
        params: { 'user.fields': 'profile_image_url,confirmed_email,username' },
      },
      profile({ data }) {
        return {
          id: data.id,
          name: data.name,
          email: data.confirmed_email ?? null,
          image: data.profile_image_url ?? null,
          username: data.username ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.access_token) {
        token.access_token = account.access_token;
      }
      if (user?.email) token.email = user.email;
      if (user?.name) token.name = user.name;
      if (user?.username) token.username = user.username;
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.access_token) {
        session.access_token = token.access_token;
      }
      if (token?.email) session.user.email = token.email;
      if (token?.name) session.user.name = token.name;
      if (token?.username) session.user.username = token.username;
      if (token?.sub) session.user.id = token.sub;
      return session;
    },
    async redirect({ url, baseUrl }) {
      const base = (siteUrl || baseUrl || '').replace(/\/$/, '');
      try {
        if (typeof url === 'string' && url.startsWith('/')) {
          return base ? `${base}${url}` : url;
        }
        const target = new URL(url);
        const allowed = new URL(base || baseUrl);
        if (target.origin === allowed.origin) {
          return `${allowed.origin}${target.pathname}${target.search}${target.hash}`;
        }
        return base || baseUrl;
      } catch {
        return base || baseUrl;
      }
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 gün sonra oturum sonlanır
    updateAge: 24 * 60 * 60, // Site kullanıldıkça 7 günlük süre yenilenir (en fazla günde bir)
  },
  events: {
    async signIn({ user, account }) {
      try {
        const supabase = createSupabaseClient();
        if (!supabase) {
          console.warn('[auth] signIn: Supabase client not configured');
          return;
        }
        if (!user?.id) return;
        const expiresAt = account?.expires_at ? new Date(account.expires_at * 1000).toISOString() : null;
        const payload = {
          id: user.id,
          email: user.email || null,
          name: user.name || null,
          image: user.image || null,
          access_token: account?.access_token ? encryptToken(account.access_token) : null,
          refresh_token: account?.refresh_token ? encryptToken(account.refresh_token) : null,
          token_expires_at: expiresAt,
          token_is_valid: true,
          updated_at: new Date().toISOString(),
        };
        if (user.username) payload.username = user.username;

        let { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
        if (error && user.username) {
          const msg = String(error.message || '');
          const missingUsername =
            error.code === 'PGRST204' ||
            /username/i.test(msg) ||
            /Could not find the 'username' column/i.test(msg);
          if (missingUsername) {
            delete payload.username;
            ({ error } = await supabase.from('users').upsert(payload, { onConflict: 'id' }));
          }
        }
        if (error) {
          console.warn('[auth] signIn Supabase upsert error:', error.message, error.code);
        }
      } catch (err) {
        console.warn('[auth] signIn error:', err?.message || err);
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'fallback-dev-secret-change-in-production',
  pages: { signIn: '/' },
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === 'production',
};

/**
 * Session alır; NEXTAUTH_SECRET değişince eski çerez decrypt edilemezse
 * hata fırlatmak yerine null döner (sayfa/API çökmez).
 */
export async function getSessionSafe() {
  try {
    return await getServerSession(authOptions);
  } catch (err) {
    const msg = err?.message ?? '';
    const code = err?.code ?? '';
    if (
      code === 'JWT_SESSION_ERROR' ||
      msg.includes('decryption') ||
      msg.includes('JWT')
    ) {
      return null;
    }
    throw err;
  }
}
