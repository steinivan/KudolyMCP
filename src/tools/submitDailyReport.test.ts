import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitDailyReport, submitDailyReportSchema } from './submitDailyReport.js';
import { KudolyApi } from '../services/kudolyApi.js';
import * as packageJsonUtils from '../utils/packageJson.js';

vi.mock('../utils/packageJson.js');

describe('submitDailyReport', () => {
  let mockApi: KudolyApi;

  beforeEach(() => {
    vi.resetAllMocks();
    mockApi = {
      checkTask: vi.fn(),
      saveReport: vi.fn()
    } as unknown as KudolyApi;
  });

  describe('schema validation', () => {
    it('validates required activities_string', () => {
      const result = submitDailyReportSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts valid input with defaults', () => {
      const result = submitDailyReportSchema.safeParse({
        activities_string: 'Did some work'
      });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('progress');
      expect(result.data?.create_task).toBe(false);
    });

    it('validates status enum', () => {
      const result = submitDailyReportSchema.safeParse({
        activities_string: 'work',
        status: 'invalid'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('project name resolution', () => {
    it('returns error when no project name available', async () => {
      vi.mocked(packageJsonUtils.getProjectNameFromPackageJson).mockReturnValue(null);

      const result = await submitDailyReport(
        { activities_string: 'work', task_name: 'task' },
        mockApi
      );

      expect(result.type).toBe('error');
      expect((result as any).code).toBe('PROJECT_NAME_REQUIRED');
    });

    it('uses project_name from input when provided', async () => {
      vi.mocked(mockApi.checkTask).mockResolvedValue({
        task_found: true,
        task_id: 'task-123',
        project_id: 'proj-123'
      });
      vi.mocked(mockApi.saveReport).mockResolvedValue({
        success: true,
        daily_id: 'daily-123'
      });

      const result = await submitDailyReport(
        {
          project_name: 'my-project',
          task_name: 'my-task',
          activities_string: 'work'
        },
        mockApi
      );

      expect(mockApi.checkTask).toHaveBeenCalledWith({
        project_name: 'my-project',
        task_name: 'my-task'
      });
    });

    it('falls back to package.json when project_name not provided', async () => {
      vi.mocked(packageJsonUtils.getProjectNameFromPackageJson).mockReturnValue('pkg-project');
      vi.mocked(mockApi.checkTask).mockResolvedValue({
        task_found: true,
        task_id: 'task-123',
        project_id: 'proj-123'
      });
      vi.mocked(mockApi.saveReport).mockResolvedValue({
        success: true,
        daily_id: 'daily-123'
      });

      await submitDailyReport(
        { task_name: 'my-task', activities_string: 'work' },
        mockApi
      );

      expect(mockApi.checkTask).toHaveBeenCalledWith({
        project_name: 'pkg-project',
        task_name: 'my-task'
      });
    });
  });

  describe('task checking', () => {
    beforeEach(() => {
      vi.mocked(packageJsonUtils.getProjectNameFromPackageJson).mockReturnValue('test-project');
    });

    it('returns error when task_name not provided', async () => {
      const result = await submitDailyReport(
        { activities_string: 'work' },
        mockApi
      );

      expect(result.type).toBe('error');
      expect((result as any).code).toBe('TASK_NAME_REQUIRED');
    });

    it('returns check_task result when task not found', async () => {
      vi.mocked(mockApi.checkTask).mockResolvedValue({
        task_found: false,
        project_id: 'proj-123',
        clickup_list_id: 'list-123',
        available_statuses: [
          { status: 'backlog', color: '#gray' }
        ]
      });

      const result = await submitDailyReport(
        { task_name: 'new-task', activities_string: 'work' },
        mockApi
      );

      expect(result.type).toBe('check_task');
      expect((result as any).task_found).toBe(false);
      expect((result as any).available_statuses).toHaveLength(1);
    });

    it('handles PROJECT_NOT_FOUND error', async () => {
      const { KudolyApiError } = await import('../services/kudolyApi.js');
      vi.mocked(mockApi.checkTask).mockRejectedValue(
        new KudolyApiError('Project not found', 400, 'PROJECT_NOT_FOUND', ['project-a', 'project-b'])
      );

      const result = await submitDailyReport(
        { task_name: 'task', activities_string: 'work' },
        mockApi
      );

      expect(result.type).toBe('error');
      expect((result as any).code).toBe('PROJECT_NOT_FOUND');
      expect((result as any).available_projects).toContain('project-a');
    });

    it('handles CLICKUP_NOT_CONFIGURED error', async () => {
      const { KudolyApiError } = await import('../services/kudolyApi.js');
      vi.mocked(mockApi.checkTask).mockRejectedValue(
        new KudolyApiError('ClickUp not configured', 400, 'CLICKUP_NOT_CONFIGURED')
      );

      const result = await submitDailyReport(
        { task_name: 'task', activities_string: 'work' },
        mockApi
      );

      expect(result.type).toBe('error');
      expect((result as any).code).toBe('CLICKUP_NOT_CONFIGURED');
    });
  });

  describe('saving report', () => {
    beforeEach(() => {
      vi.mocked(packageJsonUtils.getProjectNameFromPackageJson).mockReturnValue('test-project');
    });

    it('saves report when task exists', async () => {
      vi.mocked(mockApi.checkTask).mockResolvedValue({
        task_found: true,
        task_id: 'task-123',
        project_id: 'proj-123',
        clickup_list_id: 'list-123'
      });
      vi.mocked(mockApi.saveReport).mockResolvedValue({
        success: true,
        daily_id: 'daily-123'
      });

      const result = await submitDailyReport(
        {
          task_name: 'existing-task',
          activities_string: 'Did some work',
          status: 'complete'
        },
        mockApi
      );

      expect(result.type).toBe('save_report');
      expect((result as any).success).toBe(true);
      expect((result as any).task_created).toBe(false);
    });

    it('creates task when create_task=true and clickup_status provided', async () => {
      vi.mocked(mockApi.checkTask).mockResolvedValue({
        task_found: false,
        project_id: 'proj-123',
        clickup_list_id: 'list-123',
        available_statuses: [{ status: 'backlog', color: '#gray' }]
      });
      vi.mocked(mockApi.saveReport).mockResolvedValue({
        success: true,
        daily_id: 'daily-123',
        task_created: true
      });

      const result = await submitDailyReport(
        {
          task_name: 'new-task',
          activities_string: 'Created feature',
          create_task: true,
          clickup_status: 'backlog'
        },
        mockApi
      );

      expect(result.type).toBe('save_report');
      expect((result as any).task_created).toBe(true);
      expect(mockApi.saveReport).toHaveBeenCalledWith(
        expect.objectContaining({
          create_task: true,
          clickup_status: 'backlog'
        })
      );
    });

    it('returns error when create_task=true but no clickup_status', async () => {
      vi.mocked(mockApi.checkTask).mockResolvedValue({
        task_found: false,
        project_id: 'proj-123',
        available_statuses: [{ status: 'backlog', color: '#gray' }]
      });

      const result = await submitDailyReport(
        {
          task_name: 'new-task',
          activities_string: 'work',
          create_task: true
        },
        mockApi
      );

      expect(result.type).toBe('error');
      expect((result as any).code).toBe('CLICKUP_STATUS_REQUIRED');
    });
  });
});
