ТЗ для Codex: MVP вебзастосунку Family Tree

Створи MVP вебзастосунку Family Tree для приватного використання однією родиною. Проєкт має бути максимально простим, дешевим у підтримці, безкоштовним у хостингу, без оверінжинірингу.

1. Мета проєкту

Потрібно створити вебзастосунок для:

збереження людей у сімейному дереві
створення базових родинних зв’язків
перегляду профілю людини
перегляду дерева відносно вибраної людини
простого пошуку по людях

Проєкт розрахований на маленьку кількість користувачів і невелику базу даних. Це не enterprise-система.

2. Головні технічні вимоги
   Стек

Використовуй такий стек:

Frontend: Angular
Backend: Cloudflare Workers
Database: Cloudflare D1
Deploy frontend: Cloudflare Pages
Deploy backend: Cloudflare Workers
Storage for photos: поки що не реалізовувати upload, тільки photoUrl
Архітектура репозиторію

Проєкт має бути monorepo зі структурою:

apps/
web/
api/
packages/
shared/
docs/
Принципи
TypeScript всюди
максимально простий код
без мікросервісів
без GraphQL
без Redis
без складної роле-бейзд системи
без складних abstraction layers
без зайвих бібліотек
3. Що має бути в MVP
   3.1. Авторизація

MVP авторизації має бути дуже проста:

login по email + password
без реєстрації через UI
користувач admin може бути створений через seed або SQL
захищені роуты для авторизованого користувача

Мінімум:

POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

Можна використати просту cookie-based auth або token-based auth. Рішення має бути простим і зрозумілим.

3.2. Люди

Має бути CRUD для людей.

Поля людини:

id
firstName — обов’язкове
lastName — опціональне
middleName — опціональне
maidenName — опціональне
gender — male | female | other | unknown
birthDate — опціональне
deathDate — опціональне
birthPlace — опціональне
deathPlace — опціональне
biography — опціональне
isLiving — boolean | null
photoUrl — опціональне
createdAt
updatedAt

API:

GET /api/persons
GET /api/persons/:id
POST /api/persons
PATCH /api/persons/:id
DELETE /api/persons/:id

UI:

список людей
створення людини
редагування людини
сторінка деталей людини
3.3. Родинні зв’язки

У MVP треба підтримати тільки 2 типи зв’язків:

parent_child
spouse

Поля:

id
type
person1Id
person2Id
startDate — опціональне
endDate — опціональне
notes — опціональне
createdAt

Логіка:

для parent_child: person1Id = parent, person2Id = child
для spouse: person1Id і person2Id — партнери

API:

GET /api/relationships?personId=...
POST /api/relationships
DELETE /api/relationships/:id

UI:

додавання зв’язку parent-child
додавання зв’язку spouse
видалення зв’язку
відображення зв’язків на сторінці людини
3.4. Дерево

Потрібен окремий endpoint для дерева:

GET /api/tree/:personId?up=2&down=2

Endpoint має:

брати центральну людину
знаходити її предків на up рівнів
знаходити її нащадків на down рівнів
знаходити партнерів
повертати дані у вигляді:
rootPersonId
persons[]
relationships[]

UI:

окрема сторінка дерева
дерево будується від вибраної людини
центральна людина в центрі
предки зверху
нащадки знизу
партнери збоку або на тому ж рівні

На старті візуалізація може бути простою. Не потрібно робити складний drag-and-drop tree editor.

3.5. Пошук

Потрібен базовий пошук:

по firstName
по lastName
по частковому збігу

API:

GET /api/search?q=...

UI:

input search
список результатів
перехід до профілю людини
4. Що не входить в MVP

Не реалізовувати зараз:

GEDCOM import/export
upload фото
ролі viewer/editor/admin через UI
історію змін
запрошення користувачів
складні permission rules
таймлайн життя людини
мапи
мультимедійний архів
складні споріднення як окремі сутності
двостороннє автоматичне редагування зв’язків через UI wizard
real-time updates
5. Початкова бізнес-логіка
   5.1. Головне правило доменної моделі

Не зберігати похідні зв’язки.

Зберігати тільки:

parent_child
spouse

Не зберігати окремо:

brother
sister
grandparent
grandchild
uncle
aunt

Такі зв’язки мають обчислюватися з базових зв’язків.

5.2. Як отримувати базові зв’язки
Батьки людини

Знайти всі зв’язки:

type = parent_child
person2Id = currentPersonId
Діти людини

Знайти всі зв’язки:

type = parent_child
person1Id = currentPersonId
Партнери

Знайти всі зв’язки:

type = spouse
де person1Id = currentPersonId або person2Id = currentPersonId
Брати / сестри
знайти батьків людини
знайти інших дітей цих батьків
виключити саму людину
у MVP це можна показувати на бекенді або не показувати взагалі, якщо логіка ще не готова
5.3. Логіка дерева

Tree endpoint має:

знайти root person
рекурсивно пройти вгору по parent_child
рекурсивно пройти вниз по parent_child
додати spouse зв’язки для людей, які потрапили в вибірку
повернути плоский набір persons і relationships

Не потрібно повертати складну вкладену JSON-ієрархію. Плоска структура простіша для фронту.

6. База даних

Створи D1 schema.

Таблиця users
CREATE TABLE users (
id TEXT PRIMARY KEY,
email TEXT NOT NULL UNIQUE,
password_hash TEXT NOT NULL,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
);
Таблиця persons
CREATE TABLE persons (
id TEXT PRIMARY KEY,
first_name TEXT NOT NULL,
last_name TEXT,
middle_name TEXT,
maiden_name TEXT,
gender TEXT NOT NULL DEFAULT 'unknown',
birth_date TEXT,
death_date TEXT,
birth_place TEXT,
death_place TEXT,
biography TEXT,
is_living INTEGER,
photo_url TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
);
Таблиця relationships
CREATE TABLE relationships (
id TEXT PRIMARY KEY,
type TEXT NOT NULL,
person1_id TEXT NOT NULL,
person2_id TEXT NOT NULL,
start_date TEXT,
end_date TEXT,
notes TEXT,
created_at TEXT NOT NULL,
FOREIGN KEY (person1_id) REFERENCES persons(id),
FOREIGN KEY (person2_id) REFERENCES persons(id)
);

Додай індекси на:

relationships.person1_id
relationships.person2_id
relationships.type
persons.first_name
persons.last_name
7. API-контракти
   DTO для Person

Створи типи для:

Person
CreatePersonDto
UpdatePersonDto
DTO для Relationship

Створи типи для:

Relationship
CreateRelationshipDto
DTO для Tree
type TreeResponse = {
rootPersonId: string;
persons: Person[];
relationships: Relationship[];
};

Винеси спільні типи в packages/shared.

8. Вимоги до frontend
   Сторінки

Потрібні сторінки:

/login
/persons
/persons/new
/persons/:id
/persons/:id/edit
/tree/:personId
UI мінімум
login form
persons list
person details
person form
relationship form
tree page
Стан

Не треба складного state management.
Використай:

Angular services
signals або RxJS, що простіше
Стилі

Мінімальний чистий UI.
Без важких дизайн-систем, якщо вони не потрібні.
Головне — функціональність і простота.

9. Вимоги до backend
   Структура

API має бути розділене логічно:

auth
persons
relationships
tree
search
Валідація

Потрібна базова серверна валідація:

firstName обов’язкове
type relationship має бути лише parent_child або spouse
не можна створювати relationship, де person1Id === person2Id
не можна створювати дублікати однакових relationship
не можна створювати relationship для неіснуючих persons
Обробка помилок

Потрібні нормальні HTTP status codes:

200
201
400
401
404
409
500
10. Seed дані

Потрібно підготувати:

1 admin user
кілька demo persons
кілька demo relationships

Це потрібно для локальної перевірки MVP.

11. Acceptance criteria

MVP вважається готовим, якщо:

Можна залогінитися під admin user
Можна відкрити список людей
Можна створити людину
Можна відредагувати людину
Можна видалити людину
Можна створити зв’язок parent-child
Можна створити зв’язок spouse
Можна переглянути профіль людини зі зв’язками
Можна виконати пошук по імені або прізвищу
Можна відкрити сторінку дерева для вибраної людини
Дані зберігаються в D1
Проєкт запускається локально без ручного хаосу
12. Що потрібно згенерувати на старті

На першому етапі створи:

Repo structure
apps/web
apps/api
packages/shared
Frontend
Angular app skeleton
routing
auth pages
persons pages
tree page
services for API calls
basic forms
Backend
Worker app skeleton
API routes
D1 integration
auth logic
CRUD logic
tree logic
search logic
Shared package
shared DTOs and types
Database
SQL schema
migrations
seed script
13. Головний пріоритет реалізації

Пріоритет такий:

repo structure
database schema
backend API skeleton
auth
persons CRUD
relationships CRUD
tree endpoint
frontend pages
search
polishing

Не треба намагатися зробити “ідеально”.
Треба зробити простий, working MVP.

14. Додаткові вимоги до коду
    пиши чистий, зрозумілий TypeScript
    не використовуй складні патерни без реальної потреби
    коментарі тільки там, де логіка неочевидна
    назви змінних і функцій мають бути простими і прямими
    не додавати зайвих залежностей
    якщо є вибір між “красиво, але складно” і “простішe, але надійно” — обирай простіше
15. Формат очікуваного результату від Codex

Потрібно:

згенерувати базову структуру проєкту
створити D1 schema і seed
створити API routes
створити Angular pages/components/services
зв’язати frontend з backend
дати коротку інструкцію запуску локально
явно позначити, що зроблено, а що лишилося TODO