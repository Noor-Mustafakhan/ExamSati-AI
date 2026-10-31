import { createClient } from '@supabase/supabase-js';

// In Node.js testing/script environments, load .env file if available
if (typeof process !== 'undefined' && process.env && !process.env.VITE_SUPABASE_URL && typeof window === 'undefined') {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('.env');
    }
  } catch {
    // Ignore if already loaded or not found
  }
}

const env = (typeof import.meta !== 'undefined' && import.meta.env) || (typeof process !== 'undefined' && process.env) || {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

// Detect if real Supabase environment variables are provided
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseKey.includes('your-supabase-publishable')
);

// Fallback dummy URL and key to prevent instantiation failure when variables are not yet configured
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
