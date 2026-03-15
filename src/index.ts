#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { KudolyApi } from './services/kudolyApi.js';
import { submitDailyReport, submitDailyReportSchema } from './tools/submitDailyReport.js';
import { generateDevlog, generateDevlogSchema, GENERATE_DEVLOG_DESCRIPTION } from './tools/generateDevlog.js';
import { logTimeEntry, logTimeEntrySchema, LOG_TIME_ENTRY_DESCRIPTION } from './tools/logTimeEntry.js';
import { startTaskTimer, startTaskTimerSchema, START_TASK_TIMER_DESCRIPTION } from './tools/startTaskTimer.js';
import { stopTaskTimer, stopTaskTimerSchema, STOP_TASK_TIMER_DESCRIPTION } from './tools/stopTaskTimer.js';
import { cancelTaskTimer, cancelTaskTimerSchema, CANCEL_TASK_TIMER_DESCRIPTION } from './tools/cancelTaskTimer.js';
import { listAvailableProjects, listAvailableProjectsSchema, LIST_AVAILABLE_PROJECTS_DESCRIPTION } from './tools/listAvailableProjects.js';
import { listRecentTasks, listRecentTasksSchema, LIST_RECENT_TASKS_DESCRIPTION } from './tools/listRecentTasks.js';

const KUDOLY_BASE_URL = process.env.KUDOLY_BASE_URL;
const KUDOLY_API_TOKEN = process.env.KUDOLY_API_TOKEN;

if (!KUDOLY_BASE_URL) {
  console.error('Error: KUDOLY_BASE_URL environment variable is required');
  process.exit(1);
}

if (!KUDOLY_API_TOKEN) {
  console.error('Error: KUDOLY_API_TOKEN environment variable is required');
  process.exit(1);
}

const api = new KudolyApi(KUDOLY_BASE_URL, KUDOLY_API_TOKEN);

const server = new McpServer({
  name: 'kudoly-mcp',
  version: '1.0.0'
});

const DAILY_TOOL_DESCRIPTION = `Registra una actividad diaria con verificacion de tarea en ClickUp.

IMPORTANTE: NUNCA ejecutes este tool directamente. Sigue este flujo conversacional ANTES de llamar al tool:

1. PROYECTO: Si el usuario no menciona el proyecto, intenta obtenerlo del package.json. Si no es posible, pregunta: "¿En que proyecto estas trabajando?"
2. TAREA: Pregunta: "¿Como se llama la tarea que quieres registrar?"
3. RESUMEN: Genera un resumen no tecnico, conciso y entendible para stakeholders.
4. ESTADO: Confirma o infiere el estado.
5. Solo despues de tener toda la informacion confirmada, ejecuta el tool.
6. Si task_found=false, pregunta si quiere crear la tarea y con que status de ClickUp.`;

function textToolResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function promptResult(text: string) {
  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text
        }
      }
    ]
  };
}

server.registerTool(
  'submit_daily_report',
  {
    description: DAILY_TOOL_DESCRIPTION,
    inputSchema: submitDailyReportSchema
  } as any,
  (async (params: unknown) => {
    const input = submitDailyReportSchema.parse(params);
    const result = await submitDailyReport(input, api);
    return textToolResult(result);
  }) as any
);

server.registerTool(
  'generate_devlog',
  {
    description: GENERATE_DEVLOG_DESCRIPTION,
    inputSchema: generateDevlogSchema
  } as any,
  (async (params: unknown) => {
    const input = generateDevlogSchema.parse(params);
    const result = await generateDevlog(input, api);
    return textToolResult(result);
  }) as any
);

server.registerTool(
  'log_time_entry',
  {
    description: LOG_TIME_ENTRY_DESCRIPTION,
    inputSchema: logTimeEntrySchema
  } as any,
  (async (params: unknown) => {
    const input = logTimeEntrySchema.parse(params);
    const result = await logTimeEntry(input, api);
    return textToolResult(result);
  }) as any
);

server.registerTool(
  'list_available_projects',
  {
    description: LIST_AVAILABLE_PROJECTS_DESCRIPTION,
    inputSchema: listAvailableProjectsSchema
  } as any,
  (async (params: unknown) => {
    const input = listAvailableProjectsSchema.parse(params);
    const result = await listAvailableProjects(input, api);
    return textToolResult(result);
  }) as any
);

server.registerTool(
  'list_recent_tasks',
  {
    description: LIST_RECENT_TASKS_DESCRIPTION,
    inputSchema: listRecentTasksSchema
  } as any,
  (async (params: unknown) => {
    const input = listRecentTasksSchema.parse(params);
    const result = await listRecentTasks(input, api);
    return textToolResult(result);
  }) as any
);

server.registerTool(
  'start_task_timer',
  {
    description: START_TASK_TIMER_DESCRIPTION,
    inputSchema: startTaskTimerSchema
  } as any,
  (async (params: unknown) => {
    const input = startTaskTimerSchema.parse(params);
    const result = await startTaskTimer(input, api);
    return textToolResult(result);
  }) as any
);

server.registerTool(
  'stop_task_timer',
  {
    description: STOP_TASK_TIMER_DESCRIPTION,
    inputSchema: stopTaskTimerSchema
  } as any,
  (async (params: unknown) => {
    const input = stopTaskTimerSchema.parse(params);
    const result = await stopTaskTimer(input, api);
    return textToolResult(result);
  }) as any
);

server.registerTool(
  'cancel_task_timer',
  {
    description: CANCEL_TASK_TIMER_DESCRIPTION,
    inputSchema: cancelTaskTimerSchema
  } as any,
  (async (params: unknown) => {
    const input = cancelTaskTimerSchema.parse(params);
    const result = await cancelTaskTimer(input, api);
    return textToolResult(result);
  }) as any
);

server.registerPrompt(
  'register-daily',
  {
    description: 'Inicia el flujo guiado para registrar una actividad diaria'
  },
  (async () => promptResult(
    `Quiero registrar mi daily de hoy.

Por favor guiame paso a paso:
1. Primero confirma el proyecto
2. Preguntame el nombre de la tarea
3. Genera un resumen ejecutivo de mis actividades
4. Confirma el estado de la tarea
5. Solo entonces usa el tool submit_daily_report

Empecemos.`
  )) as any
);

server.registerPrompt(
  'register-time-entry',
  {
    description: 'Inicia el flujo guiado para registrar una entrada de tiempo'
  },
  (async () => promptResult(
    `Quiero registrar una entrada de tiempo en Kudoly.

Por favor:
1. Identifica proyecto y tarea si se pueden inferir
2. Genera un resumen no tecnico breve
3. Genera un resumen tecnico breve
4. Estima horas y minutos consumidos
5. Confirma cualquier dato faltante
6. Solo al final usa el tool log_time_entry`
  )) as any
);

server.registerPrompt(
  'track-work-session',
  {
    description: 'Inicia el flujo guiado para medir una sesion de trabajo real en Kudoly'
  },
  (async () => promptResult(
    `Quiero registrar trabajo real en Kudoly.

Por favor:
1. Decide si esto merece timer o si es una microinteraccion que no debe registrarse
2. Si merece timer, infiere o confirma proyecto y tarea
3. Si proyecto o tarea no estan claros, usa list_available_projects y list_recent_tasks antes de abrir una tarea nueva
4. Reutiliza una tarea reciente si claramente pertenece al mismo workstream
5. Usa start_task_timer solo cuando empiece trabajo sustancial
6. Al terminar, genera resumen no tecnico y tecnico
7. Usa stop_task_timer para cerrar el bloque
8. Si el timer se inicio por error o el trabajo fue insignificante, usa cancel_task_timer`
  )) as any
);

server.registerPrompt(
  'generate-devlog',
  {
    description: 'Inicia el flujo guiado para generar un DEVLOG de conocimiento'
  },
  (async () => promptResult(
    `Quiero generar un DEVLOG para documentar el trabajo que hicimos.

Por favor:
1. Confirma el proyecto
2. Confirma la tarea donde guardar el DEVLOG
3. Analiza todo el historial de trabajo relevante
4. Genera un DEVLOG completo con contexto, implementacion, problemas y limitaciones
5. Muestrame el DEVLOG y dejame revisarlo
6. Solo cuando lo apruebe, usa el tool generate_devlog`
  )) as any
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
