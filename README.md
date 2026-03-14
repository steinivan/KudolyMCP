# Kudoly MCP

MCP Server para registrar dailies, devlogs y tiempo en Kudoly.

## Instalacion

```bash
npm install
npm run build
```

## Configuracion

Crea un archivo `.env`:

```env
KUDOLY_BASE_URL=https://tu-app-kudoly.com
KUDOLY_API_TOKEN=tu-token-de-kudoly
```

`KUDOLY_BASE_URL` debe apuntar a la app Next de Kudoly. Los tools MCP usan el backend web de Kudoly, no los webhooks de n8n.

## Uso con Claude Desktop

Agrega esto a `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kudoly": {
      "command": "node",
      "args": ["C:/ruta/al/proyecto/dist/index.js"],
      "env": {
        "KUDOLY_BASE_URL": "https://tu-app-kudoly.com",
        "KUDOLY_API_TOKEN": "tu-token-de-kudoly"
      }
    }
  }
}
```

## Tool: submit_daily_report

Registra una actividad diaria con verificacion de tarea en ClickUp.

### Parametros

| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| project_name | string | No | Nombre del proyecto. Si falta, se intenta inferir desde `package.json`. |
| task_name | string | Si | Nombre de la tarea en ClickUp. |
| activities_string | string | Si | Descripcion de las actividades realizadas. |
| status | enum | No | `complete`, `progress`, `blocked`, `upcoming`, `qa`. |
| create_task | boolean | No | Si es `true`, crea la tarea en ClickUp si no existe. |
| clickup_status | string | No | Status de ClickUp para la nueva tarea. |

## Tool: generate_devlog

Genera y guarda un archivo `DEVLOG.md` como adjunto en una tarea de ClickUp.

## Tool: log_time_entry

Registra una entrada de tiempo en el dashboard `Time` de Kudoly.

Usalo para carga retroactiva o manual. Si quieres medir trabajo en tiempo real, usa `start_task_timer` y `stop_task_timer`.

### Parametros principales

| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| project_name | string | No | Proyecto en Kudoly. |
| task_name | string | No | Tarea a reutilizar o crear. |
| description | string | No | Descripcion de la entrada de tiempo. |
| duration_hours | number | No | Horas consumidas. |
| duration_minutes | number | No | Minutos consumidos. |
| non_technical_summary | string | No | Resumen para negocio o stakeholders. |
| technical_summary | string | No | Resumen tecnico. |
| notes | string | No | Contexto adicional. |
| status | enum | No | `todo`, `in_progress`, `done`. |

Debes informar `task_name` o `description`, y la duracion total debe ser mayor a 0.

## Tool: start_task_timer

Inicia un timer activo en Kudoly para una tarea real de trabajo.

Parametros principales:

| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| project_name | string | No | Proyecto en Kudoly. Se intenta resolver por similitud. |
| task_name | string | No | Tarea a reutilizar o crear. |
| task_id | string | No | ID de tarea si ya fue resuelto antes. |
| description | string | No | Descripcion breve del bloque que empieza. |
| non_technical_summary | string | No | Objetivo no tecnico del bloque. |
| technical_summary | string | No | Objetivo tecnico del bloque. |

Debes informar `task_id`, `task_name` o `description`.

## Tool: stop_task_timer

Detiene un timer activo y registra el bloque trabajado.

Parametros principales:

| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| task_id | string | No | ID exacto de la tarea. |
| task_name | string | No | Nombre de la tarea si no tienes el ID. |
| project_name | string | No | Ayuda a resolver la tarea correcta. |
| description | string | No | Descripcion final del bloque. |
| notes | string | No | Contexto adicional o links. |
| non_technical_summary | string | No | Resumen final para negocio. |
| technical_summary | string | No | Resumen final tecnico. |
| status | enum | No | `todo`, `in_progress`, `done`. Default: `done`. |

Si no informas `task_id` ni `task_name`, el backend solo podra resolverlo cuando haya un unico timer activo.

## Tool: cancel_task_timer

Cancela un timer activo sin registrar tiempo. Sirve para timers iniciados por error o trabajo demasiado pequeno para merecer una entrada.

## Desarrollo

```bash
npm install
npm run build
npm test
npm run test:coverage
npm run dev
```

## Estructura del proyecto

```text
src/
|-- index.ts
|-- tools/
|-- services/
|-- utils/
`-- types/
```
