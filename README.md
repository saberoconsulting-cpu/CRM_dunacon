# CRM Inmobiliario 🏠

Sistema CRM para la gestión de lotes, planos interactivos SVG, clientes, ventas, pagos y finanzas de una inmobiliaria.

## Stack tecnológico

| Capa       | Tecnología                                                              |
|------------|-------------------------------------------------------------------------|
| Backend    | NestJS (10) · API REST · Arquitectura Hexagonal                         |
| Base datos | PostgreSQL 17 local · TypeORM 0.3 con **migraciones**                  |
| Auth       | JWT (Passport) · control de acceso por **roles** (superadmin/admin/agent) |
| Tiempo real| WebSockets con **Socket.IO** (NestJS gateway)                          |
| Frontend   | Next.js 14 · React · TypeScript · Tailwind CSS                          |
| Planos     | Imagen base (PNG/JPG/PDF→imagen) + **polígonos SVG** almacenados como JSONB |
| Mapas      | **MapLibre GL JS** + tiles OpenStreetMap (sin Google Maps de pago)      |

## Estructura del monorepo

```
crm_inmobiliario/
├── backend/                 # NestJS · Arquitectura hexagonal
│   └── src/
│       ├── main.ts          # Bootstrap Nest
│       ├── app.module.ts    # Integración de módulos + TypeORM
│       ├── config/
│       │   └── data-source.ts   # Fuente de datos TypeORM para migraciones
│       ├── database/migrations/  # Migraciones TypeORM (esquema + seed)
│       ├── shared/          # Capa transversal
│       │   ├── domain/      # Enums de dominio (estados, roles, colores)
│       │   ├── application/ # Guards JWT/Roles, decoradores
│       │   ├── infrastructure/
│       │   │   ├── entities/     # Entidades TypeORM (Adapter)
│       │   │   └── websocket/    # Gateway de eventos en tiempo real
│       └── modules/         # Módulos con arquitectura hexagonal
│           └── <MODULO>/
│               ├── domain/        # (cuando hay lógica pura de dominio)
│               ├── application/   # Casos de uso + DTOs + servicios
│               ├── interface/     # Controllers (REST)
│               └── <MODULO>.module.ts
└── frontend/                # Next.js · App Router (a implementar)
```

La arquitectura **hexagonal / puertos y adaptadores** separa la lógica de negocio
(`application`) de las tecnologías externas (`infrastructure`: TypeORM, Socket.IO).
El núcleo de negocio usa enums y reglas puras en `shared/domain`, mientras que los
adaptadores implementan los repositorios. Cada módulo agrupa su capa por responsabilidad.

## Módulos del backend

- `auth` — login, perfil, cambio de contraseña
- `users` — crear/editar Admin y Agente, activar/desactivar, auditoría, actividad
- `projects` — CRUD, portada, dashboard de proyecto, stats
- `plan` — editor de plano (imagen + SVG), manzanas, lotes, historial de estados
- `lots` — listado/filtros y ficha completa (pagado, saldo, historial)
- `clients` — leads/CRUD, pipeline, contactos, métricas por canal
- `campaigns` — campañas por canal con métricas (leads, CPL, ingreso)
- `sales` — ventas, comisión de agente, valida lote no re-vendible, ingreso financiero
- `payments` — reserva/adelanto/cuota, movimientos financieros inmutables, alertas
- `finances` — resumen ingreso/egreso/utilidad, gastos, ingreso extra, por categoría/proyecto
- `dashboards` — consolidado general, por proyecto y del agente
- websocket — eventos `lot.updated`, `payment.created`, `expense.created`, `sale.created`

## Base de datos y migraciones

La base se llama `crm_inmobiliario`.

```bash
cd backend
npm install
# Crear la base la primera vez (si no existe):
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE crm_inmobiliario;"

# Editar backend/.env con tus credenciales
# Ejecutar las migraciones (crea esquema + datos demo):
npm run migration:run

# Para generar/deshacer migraciones:
npm run migration:generate -- src/database/migrations/Nombre
npm run migration:revert
```

> ⚠️ **Credenciales de la base local**: la conexión usa `backend/.env`
> (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). Cambia la
> contraseña por la tuya en ese archivo.

### Migraciones incluidas

1. `1710000000000-InitialSchema` — crea todas las tablas, constraints e índices.
2. `1710000000001-Seed` — datos demo (usuarios, proyecto, plano, manzanas A/B/C, lotes, clientes, campañas).

### Usuarios demo (contraseña: `Admin150` — ver migración `1710000000007-UpdateCredentials`)

| Correo             | Rol        |
|--------------------|------------|
| admin@crm.com      | superadmin |
| gerente@crm.com    | admin      |
| Rene@crm.com       | agent (3.5%) |
| carlos@crm.com     | agent (3.0%) |

## Estados comerciales del lote (decisiones cerradas)

| Estado        | Color   | Acción financiera                                            |
|---------------|---------|--------------------------------------------------------------|
| Disponible    | 🟢 Verde | No genera movimiento                                        |
| Reservado     | 🟡 Amarillo | Registra ingreso de reserva                              |
| Con adelanto  | 🔵 Azul  | Pago parcial y actualiza saldo                               |
| Primera cuota | 🟣 Morado | Primera cuota y crea pagos pendientes                       |
| Vendido       | 🔴 Rojo  | Comisión del agente y venta en dashboards                   |

Cada pago crea una fila inmutable en `financial_transactions`, de modo que las
finanzas no dependen solo del estado visual del lote.

## Levantar el backend

```bash
cd backend
npm run start:dev        # http://localhost:3001/api
```

## Planes de lotización / plano interactivo

Se decide **no** detectar automáticamente lotes desde PDF. El administrador sube la
imagen del plano (PNG, JPG o PDF convertido a imagen) y dibuja **manualmente** los
polígonos SVG de manzanas y lotes, garantizando resultados exactos. Las coordenadas
se guardan como `JSONB` en `blocks.points` y `lots.points`.

---

*Proyecto de presentación. El almacenamiento es local (`uploads/`); la integración
con Google Drive queda como opcional futura.*
