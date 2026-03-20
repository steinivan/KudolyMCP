import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';
import { maybeThrowOAuthElicitationError } from './oauthElicitation.js';

const stopTaskTimerBaseSchema = z.object({
  project_name: z.string().optional().describe('Nombre del proyecto para ayudar a resolver la tarea'),
  task_name: z.string().optional().describe('Nombre de la tarea a detener. Si no se informa y solo hay un timer activo, el backend lo resuelve'),
  task_id: z.string().uuid().optional().describe('ID exacto de la tarea si ya fue resuelto antes'),
  description: z.string().optional().describe('Descripcion final del bloque realizado'),
  notes: z.string().optional().describe('Notas finales, links o contexto adicional'),
  non_technical_summary: z.string().optional().describe('Resumen final no tecnico para stakeholders'),
  technical_summary: z.string().optional().describe('Resumen final tecnico con cambios, archivos o decisiones'),
  status: z.enum(['backlog', 'in_progress', 'qa', 'complete', 'todo', 'done']).default('qa').describe('Estado final de la tarea al detener el timer'),
  source: z.enum(['manual', 'ai', 'clockify']).optional().describe('Origen del trabajo registrado'),
});

export const stopTaskTimerToolShape = stopTaskTimerBaseSchema.shape;
export const stopTaskTimerSchema = stopTaskTimerBaseSchema;

export type StopTaskTimerInput = z.infer<typeof stopTaskTimerSchema>;

interface StopTaskTimerSuccessResult {
  type: 'success';
  stopped: boolean;
  task_id: string;
  elapsed_seconds: number;
  message: string;
}

interface StopTaskTimerErrorResult {
  type: 'error';
  code: string;
  message: string;
}

export type StopTaskTimerResult = StopTaskTimerSuccessResult | StopTaskTimerErrorResult;

export async function stopTaskTimer(
  input: StopTaskTimerInput,
  api: KudolyApi
): Promise<StopTaskTimerResult> {
  try {
    const result = await api.stopTaskTimer({
      task: input.task_name || null,
      task_id: input.task_id,
      project: input.project_name || null,
      description: input.description || null,
      notes: input.notes || null,
      technical_summary: input.technical_summary || null,
      non_technical_summary: input.non_technical_summary || null,
      status: input.status,
      source: input.source,
    });

    return {
      type: 'success',
      stopped: result.stopped,
      task_id: result.task_id,
      elapsed_seconds: result.elapsed_seconds,
      message: result.message || 'Timer detenido correctamente.',
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
      };
    }

    return {
      type: 'error',
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

export const STOP_TASK_TIMER_DESCRIPTION = `Detiene un timer activo en Kudoly y guarda el bloque trabajado.

Usalo al cerrar una tarea o un bloque sustancial de trabajo. Idealmente envia:
- descripcion final
- resumen no tecnico
- resumen tecnico
- estado final de la tarea

Si hay varios timers activos, informa task_id o task_name para detener el correcto.`;

