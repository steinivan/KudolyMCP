import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';

export const listAvailableProjectsSchema = z.object({});

export type ListAvailableProjectsInput = z.infer<typeof listAvailableProjectsSchema>;

interface ListAvailableProjectsSuccessResult {
  type: 'success';
  total: number;
  projects: Array<{
    id: string;
    name: string;
  }>;
}

interface ListAvailableProjectsErrorResult {
  type: 'error';
  code: string;
  message: string;
}

export type ListAvailableProjectsResult =
  | ListAvailableProjectsSuccessResult
  | ListAvailableProjectsErrorResult;

export async function listAvailableProjects(
  _input: ListAvailableProjectsInput,
  api: KudolyApi
): Promise<ListAvailableProjectsResult> {
  try {
    const result = await api.listAvailableProjects();

    return {
      type: 'success',
      total: result.total,
      projects: result.projects,
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
      };
    }

    return {
      type: 'error',
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

export const LIST_AVAILABLE_PROJECTS_DESCRIPTION = `Devuelve los proyectos disponibles en Kudoly para la empresa del token actual.

Usalo antes de iniciar o registrar tiempo cuando el proyecto no este claro o cuando quieras validar el nombre exacto a reutilizar.`;
