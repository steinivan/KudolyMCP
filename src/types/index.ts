// Types for Kudoly MCP

export type ReportStatus = 'complete' | 'progress' | 'blocked' | 'upcoming' | 'qa';

export interface ClickUpStatus {
  status: string;
  color: string;
}

// Check Task Endpoint
export interface CheckTaskRequest {
  project_name: string;
  task_name: string;
}

export interface CheckTaskResponse {
  task_found: boolean;
  task_id?: string;
  clickup_task_id?: string;
  project_id?: string;
  clickup_list_id?: string;
  available_statuses?: ClickUpStatus[];
  code?: 'PROJECT_NOT_FOUND' | 'CLICKUP_NOT_CONFIGURED';
  available_projects?: string[];
}

// Save Report Endpoint
export interface SaveReportRequest {
  project_id: string;
  project_name: string;
  clickup_list_id?: string;
  clickup_task_id?: string;
  task_name: string;
  activities_string: string;
  status: ReportStatus;
  create_task: boolean;
  clickup_status?: string;
}

export interface SaveReportResponse {
  success: boolean;
  daily_id: string;
  task_created?: boolean;
}

// Tool Parameters
export interface SubmitDailyReportParams {
  project_name?: string;
  task_name?: string;
  activities_string: string;
  status?: ReportStatus;
  create_task?: boolean;
  clickup_status?: string;
}

// Devlog Types
export interface SaveDevlogRequest {
  project_name: string;
  task_name: string;
  devlog_content: string;
  filename: string;
}

export interface SaveDevlogResponse {
  success: boolean;
  message: string;
  task_id?: string;
  task_name?: string;
  file_url?: string;
  filename?: string;
}

// Time entry types
export type TimeEntryStatus = 'todo' | 'in_progress' | 'done';
export type TimeEntrySource = 'manual' | 'ai' | 'clockify';

export interface SaveTimeEntryRequest {
  user_email?: string;
  task?: string | null;
  task_id?: string;
  project?: string | null;
  project_id?: string;
  description?: string | null;
  duration_minutes?: number;
  duration_seconds?: number;
  started_at?: string;
  ended_at?: string;
  notes?: string | null;
  technical_summary?: string | null;
  non_technical_summary?: string | null;
  status?: TimeEntryStatus;
  source?: TimeEntrySource;
}

export interface SaveTimeEntryResponse {
  task_id?: string | null;
  imported: boolean;
  message: string;
}

export interface StartTaskTimerRequest {
  user_email?: string;
  task?: string | null;
  task_id?: string;
  project?: string | null;
  project_id?: string;
  description?: string | null;
  technical_summary?: string | null;
  non_technical_summary?: string | null;
  source?: TimeEntrySource;
}

export interface StartTaskTimerResponse {
  task_id: string;
  started: boolean;
  project_id?: string | null;
  project_name?: string | null;
  message: string;
}

export interface StopTaskTimerRequest {
  user_email?: string;
  task?: string | null;
  task_id?: string;
  project?: string | null;
  project_id?: string;
  description?: string | null;
  notes?: string | null;
  technical_summary?: string | null;
  non_technical_summary?: string | null;
  status?: TimeEntryStatus;
  source?: TimeEntrySource;
}

export interface StopTaskTimerResponse {
  task_id: string;
  stopped: boolean;
  elapsed_seconds: number;
  message: string;
}

export interface CancelTaskTimerRequest {
  user_email?: string;
  task?: string | null;
  task_id?: string;
  project?: string | null;
  project_id?: string;
}

export interface CancelTaskTimerResponse {
  task_id: string;
  cancelled: boolean;
  message: string;
}

export interface AvailableProject {
  id: string;
  name: string;
}

export interface ListAvailableProjectsResponse {
  projects: AvailableProject[];
  total: number;
}

export interface RecentTask {
  id: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  status: TimeEntryStatus;
  is_running: boolean;
  total_seconds: number;
  updated_at: string;
  last_activity_at?: string | null;
  last_session_description?: string | null;
}

export interface ListRecentTasksRequest {
  user_email?: string;
  project?: string | null;
  project_id?: string;
  limit?: number;
}

export interface ListRecentTasksResponse {
  tasks: RecentTask[];
  total: number;
  project_id?: string | null;
  project_name?: string | null;
}
