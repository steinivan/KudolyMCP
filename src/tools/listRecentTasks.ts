import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';

export const listRecentTasksSchema = z.object({
  project_name: z.string().optional().describe('Filtra por nombre de proyecto si ya lo conoces'),
  project_id: z.string().uuid().optional().describe('Filtra por ID exacto del proyecto'),
  limit: z.number().int().min(1).max(25).default(10).describe('Cantidad maxima de tareas recientes a devolver'),
});

export type ListRecentTasksInput = z.infer<typeof listRecentTasksSchema>;

interface ListRecentTasksSuccessResult {
  type: 'success';
  total: number;
  project_id?: string | null;
  project_name?: string | null;
  tasks: Array<{
    id: string;
    title: string;
    description?: string | null;
    project_id?: string | null;
    project_name?: string | null;
    status: 'todo' | 'in_progress' | 'done';
    is_running: boolean;
    total_seconds: number;
    updated_at: string;
    last_activity_at?: string | null;
    last_session_description?: string | null;
  }>;
}

interface ListRecentTasksErrorResult {
  type: 'error';
  code: string;
  message: string;
  available_projects?: string[];
}

export type ListRecentTasksResult = ListRecentTasksSuccessResult | ListRecentTasksErrorResult;

export async function listRecentTasks(
  input: ListRecentTasksInput,
  api: KudolyApi
): Promise<ListRecentTasksResult> {
  try {
    const result = await api.listRecentTasks({
      project: input.project_name || null,
      project_id: input.project_id,
      limit: input.limit,
    });

    return {
      type: 'success',
      total: result.total,
      project_id: result.project_id,
      project_name: result.project_name,
      tasks: result.tasks,
    };
  } catch (error) {
    if (error instanceof KudolyApiError) {
      if (error.code === 'UNAUTHORIZED' || error.statusCode === 401) {
        return {
          type: 'error',
          code: 'UNAUTHORIZED',
          message: 'Token invalido o expirado.',
        };
      }

      return {
        type: 'error',
        code: error.code || 'API_ERROR',
        message: error.message,
        available_projects: error.availableProjects,
      };
    }

    return {
      type: 'error',
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

export const LIST_RECENT_TASKS_DESCRIPTION = `Devuelve tareas recientes del developer autenticado, opcionalmente filtradas por proyecto.

Usalo cuando:
- quieras reutilizar una tarea existente en vez de crear una nueva
- el trabajo actual parece continuidad de un problema anterior
- necesites ver las tareas recientes antes de iniciar o registrar tiempo`;
