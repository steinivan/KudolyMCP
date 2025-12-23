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
