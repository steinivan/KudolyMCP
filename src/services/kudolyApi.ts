import type {
  ListAvailableProjectsResponse,
  ListRecentTasksRequest,
  ListRecentTasksResponse,
  CancelTaskTimerRequest,
  CancelTaskTimerResponse,
  CheckTaskRequest,
  CheckTaskResponse,
  SaveReportRequest,
  SaveReportResponse,
  SaveDevlogRequest,
  SaveDevlogResponse,
  StartTaskTimerRequest,
  StartTaskTimerResponse,
  StopTaskTimerRequest,
  StopTaskTimerResponse,
  SaveTimeEntryRequest,
  SaveTimeEntryResponse
} from '../types/index.js';

export class KudolyApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public availableProjects?: string[]
  ) {
    super(message);
    this.name = 'KudolyApiError';
  }
}

export class KudolyApi {
  constructor(
    private baseUrl: string,
    private token: string
  ) {
    if (!baseUrl) {
      throw new Error('KUDOLY_BASE_URL is required');
    }
    if (!token) {
      throw new Error('KUDOLY_API_TOKEN is required');
    }
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST';
      body?: object;
      query?: Record<string, string | number | null | undefined>;
    } = {}
  ): Promise<T> {
    const queryString = options.query
      ? new URLSearchParams(
          Object.entries(options.query)
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
            .map(([key, value]) => [key, String(value)] as [string, string])
        ).toString()
      : '';

    const url = `${this.baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;
    const method = options.method || 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        'Authorization': `Bearer ${this.token}`
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {})
    });

    // Always try to parse JSON response
    let data: any;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    // Handle HTTP errors with parsed body
    if (response.status === 401) {
      throw new KudolyApiError(
        data?.error || 'Invalid or expired token',
        401,
        'UNAUTHORIZED'
      );
    }

    if (!response.ok) {
      throw new KudolyApiError(
        data?.error || `HTTP error: ${response.status}`,
        response.status,
        data?.code,
        data?.available_projects
      );
    }

    // Check for success: false in 200 responses
    if (data && data.success === false) {
      throw new KudolyApiError(
        data.error || 'Request failed',
        200,
        data.code,
        data.available_projects
      );
    }

    if (data && data.success === true && 'data' in data) {
      return data.data as T;
    }

    return data as T;
  }

  async checkTask(request: CheckTaskRequest): Promise<CheckTaskResponse> {
    return this.request<CheckTaskResponse>('/daily-check-task', { body: request });
  }

  async saveReport(request: SaveReportRequest): Promise<SaveReportResponse> {
    return this.request<SaveReportResponse>('/daily-save-report', { body: request });
  }

  async saveDevlog(request: SaveDevlogRequest): Promise<SaveDevlogResponse> {
    return this.request<SaveDevlogResponse>('/daily-save-devlog', { body: request });
  }

  async saveTimeEntry(request: SaveTimeEntryRequest): Promise<SaveTimeEntryResponse> {
    return this.request<SaveTimeEntryResponse>('/api/v1/time-entries', { body: request });
  }

  async startTaskTimer(request: StartTaskTimerRequest): Promise<StartTaskTimerResponse> {
    return this.request<StartTaskTimerResponse>('/api/v1/time-entries/start', { body: request });
  }

  async stopTaskTimer(request: StopTaskTimerRequest): Promise<StopTaskTimerResponse> {
    return this.request<StopTaskTimerResponse>('/api/v1/time-entries/stop', { body: request });
  }

  async cancelTaskTimer(request: CancelTaskTimerRequest): Promise<CancelTaskTimerResponse> {
    return this.request<CancelTaskTimerResponse>('/api/v1/time-entries/cancel', { body: request });
  }

  async listAvailableProjects(): Promise<ListAvailableProjectsResponse> {
    return this.request<ListAvailableProjectsResponse>('/api/v1/time-entries/projects', {
      method: 'GET'
    });
  }

  async listRecentTasks(request: ListRecentTasksRequest): Promise<ListRecentTasksResponse> {
    return this.request<ListRecentTasksResponse>('/api/v1/time-entries/tasks/recent', {
      method: 'GET',
      query: {
        user_email: request.user_email,
        project: request.project,
        project_id: request.project_id,
        limit: request.limit
      }
    });
  }
}
