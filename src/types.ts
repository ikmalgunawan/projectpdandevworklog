export type Role = 'staff' | 'supervisor' | 'manager' | 'admin';
export type Department = 'Product Development' | 'Analytical Development' | 'Management' | 'IT / Admin';
export type ReferenceType = 'UPB' | 'UPV' | 'Produk Eksisting';
export type SubmissionStatus = 'Belum Submit' | 'Sudah Submit' | 'Menunggu Revisi' | 'Perlu Revisi';

export interface User {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  department: Department;
  role: Role;
  supervisor_id: number | null;
  supervisor_name?: string | null;
  status: 'Active' | 'Inactive';
}

export interface WorkCategory {
  id: number;
  category_name: string;
  department: string;
  status: 'Active' | 'Inactive';
}

export interface WorkReference {
  id: number;
  reference_type: ReferenceType;
  reference_number: string;
  product_code: string;
  product_name: string;
  erp_source_id: string;
}

export interface Worklog {
  id: number;
  user_id: number;
  user_name?: string;
  employee_id?: string;
  department?: string;
  work_date: string; // YYYY-MM-DD
  category_id: number;
  category_name?: string;
  reference_id: number | null;
  reference_type?: ReferenceType;
  reference_number?: string;
  product_code?: string;
  product_name?: string;
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  duration_minutes: number;
  description: string;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_data?: string | null;
  submission_status: SubmissionStatus;
  created_at: string;
  updated_at: string;
}

export interface DailySubmission {
  id: number;
  user_id: number;
  user_name?: string;
  department?: string;
  submission_date: string;
  total_activities: number;
  total_duration_minutes: number;
  submission_status: SubmissionStatus;
  revision_reason?: string | null;
  submitted_at: string;
}

export interface NotificationItem {
  id: number;
  recipient_id: number;
  notification_type: 'SUBMITTED' | 'REMINDER' | 'REVISION_REQUEST' | 'REVISION_APPROVED' | 'REVISION_REJECTED';
  title: string;
  message: string;
  read_status: number;
  created_at: string;
}

export interface AuditTrailItem {
  id: number;
  worklog_id: number;
  changed_by: number;
  changed_by_name?: string;
  previous_value: string;
  new_value: string;
  change_reason: string;
  changed_at: string;
}

export interface DashboardSummary {
  kpi: {
    totalPd: number;
    totalAndev: number;
    totalActivitiesToday: number;
    totalSubmittedToday: number;
    totalNotSubmittedToday: number;
    totalDurationMinutes: number;
  };
  sourceDistribution: Array<{ name: string; count: number; percentage: number; durationMinutes: number }>;
  monthlyTrend: Array<{ month: string; UPB: number; UPV: number; 'Produk Eksisting': number; total: number }>;
  departmentComparison: Array<{
    department: string;
    activities: number;
    durationMinutes: number;
    avgDurationMinutes: number;
  }>;
  topProducts: Array<{
    rank: number;
    reference_id: number;
    reference_number: string;
    product_code: string;
    product_name: string;
    reference_type: ReferenceType;
    activity_count: number;
    total_duration_minutes: number;
    percentage: number;
  }>;
  employeeMonitoring: Array<{
    user_id: number;
    employee_id: string;
    name: string;
    department: string;
    total_activities: number;
    total_duration_minutes: number;
    submission_status: SubmissionStatus;
    revision_reason?: string | null;
  }>;
}

export interface ErpConfig {
  mode: 'SIMULATION' | 'PRODUCTION';
  baseUrl: string;
  authType: string;
  connected: boolean;
  lastSyncAt: string;
  endpoints: Array<{
    name: string;
    method: string;
    path: string;
    description: string;
  }>;
}
