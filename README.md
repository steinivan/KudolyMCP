# Kudoly MCP

MCP Server para registrar reportes diarios de desarrolladores en Kudoly.

## Instalación

```bash
npm install
npm run build
```

## Configuración

Crear archivo `.env` con:

```env
KUDOLY_BASE_URL=https://tu-n8n.com/webhook
KUDOLY_API_TOKEN=tu-token-aqui
```

## Uso con Claude Desktop

Agregar a `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kudoly": {
      "command": "node",
      "args": ["C:/ruta/al/proyecto/dist/index.js"],
      "env": {
        "KUDOLY_BASE_URL": "https://tu-n8n.com/webhook",
        "KUDOLY_API_TOKEN": "tu-token"
      }
    }
  }
}
```

## Tool: submit_daily_report

Registra una actividad diaria con verificación de tarea en ClickUp.

### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| project_name | string | No | Nombre del proyecto (se intenta obtener de package.json si no se proporciona) |
| task_name | string | Sí | Nombre de la tarea en ClickUp |
| activities_string | string | Sí | Descripción de las actividades realizadas |
| status | enum | No | Estado: complete, progress, blocked, upcoming, qa (default: progress) |
| create_task | boolean | No | Si es true, crea la tarea en ClickUp si no existe (default: false) |
| clickup_status | string | No | Status de ClickUp para la nueva tarea (requerido si create_task=true) |

### Flujo

1. **Verificar tarea**: Llama al backend para verificar si la tarea existe en ClickUp
2. **Si no existe**: Retorna los statuses disponibles para que el usuario confirme la creación
3. **Guardar reporte**: Guarda el reporte (creando la tarea si fue confirmado)

### Respuestas

**Tarea encontrada y reporte guardado:**
```json
{
  "type": "save_report",
  "success": true,
  "daily_id": "uuid",
  "task_name": "Mi tarea",
  "task_created": false,
  "project_name": "mi-proyecto",
  "message": "Reporte guardado para la tarea \"Mi tarea\"."
}
```

**Tarea no encontrada (necesita confirmación):**
```json
{
  "type": "check_task",
  "task_found": false,
  "project_id": "uuid",
  "project_name": "mi-proyecto",
  "available_statuses": [
    {"status": "backlog", "color": "#gray"},
    {"status": "in progress", "color": "#blue"}
  ],
  "message": "La tarea \"Nueva tarea\" no existe en ClickUp. ¿Deseas crearla?"
}
```

**Error:**
```json
{
  "type": "error",
  "code": "PROJECT_NOT_FOUND",
  "message": "Proyecto \"xyz\" no encontrado.",
  "available_projects": ["proyecto-a", "proyecto-b"]
}
```

## Desarrollo

```bash
# Instalar dependencias
npm install

# Compilar
npm run build

# Ejecutar tests
npm test

# Tests con coverage
npm run test:coverage

# Modo desarrollo (watch)
npm run dev
```

## Estructura del Proyecto

```
src/
├── index.ts                    # Entry point, MCP server setup
├── tools/
│   └── submitDailyReport.ts    # Tool principal
├── services/
│   └── kudolyApi.ts            # Cliente HTTP para n8n
├── utils/
│   └── packageJson.ts          # Utilidad para leer package.json
└── types/
    └── index.ts                # Tipos TypeScript
```
