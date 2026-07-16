import { createClient } from '@supabase/supabase-js';
import { hasSupabaseEnvironment, publicEnv } from './env';

export const supabase = hasSupabaseEnvironment
  ? createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
      },
      realtime: {
        params: { eventsPerSecond: 5 },
      },
    })
  : null;
