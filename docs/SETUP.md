# Family Tree MVP

## Що вже зроблено

- Monorepo структура:
  - `apps/web`
  - `apps/api`
  - `packages/shared`
  - `docs`
- Shared DTO та типи для:
  - `Person`
  - `CreatePersonDto`
  - `UpdatePersonDto`
  - `Relationship`
  - `CreateRelationshipDto`
  - `TreeResponse`
  - auth DTO
- Cloudflare Worker API:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/persons`
  - `GET /api/persons/:id`
  - `POST /api/persons`
  - `PATCH /api/persons/:id`
  - `DELETE /api/persons/:id`
  - `GET /api/relationships?personId=...`
  - `POST /api/relationships`
  - `DELETE /api/relationships/:id`
  - `GET /api/search?q=...`
  - `GET /api/tree/:personId?up=2&down=2`
- D1:
  - schema migration
  - seed SQL
  - demo persons
  - demo relationships
  - admin user
- Angular frontend:
  - `/login`
  - `/persons`
  - `/persons/new`
  - `/persons/:id`
  - `/persons/:id/edit`
  - `/tree/:personId`
  - auth guard
  - login form
  - persons list
  - person form
  - person details
  - relationship form
  - search UI
  - tree UI

## Локальний запуск

### 1. Встановити залежності

```bash
npm install
```

### 2. Підготувати env для API

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Після цього замініть `SESSION_SECRET` у `apps/api/.dev.vars` на довгий випадковий рядок.

### 3. Підготувати локальну D1 базу

```bash
npm run db:migrate:local --workspace @family-tree/api
npm run db:seed:local --workspace @family-tree/api
```

### 4. Запустити backend

```bash
npm run dev --workspace @family-tree/api
```

API буде доступне на `http://localhost:8787`.

### 5. Запустити frontend

```bash
npm run dev --workspace @family-tree/web
```

Web буде доступний на `http://localhost:4200`.

## Seed доступ

- Email: `admin@example.com`
- Password: `admin12345`

## Важливо для deploy

- У `apps/api/wrangler.toml` зараз стоїть placeholder `database_id`.
- Перед реальним deploy треба створити D1 database в Cloudflare і підставити справжній `database_id`.
- Для production також варто задати production `SESSION_SECRET`.

## TODO

- Немає UI для створення нових користувачів, є лише seed admin.
- Немає upload фото, тільки `photoUrl`.
- Немає автоматизованих тестів.
- Немає Cloudflare Pages/Workers CI-конфігурації.
- Немає production-ready hardening для auth cookie та секретів.
- Візуалізація дерева навмисно проста, без drag-and-drop editor.
