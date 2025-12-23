#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { KudolyApi } from './services/kudolyApi.js';
import { submitDailyReport, submitDailyReportSchema } from './tools/submitDailyReport.js';

// Validate environment variables
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

// Create API client
const api = new KudolyApi(KUDOLY_BASE_URL, KUDOLY_API_TOKEN);

// Create MCP server
const server = new McpServer({
  name: 'kudoly-mcp',
  version: '1.0.0'
});

// Tool description with conversation flow instructions
const TOOL_DESCRIPTION = `Registra una actividad diaria con verificación de tarea en ClickUp.

IMPORTANTE: NUNCA ejecutes este tool directamente. Sigue este flujo conversacional ANTES de llamar al tool:

1. PROYECTO: Si el usuario no menciona el proyecto, intenta obtenerlo del package.json. Si no es posible, pregunta: "¿En qué proyecto estás trabajando?"

2. TAREA: Pregunta: "¿Cómo se llama la tarea que quieres registrar?"

3. RESUMEN: Analiza el contexto del chat y genera un resumen que:
   - Sea comprensible para personas no técnicas (stakeholders, managers)
   - Se enfoque en QUÉ se hizo y PARA QUÉ, no en detalles técnicos
   - Sea conciso (2-4 oraciones máximo)
   Muestra el resumen y pregunta: "Este es el resumen para la daily: [resumen]. ¿Quieres registrar esto, o hay algo que deba agregar/modificar?"

4. ESTADO: Pregunta: "¿Cuál es el estado? (complete, progress, blocked, upcoming, qa)" o infiere del contexto.

5. Solo después de tener TODA la información confirmada, ejecuta el tool.

6. Si el tool retorna task_found=false, pregunta al usuario si quiere crear la tarea y con qué status de ClickUp.`;

// Register the submit_daily_report tool
server.tool(
  'submit_daily_report',
  TOOL_DESCRIPTION,
  submitDailyReportSchema.shape,
  async (params) => {
    const input = submitDailyReportSchema.parse(params);
    const result = await submitDailyReport(input, api);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

// Register a prompt for guided daily registration
server.prompt(
  'register-daily',
  'Inicia el flujo guiado para registrar una actividad diaria',
  {
    context: z.string().optional().describe('Contexto adicional sobre el trabajo realizado')
  },
  async (args) => {
    const contextInfo = args.context ? `\n\nContexto proporcionado: ${args.context}` : '';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Quiero registrar mi daily de hoy.${contextInfo}

Por favor guíame paso a paso:
1. Primero confirma el proyecto (puedes intentar obtenerlo del package.json)
2. Pregúntame el nombre de la tarea
3. Genera un resumen ejecutivo de mis actividades basado en nuestra conversación
4. Confirma el estado de la tarea
5. Solo entonces usa el tool submit_daily_report

Empecemos.`
          }
        }
      ]
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
