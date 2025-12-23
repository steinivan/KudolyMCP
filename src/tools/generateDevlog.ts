import { z } from 'zod';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';
import { getProjectNameFromPackageJson } from '../utils/packageJson.js';

export const generateDevlogSchema = z.object({
  project_name: z.string().optional().describe('Nombre del proyecto. Si no se proporciona, se intenta obtener del package.json'),
  task_name: z.string().describe('Nombre de la tarea en ClickUp donde se guardará el DEVLOG'),
  devlog_content: z.string().describe('Contenido del DEVLOG en formato markdown')
});

export type GenerateDevlogInput = z.infer<typeof generateDevlogSchema>;

interface SuccessResult {
  type: 'success';
  message: string;
  task_name: string;
  filename: string;
  file_url?: string;
}

interface ErrorResult {
  type: 'error';
  code: string;
  message: string;
}

export type GenerateDevlogResult = SuccessResult | ErrorResult;

export async function generateDevlog(
  input: GenerateDevlogInput,
  api: KudolyApi
): Promise<GenerateDevlogResult> {
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

  if (!input.task_name) {
    return {
      type: 'error',
      code: 'TASK_NAME_REQUIRED',
      message: 'Por favor proporciona el nombre de la tarea donde guardar el DEVLOG.'
    };
  }

  if (!input.devlog_content || input.devlog_content.trim().length === 0) {
    return {
      type: 'error',
      code: 'DEVLOG_CONTENT_REQUIRED',
      message: 'El contenido del DEVLOG no puede estar vacío.'
    };
  }

  try {
    const result = await api.saveDevlog({
      project_name: projectName,
      task_name: input.task_name,
      devlog_content: input.devlog_content,
      filename: 'DEVLOG.md'
    });

    return {
      type: 'success',
      message: result.message || `DEVLOG guardado en la tarea "${result.task_name || input.task_name}"`,
      task_name: result.task_name || input.task_name,
      filename: result.filename || 'DEVLOG.md',
      file_url: result.file_url
    };

  } catch (error) {
    if (error instanceof KudolyApiError) {
      if (error.code === 'TASK_NOT_FOUND') {
        return {
          type: 'error',
          code: 'TASK_NOT_FOUND',
          message: `Tarea "${input.task_name}" no encontrada en ClickUp.`
        };
      }

      if (error.code === 'PROJECT_NOT_FOUND') {
        return {
          type: 'error',
          code: 'PROJECT_NOT_FOUND',
          message: `Proyecto "${projectName}" no encontrado.`
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
        message: error.message
      };
    }

    return {
      type: 'error',
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

// Tool description with conversation flow instructions
export const GENERATE_DEVLOG_DESCRIPTION = `Genera y guarda un documento de conocimiento (DEVLOG.md) en una tarea de ClickUp.

IMPORTANTE: NUNCA ejecutes este tool directamente. Sigue este flujo conversacional ANTES de llamar al tool:

1. PROYECTO Y TAREA:
   - Proyecto: obtener del package.json o preguntar "¿En qué proyecto estás trabajando?"
   - Tarea: preguntar "¿Para qué tarea quieres generar el DEVLOG?"

2. ANALIZAR CONTEXTO COMPLETO:
   Revisar TODO el historial del chat incluyendo:
   - Código escrito o modificado
   - Archivos creados
   - Comandos ejecutados
   - Errores encontrados y cómo se resolvieron
   - Decisiones tomadas durante la conversación

3. GENERAR DEVLOG con esta estructura:
   ---
   proyecto: [nombre]
   tarea: [nombre]
   fecha: [YYYY-MM-DD]
   tags: [tecnologías, conceptos clave]
   ---

   # [Título descriptivo]

   ## Contexto
   [Por qué se necesitaba este cambio]

   ## Qué se hizo
   [Descripción clara de la solución]

   ## Decisiones técnicas
   [Cada decisión con su justificación, alternativas y trade-offs]

   ## Implementación
   [Archivos involucrados, flujo de datos, dependencias]

   ## Problemas y soluciones
   [Errores encontrados, causas, cómo se resolvieron]

   ## Configuración y uso
   [Cómo ejecutar/probar, variables de entorno]

   ## Limitaciones conocidas
   [Qué NO hace, edge cases, mejoras pendientes]

   ## Keywords para búsqueda
   [Términos relevantes para encontrar este documento]

4. MOSTRAR PREVIEW Y CONFIRMAR:
   "Este es el DEVLOG generado. ¿Quieres guardarlo así, o necesitas ajustar algo?"
   - Permitir múltiples iteraciones hasta que el usuario esté satisfecho

5. Solo entonces ejecutar el tool con el contenido final.

PRINCIPIOS para buen contenido:
- Autocontenido: entendible sin ver el chat original
- Contextual: incluir el POR QUÉ, no solo el QUÉ
- Buscable: usar keywords relevantes
- Preciso: nombres exactos de archivos y funciones
- Honesto: documentar limitaciones y deuda técnica`;
