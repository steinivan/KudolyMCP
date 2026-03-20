import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';
import { maybeThrowOAuthElicitationError } from './oauthElicitation.js';

const startTaskTimerBaseSchema = z.object({
  project_name: z.string().optional().describe('Nombre del proyecto en Kudoly. Se intenta resolver por similitud'),
  task_name: z.string().optional().describe('Nombre de la tarea. Si no existe, el backend puede crearla o reutilizar una abierta'),
  task_id: z.string().uuid().optional().describe('ID exacto de la tarea si ya fue resuelto antes'),
  description: z.string().optional().describe('Descripcion breve del bloque de trabajo que empieza'),
  non_technical_summary: z.string().optional().describe('Resumen no tecnico inicial u objetivo del bloque'),
  technical_summary: z.string().optional().describe('Resumen tecnico inicial del trabajo a realizar'),
  source: z.enum(['manual', 'ai', 'clockify']).default('ai').describe('Origen del timer'),
});

export const startTaskTimerToolShape = startTaskTimerBaseSchema.shape;

export const startTaskTimerSchema = startTaskTimerBaseSchema.refine(
  (value) => Boolean(value.task_id || value.task_name || value.description),
  {
    message: 'Debes indicar task_id, task_name o description',
    path: ['description'],
  }
);

export type StartTaskTimerInput = z.infer<typeof startTaskTimerSchema>;

interface StartTaskTimerSuccessResult {
  type: 'success';
  started: boolean;
  task_id: string;
  project_id?: string | null;
  project_name?: string | null;
  message: string;
}

interface StartTaskTimerErrorResult {
  type: 'error';
  code: string;
  message: string;
}

export type StartTaskTimerResult = StartTaskTimerSuccessResult | StartTaskTimerErrorResult;

export async function startTaskTimer(
  input: StartTaskTimerInput,
  api: KudolyApi
): Promise<StartTaskTimerResult> {
  try {
    const result = await api.startTaskTimer({
      task: input.task_name || null,
      task_id: input.task_id,
      project: input.project_name || null,
      description: input.description || null,
      technical_summary: input.technical_summary || null,
      non_technical_summary: input.non_technical_summary || null,
      source: input.source,
    });

    return {
      type: 'success',
      started: result.started,
      task_id: result.task_id,
      project_id: result.project_id,
      project_name: result.project_name,
      message: result.message || 'Timer iniciado correctamente.',
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

export const START_TASK_TIMER_DESCRIPTION = `Inicia un timer activo en Kudoly para una tarea del developer.

Usalo cuando el pedido del usuario ya se convirtio en trabajo real:
- implementacion
- debugging
- investigacion sustancial
- cambios de codigo, migraciones o comandos con impacto

No lo uses para microinteracciones, preguntas cortas o respuestas conceptuales que no justifican una tarea.

El backend intenta resolver el proyecto por similitud y reutiliza una tarea abierta si encuentra una coincidente.`;

