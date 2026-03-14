import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';

const cancelTaskTimerBaseSchema = z.object({
  project_name: z.string().optional().describe('Nombre del proyecto para ayudar a resolver la tarea'),
  task_name: z.string().optional().describe('Nombre de la tarea a cancelar'),
  task_id: z.string().uuid().optional().describe('ID exacto de la tarea si ya fue resuelto antes'),
});

export const cancelTaskTimerToolShape = cancelTaskTimerBaseSchema.shape;
export const cancelTaskTimerSchema = cancelTaskTimerBaseSchema;

export type CancelTaskTimerInput = z.infer<typeof cancelTaskTimerSchema>;

interface CancelTaskTimerSuccessResult {
  type: 'success';
  cancelled: boolean;
  task_id: string;
  message: string;
}

interface CancelTaskTimerErrorResult {
  type: 'error';
  code: string;
  message: string;
}

export type CancelTaskTimerResult = CancelTaskTimerSuccessResult | CancelTaskTimerErrorResult;

export async function cancelTaskTimer(
  input: CancelTaskTimerInput,
  api: KudolyApi
): Promise<CancelTaskTimerResult> {
  try {
    const result = await api.cancelTaskTimer({
      task: input.task_name || null,
      task_id: input.task_id,
      project: input.project_name || null,
    });

    return {
      type: 'success',
      cancelled: result.cancelled,
      task_id: result.task_id,
      message: result.message || 'Timer cancelado sin registrar tiempo.',
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

export const CANCEL_TASK_TIMER_DESCRIPTION = `Cancela un timer activo en Kudoly sin registrar tiempo.

Usalo solo cuando el timer se inicio por error o cuando el trabajo termino siendo demasiado pequeno para merecer un registro.

Si hay varios timers activos, informa task_id o task_name para cancelar el correcto.`;
