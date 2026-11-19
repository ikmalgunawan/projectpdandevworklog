import React, { useEffect, useMemo, useState } from 'react';
import {
  Home,
  ClipboardList,
  PlusCircle,
  History,
  User as UserIcon,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Search,
  Bell,
  LogOut,
  Send,
  RotateCcw,
  FlaskConical,
  Camera,
  Paperclip,
  X,
} from 'lucide-react';
import { apiFetch, formatDateID, formatDuration, formatDurationShort } from '../lib/api';
import { NotificationItem, ReferenceType, User, WorkCategory, Worklog, WorkReference } from '../types';

interface MobileAppProps {
  user: User;
  onLogout: () => void;
}

type MobileTab = 'home' | 'worklog' | 'add' | 'history' | 'profile';

function getLocalTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWorkdaysInRange(startIso: string, endIso: string): string[] {
  const result: string[] = [];
  const cur = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return result;
  let guard = 0;
  while (cur <= end && guard < 120) {
    const day = cur.getDay(); // 0 = Sun, 6 = Sat
    if (day >= 1 && day <= 5) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      result.push(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return result;
}

const TODAY = getLocalTodayISO();

export default function MobileApp({ user, onLogout }: MobileAppProps) {
  const [tab, setTab] = useState<MobileTab>('home');
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add Activity Form State
  const [formDate, setFormDate] = useState(TODAY);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [sourceType, setSourceType] = useState<ReferenceType>('UPB');
  const [refQuery, setRefQuery] = useState('');
  const [references, setReferences] = useState<WorkReference[]>([]);
  const [selectedRef, setSelectedRef] = useState<WorkReference | null>(null);
  const [refDropdownOpen, setRefDropdownOpen] = useState(false);
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('17:00');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);

  // Modals
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');

  // History Filters & Pagination
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_DAYS_PER_PAGE = 7;

  function showToast(type: 'success' | 'error', text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [logs, cats, notifs] = await Promise.all([
        apiFetch<Worklog[]>('/api/worklogs'),
        apiFetch<WorkCategory[]>('/api/categories'),
        apiFetch<NotificationItem[]>('/api/notifications'),
      ]);
      setWorklogs(logs);
      const activeCats = cats.filter((c) => c.status === 'Active');
      setCategories(activeCats);
      if (activeCats.length > 0 && categoryId === 0) {
        setCategoryId(activeCats[0].id);
      }
      setNotifications(notifs);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const refs = await apiFetch<WorkReference[]>(
          `/api/erp/references?type=${encodeURIComponent(sourceType)}&q=${encodeURIComponent(refQuery)}`
        );
        setReferences(refs);
      } catch {
        setReferences([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [sourceType, refQuery]);

  const activeDate = tab === 'worklog' ? selectedDate : TODAY;

  const dayLogs = useMemo(
    () => worklogs.filter((w) => w.work_date === activeDate).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [worklogs, activeDate]
  );

  const dayTotalDuration = useMemo(() => dayLogs.reduce((s, l) => s + l.duration_minutes, 0), [dayLogs]);
  const dayStatus = dayLogs.length > 0 ? dayLogs[0].submission_status : 'Belum Submit';
  const isLocked = dayStatus === 'Sudah Submit' || dayStatus === 'Menunggu Revisi';

  const { calculatedDuration, isCrossDay } = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return { calculatedDuration: 0, isCrossDay: false };
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin === startMin) return { calculatedDuration: 0, isCrossDay: false };
    if (endMin < startMin) {
      return { calculatedDuration: endMin + 1440 - startMin, isCrossDay: true };
    }
    return { calculatedDuration: endMin - startMin, isCrossDay: false };
  }, [startTime, endTime]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('error', 'Ukuran file maksimal 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: String(reader.result || ''),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleAddActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRef) {
      showToast('error', 'Silakan pilih Referensi Pekerjaan dari daftar ERP.');
      return;
    }
    if (calculatedDuration <= 0) {
      showToast('error', 'Waktu mulai dan waktu selesai tidak boleh sama.');
      return;
    }
    setSubmittingForm(true);
    try {
      await apiFetch('/api/worklogs', {
        method: 'POST',
        body: JSON.stringify({
          work_date: formDate,
          category_id: categoryId,
          reference_id: selectedRef.id,
          start_time: startTime,
          end_time: endTime,
          description,
          attachment_name: attachment?.name ?? null,
          attachment_type: attachment?.type ?? null,
          attachment_data: attachment?.data ?? null,
        }),
      });
      setDescription('');
      setAttachment(null);
      setSelectedRef(null);
      setRefQuery('');
      await loadAll();
      showToast('success', 'Aktivitas pekerjaan berhasil disimpan.');
      setSelectedDate(formDate);
      setTab(formDate === TODAY ? 'home' : 'history');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan aktivitas.');
    } finally {
      setSubmittingForm(false);
    }
  }

  async function handleDeleteLog(id: number) {
    try {
      await apiFetch(`/api/worklogs/${id}`, { method: 'DELETE' });
      await loadAll();
      showToast('success', 'Aktivitas dihapus.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghapus aktivitas.');
    }
  }

  async function handleConfirmSubmit() {
    try {
      await apiFetch('/api/submissions/submit', {
        method: 'POST',
        body: JSON.stringify({ work_date: activeDate }),
      });
      setSubmitModalOpen(false);
      await loadAll();
      showToast('success', 'Pekerjaan harian berhasil disubmit. Notifikasi dikirim ke atasan.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal submit pekerjaan.');
    }
  }

  async function handleRequestRevision(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/submissions/request-revision', {
        method: 'POST',
        body: JSON.stringify({ work_date: activeDate, reason: revisionReason }),
      });
      setRevisionModalOpen(false);
      setRevisionReason('');
      await loadAll();
      showToast('success', 'Permintaan revisi dikirim ke atasan.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mengajukan revisi.');
    }
  }

  const filteredHistoryLogs = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return worklogs.filter((log) => {
      if (historyStartDate && log.work_date < historyStartDate) return false;
      if (historyEndDate && log.work_date > historyEndDate) return false;
      if (q) {
        const hay = `${log.reference_number || ''} ${log.product_name || ''} ${log.category_name || ''} ${log.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [worklogs, historyStartDate, historyEndDate, historyQuery]);

  const groupedHistory = useMemo(() => {
    const map = new Map<string, Worklog[]>();
    for (const log of filteredHistoryLogs) {
      if (!map.has(log.work_date)) map.set(log.work_date, []);
      map.get(log.work_date)!.push(log);
    }

    // Include empty workdays (Mon-Fri) as Belum Submit when not filtering by keyword
    if (!historyQuery.trim()) {
      const rangeEnd = historyEndDate && historyEndDate < TODAY ? historyEndDate : TODAY;
      const defaultStart = (() => {
        const d = new Date(`${rangeEnd}T00:00:00`);
        d.setDate(d.getDate() - 13);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })();
      const rangeStart = historyStartDate || defaultStart;
      for (const wd of getWorkdaysInRange(rangeStart, rangeEnd)) {
        if (!map.has(wd)) {
          map.set(wd, []);
        }
      }
    }

    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredHistoryLogs, historyStartDate, historyEndDate, historyQuery]);

  const totalHistoryPages = Math.max(1, Math.ceil(groupedHistory.length / HISTORY_DAYS_PER_PAGE));
  const paginatedHistory = useMemo(() => {
    const safePage = Math.min(historyPage, totalHistoryPages);
    const startIdx = (safePage - 1) * HISTORY_DAYS_PER_PAGE;
    return groupedHistory.slice(startIdx, startIdx + HISTORY_DAYS_PER_PAGE);
  }, [groupedHistory, historyPage, totalHistoryPages]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyStartDate, historyEndDate, historyQuery]);

  const unreadCount = notifications.filter((n) => !n.read_status).length;

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center">
      {/* Mobile Shell Container (responsive full-width on mobile, centered 480px app frame on desktop) */}
      <div className="w-full max-w-lg bg-slate-50 min-h-screen flex flex-col border-x border-slate-200 relative pb-20">
        {/* Top App Bar */}
        <header className="bg-[#0F2747] text-white px-5 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="w-5 h-5 text-blue-300 shrink-0" />
            <span className="text-sm font-bold tracking-tight whitespace-nowrap">PD &amp; ANDEV WORKLOG</span>
          </div>
          <button
            onClick={() => setTab('profile')}
            className="relative p-1.5 text-slate-200 hover:text-white transition-colors"
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

        {/* Toast Feedback */}
        {toast && (
          <div
            className={`mx-4 mt-3 p-3 rounded-lg text-xs font-medium border flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{toast.text}</span>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 space-y-4">
          {/* HOME & MY WORKLOG */}
          {(tab === 'home' || tab === 'worklog') && (
            <>
              {/* Employee Summary Card */}
              <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{user.name}</h2>
                    <p className="text-xs text-slate-500">
                      {user.department} · {user.employee_id}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
                      {formatDateID(activeDate)}
                    </div>
                    <div
                      className={`text-xs font-semibold mt-0.5 ${
                        dayStatus === 'Sudah Submit'
                          ? 'text-emerald-700'
                          : dayStatus === 'Menunggu Revisi'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                      }`}
                    >
                      {dayStatus}
                    </div>
                  </div>
                </div>

                {tab === 'worklog' && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-600">Pilih Tanggal Worklog</label>
                      {selectedDate !== TODAY && (
                        <button
                          type="button"
                          onClick={() => setSelectedDate(TODAY)}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Reset Filter
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Total Aktivitas</div>
                    <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">{dayLogs.length}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Total Durasi</div>
                    <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                      {formatDuration(dayTotalDuration)}
                    </div>
                  </div>
                </div>

                {!isLocked && (
                  <button
                    onClick={() => {
                      setFormDate(activeDate);
                      setTab('add');
                    }}
                    className="w-full py-2.5 px-4 bg-[#0F2747] hover:bg-[#163661] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Pekerjaan</span>
                  </button>
                )}
              </section>

              {/* Daily Activity List */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Daftar Aktivitas ({formatDateID(activeDate)})
                  </h3>
                  <span className="text-xs text-slate-500 tabular-nums">{dayLogs.length} entri</span>
                </div>

                {loading ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                    Memuat data aktivitas...
                  </div>
                ) : dayLogs.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2">
                    <p className="text-sm font-medium text-slate-700">Belum ada aktivitas dicatat</p>
                    <p className="text-xs text-slate-500">
                      Tekan tombol Tambah Pekerjaan untuk mencatat aktivitas harian Anda.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {dayLogs.map((log) => (
                      <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#0F2747] tabular-nums">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <span>
                              {log.start_time} - {log.end_time}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600">{formatDurationShort(log.duration_minutes)}</span>
                          </div>
                          {!isLocked && (
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                              title="Hapus aktivitas"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{log.category_name}</div>
                        <div className="text-xs text-slate-600">
                          <span className="font-semibold text-blue-700">{log.reference_type}</span>
                          {' · '}
                          <span className="font-mono">{log.reference_number}</span>
                          {' — '}
                          <span>{log.product_name}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed pt-1 border-t border-slate-100">
                          {log.description}
                        </p>
                        {log.attachment_data && log.attachment_name && (
                          <div className="pt-1.5">
                            {log.attachment_type?.startsWith('image/') ? (
                              <a
                                href={log.attachment_data}
                                download={log.attachment_name}
                                className="block"
                              >
                                <img
                                  src={log.attachment_data}
                                  alt={log.attachment_name}
                                  className="w-full max-h-44 object-cover rounded-lg border border-slate-200"
                                />
                              </a>
                            ) : (
                              <a
                                href={log.attachment_data}
                                download={log.attachment_name}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>{log.attachment_name}</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Submit / Revision Action */}
                {dayLogs.length > 0 && !isLocked && (
                  <button
                    onClick={() => setSubmitModalOpen(true)}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>Submit Pekerjaan Hari Ini</span>
                  </button>
                )}

                {dayStatus === 'Sudah Submit' && (
                  <button
                    onClick={() => setRevisionModalOpen(true)}
                    className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Ajukan Request Revisi</span>
                  </button>
                )}
              </section>
            </>
          )}

          {/* ADD ACTIVITY FORM */}
          {tab === 'add' && (
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-base font-bold text-slate-900 mb-1">Form Tambah Pekerjaan</h2>
              <p className="text-xs text-slate-500 mb-4">
                Data referensi UPB, UPV, dan Produk Eksisting terhubung melalui ERP API Layer.
              </p>

              <form onSubmit={handleAddActivity} className="space-y-4">
                {/* Field 1: Jenis Pekerjaan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">1. Jenis Pekerjaan</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field 2: Sumber Data */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">2. Sumber Data Pekerjaan</label>
                  <select
                    value={sourceType}
                    onChange={(e) => {
                      setSourceType(e.target.value as ReferenceType);
                      setSelectedRef(null);
                      setRefQuery('');
                    }}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="UPB">Nomor UPB</option>
                    <option value="UPV">Nomor UPV</option>
                    <option value="Produk Eksisting">Produk Eksisting</option>
                  </select>
                </div>

                {/* Field 3: Referensi ERP Searchable */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      3. Referensi {sourceType} (ERP)
                    </label>
                    {(selectedRef || refQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRef(null);
                          setRefQuery('');
                        }}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={selectedRef ? `${selectedRef.reference_number} — ${selectedRef.product_name}` : refQuery}
                      onFocus={() => setRefDropdownOpen(true)}
                      onChange={(e) => {
                        setSelectedRef(null);
                        setRefQuery(e.target.value);
                        setRefDropdownOpen(true);
                      }}
                      placeholder={`Cari nomor ${sourceType} atau nama produk...`}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  {refDropdownOpen && (
                    <div className="mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-md divide-y divide-slate-100 z-30 relative">
                      {references.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500">Tidak ada referensi ditemukan.</div>
                      ) : (
                        references.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setSelectedRef(r);
                              setRefDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors"
                          >
                            <div className="text-xs font-mono font-semibold text-[#0F2747]">
                              {r.reference_number} · {r.product_code}
                            </div>
                            <div className="text-xs text-slate-700">{r.product_name}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Field 4: Tanggal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    4. Tanggal Pekerjaan ({formatDateID(formDate)})
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                {/* Field 5 & 6: Waktu Mulai & Selesai */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">5. Waktu Mulai</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">6. Waktu Selesai</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex justify-between items-center">
                  <span>Durasi Otomatis{isCrossDay ? ' (Lintas Hari / +1 Hari)' : ''}:</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {calculatedDuration > 0 ? formatDuration(calculatedDuration) : 'Waktu tidak valid'}
                  </span>
                </div>

                {/* Field 7: Keterangan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">7. Keterangan Pekerjaan</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    placeholder="Jelaskan detail aktivitas, hasil pengujian, atau evaluasi yang dilakukan..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                {/* Field 8: Lampiran Foto Kamera / File */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    8. Lampiran Foto / File (Opsional)
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="py-2.5 px-3 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer">
                      <Camera className="w-4 h-4 text-[#0F2747]" />
                      <span>Ambil Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    <label className="py-2.5 px-3 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer">
                      <Paperclip className="w-4 h-4 text-[#0F2747]" />
                      <span>Upload File</span>
                      <input
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {attachment && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-800 truncate">{attachment.name}</span>
                        <button
                          type="button"
                          onClick={() => setAttachment(null)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          aria-label="Hapus lampiran"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {attachment.type.startsWith('image/') && (
                        <img
                          src={attachment.data}
                          alt={attachment.name}
                          className="w-full max-h-44 object-cover rounded-lg border border-slate-200"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setTab('home')}
                    className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingForm}
                    className="flex-1 py-2.5 px-4 bg-[#0F2747] hover:bg-[#163661] text-white text-sm font-semibold rounded-lg disabled:opacity-60"
                  >
                    {submittingForm ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* HISTORY */}
          {tab === 'history' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Riwayat Pekerjaan Pribadi</h2>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryStartDate('');
                    setHistoryEndDate('');
                    setHistoryQuery('');
                  }}
                  disabled={!historyStartDate && !historyEndDate && !historyQuery}
                  className="text-xs font-semibold text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline"
                >
                  Reset Filter
                </button>
              </div>

              {/* Filter & Search Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    placeholder="Cari nomor UPB/UPV, produk, atau keterangan..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Periode Mulai</label>
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(e) => setHistoryStartDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Periode Akhir</label>
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => setHistoryEndDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 pt-1.5 border-t border-slate-100 font-mono tabular-nums">
                  <span>{groupedHistory.length} Hari · {filteredHistoryLogs.length} Aktivitas</span>
                  <span className="font-semibold text-slate-900">
                    {formatDuration(filteredHistoryLogs.reduce((s, l) => s + l.duration_minutes, 0))}
                  </span>
                </div>
              </div>

              {groupedHistory.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  Tidak ada riwayat pekerjaan pada rentang tanggal tersebut.
                </div>
              ) : (
                <>
                  {paginatedHistory.map(([date, logs]) => {
                  const dur = logs.reduce((s, l) => s + l.duration_minutes, 0);
                  const status = logs[0]?.submission_status ?? 'Belum Submit';
                  return (
                    <div key={date} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(date);
                            setTab('worklog');
                          }}
                          className="text-left"
                        >
                          <div className="text-sm font-mono font-bold text-[#0F2747] tabular-nums hover:underline">
                            {formatDateID(date)}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {logs.length} aktivitas · {formatDuration(dur)}
                          </div>
                        </button>
                        <span
                          className={`text-xs font-semibold ${
                            status === 'Sudah Submit'
                              ? 'text-emerald-700'
                              : status === 'Menunggu Revisi'
                                ? 'text-amber-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {logs.length === 0 ? (
                          <div className="p-2.5 bg-red-50/70 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
                            <div className="font-semibold">Belum ada aktivitas dicatat pada hari kerja ini.</div>
                            <p className="text-[11px] text-red-700">
                              Status masih Belum Submit. Harap lengkapi dan submit pekerjaan melalui aplikasi ERP.
                            </p>
                          </div>
                        ) : (
                          logs.map((l) => (
                            <div key={l.id} className="text-xs space-y-1 pb-2.5 border-b border-slate-100 last:border-b-0 last:pb-0">
                              <div className="flex items-center justify-between font-mono text-slate-600 tabular-nums">
                                <span className="font-semibold text-[#0F2747]">
                                  {l.start_time} - {l.end_time}
                                </span>
                                <span>{formatDurationShort(l.duration_minutes)}</span>
                              </div>
                              <div className="font-semibold text-slate-900">{l.category_name}</div>
                              <div className="text-slate-600">
                                <span className="font-semibold text-blue-700">{l.reference_type}</span>
                                {' · '}
                                <span className="font-mono">{l.reference_number}</span>
                                {' — '}
                                <span>{l.product_name}</span>
                              </div>
                              <p className="text-slate-600 leading-relaxed">{l.description}</p>
                              {l.attachment_data && l.attachment_name && (
                                <div className="pt-1">
                                  {l.attachment_type?.startsWith('image/') ? (
                                    <a href={l.attachment_data} download={l.attachment_name} className="block">
                                      <img
                                        src={l.attachment_data}
                                        alt={l.attachment_name}
                                        className="w-full max-h-36 object-cover rounded-lg border border-slate-200"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={l.attachment_data}
                                      download={l.attachment_name}
                                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
                                    >
                                      <Paperclip className="w-3.5 h-3.5" />
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
                  );
                  })}

                  {totalHistoryPages > 1 && (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage <= 1}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Sebelumnya
                      </button>
                      <span className="font-mono text-slate-600 tabular-nums">
                        Hal {Math.min(historyPage, totalHistoryPages)} / {totalHistoryPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                        disabled={historyPage >= totalHistoryPages}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Berikutnya
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* PROFILE & NOTIFICATIONS */}
          {tab === 'profile' && (
            <section className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h2 className="text-base font-bold text-slate-900">Profil Karyawan</h2>
                <div className="grid grid-cols-2 gap-y-2.5 text-xs">
                  <span className="text-slate-500">Nama Lengkap</span>
                  <span className="font-semibold text-slate-900 text-right">{user.name}</span>
                  <span className="text-slate-500">Employee ID</span>
                  <span className="font-mono font-semibold text-slate-900 text-right">{user.employee_id}</span>
                  <span className="text-slate-500">Departemen</span>
                  <span className="font-semibold text-slate-900 text-right">{user.department}</span>
                  <span className="text-slate-500">Email</span>
                  <span className="font-medium text-slate-900 text-right">{user.email}</span>
                  <span className="text-slate-500">Atasan Langsung</span>
                  <span className="font-semibold text-slate-900 text-right">{user.supervisor_name || '-'}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full mt-2 py-2.5 px-4 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded-lg flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Keluar dari Aplikasi</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900">Notifikasi</h3>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada notifikasi.</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="text-xs font-semibold text-slate-900">{n.title}</div>
                      <p className="text-xs text-slate-600">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </main>

        {/* Bottom Navigation (4 items) */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-slate-200 grid grid-cols-4 z-20">
          {(
            [
              { id: 'home', label: 'Home', icon: Home },
              { id: 'add', label: 'Add', icon: PlusCircle },
              { id: 'history', label: 'History', icon: History },
              { id: 'profile', label: 'Profile', icon: UserIcon },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`py-2.5 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? 'text-[#0F2747] font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-blue-700' : ''}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Submit Confirmation Modal */}
        {submitModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Konfirmasi Submit Pekerjaan</h3>
              <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>Tanggal: <strong className="font-mono">{formatDateID(activeDate)}</strong></div>
                <div>Total Aktivitas: <strong className="tabular-nums">{dayLogs.length}</strong></div>
                <div>Total Durasi: <strong className="tabular-nums">{formatDuration(dayTotalDuration)}</strong></div>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {dayLogs.map((l) => (
                  <div key={l.id} className="p-2.5 text-xs">
                    <span className="font-mono font-semibold">{l.start_time}-{l.end_time}</span> · {l.reference_number} · {l.category_name}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Setelah disubmit, data akan dikunci dan notifikasi dikirim ke atasan Anda.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSubmitModalOpen(false)}
                  className="flex-1 py-2 px-4 border border-slate-300 text-xs font-semibold rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmSubmit}
                  className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"
                >
                  Ya, Submit Sekarang
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Request Revision Modal */}
        {revisionModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <form onSubmit={handleRequestRevision} className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Ajukan Request Revisi</h3>
              <p className="text-xs text-slate-600">
                Permintaan revisi untuk tanggal <strong className="font-mono">{formatDateID(activeDate)}</strong> memerlukan persetujuan atasan.
              </p>
              <textarea
                rows={3}
                required
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="Tuliskan alasan revisi yang jelas..."
                className="w-full p-3 text-xs border border-slate-300 rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRevisionModalOpen(false)}
                  className="flex-1 py-2 px-4 border border-slate-300 text-xs font-semibold rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-[#0F2747] text-white text-xs font-semibold rounded-lg"
                >
                  Kirim Permintaan
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
