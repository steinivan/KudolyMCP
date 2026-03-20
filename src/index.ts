#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { getOAuthProtectedResourceMetadataUrl, mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { KudolyApi } from './services/kudolyApi.js';
import { submitDailyReport, submitDailyReportSchema } from './tools/submitDailyReport.js';
import { generateDevlog, generateDevlogSchema, GENERATE_DEVLOG_DESCRIPTION } from './tools/generateDevlog.js';
import { logTimeEntry, logTimeEntrySchema, LOG_TIME_ENTRY_DESCRIPTION } from './tools/logTimeEntry.js';
import { startTaskTimer, startTaskTimerSchema, START_TASK_TIMER_DESCRIPTION } from './tools/startTaskTimer.js';
import { stopTaskTimer, stopTaskTimerSchema, STOP_TASK_TIMER_DESCRIPTION } from './tools/stopTaskTimer.js';
import { cancelTaskTimer, cancelTaskTimerSchema, CANCEL_TASK_TIMER_DESCRIPTION } from './tools/cancelTaskTimer.js';
import { listAvailableProjects, listAvailableProjectsSchema, LIST_AVAILABLE_PROJECTS_DESCRIPTION } from './tools/listAvailableProjects.js';
import { listRecentTasks, listRecentTasksSchema, LIST_RECENT_TASKS_DESCRIPTION } from './tools/listRecentTasks.js';

const KUDOLY_PRODUCTION_BASE_URL = 'https://www.kudolyai.com';
const MCP_PORT = Number.parseInt(process.env.KUDOLY_MCP_PORT || '3737', 10);
const MCP_HOST = process.env.KUDOLY_MCP_HOST || '127.0.0.1';
const MCP_PUBLIC_URL = process.env.KUDOLY_MCP_PUBLIC_URL || `http://${MCP_HOST}:${MCP_PORT}`;
const MCP_SCOPE = 'mcp:tools';
const TOKEN_VERIFY_CACHE_MS = 60 * 1000;
const TOKEN_EXPIRY_SKEW_SECONDS = 30;

const localMcpServerUrl = new URL('/mcp', MCP_PUBLIC_URL);
const oauthProtectedResourceUrl = new URL('/mcp', KUDOLY_PRODUCTION_BASE_URL);
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(oauthProtectedResourceUrl);
const oauthIssuerUrl = KUDOLY_PRODUCTION_BASE_URL;

const oauthMetadata = {
  issuer: oauthIssuerUrl,
  authorization_endpoint: new URL('/api/oauth/mcp/authorize', KUDOLY_PRODUCTION_BASE_URL).href,
  token_endpoint: new URL('/api/oauth/mcp/token', KUDOLY_PRODUCTION_BASE_URL).href,
  registration_endpoint: new URL('/api/oauth/mcp/register', KUDOLY_PRODUCTION_BASE_URL).href,
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  scopes_supported: [MCP_SCOPE],
  client_id_metadata_document_supported: true
};

const tokenVerificationCache = new Map<string, { checkedAt: number; expiresAt: number; clientId: string }>();

function parseTokenPayload(token: string): Record<string, unknown> | null {
  const [payload] = token.split('.');
  if (!payload) {
    return null;
  }

  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractTokenExpiry(token: string): number {
  const payload = parseTokenPayload(token);
  const exp = payload?.exp;
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    return exp;
  }

  return Math.floor(Date.now() / 1000) + 5 * 60;
}

function extractTokenClientId(token: string): string {
  const payload = parseTokenPayload(token);
  const clientId = payload?.client_id;
  if (typeof clientId === 'string' && clientId.trim().length > 0) {
    return clientId;
  }

  return 'kudoly-mcp';
}

async function verifyAccessTokenAgainstBackend(token: string): Promise<void> {
  const response = await fetch(new URL('/api/v1/time-entries/projects', KUDOLY_PRODUCTION_BASE_URL), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  await response.body?.cancel();

  if (!response.ok) {
    throw new Error('Invalid or expired token');
  }
}

const authMiddleware = requireBearerAuth({
  verifier: {
    verifyAccessToken: async (token: string) => {
      const nowMs = Date.now();
      const nowSeconds = Math.floor(nowMs / 1000);
      const cached = tokenVerificationCache.get(token);

      if (
        cached &&
        nowMs - cached.checkedAt < TOKEN_VERIFY_CACHE_MS &&
        cached.expiresAt > nowSeconds + TOKEN_EXPIRY_SKEW_SECONDS
      ) {
        return {
          token,
          clientId: cached.clientId,
          scopes: [MCP_SCOPE],
          expiresAt: cached.expiresAt
        };
      }

      await verifyAccessTokenAgainstBackend(token);

      const expiresAt = extractTokenExpiry(token);
      if (expiresAt <= nowSeconds + TOKEN_EXPIRY_SKEW_SECONDS) {
        throw new Error('Token has expired');
      }

      const clientId = extractTokenClientId(token);
      tokenVerificationCache.set(token, {
        checkedAt: nowMs,
        expiresAt,
        clientId
      });

      return {
        token,
        clientId,
        scopes: [MCP_SCOPE],
        expiresAt
      };
    }
  },
  requiredScopes: [MCP_SCOPE],
  resourceMetadataUrl
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

function createMcpServer(api: KudolyApi): McpServer {
  const server = new McpServer({
    name: 'kudoly-mcp',
    version: '1.0.0'
  });

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
4. En task board flows, consulta primero list_recent_tasks con status: in_progress para obtener la cola MCP por defecto
5. Reutiliza una tarea reciente si claramente pertenece al mismo workstream
6. Usa start_task_timer solo cuando empiece trabajo sustancial
7. Al terminar, genera resumen no tecnico y tecnico
8. Si terminaste implementacion de una tarea que estaba en in_progress, usa stop_task_timer con status qa
9. Si el timer se inicio por error o el trabajo fue insignificante, usa cancel_task_timer`
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

  return server;
}

function methodNotAllowedResponse(res: any): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.'
    },
    id: null
  });
}

async function main() {
  const app = createMcpExpressApp();

  app.use(mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: oauthProtectedResourceUrl,
    scopesSupported: [MCP_SCOPE],
    resourceName: 'Kudoly MCP'
  }));

  app.post('/mcp', (req: any, res: any, next: any) => {
    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res
        .status(401)
        .set('WWW-Authenticate', `Bearer error="invalid_token", error_description="Missing bearer token", resource_metadata="${resourceMetadataUrl}", scope="${MCP_SCOPE}"`)
        .json({
          error: 'invalid_token',
          error_description: 'Missing bearer token'
        });
      return;
    }

    next();
  }, authMiddleware, async (req: any, res: any) => {
    const bearerToken = req.auth?.token;
    if (!bearerToken) {
      res
        .status(401)
        .set('WWW-Authenticate', `Bearer error="invalid_token", error_description="Missing bearer token", resource_metadata="${resourceMetadataUrl}", scope="${MCP_SCOPE}"`)
        .json({ error: 'Unauthorized' });
      return;
    }

    const api = new KudolyApi(
      KUDOLY_PRODUCTION_BASE_URL,
      async () => bearerToken
    );

    const server = createMcpServer(api);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[kudoly-mcp] Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        });
      }
    }
  });

  app.get('/mcp', (_req: any, res: any) => methodNotAllowedResponse(res));
  app.delete('/mcp', (_req: any, res: any) => methodNotAllowedResponse(res));

  app.listen(MCP_PORT, MCP_HOST, (error?: Error) => {
    if (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }

    console.error(`[kudoly-mcp] Streamable HTTP server listening at ${localMcpServerUrl.href}`);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
