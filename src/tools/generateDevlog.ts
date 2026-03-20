import { z } from 'zod/v3';
import { KudolyApi, KudolyApiError } from '../services/kudolyApi.js';
import { maybeThrowOAuthElicitationError } from './oauthElicitation.js';
import { getProjectNameFromPackageJson } from '../utils/packageJson.js';

export const generateDevlogSchema = z.object({
  project_name: z.string().optional().describe('Nombre del proyecto. Si no se proporciona, se intenta obtener del package.json'),
  task_name: z.string().describe('Nombre de la tarea en ClickUp donde se guardarÃ¡ el DEVLOG'),
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
      message: 'No se pudo determinar el nombre del proyecto. Por favor especifÃ­calo.'
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
      message: 'El contenido del DEVLOG no puede estar vacÃ­o.'
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
    maybeThrowOAuthElicitationError(error);

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
          message: 'Token invÃ¡lido o expirado.'
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
   - Proyecto: obtener del package.json o preguntar "Â¿En quÃ© proyecto estÃ¡s trabajando?"
   - Tarea: preguntar "Â¿Para quÃ© tarea quieres generar el DEVLOG?"

2. ANALIZAR CONTEXTO COMPLETO:
   Revisar TODO el historial del chat incluyendo:
   - CÃ³digo escrito o modificado
   - Archivos creados
   - Comandos ejecutados
   - Errores encontrados y cÃ³mo se resolvieron
   - Decisiones tomadas durante la conversaciÃ³n

3. GENERAR DEVLOG con esta estructura:
   ---
   proyecto: [nombre]
   tarea: [nombre]
   fecha: [YYYY-MM-DD]
   tags: [tecnologÃ­as, conceptos clave]
   ---

   # [TÃ­tulo descriptivo]

   ## Contexto
   [Por quÃ© se necesitaba este cambio]

   ## QuÃ© se hizo
   [DescripciÃ³n clara de la soluciÃ³n]

   ## Decisiones tÃ©cnicas
   [Cada decisiÃ³n con su justificaciÃ³n, alternativas y trade-offs]

   ## ImplementaciÃ³n
   [Archivos involucrados, flujo de datos, dependencias]

   ## Problemas y soluciones
   [Errores encontrados, causas, cÃ³mo se resolvieron]

   ## ConfiguraciÃ³n y uso
   [CÃ³mo ejecutar/probar, variables de entorno]

   ## Limitaciones conocidas
   [QuÃ© NO hace, edge cases, mejoras pendientes]

   ## Keywords para bÃºsqueda
   [TÃ©rminos relevantes para encontrar este documento]

4. MOSTRAR PREVIEW Y CONFIRMAR:
   "Este es el DEVLOG generado. Â¿Quieres guardarlo asÃ­, o necesitas ajustar algo?"
   - Permitir mÃºltiples iteraciones hasta que el usuario estÃ© satisfecho

5. Solo entonces ejecutar el tool con el contenido final.

PRINCIPIOS para buen contenido:
- Autocontenido: entendible sin ver el chat original
- Contextual: incluir el POR QUÃ‰, no solo el QUÃ‰
- Buscable: usar keywords relevantes
- Preciso: nombres exactos de archivos y funciones
- Honesto: documentar limitaciones y deuda tÃ©cnica`;

