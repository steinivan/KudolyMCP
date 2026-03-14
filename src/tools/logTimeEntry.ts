import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';

const logTimeEntryBaseSchema = z.object({
  project_name: z.string().optional().describe('Nombre del proyecto en Kudoly'),
  task_name: z.string().optional().describe('Nombre de la tarea en Kudoly. Si no existe, el backend puede crearla'),
  description: z.string().optional().describe('Descripcion de la entrada de tiempo'),
  duration_hours: z.number().min(0).optional().describe('Horas invertidas'),
  duration_minutes: z.number().min(0).optional().describe('Minutos adicionales invertidos'),
  notes: z.string().optional().describe('Notas libres, links o contexto extra'),
  non_technical_summary: z.string().optional().describe('Resumen comprensible para negocio o stakeholders'),
  technical_summary: z.string().optional().describe('Resumen tecnico con implementacion, archivos, endpoints o decisiones'),
  status: z.enum(['todo', 'in_progress', 'done']).default('done').describe('Estado final de la tarea'),
  source: z.enum(['manual', 'ai', 'clockify']).default('ai').describe('Origen del registro'),
});

export const logTimeEntryToolShape = logTimeEntryBaseSchema.shape;

export const logTimeEntrySchema = logTimeEntryBaseSchema.refine(
  (value) => Boolean(value.task_name || value.description),
  {
    message: 'Debes indicar task_name o description',
    path: ['description'],
  }
).refine(
  (value) => ((value.duration_hours || 0) * 60) + (value.duration_minutes || 0) > 0,
  {
    message: 'Debes indicar una duracion mayor a 0',
    path: ['duration_minutes'],
  }
);

export type LogTimeEntryInput = z.infer<typeof logTimeEntrySchema>;

interface SuccessResult {
  type: 'success';
  imported: boolean;
  task_id?: string | null;
  message: string;
}

interface ErrorResult {
  type: 'error';
  code: string;
  message: string;
}

export type LogTimeEntryResult = SuccessResult | ErrorResult;

export async function logTimeEntry(
  input: LogTimeEntryInput,
  api: KudolyApi
): Promise<LogTimeEntryResult> {
  const totalMinutes = ((input.duration_hours || 0) * 60) + (input.duration_minutes || 0);

  try {
    const result = await api.saveTimeEntry({
      task: input.task_name || null,
      project: input.project_name || null,
      description: input.description || null,
      duration_minutes: totalMinutes,
      notes: input.notes || null,
      technical_summary: input.technical_summary || null,
      non_technical_summary: input.non_technical_summary || null,
      status: input.status,
      source: input.source,
    });

    return {
      type: 'success',
      imported: result.imported,
      task_id: result.task_id,
      message: result.message || 'Tiempo registrado correctamente.',
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

export const LOG_TIME_ENTRY_DESCRIPTION = `Registra una entrada de tiempo en Kudoly para que quede visible en el dashboard Time.

Usalo cuando necesites cargar tiempo retroactivo, importado o manual, en lugar de medirlo con start_task_timer / stop_task_timer.

Sirve para dejar:
- duracion consumida
- descripcion de la entrada
- proyecto y tarea si aplica
- resumen no tecnico para stakeholders
- resumen tecnico para desarrolladores

El backend reutiliza la tarea si ya existe y, si no existe, puede crearla automaticamente.

Flujo recomendado antes de ejecutar el tool:
1. Resume que se hizo en lenguaje no tecnico.
2. Resume lo tecnico: archivos, endpoints, decisiones, migraciones, riesgos.
3. Calcula o estima horas y minutos invertidos porque este tool no mide tiempo real.
4. Confirma proyecto/tarea solo si el contexto no los deja claros.
5. Ejecuta el tool al cerrar el trabajo.`;
