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
      expect(() => new KudolyApi('', async () => token)).toThrow('Base URL is required');
    });

    it('throws error when auth source is missing', () => {
      expect(() => new KudolyApi(baseUrl, undefined as any)).toThrow('OAuth token provider is required');
    });

    it('creates instance with valid params', () => {
      const api = new KudolyApi(baseUrl, async () => token);
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

      const api = new KudolyApi(baseUrl, async () => token);
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

      const api = new KudolyApi(baseUrl, async () => token);
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

      const api = new KudolyApi(baseUrl, async () => token);

      await expect(
        api.checkTask({ project_name: 'test', task_name: 'test' })
      ).rejects.toThrow(KudolyApiError);
    });

    it('throws error on 500 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' })
      });

      const api = new KudolyApi(baseUrl, async () => token);

      await expect(
        api.checkTask({ project_name: 'test', task_name: 'test' })
      ).rejects.toThrow('Server error');
    });

    it('uses async token source when provided', async () => {
      const getToken = vi.fn().mockResolvedValue(token);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ task_found: false })
      });

      const api = new KudolyApi(baseUrl, getToken);
      await api.checkTask({ project_name: 'test', task_name: 'test' });

      expect(getToken).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/daily-check-task`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${token}`
          })
        })
      );
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

      const api = new KudolyApi(baseUrl, async () => token);
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

      const api = new KudolyApi(baseUrl, async () => token);
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

  describe('time tracker endpoints', () => {
    it('unwraps apiSuccess responses for saveTimeEntry', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          success: true,
          data: {
            task_id: 'task-123',
            imported: true,
            message: 'Tiempo registrado correctamente'
          }
        })
      });

      const api = new KudolyApi(baseUrl, async () => token);
      const result = await api.saveTimeEntry({
        user_email: 'dev@test.com',
        task: 'Tracker',
        duration_minutes: 15
      });

      expect(result).toEqual({
        task_id: 'task-123',
        imported: true,
        message: 'Tiempo registrado correctamente'
      });
    });

    it('starts a task timer', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          success: true,
          data: {
            task_id: 'task-123',
            started: true,
            project_id: 'project-1',
            project_name: 'Kudoly',
            message: 'Timer iniciado correctamente'
          }
        })
      });

      const api = new KudolyApi(baseUrl, async () => token);
      const result = await api.startTaskTimer({
        user_email: 'dev@test.com',
        task: 'Implementar tracker',
        project: 'Kudoly'
      });

      expect(result.started).toBe(true);
      expect(result.task_id).toBe('task-123');
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/time-entries/start`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('stops a task timer', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            task_id: 'task-123',
            stopped: true,
            elapsed_seconds: 1800,
            message: 'Timer detenido correctamente'
          }
        })
      });

      const api = new KudolyApi(baseUrl, async () => token);
      const result = await api.stopTaskTimer({
        user_email: 'dev@test.com',
        task_id: 'task-123',
        status: 'done'
      });

      expect(result.elapsed_seconds).toBe(1800);
      expect(result.stopped).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/time-entries/stop`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('cancels a task timer', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            task_id: 'task-123',
            cancelled: true,
            message: 'Timer cancelado sin registrar tiempo'
          }
        })
      });

      const api = new KudolyApi(baseUrl, async () => token);
      const result = await api.cancelTaskTimer({
        user_email: 'dev@test.com',
        task_id: 'task-123'
      });

      expect(result.cancelled).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/time-entries/cancel`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('lists available projects', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            projects: [
              { id: 'project-1', name: 'Kudoly' },
              { id: 'project-2', name: 'Tasauto' }
            ],
            total: 2
          }
        })
      });

      const api = new KudolyApi(baseUrl, async () => token);
      const result = await api.listAvailableProjects();

      expect(result.total).toBe(2);
      expect(result.projects[0].name).toBe('Kudoly');
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/time-entries/projects`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('lists recent tasks with project filter', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            tasks: [
              {
                id: 'task-123',
                title: 'Optimizar Time',
                project_id: 'project-1',
                project_name: 'Kudoly',
                status: 'in_progress',
                is_running: false,
                total_seconds: 5400,
                updated_at: '2026-03-14T12:00:00.000Z'
              }
            ],
            total: 1,
            project_id: 'project-1',
            project_name: 'Kudoly'
          }
        })
      });

      const api = new KudolyApi(baseUrl, async () => token);
      const result = await api.listRecentTasks({
        project: 'Kudoly',
        limit: 5
      });

      expect(result.total).toBe(1);
      expect(result.tasks[0].title).toBe('Optimizar Time');
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/time-entries/tasks/recent?project=Kudoly&limit=5`,
        expect.objectContaining({ method: 'GET' })
      );
    });
  });
});
