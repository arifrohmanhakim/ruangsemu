import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock client for build/preview when env vars not available
    const mockClient = {
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
    } as unknown as SupabaseClient;
    return mockClient;
  }

  return createBrowserClient(url, key);
}
