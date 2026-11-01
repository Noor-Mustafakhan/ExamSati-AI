import React, { useState, useEffect, useMemo } from 'react';
import { adminUserService } from '../services/adminUserService';
import { useAuth } from '../context/AuthContext';
import { Users, Shield, Search, Check, AlertCircle, RefreshCw, Edit3, X } from 'lucide-react';

export const AdminUserManagementPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Edit role modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState('student');
  const [updating, setUpdating] = useState(false);

  // Edit name modal state
  const [editingNameUser, setEditingNameUser] = useState(null);
  const [newName, setNewName] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUserService.fetchAllUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Failed to load user profiles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChangeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    setUpdating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await adminUserService.updateUserRole(selectedUser.id, newRole);
      setSuccessMsg(`Successfully updated role for ${selectedUser.full_name || selectedUser.email} to "${newRole}".`);
      setSelectedUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user role.');
    } finally {
      setUpdating(false);
    }
  };

  const handleNameChangeSubmit = async (e) => {
    e.preventDefault();
    if (!editingNameUser || !newName.trim()) return;

    setUpdating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await adminUserService.updateUserProfile(editingNameUser.id, newName.trim());
      setSuccessMsg(`Successfully updated name for ${editingNameUser.email || 'user'} to "${newName.trim()}".`);
      setEditingNameUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user profile name.');
    } finally {
      setUpdating(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || name.includes(q) || email.includes(q);
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter.toLowerCase();
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const students = users.filter((u) => u.role === 'student').length;
    const moderators = users.filter((u) => u.role === 'moderator').length;
    return { total, admins, students, moderators };
  }, [users]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#15233B] text-white">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              User & Role Administration
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Manage user accounts, assign admin privileges, and inspect permissions backed by Supabase RLS.
          </p>
        </div>

        <button
          onClick={loadUsers}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Status Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Users
          </span>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
            Administrators
          </span>
          <p className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-300">{stats.admins}</p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Students
          </span>
          <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-200">{stats.students}</p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Moderators
          </span>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{stats.moderators}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Filter:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">Admins Only</option>
            <option value="STUDENT">Students Only</option>
            <option value="MODERATOR">Moderators Only</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading registered users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No users match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = currentUser?.id === u.id;
                  const roleBadgeClass =
                    u.role === 'admin'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                      : u.role === 'moderator'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{u.full_name || 'Anonymous User'}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.id}</div>
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {u.email || <span className="italic text-slate-400">Email hidden</span>}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${roleBadgeClass}`}
                        >
                          {u.role === 'admin' && <Shield className="w-3 h-3" />}
                          {u.role ? u.role.toUpperCase() : 'STUDENT'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>

                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingNameUser(u);
                            setNewName(u.full_name || '');
                          }}
                          className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition-colors"
                          title="Edit User Name"
                        >
                          <Edit3 className="w-3 h-3 inline mr-1" />
                          Edit
                        </button>

                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setNewRole(u.role || 'student');
                          }}
                          className="px-2.5 py-1 rounded bg-[#15233B] hover:bg-slate-800 text-white font-medium transition-colors"
                        >
                          Change Role
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Change Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Modify User Role
              </h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Update platform access permissions for{' '}
              <strong>{selectedUser.full_name || selectedUser.email}</strong>.
            </p>

            <form onSubmit={handleRoleChangeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assigned Permission Level
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="student">Student (Standard Exam Preparation Access)</option>
                  <option value="moderator">Moderator (Can review & verify MCQs)</option>
                  <option value="admin">Administrator (Full Platform Management Access)</option>
                </select>
              </div>

              {selectedUser.role === 'admin' && newRole !== 'admin' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <strong>Warning:</strong> Demoting an administrator revokes their platform curation and question review privileges.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 py-1.5 rounded-lg bg-[#15233B] hover:bg-slate-800 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {updating ? 'Updating...' : 'Save Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Name Edit Modal */}
      {editingNameUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Edit User Profile Name
              </h3>
              <button
                onClick={() => setEditingNameUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleNameChangeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Enter user full name..."
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingNameUser(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 py-1.5 rounded-lg bg-[#15233B] hover:bg-slate-800 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {updating ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

