import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Worklog } from '../types';

const TOKEN_KEY = 'pd_andev_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request gagal (${res.status})`);
  }
  return data as T;
}

export function formatDateID(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} Jam ${m} Menit`;
  if (h > 0) return `${h} Jam`;
  return `${m} Menit`;
}

export function formatDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}j ${m.toString().padStart(2, '0')}m`;
}

export function exportWorklogsToExcel(rows: Worklog[], reportTitle: string) {
  const totalMinutes = rows.reduce((s, r) => s + r.duration_minutes, 0);
  const sheetData: Array<Record<string, string | number>> = rows.map((r, i) => ({
    No: i + 1,
    Tanggal: formatDateID(r.work_date),
    'ID Karyawan': r.employee_id || '-',
    'Nama Karyawan': r.user_name || '-',
    Departemen: r.department || '-',
    'Jam Mulai': r.start_time,
    'Jam Selesai': r.end_time,
    'Durasi (Menit)': r.duration_minutes,
    'Jenis Pekerjaan': r.category_name || '-',
    'Sumber Data': r.reference_type || '-',
    Referensi: r.reference_number || '-',
    'Nama Produk': r.product_name || '-',
    Keterangan: r.description,
    Status: r.submission_status,
  }));

  sheetData.push({
    No: rows.length + 1,
    Tanggal: 'TOTAL',
    'ID Karyawan': '',
    'Nama Karyawan': `${rows.length} Aktivitas`,
    Departemen: '',
    'Jam Mulai': '',
    'Jam Selesai': '',
    'Durasi (Menit)': totalMinutes,
    'Jenis Pekerjaan': formatDuration(totalMinutes),
    'Sumber Data': '',
    Referensi: '',
    'Nama Produk': '',
    Keterangan: '',
    Status: '',
  });

  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worklog Report');
  const safeName = reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  XLSX.writeFile(wb, `${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportWorklogsToPDF(rows: Worklog[], reportTitle: string, periodLabel: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const totalMinutes = rows.reduce((s, r) => s + r.duration_minutes, 0);

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`PD & ANDEV WORKLOG — ${reportTitle}`, 40, 42);

  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Periode: ${periodLabel}  |  Total Aktivitas: ${rows.length}  |  Total Durasi: ${formatDuration(totalMinutes)}`, 40, 60);

  autoTable(doc, {
    startY: 74,
    head: [['Tanggal', 'Karyawan', 'Dept', 'Waktu', 'Durasi', 'Jenis Pekerjaan', 'Sumber', 'Referensi & Produk', 'Keterangan']],
    body: rows.map((r) => [
      formatDateID(r.work_date),
      r.user_name || '-',
      r.department === 'Product Development' ? 'PD' : r.department === 'Analytical Development' ? 'Andev' : r.department || '-',
      `${r.start_time}-${r.end_time}`,
      formatDurationShort(r.duration_minutes),
      r.category_name || '-',
      r.reference_type || '-',
      `${r.reference_number || ''} ${r.product_name || ''}`.trim(),
      r.description,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 39, 71], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const safeName = reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  doc.save(`${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
