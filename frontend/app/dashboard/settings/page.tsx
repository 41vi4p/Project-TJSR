'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateProfile,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Bell, Lock, User, LogOut, Save, CheckCircle, AlertCircle } from 'lucide-react';
import Image from 'next/image';

function StatusMessage({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div
      className={`flex items-center space-x-2 p-3 rounded-lg text-sm ${
        type === 'success'
          ? 'bg-green-500/10 border border-green-500/30 text-green-400'
          : 'bg-red-500/10 border border-red-500/30 text-red-400'
      }`}
    >
      {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      <span>{message}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('profile');

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Notifications state
  const [notifSettings, setNotifSettings] = useState({
    jobMatches: true,
    applicationUpdates: true,
    interviewReminders: true,
    weeklyDigest: false,
    companyUpdates: false,
  });

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityStatus, setSecurityStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isGoogleUser = user?.providerData.some((p) => p.providerId === 'google.com') ?? false;
  const isPasswordUser = user?.providerData.some((p) => p.providerId === 'password') ?? false;

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    setProfileStatus(null);
    try {
      await updateProfile(user, { displayName });
      setProfileStatus({ type: 'success', message: 'Profile updated successfully.' });
    } catch (err: unknown) {
      setProfileStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update profile.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) return;
    setSecurityLoading(true);
    setSecurityStatus(null);

    if (newPassword !== confirmPassword) {
      setSecurityStatus({ type: 'error', message: 'New passwords do not match.' });
      setSecurityLoading(false);
      return;
    }
    if (newPassword.length < 6) {
      setSecurityStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      setSecurityLoading(false);
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setSecurityStatus({ type: 'success', message: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      setSecurityStatus({ type: 'error', message: msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim() });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setSecurityLoading(true);
    setSecurityStatus(null);
    try {
      if (isPasswordUser && user.email) {
        const credential = EmailAuthProvider.credential(user.email, deleteConfirmPassword);
        await reauthenticateWithCredential(user, credential);
      }
      await deleteUser(user);
      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account.';
      setSecurityStatus({ type: 'error', message: msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim() });
      setSecurityLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  return (
    <div className="max-w-4xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold theme-text mb-2">Settings</h1>
        <p className="text-gray-400">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b theme-border mb-8 overflow-x-auto">
        {[
          { id: 'profile', label: 'Profile', icon: User },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'security', label: 'Security', icon: Lock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 whitespace-nowrap smooth-transition flex-shrink-0 ${
                isActive
                  ? 'text-yellow-500 border-yellow-400'
                  : 'text-gray-400 border-transparent hover:text-[var(--text-main)]'
              }`}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Profile Picture */}
            <div className="brand-card dark-card rounded-lg p-6">
              <h2 className="text-lg font-bold theme-text mb-4">Profile Picture</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {user?.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt={user.displayName ?? 'Profile'}
                    width={80}
                    height={80}
                    className="rounded-xl ring-2 ring-yellow-400/40 flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#FACC15] text-[#1F2937] rounded-xl flex items-center justify-center text-xl sm:text-2xl font-bold flex-shrink-0">
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium theme-text truncate">{user?.displayName ?? 'No name set'}</p>
                  <p className="theme-muted text-sm mt-1 truncate">{user?.email}</p>
                  {isGoogleUser && (
                    <span className="inline-flex items-center space-x-1 mt-2 px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-blue-400 text-xs">
                      <svg className="w-3 h-3" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span>Signed in with Google</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Basic Info */}
            <div className="brand-card dark-card rounded-lg p-6">
              <h2 className="text-lg font-bold theme-text mb-6">Basic Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium theme-text-soft mb-2">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full theme-surface border theme-border rounded-lg py-2 px-4 theme-text placeholder:text-[var(--text-muted)] focus:outline-none focus:theme-border smooth-transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium theme-text-soft mb-2">Email</label>
                  <input
                    type="email"
                    value={user?.email ?? ''}
                    disabled
                    className="w-full theme-surface rounded-lg py-2 px-4 theme-muted cursor-not-allowed"
                  />
                  <p className="text-xs theme-muted mt-1">Email cannot be changed here.</p>
                </div>

                {profileStatus && <StatusMessage type={profileStatus.type} message={profileStatus.message} />}

                <button
                  onClick={handleSaveProfile}
                  disabled={profileLoading}
                  className="flex items-center justify-center space-x-2 w-full bg-[#FACC15] text-[#1F2937] rounded-lg py-3 theme-text font-semibold hover:shadow-lg dark-card-hover smooth-transition disabled:opacity-50"
                >
                  <Save size={20} />
                  <span>{profileLoading ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            {/* Sign Out */}
            <div className="brand-card dark-card rounded-lg p-6">
              <h2 className="text-lg font-bold theme-text mb-4">Session</h2>
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 px-6 py-3 theme-surface border theme-border hover:bg-[var(--card-bg)] rounded-lg theme-text smooth-transition"
              >
                <LogOut size={20} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="brand-card dark-card rounded-lg p-6">
            <h2 className="text-lg font-bold theme-text mb-6">Notification Preferences</h2>
            <div className="space-y-4">
              {(
                [
                  { key: 'jobMatches', label: 'New job matches', desc: 'Get notified when new jobs match your profile' },
                  { key: 'applicationUpdates', label: 'Application updates', desc: 'Receive updates on your applications' },
                  { key: 'interviewReminders', label: 'Interview reminders', desc: 'Get reminders before your interviews' },
                  { key: 'weeklyDigest', label: 'Weekly digest', desc: 'Receive a weekly summary of opportunities' },
                  { key: 'companyUpdates', label: 'Company updates', desc: 'Get updates from companies you follow' },
                ] as const
              ).map((notif) => (
                <div
                  key={notif.key}
                  className="flex items-start sm:items-center justify-between gap-4 p-4 theme-input rounded-lg border theme-border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium theme-text">{notif.label}</p>
                    <p className="theme-muted text-sm">{notif.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={notifSettings[notif.key]}
                      onChange={(e) =>
                        setNotifSettings((prev) => ({ ...prev, [notif.key]: e.target.checked }))
                      }
                    />
                    <div className="w-11 h-6 [background:var(--card-bg2)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-yellow-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-400"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Change Password — only for email/password users */}
            {isPasswordUser ? (
              <div className="brand-card dark-card rounded-lg p-6">
                <h2 className="text-lg font-bold theme-text mb-6">Change Password</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium theme-text-soft mb-2">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full theme-surface border theme-border rounded-lg py-2 px-4 theme-text focus:outline-none focus:theme-border smooth-transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium theme-text-soft mb-2">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full theme-surface border theme-border rounded-lg py-2 px-4 theme-text focus:outline-none focus:theme-border smooth-transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium theme-text-soft mb-2">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full theme-surface border theme-border rounded-lg py-2 px-4 theme-text focus:outline-none focus:theme-border smooth-transition"
                    />
                  </div>

                  {securityStatus && !showDeleteConfirm && (
                    <StatusMessage type={securityStatus.type} message={securityStatus.message} />
                  )}

                  <button
                    onClick={handleChangePassword}
                    disabled={securityLoading}
                    className="w-full bg-[#FACC15] text-[#1F2937] rounded-lg py-3 theme-text font-semibold hover:shadow-lg dark-card-hover smooth-transition disabled:opacity-50"
                  >
                    {securityLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="brand-card dark-card rounded-lg p-6">
                <h2 className="text-lg font-bold theme-text mb-2">Password</h2>
                <p className="text-gray-400 text-sm">
                  You signed in with Google. Password management is handled by your Google account.
                </p>
              </div>
            )}

            {/* Danger Zone */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
              <h2 className="text-lg font-bold text-red-400 mb-4">Danger Zone</h2>
              <p className="text-gray-400 mb-4">Permanently delete your account and all associated data.</p>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg theme-text font-semibold smooth-transition"
                >
                  <LogOut size={20} />
                  <span>Delete Account</span>
                </button>
              ) : (
                <div className="space-y-4">
                  <p className="text-red-300 text-sm font-medium">
                    This action is irreversible. {isPasswordUser ? 'Enter your password to confirm.' : 'Click confirm to proceed.'}
                  </p>
                  {isPasswordUser && (
                    <input
                      type="password"
                      placeholder="Enter your password to confirm"
                      value={deleteConfirmPassword}
                      onChange={(e) => setDeleteConfirmPassword(e.target.value)}
                      className="w-full theme-surface border border-red-500/30 rounded-lg py-2 px-4 theme-text focus:outline-none focus:border-red-500/50 smooth-transition"
                    />
                  )}
                  {securityStatus && showDeleteConfirm && (
                    <StatusMessage type={securityStatus.type} message={securityStatus.message} />
                  )}
                  <div className="flex space-x-3">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={securityLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 rounded-lg py-2 theme-text font-semibold smooth-transition disabled:opacity-50"
                    >
                      {securityLoading ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmPassword(''); setSecurityStatus(null); }}
                      className="flex-1 theme-surface hover:bg-[var(--card-bg)] rounded-lg py-2 theme-text smooth-transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
