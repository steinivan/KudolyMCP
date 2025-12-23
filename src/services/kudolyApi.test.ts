import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KudolyApi, KudolyApiError } from './kudolyApi.js';

describe('KudolyApi', () => {
  const baseUrl = 'https://test.com/webhook';
  const token = 'test-token';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('throws error when baseUrl is missing', () => {
      expect(() => new KudolyApi('', token)).toThrow('KUDOLY_BASE_URL is required');
    });

    it('throws error when token is missing', () => {
      expect(() => new KudolyApi(baseUrl, '')).toThrow('KUDOLY_API_TOKEN is required');
    });

    it('creates instance with valid params', () => {
      const api = new KudolyApi(baseUrl, token);
      expect(api).toBeInstanceOf(KudolyApi);
    });
  });

  describe('checkTask', () => {
    it('returns task found response', async () => {
      const mockResponse = {
        task_found: true,
        task_id: 'task-123',
        project_id: 'project-456',
        clickup_list_id: 'list-789'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const api = new KudolyApi(baseUrl, token);
      const result = await api.checkTask({
        project_name: 'my-project',
        task_name: 'my-task'
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/daily-check-task`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            project_name: 'my-project',
            task_name: 'my-task'
          })
        })
      );
    });

    it('returns task not found with available statuses', async () => {
      const mockResponse = {
        task_found: false,
        project_id: 'project-456',
        clickup_list_id: 'list-789',
        available_statuses: [
          { status: 'backlog', color: '#gray' },
          { status: 'in progress', color: '#blue' }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const api = new KudolyApi(baseUrl, token);
      const result = await api.checkTask({
        project_name: 'my-project',
        task_name: 'new-task'
      });

      expect(result.task_found).toBe(false);
      expect(result.available_statuses).toHaveLength(2);
    });

    it('throws error on 401 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      const api = new KudolyApi(baseUrl, token);

      await expect(
        api.checkTask({ project_name: 'test', task_name: 'test' })
      ).rejects.toThrow(KudolyApiError);
    });

    it('throws error on 500 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const api = new KudolyApi(baseUrl, token);

      await expect(
        api.checkTask({ project_name: 'test', task_name: 'test' })
      ).rejects.toThrow('HTTP error: 500 Internal Server Error');
    });
  });

  describe('saveReport', () => {
    it('saves report successfully', async () => {
      const mockResponse = {
        success: true,
        daily_id: 'daily-123',
        task_created: false
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const api = new KudolyApi(baseUrl, token);
      const result = await api.saveReport({
        project_id: 'project-456',
        project_name: 'my-project',
        clickup_list_id: 'list-789',
        clickup_task_id: 'task-123',
        task_name: 'my-task',
        activities_string: 'Did some work',
        status: 'progress',
        create_task: false
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/daily-save-report`,
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('saves report with task creation', async () => {
      const mockResponse = {
        success: true,
        daily_id: 'daily-124',
        task_created: true
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const api = new KudolyApi(baseUrl, token);
      const result = await api.saveReport({
        project_id: 'project-456',
        project_name: 'my-project',
        clickup_list_id: 'list-789',
        task_name: 'new-task',
        activities_string: 'Created new feature',
        status: 'progress',
        create_task: true,
        clickup_status: 'backlog'
      });

      expect(result.task_created).toBe(true);
    });
  });
});
