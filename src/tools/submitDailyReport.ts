import { z } from 'zod';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';
import { getProjectNameFromPackageJson } from '../utils/packageJson.js';
import type { CheckTaskResponse, ReportStatus } from '../types/index.js';

export const submitDailyReportSchema = z.object({
  project_name: z.string().optional().describe('Nombre del proyecto. Si no se proporciona, se intenta obtener del package.json'),
  task_name: z.string().optional().describe('Nombre de la tarea en ClickUp'),
  activities_string: z.string().describe('Descripción de las actividades realizadas'),
  status: z.enum(['complete', 'progress', 'blocked', 'upcoming', 'qa']).default('progress').describe('Estado de la tarea'),
  create_task: z.boolean().default(false).describe('Si es true, crea la tarea en ClickUp si no existe'),
  clickup_status: z.string().optional().describe('Status de ClickUp para la nueva tarea (requerido si create_task=true)')
});

export type SubmitDailyReportInput = z.infer<typeof submitDailyReportSchema>;

interface CheckTaskResult {
  type: 'check_task';
  task_found: boolean;
  task_id?: string;
  project_id?: string;
  project_name: string;
  clickup_list_id?: string;
  available_statuses?: Array<{ status: string; color: string }>;
  message: string;
}

interface SaveReportResult {
  type: 'save_report';
  success: boolean;
  daily_id: string;
  task_name: string;
  task_created: boolean;
  project_name: string;
  message: string;
}

interface ErrorResult {
  type: 'error';
  code: string;
  message: string;
  available_projects?: string[];
}

export type SubmitDailyReportResult = CheckTaskResult | SaveReportResult | ErrorResult;

export async function submitDailyReport(
  input: SubmitDailyReportInput,
  api: KudolyApi
): Promise<SubmitDailyReportResult> {
  // Get project name from input or package.json
  let projectName = input.project_name;
  if (!projectName) {
    projectName = getProjectNameFromPackageJson() || undefined;
  }

  if (!projectName) {
    return {
      type: 'error',
      code: 'PROJECT_NAME_REQUIRED',
      message: 'No se pudo determinar el nombre del proyecto. Por favor especifícalo.'
    };
  }

  // If no task_name and not creating, we need the task name
  if (!input.task_name) {
    return {
      type: 'error',
      code: 'TASK_NAME_REQUIRED',
      message: 'Por favor proporciona el nombre de la tarea.'
    };
  }

  try {
    // Step 1: Check if task exists
    const checkResult: CheckTaskResponse = await api.checkTask({
      project_name: projectName,
      task_name: input.task_name
    });

    // If task not found and not confirmed to create
    if (!checkResult.task_found && !input.create_task) {
      return {
        type: 'check_task',
        task_found: false,
        project_id: checkResult.project_id,
        project_name: projectName,
        clickup_list_id: checkResult.clickup_list_id,
        available_statuses: checkResult.available_statuses,
        message: `La tarea "${input.task_name}" no existe en ClickUp. ¿Deseas crearla?`
      };
    }

    // Validate clickup_status if creating task
    if (input.create_task && !input.clickup_status) {
      return {
        type: 'error',
        code: 'CLICKUP_STATUS_REQUIRED',
        message: 'Debes especificar el status de ClickUp para crear la tarea.'
      };
    }

    // Step 2: Save the report
    const saveResult = await api.saveReport({
      project_id: checkResult.project_id!,
      project_name: projectName,
      clickup_list_id: checkResult.clickup_list_id,
      clickup_task_id: checkResult.task_id,
      task_name: input.task_name,
      activities_string: input.activities_string,
      status: input.status as ReportStatus,
      create_task: input.create_task,
      clickup_status: input.clickup_status
    });

    return {
      type: 'save_report',
      success: saveResult.success,
      daily_id: saveResult.daily_id,
      task_name: input.task_name,
      task_created: saveResult.task_created || false,
      project_name: projectName,
      message: saveResult.task_created
        ? `Reporte guardado. Tarea "${input.task_name}" creada en ClickUp.`
        : `Reporte guardado para la tarea "${input.task_name}".`
    };

  } catch (error) {
    if (error instanceof KudolyApiError) {
      // Handle specific error codes from the API
      if (error.code === 'PROJECT_NOT_FOUND') {
        return {
          type: 'error',
          code: 'PROJECT_NOT_FOUND',
          message: `Proyecto "${projectName}" no encontrado.`,
          available_projects: error.availableProjects
        };
      }

      if (error.code === 'CLICKUP_NOT_CONFIGURED') {
        return {
          type: 'error',
          code: 'CLICKUP_NOT_CONFIGURED',
          message: `El proyecto "${projectName}" no tiene ClickUp configurado.`
        };
      }

      if (error.code === 'UNAUTHORIZED' || error.statusCode === 401) {
        return {
          type: 'error',
          code: 'UNAUTHORIZED',
          message: 'Token inválido o expirado.'
        };
      }

      return {
        type: 'error',
        code: error.code || 'API_ERROR',
        message: error.message,
        available_projects: error.availableProjects
      };
    }

    return {
      type: 'error',
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}
