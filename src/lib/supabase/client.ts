import { createBrowserClient, SupabaseClient } from '@supabase/ssr';

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock client for build/preview when env vars not available
    const mockClient: SupabaseClient = {
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
    } as SupabaseClient;
    return mockClient;
  }

  return createBrowserClient(url, key);
}
