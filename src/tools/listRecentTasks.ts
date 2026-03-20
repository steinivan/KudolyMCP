import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';
import { maybeThrowOAuthElicitationError } from './oauthElicitation.js';

export const listRecentTasksSchema = z.object({
  project_name: z.string().optional().describe('Filtra por nombre de proyecto si ya lo conoces'),
  project_id: z.string().uuid().optional().describe('Filtra por ID exacto del proyecto'),
  status: z.enum(['backlog', 'in_progress', 'qa', 'complete', 'todo', 'done']).optional().describe('Filtra por estado. Para board MCP usa in_progress por defecto'),
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
    technical_summary?: string | null;
    non_technical_summary?: string | null;
    attachments?: Array<{
      id: string;
      file_name: string;
      file_type?: string | null;
      file_size?: number | null;
      public_url: string;
      created_at: string;
    }>;
    project_id?: string | null;
    project_name?: string | null;
    status: 'backlog' | 'in_progress' | 'qa' | 'complete' | 'todo' | 'done';
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
      status: input.status,
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
    maybeThrowOAuthElicitationError(error);

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
- necesites ver las tareas recientes antes de iniciar o registrar tiempo

Para task board + MCP:
- usa \`status: in_progress\` cuando quieras traer las tareas listas para trabajar
- las tareas en \`qa\` ya no son el default del MCP y esperan verificacion
- si la tarea trae \`attachments\`, usalos como contexto visual adicional para ejecutar el trabajo`;

