import { db } from './db.js';

export interface ErpReference {
  id: number;
  reference_type: 'UPB' | 'UPV' | 'Produk Eksisting';
  reference_number: string;
  product_code: string;
  product_name: string;
  erp_source_id: string;
}

export const ERP_REQUIRED_ENDPOINTS = [
  {
    name: 'Get UPB List',
    method: 'GET',
    path: '/api/v1/rd/upb?search={query}&status=ACTIVE',
    description: 'Mengambil daftar Nomor Usulan Produk Baru (UPB) beserta nama produk dan kode sementara dari ERP.',
  },
  {
    name: 'Get UPV List',
    method: 'GET',
    path: '/api/v1/rd/upv?search={query}&status=ACTIVE',
    description: 'Mengambil daftar Nomor Usulan Perubahan/Validasi (UPV) beserta produk terkait dari ERP.',
  },
  {
    name: 'Get Existing Products',
    method: 'GET',
    path: '/api/v1/master/products?search={query}&active=true',
    description: 'Mengambil master Produk Eksisting (Kode Produk & Nama Produk) dari ERP perusahaan.',
  },
  {
    name: 'Health & Auth Check',
    method: 'GET',
    path: '/api/v1/health',
    description: 'Validasi konektivitas server-to-server dan validitas OAuth2 Bearer Token.',
  },
];

export function getErpConfig() {
  const row = db.prepare('SELECT * FROM erp_config WHERE id = 1').get() as {
    mode: 'SIMULATION' | 'PRODUCTION';
    base_url: string;
    auth_type: string;
    connected: number;
    last_sync_at: string;
  };
  return {
    mode: row.mode,
    baseUrl: row.base_url,
    authType: row.auth_type,
    connected: Boolean(row.connected),
    lastSyncAt: row.last_sync_at,
    endpoints: ERP_REQUIRED_ENDPOINTS,
  };
}

export function updateErpConfig(mode: 'SIMULATION' | 'PRODUCTION', baseUrl: string, authType: string) {
  // Never falsely claim PRODUCTION is connected without actual verified ERP credentials
  const connected = mode === 'PRODUCTION' ? 0 : 0;
  db.prepare(`
    UPDATE erp_config
    SET mode = ?, base_url = ?, auth_type = ?, connected = ?, last_sync_at = datetime('now')
    WHERE id = 1
  `).run(mode, baseUrl, authType, connected);
  return getErpConfig();
}

export function searchErpReferences(type?: string, query?: string): ErpReference[] {
  let sql = 'SELECT * FROM work_references WHERE 1=1';
  const params: unknown[] = [];

  if (type && ['UPB', 'UPV', 'Produk Eksisting'].includes(type)) {
    sql += ' AND reference_type = ?';
    params.push(type);
  }

  if (query && query.trim().length > 0) {
    const q = `%${query.trim()}%`;
    sql += ' AND (reference_number LIKE ? OR product_code LIKE ? OR product_name LIKE ?)';
    params.push(q, q, q);
  }

  sql += ' ORDER BY reference_number ASC';
  return db.prepare(sql).all(...params) as ErpReference[];
}
