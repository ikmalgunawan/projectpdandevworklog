import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  FileSpreadsheet,
  Database,
  Shield,
  User as UserIcon,
  Bell,
  LogOut,
  FlaskConical,
  Download,
  FileText,
  Check,
  X,
  Plus,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  apiFetch,
  exportWorklogsToExcel,
  exportWorklogsToPDF,
  formatDateID,
  formatDuration,
  formatDurationShort,
} from '../lib/api';
import {
  DashboardSummary,
  ErpConfig,
  NotificationItem,
  User,
  WorkCategory,
  Worklog,
} from '../types';

interface MobileManagementAppProps {
  user: User;
  onLogout: () => void;
}

type MobileMgmtTab = 'dashboard' | 'monitoring' | 'products' | 'reports' | 'master' | 'users' | 'profile';

const CHART_COLORS = ['#0F2747', '#2563EB', '#64748B'];

const REPORT_TYPES = [
  'Daily Worklog Report',
  'Monthly Worklog Report',
  'Employee Activity Report',
  'Department Activity Report',
  'Product Activity Report',
  'UPB / UPV Activity Report',
];

export default function MobileManagementApp({ user, onLogout }: MobileManagementAppProps) {
  const [tab, setTab] = useState<MobileMgmtTab>('dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [erpConfig, setErpConfig] = useState<ErpConfig | null>(null);

  // Filters
  const [monitorDate, setMonitorDate] = useState('2026-11-19');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-11-30');
  const [deptFilter, setDeptFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);

  // Employee Detail Modal
  const [detailEmployee, setDetailEmployee] = useState<{ id: number; name: string; department: string } | null>(null);
  const [detailLogs, setDetailLogs] = useState<Worklog[]>([]);

  // Admin Forms
  const [newCatName, setNewCatName] = useState('');
  const [newCatDept, setNewCatDept] = useState('All');
  const [newUserForm, setNewUserForm] = useState({
    employee_id: '',
    name: '',
    email: '',
    department: 'Product Development',
    role: 'staff',
  });
  const [toast, setToast] = useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function loadAll() {
    const qs = new URLSearchParams({
      date: monitorDate,
      startDate,
      endDate,
      department: deptFilter,
      referenceType: sourceFilter,
    });
    const [sum, wls, cats, usrs, notifs, erp] = await Promise.all([
      apiFetch<DashboardSummary>(`/api/dashboard/summary?${qs}`),
      apiFetch<Worklog[]>(`/api/worklogs?${qs}`),
      apiFetch<WorkCategory[]>('/api/categories'),
      apiFetch<User[]>('/api/users'),
      apiFetch<NotificationItem[]>('/api/notifications'),
      apiFetch<ErpConfig>('/api/erp/config'),
    ]);
    setSummary(sum);
    setWorklogs(wls);
    setCategories(cats);
    setUsersList(usrs);
    setNotifications(notifs);
    setErpConfig(erp);
  }

  useEffect(() => {
    loadAll().catch(() => {});
  }, [monitorDate, startDate, endDate, deptFilter, sourceFilter]);

  async function openEmployeeDetail(emp: { user_id: number; name: string; department: string }) {
    setDetailEmployee({ id: emp.user_id, name: emp.name, department: emp.department });
    const logs = await apiFetch<Worklog[]>(`/api/worklogs?userId=${emp.user_id}&startDate=${startDate}&endDate=${endDate}`);
    setDetailLogs(logs);
  }

  async function handleReviewRevision(userId: number, approve: boolean) {
    await apiFetch('/api/submissions/review-revision', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, work_date: monitorDate, approve }),
    });
    notify(approve ? 'Permintaan revisi disetujui.' : 'Permintaan revisi ditolak.');
    await loadAll();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await apiFetch('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ category_name: newCatName, department: newCatDept }),
    });
    setNewCatName('');
    notify('Jenis pekerjaan ditambahkan.');
    await loadAll();
  }

  async function handleToggleCategory(cat: WorkCategory) {
    await apiFetch(`/api/categories/${cat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: cat.status === 'Active' ? 'Inactive' : 'Active' }),
    });
    await loadAll();
  }

  async function handleSaveErpConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!erpConfig) return;
    await apiFetch('/api/erp/config', {
      method: 'PUT',
      body: JSON.stringify({
        mode: erpConfig.mode,
        baseUrl: erpConfig.baseUrl,
        authType: erpConfig.authType,
      }),
    });
    notify('Konfigurasi ERP disimpan.');
    await loadAll();
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(newUserForm),
    });
    setNewUserForm({
      employee_id: '',
      name: '',
      email: '',
      department: 'Product Development',
      role: 'staff',
    });
    notify('Pengguna baru ditambahkan.');
    await loadAll();
  }

  async function handleReadAllNotifs() {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await loadAll();
  }

  const unreadCount = notifications.filter((n) => !n.read_status).length;

  const bottomTabs: Array<{ id: MobileMgmtTab; label: string; icon: React.ElementType }> =
    user.role === 'admin'
      ? [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'monitoring', label: 'Tim', icon: Users },
          { id: 'master', label: 'Master', icon: Database },
          { id: 'users', label: 'Users', icon: Shield },
          { id: 'profile', label: 'Profile', icon: UserIcon },
        ]
      : [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'monitoring', label: 'Tim', icon: Users },
          { id: 'products', label: 'Produk', icon: Package },
          { id: 'reports', label: 'Report', icon: FileSpreadsheet },
          { id: 'profile', label: 'Profile', icon: UserIcon },
        ];

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center">
      <div className="w-full max-w-lg bg-slate-50 min-h-screen flex flex-col border-x border-slate-200 relative pb-20">
        {/* Mobile Top Bar */}
        <header className="bg-[#0F2747] text-white px-5 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <FlaskConical className="w-5 h-5 text-blue-300 shrink-0" />
            <div className="truncate">
              <div className="text-sm font-bold tracking-tight leading-tight truncate">PD &amp; ANDEV WORKLOG</div>
              <div className="text-[11px] text-blue-200 uppercase font-mono">{user.role}</div>
            </div>
          </div>
          <button
            onClick={() => setTab('profile')}
            className="relative p-1.5 text-slate-200 hover:text-white"
            aria-label="Notifikasi"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>
        </header>

        {toast && (
          <div className="mx-4 mt-3 p-3 rounded-lg text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-800">
            {toast}
          </div>
        )}

        <main className="flex-1 p-4 space-y-4">
          {/* Compact Mobile Filters */}
          {(tab === 'dashboard' || tab === 'monitoring' || tab === 'products' || tab === 'reports') && (
            <section className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Filter Data</span>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('2026-09-01');
                    setEndDate('2026-11-30');
                    setMonitorDate('2026-11-19');
                    setDeptFilter('all');
                    setSourceFilter('all');
                  }}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Reset Filter
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Periode Mulai</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Periode Akhir</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setMonitorDate(e.target.value);
                    }}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Departemen</label>
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="all">Semua Dept</option>
                    <option value="Product Development">PD</option>
                    <option value="Analytical Development">Andev</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Sumber Data</label>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="all">Semua Sumber</option>
                    <option value="UPB">UPB</option>
                    <option value="UPV">UPV</option>
                    <option value="Produk Eksisting">Produk Eksisting</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* 1. DASHBOARD */}
          {tab === 'dashboard' && summary && (
            <>
              <section className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Karyawan PD', value: summary.kpi.totalPd },
                  { label: 'Karyawan Andev', value: summary.kpi.totalAndev },
                  { label: 'Aktivitas Hari Ini', value: summary.kpi.totalActivitiesToday },
                  { label: 'Sudah Submit', value: summary.kpi.totalSubmittedToday, tone: 'text-emerald-700' },
                  { label: 'Belum Submit', value: summary.kpi.totalNotSubmittedToday, tone: 'text-amber-700' },
                  { label: 'Total Durasi', value: formatDurationShort(summary.kpi.totalDurationMinutes) },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-3.5">
                    <div className="text-[11px] text-slate-500">{kpi.label}</div>
                    <div className={`text-xl font-bold tabular-nums mt-0.5 ${kpi.tone || 'text-slate-900'}`}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </section>

              <section className="bg-white border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Distribusi Sumber Pekerjaan</h3>
                <p className="text-xs text-slate-500 mb-3">UPB, UPV, dan Produk Eksisting</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.sourceDistribution}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, payload }) => `${name} (${(payload as { percentage: number }).percentage}%)`}
                      >
                        {summary.sourceDistribution.map((entry, idx) => (
                          <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Aktivitas PD vs Andev</h3>
                <p className="text-xs text-slate-500 mb-3">Indikator distribusi aktivitas per departemen</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.departmentComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="activities" name="Aktivitas" fill="#0F2747" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Tren Bulanan</h3>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="UPB" stroke="#0F2747" strokeWidth={2} />
                      <Line type="monotone" dataKey="UPV" stroke="#2563EB" strokeWidth={2} />
                      <Line type="monotone" dataKey="Produk Eksisting" stroke="#64748B" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          )}

          {/* 2. EMPLOYEE MONITORING */}
          {tab === 'monitoring' && summary && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Monitoring Tim ({formatDateID(monitorDate)})</h3>
                <span className="text-xs text-slate-500 tabular-nums">{summary.employeeMonitoring.length} karyawan</span>
              </div>

              {summary.employeeMonitoring.map((emp) => (
                <div key={emp.user_id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => openEmployeeDetail(emp)}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="text-sm font-bold text-[#0F2747] flex items-center gap-1">
                        <span className="truncate">{emp.name}</span>
                        <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
                      </div>
                      <div className="text-xs text-slate-500">
                        {emp.department} · {emp.employee_id}
                      </div>
                    </button>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        emp.submission_status === 'Sudah Submit'
                          ? 'text-emerald-700'
                          : emp.submission_status === 'Menunggu Revisi'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {emp.submission_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100 font-mono tabular-nums">
                    <span>{emp.total_activities} aktivitas</span>
                    <span>{formatDurationShort(emp.total_duration_minutes)}</span>
                  </div>

                  {emp.submission_status === 'Menunggu Revisi' && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      {emp.revision_reason && (
                        <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                          Alasan revisi: {emp.revision_reason}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReviewRevision(emp.user_id, true)}
                          className="flex-1 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Setujui Revisi</span>
                        </button>
                        <button
                          onClick={() => handleReviewRevision(emp.user_id, false)}
                          className="flex-1 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Tolak</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* 3. TOP 10 PRODUCTS */}
          {tab === 'products' && summary && (
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Top 10 Produk Paling Sering Dikerjakan</h3>
              {summary.topProducts.map((p) => (
                <div key={p.reference_id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#0F2747]">
                      #{p.rank} · {p.reference_number}
                    </span>
                    <span className="font-semibold text-blue-700">{p.reference_type}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{p.product_name}</div>
                  <div className="flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums pt-1 border-t border-slate-100">
                    <span>{p.activity_count} Aktivitas ({p.percentage}%)</span>
                    <span>{formatDuration(p.total_duration_minutes)}</span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* 4. REPORTS */}
          {tab === 'reports' && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Report &amp; Export Data</h3>
                <p className="text-xs text-slate-500">Pilih jenis laporan lalu unduh dalam format Excel atau PDF.</p>
              </div>
              <div className="space-y-2">
                {REPORT_TYPES.map((rt) => (
                  <button
                    key={rt}
                    onClick={() => setReportType(rt)}
                    className={`w-full p-3 text-left rounded-lg border text-xs font-semibold ${
                      reportType === rt
                        ? 'border-[#0F2747] bg-blue-50/50 text-[#0F2747]'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    {rt}
                  </button>
                ))}
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-700">
                {worklogs.length} Aktivitas · {formatDuration(worklogs.reduce((s, w) => s + w.duration_minutes, 0))}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => exportWorklogsToExcel(worklogs, reportType)}
                  className="py-2.5 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() =>
                    exportWorklogsToPDF(worklogs, reportType, `${formatDateID(startDate)} - ${formatDateID(endDate)}`)
                  }
                  className="py-2.5 px-3 bg-[#0F2747] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>PDF</span>
                </button>
              </div>
            </section>
          )}

          {/* 5. MASTER DATA & ERP (ADMIN) */}
          {tab === 'master' && user.role === 'admin' && (
            <div className="space-y-4">
              <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Master Jenis Pekerjaan</h3>
                <form onSubmit={handleAddCategory} className="space-y-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nama jenis pekerjaan baru..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newCatDept}
                      onChange={(e) => setNewCatDept(e.target.value)}
                      className="flex-1 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="All">All</option>
                      <option value="Product Development">PD</option>
                      <option value="Analytical Development">Andev</option>
                    </select>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#0F2747] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                </form>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {categories.map((c) => (
                    <div key={c.id} className="px-3 py-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900">{c.category_name}</span>
                      <button
                        onClick={() => handleToggleCategory(c)}
                        className={`font-semibold ${c.status === 'Active' ? 'text-emerald-700' : 'text-slate-400'}`}
                      >
                        {c.status}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {erpConfig && (
                <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">ERP API Integration Layer</h3>
                  <form onSubmit={handleSaveErpConfig} className="space-y-2.5">
                    <select
                      value={erpConfig.mode}
                      onChange={(e) =>
                        setErpConfig({ ...erpConfig, mode: e.target.value as 'SIMULATION' | 'PRODUCTION' })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="SIMULATION">SIMULATION (Data Demonstrasi)</option>
                      <option value="PRODUCTION">PRODUCTION (REST API ERP)</option>
                    </select>
                    <input
                      type="text"
                      value={erpConfig.baseUrl}
                      onChange={(e) => setErpConfig({ ...erpConfig, baseUrl: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#0F2747] text-white text-xs font-semibold rounded-lg"
                    >
                      Simpan Konfigurasi ERP
                    </button>
                  </form>
                </section>
              )}
            </div>
          )}

          {/* 6. USER MANAGEMENT (ADMIN) */}
          {tab === 'users' && user.role === 'admin' && (
            <div className="space-y-4">
              <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900">Tambah Pengguna Baru</h3>
                <form onSubmit={handleAddUser} className="space-y-2">
                  <input
                    required
                    placeholder="Employee ID (mis. PD-105)"
                    value={newUserForm.employee_id}
                    onChange={(e) => setNewUserForm({ ...newUserForm, employee_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                  <input
                    required
                    placeholder="Nama Lengkap"
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newUserForm.department}
                      onChange={(e) => setNewUserForm({ ...newUserForm, department: e.target.value })}
                      className="px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Product Development">PD</option>
                      <option value="Analytical Development">Andev</option>
                      <option value="Management">Management</option>
                      <option value="IT / Admin">IT / Admin</option>
                    </select>
                    <select
                      value={newUserForm.role}
                      onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                      className="px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="staff">Staff</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-[#0F2747] text-white text-xs font-semibold rounded-lg"
                  >
                    Simpan Pengguna
                  </button>
                </form>
              </section>

              <section className="space-y-2">
                {usersList.map((u) => (
                  <div key={u.id} className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{u.name}</span>
                      <span className="font-mono uppercase text-[11px] text-blue-700 font-semibold">{u.role}</span>
                    </div>
                    <div className="text-slate-500">
                      {u.employee_id} · {u.department} · {u.email}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}

          {/* 7. PROFILE & NOTIFICATIONS */}
          {tab === 'profile' && (
            <section className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h2 className="text-base font-bold text-slate-900">Profil Akun</h2>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <span className="text-slate-500">Nama</span>
                  <span className="font-semibold text-slate-900 text-right">{user.name}</span>
                  <span className="text-slate-500">ID Karyawan</span>
                  <span className="font-mono font-semibold text-slate-900 text-right">{user.employee_id}</span>
                  <span className="text-slate-500">Role</span>
                  <span className="font-mono uppercase font-semibold text-blue-700 text-right">{user.role}</span>
                  <span className="text-slate-500">Departemen</span>
                  <span className="font-semibold text-slate-900 text-right">{user.department}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full py-2.5 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded-lg flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Keluar dari Aplikasi</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Notifikasi ({unreadCount} baru)</h3>
                  {unreadCount > 0 && (
                    <button onClick={handleReadAllNotifs} className="text-xs font-medium text-blue-700">
                      Tandai dibaca
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada notifikasi.</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        n.read_status ? 'bg-slate-50 border-slate-200' : 'bg-blue-50/50 border-blue-200'
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{n.title}</div>
                      <p className="text-slate-600">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-slate-200 grid grid-cols-5 z-20">
          {bottomTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`py-2.5 flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active ? 'text-[#0F2747] font-semibold' : 'text-slate-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-blue-700' : ''}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Employee Activity Detail Sheet */}
        {detailEmployee && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-end sm:items-center justify-center p-2">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[82vh] flex flex-col">
              <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{detailEmployee.name}</h3>
                  <p className="text-xs text-slate-500">
                    {detailEmployee.department} · {detailLogs.length} aktivitas
                  </p>
                </div>
                <button onClick={() => setDetailEmployee(null)} className="p-1 text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-2.5">
                {detailLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Tidak ada aktivitas pada periode ini.</p>
                ) : (
                  detailLogs.map((l) => (
                    <div key={l.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono text-[#0F2747] font-semibold">
                        <span>{formatDateID(l.work_date)}</span>
                        <span>
                          {l.start_time}-{l.end_time} ({formatDurationShort(l.duration_minutes)})
                        </span>
                      </div>
                      <div className="font-semibold text-slate-900">{l.category_name}</div>
                      <div className="text-blue-700 font-mono">
                        {l.reference_type} · {l.reference_number} — {l.product_name}
                      </div>
                      <p className="text-slate-600">{l.description}</p>
                      {l.attachment_data && l.attachment_name && (
                        <div className="pt-1.5">
                          {l.attachment_type?.startsWith('image/') ? (
                            <a href={l.attachment_data} download={l.attachment_name} className="block">
                              <img
                                src={l.attachment_data}
                                alt={l.attachment_name}
                                className="w-full max-h-40 object-cover rounded-lg border border-slate-200"
                              />
                            </a>
                          ) : (
                            <a
                              href={l.attachment_data}
                              download={l.attachment_name}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>{l.attachment_name}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
