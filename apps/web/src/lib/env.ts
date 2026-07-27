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
  // Public Map ID (not a secret — visible in any page source). Google refuses
  // AdvancedMarkerElement without one, throwing the "can't load Google Maps
  // correctly" dialog, so a baked-in fallback keeps the planner alive even if
  // the Pages env var is missing at build time.
  googleMapId: optional('VITE_GOOGLE_MAP_ID') ?? '583a4cefd65aafa7ec06e319',
};

export const hasSupabaseEnvironment = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabasePublishableKey,
);
