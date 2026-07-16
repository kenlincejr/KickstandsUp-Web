type PublicEnvironment = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  googleMapsBrowserKey?: string;
  googleMapId?: string;
};

function optional(name: keyof ImportMetaEnv) {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export const publicEnv: PublicEnvironment = {
  supabaseUrl: optional('VITE_SUPABASE_URL') ?? '',
  supabasePublishableKey: optional('VITE_SUPABASE_PUBLISHABLE_KEY') ?? '',
  googleMapsBrowserKey: optional('VITE_GOOGLE_MAPS_BROWSER_KEY'),
  googleMapId: optional('VITE_GOOGLE_MAP_ID'),
};

export const hasSupabaseEnvironment = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabasePublishableKey,
);
