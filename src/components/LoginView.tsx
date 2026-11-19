import React, { useState } from 'react';
import { FlaskConical, Lock, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { apiFetch, setToken } from '../lib/api';
import { User } from '../types';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

const DEMO_ACCOUNTS = [
  { label: 'Staff PD (M. Ikmal)', email: 'ikmal@pharma.co.id', role: 'Staff · Mobile' },
  { label: 'Staff Andev (Nadia)', email: 'nadia.andev@pharma.co.id', role: 'Staff · Mobile' },
  { label: 'Supervisor PD', email: 'spv.pd@pharma.co.id', role: 'Supervisor · Mobile' },
  { label: 'Manager R&D', email: 'manager@pharma.co.id', role: 'Manager · Mobile' },
  { label: 'Administrator', email: 'admin@pharma.co.id', role: 'Admin · Mobile' },
];

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [email, setEmail] = useState('ikmal@pharma.co.id');
  const [password, setPassword] = useState('Pharma2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          {/* Brand Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-[#0F2747] text-white flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">
                PD &amp; ANDEV WORKLOG
              </h1>
              <p className="text-xs text-slate-500">
                Pharmaceutical R&amp;D Activity Management
              </p>
            </div>
          </div>

          {!forgotOpen ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email / Employee ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@pharma.co.id"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen(true);
                      setForgotSent(false);
                    }}
                    className="text-xs font-medium text-blue-700 hover:text-blue-800"
                  >
                    Lupa Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#0F2747] hover:bg-[#163661] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>{loading ? 'Memverifikasi...' : 'Masuk ke Aplikasi'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">Reset Password Akun</h2>
              {forgotSent ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Permintaan reset password telah dikirim ke Administrator IT untuk email{' '}
                    <strong>{email}</strong>.
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Masukkan email perusahaan Anda. Administrator akan mengirimkan tautan reset password.
                </p>
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg"
                placeholder="nama@pharma.co.id"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForgotSent(true)}
                  className="flex-1 py-2 px-4 bg-[#0F2747] text-white text-xs font-semibold rounded-lg hover:bg-[#163661]"
                >
                  Kirim Permintaan
                </button>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="py-2 px-4 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Kembali
                </button>
              </div>
            </div>
          )}

          {/* Demo Role Switcher */}
          <div className="mt-7 pt-5 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-2.5">
              Akun Simulasi (Password: <span className="font-mono">Pharma2026!</span>)
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword('Pharma2026!');
                    setForgotOpen(false);
                    setError('');
                  }}
                  className={`flex items-center justify-between px-3 py-2 text-left text-xs rounded-lg border transition-colors ${
                    email === acc.email
                      ? 'border-blue-600 bg-blue-50/60 text-slate-900 font-medium'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>{acc.label}</span>
                  <span className="text-slate-500 font-mono text-[11px]">{acc.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
