import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { commissions as mockCommissions } from '../data/commissions';

export const commissionService = {
  async getCommissions() {
    if (!isSupabaseConfigured) {
      return { data: mockCommissions, isLive: false, error: null };
    }

    try {
      const { data, error } = await supabase
        .from('commissions')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return { data: data && data.length > 0 ? data : mockCommissions, isLive: Boolean(data?.length), error: null };
    } catch (err) {
      // Graceful fallback to mock data on network error
      return { data: mockCommissions, isLive: false, error: err.message };
    }
  },
};
