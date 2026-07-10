import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock client for build/preview when env vars not available
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        signInWithOAuth: async () => ({ error: new Error('Supabase not configured') }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error('Supabase not configured') }),
          }),
          order: () => ({
            limit: () => ({
              then: async () => [],
              catch: async () => [],
            }),
            then: async () => [],
            catch: async () => [],
          }),
        }),
        insert: async () => ({ error: new Error('Supabase not configured') }),
      }),
      channel: () => ({
        on: () => ({ subscribe: () => {} }),
      }),
    } as any;
  }

  return createBrowserClient(url, key);
}
