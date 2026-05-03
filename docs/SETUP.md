# MVP родинного дерева

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
  - user DTO
- Cloudflare Worker API:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `POST /api/users`
  - `GET /api/signup/persons?q=...`
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
  - розширені demo persons
  - розширені demo relationships
  - admin user
- Angular frontend:
  - `/login`
  - `/users/new`
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
  - user create UI

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

`seed.sql` тепер містить більшу демо-родину з кількома поколіннями, sibling-гілками та кількома шлюбами. Вставки виконуються через `INSERT OR REPLACE`, тому seed зручно проганяти повторно під час локального тестування.

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

## Доступ до тестового користувача

- Електронна пошта: `admin@example.com`
- Password: `admin12345`

Увесь demo-набір людей і зв’язків прив’язаний саме до цього admin-акаунта. Під час реєстрації новий користувач або створює власну базову картку, або обирає себе зі списку вже наявних людей. Ця картка стає центральною людиною акаунта і доступна в хедері як `Мій профіль`.

## Важливо для deploy

- У `apps/api/wrangler.toml` зараз стоїть placeholder `database_id`.
- Перед реальним deploy треба створити D1 database в Cloudflare і підставити справжній `database_id`.
- Для production також варто задати production `SESSION_SECRET`.

## TODO

- Реєстрація відкрита публічно: немає ролей, invite-flow або approval-моделі для створення користувачів.
- Немає upload фото, тільки `photoUrl`.
- Немає автоматизованих тестів.
- Немає Cloudflare Pages/Workers CI-конфігурації.
- Немає production-ready hardening для auth cookie та секретів.
- Візуалізація дерева навмисно проста, без drag-and-drop editor.
- Додати посилання на соц мережі
