import type {
  CheckTaskRequest,
  CheckTaskResponse,
  SaveReportRequest,
  SaveReportResponse,
  SaveDevlogRequest,
  SaveDevlogResponse
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

  private async request<T>(endpoint: string, body: object): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(body)
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

    return data as T;
  }

  async checkTask(request: CheckTaskRequest): Promise<CheckTaskResponse> {
    return this.request<CheckTaskResponse>('/daily-check-task', request);
  }

  async saveReport(request: SaveReportRequest): Promise<SaveReportResponse> {
    return this.request<SaveReportResponse>('/daily-save-report', request);
  }

  async saveDevlog(request: SaveDevlogRequest): Promise<SaveDevlogResponse> {
    return this.request<SaveDevlogResponse>('/daily-save-devlog', request);
  }
}
