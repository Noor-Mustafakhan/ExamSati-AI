import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

/**
 * Admin User & Role Management Service
 * Provides secure administrative operations to view users and update roles.
 * Backed by Supabase RLS and SECURITY DEFINER RPCs.
 */
export const adminUserService = {
  /**
   * Fetches all registered users for the admin management dashboard.
   * Only succeeds if the current authenticated user has the 'admin' role.
   */
  async fetchAllUsers() {
    if (!isSupabaseConfigured) {
      // Local fallback mock data for testing/demo
      return [
        {
          id: 'admin-mock-1',
          full_name: 'Project Administrator',
          role: 'admin',
          email: 'admin@examsathi.ai',
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        },
        {
          id: 'student-mock-2',
          full_name: 'Sample Candidate',
          role: 'student',
          email: 'student@example.com',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          last_sign_in_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ];
    }

    try {
      // Try the secure RPC first (which joins auth.users for email)
      const { data, error } = await supabase.rpc('admin_get_all_users');
      if (!error && Array.isArray(data)) {
        return data;
      }

      // Fallback: direct query on public.profiles (permitted by admin SELECT policy)
      const { data: profiles, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profileErr) throw profileErr;
      return profiles || [];
    } catch (err) {
      console.error('[AdminUserService] Error fetching users:', err);
      throw err;
    }
  },

  /**
   * Updates a user's role (admin, student, moderator).
   * Protected by server-side is_admin() and RLS.
   */
  async updateUserRole(targetUserId, newRole) {
    if (!isSupabaseConfigured) {
      return { success: true, user_id: targetUserId, new_role: newRole };
    }

    try {
      const { data, error } = await supabase.rpc('admin_update_user_role', {
        p_target_user_id: targetUserId,
        p_new_role: newRole,
      });

      if (error) {
        // Fallback to direct table update if RPC not yet run
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ role: newRole, updated_at: new Date().toISOString() })
          .eq('id', targetUserId);

        if (updateErr) throw updateErr;
        return { success: true, user_id: targetUserId, new_role: newRole };
      }

      return data;
    } catch (err) {
      console.error('[AdminUserService] Failed to update role:', err);
      throw err;
    }
  },

  /**
   * Updates a user's full name by an administrator.
   */
  async updateUserProfile(targetUserId, fullName) {
    if (!isSupabaseConfigured) {
      return { success: true, user_id: targetUserId, full_name: fullName };
    }

    try {
      const { data, error } = await supabase.rpc('admin_update_user_profile', {
        p_target_user_id: targetUserId,
        p_full_name: fullName,
      });

      if (error) {
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ full_name: fullName, updated_at: new Date().toISOString() })
          .eq('id', targetUserId);

        if (updateErr) throw updateErr;
        return { success: true, user_id: targetUserId, full_name: fullName };
      }

      return data;
    } catch (err) {
      console.error('[AdminUserService] Failed to update profile:', err);
      throw err;
    }
  },
};
