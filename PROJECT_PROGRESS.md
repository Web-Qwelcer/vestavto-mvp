# VestAvto MVP — Project Progress

> Документ сгенеровано на основі аналізу реального коду. Остання дата: 2026-03-27.

---

## Архітектура

```
vestavto-mvp/
├── backend/              FastAPI + SQLAlchemy async + PostgreSQL (prod) / SQLite (dev)
│   ├── app/
│   │   ├── routes/       auth, products, orders, payments, delivery
│   │   ├── services/     monobank, novaposhta, telegram_notify, cloudinary_service
│   │   ├── models.py     SQLAlchemy ORM: Manager, Client, Product, Order, OrderItem, Payment
│   │   ├── schemas.py    Pydantic: request/response моделі
│   │   ├── auth.py       Telegram initData HMAC-SHA256 + JWT
│   │   ├── database.py   AsyncEngine + session dependency
│   │   └── admin.py      SQLAdmin панель (Manager/Client/Product/Order/Payment)
│   ├── main.py           FastAPI app, CORS, lifespan, маршрути
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/             React 18 + TypeScript + Vite + Tailwind CSS
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx        Каталог з фільтрами
│       │   ├── ProductPage.tsx     Деталі + carousel
│       │   ├── CartPage.tsx        Кошик
│       │   ├── CheckoutPage.tsx    Оформлення + оплата
│       │   ├── OrdersPage.tsx      Мої замовлення
│       │   ├── OrderPage.tsx       Деталі замовлення + трекінг
│       │   └── admin/
│       │       ├── ProductsPage.tsx  Менеджер: CRUD товарів + фото
│       │       └── OrdersPage.tsx    Менеджер: управління замовленнями
│       ├── store/
│       │   ├── auth.ts    Zustand (persists: token + isManager)
│       │   └── cart.ts    Zustand (persists: items)
│       ├── components/
│       │   └── Layout.tsx Header + nav + outlet
│       └── api.ts         Axios instance + auth interceptor
│
├── render.yaml           Backend: Render.com Docker + PostgreSQL free tier
└── docker-compose.yml    Local dev: backend + PostgreSQL + frontend
```

---

## Що реально працює (на основі коду)

### ✅ Авторизація
- Telegram initData HMAC-SHA256 валідація (`app/auth.py`)
- Підтримка **двох** bot токенів: `TELEGRAM_CLIENT_BOT_TOKEN` + `TELEGRAM_MANAGER_BOT_TOKEN`
- JWT 7 днів, persisted у Zustand localStorage
- Ролі: `client`, `manager`, `director`
- `GET /auth/me` — повертає поточного user + role
- auth_date перевіряється (не старше 24 год)

### ✅ Каталог товарів
- `GET /products` — фільтрація за `category`, `car_model`, `available_only`
- `GET /products/{id}` — деталі
- `GET /products/categories/list` + `GET /products/cars/list` — довідники
- Frontend: grid каталог, фільтри, перехід на деталі
- Фото: JSON масив URL, парситься Pydantic validator

### ✅ Кошик
- Zustand store з localStorage persistence
- addItem / removeItem / updateQuantity / clearCart
- Показує суму + мінімальний завдаток

### ✅ Checkout + Оплата (Monobank)
- `POST /orders` — створює замовлення, резервує товари (is_available = false)
- `POST /payments/create` — створює Monobank invoice (завдаток або повна сума)
- `POST /payments/webhook` — Monobank callback:
  - Записує Payment
  - Оновлює `order.paid_amount`
  - Background task: `create_ttn_for_order`
  - Надсилає Telegram сповіщення менеджеру
- `POST /payments/{id}/verify` — ручна верифікація (manager only)
- Відкриває payment URL через `Telegram.WebApp.openLink()` або `window.open()`

### ✅ Nova Poshta — Доставка
- `GET /delivery/cities?query=` — пошук міст
- `GET /delivery/warehouses?city_ref=&search=` — відділення
- `POST /delivery/{id}/create-ttn` — ручне створення ТТН (manager)
- `GET /delivery/{id}/track` — статус ТТН + автооновлення `order.status`
- `DELETE /delivery/{id}/ttn` — видалення ТТН
- BackwardDeliveryData (накладений платіж) для DEPOSIT_PAID замовлень
- `create_ttn_for_order` — автоматично після оплати (background task)

### ✅ Управління товарами (менеджер)
- CRUD: `POST/PUT/DELETE /products` (manager only)
- `POST /products/{id}/upload-image` — upload в Cloudinary (async via asyncio.to_thread)
- Форма: назва, опис, ціна, завдаток, категорія, авто, is_available
- Фото у формі: перегляд існуючих, видалення (кнопка ✕), додавання нових
- Atomic save: create → upload фото → одна кнопка, один процес
- Thumbnail click на item в списку → upload фото (multiple)

### ✅ Управління замовленнями (менеджер)
- `PATCH /orders/{id}/status` — оновити статус
  - При `cancelled` → повертає товари в наявність
  - При `paid/deposit_paid` → тригерить create_ttn background task
  - Зберігає timestamps: `paid_at`, `shipped_at`, `delivered_at`
- Status dropdown з українськими назвами
- Кнопка "Створити ТТН" для paid/deposit_paid замовлень

### ✅ Telegram сповіщення
- Нове замовлення → notification менеджеру
- Успішна оплата → notification менеджеру
- Помилка створення ТТН → error notification менеджеру
- `TELEGRAM_MANAGER_CHAT_IDS` — кома-розділений список (кілька менеджерів)
- parse_mode: HTML

### ✅ Cloudinary
- Upload фото через `cloudinary.uploader.upload()`
- Папка: `vestavto/products`
- Трансформація: 1200×1200 limit + quality auto:good
- Лазі import (`from app.services.cloudinary_service import upload_image` всередині функції)

### ✅ SQLAdmin панель
- `/admin` — логін username/password
- CRUD для: Manager, Client, Product, Order, Payment
- Конфігурація `form_columns` (замість `form_excluded_columns`) для сумісності sqladmin 0.16+

### ✅ Frontend — ProductPage Carousel
- Touch swipe (ліво/право, поріг 50px)
- Стрілки ‹ › (видимі тільки якщо є куди гортати)
- Dot-індикатори з click-to-jump
- Лічильник `1/N` у правому верхньому куті

### ✅ OrderPage — Кнопка оплати
- Показується якщо `status === 'new' || 'pending_payment'`
- Обраховує суму: завдаток або залишок (total - paid)
- `Telegram.WebApp.openLink()` з `window.open` fallback

---

## Що НЕ реалізовано / Потребує уваги

### ❌ Monobank Webhook Signature Verification
```python
# app/services/monobank.py
async def verify_webhook_signature(...) -> bool:
    # TODO: implement ECDSA verification for production
    return True  # завжди True
```
**Ризик:** будь-хто може надіслати фейковий webhook і підтвердити оплату.
**Що потрібно:** X-Sign header, ECDSA verification через Monobank public key.

### ❌ Mock режим Monobank не вимкнено примусово
```python
# app/services/monobank.py
if not MONOBANK_API_TOKEN:
    return {"invoice_id": "mock_...", "page_url": "https://mock..."}
```
Якщо `MONOBANK_API_TOKEN` не виставлений — замовлення "платяться" через mock. Потрібна перевірка в production.

### ❌ Пошук по каталогу
- `GET /products` підтримує `category` і `car_model` фільтри
- Пошук по назві (`q=`) — відсутній
- Frontend: немає текстового поля пошуку

### ❌ Pagination
- `GET /products` — без пагінації, повертає всі товари
- При великій кількості товарів — проблема продуктивності

### ❌ Видалення існуючого фото при редагуванні через бекенд
- Frontend: кнопка ✕ видаляє URL з `form.photos` → `PUT /products/{id}` з новим масивом ✅
- Але **старе фото залишається на Cloudinary** (немає `delete_image()` в `cloudinary_service.py`)
- Утримання: зайві ресурси на Cloudinary

### ❌ Tracking Auto-Refresh
- `GET /delivery/{id}/track` — оновлює `order.status` при виклику
- Але клієнт мусить вручну зайти на OrderPage і подивитись
- Немає фонового polling або webhook від Nova Poshta

### ❌ Статистика/Дашборд для менеджера
- `DashboardStats` schema є в `schemas.py`, але endpoint відсутній
- Немає сторінки зі статистикою продажів, виторгу, активних замовлень

### ❌ Блокування клієнтів
- `Client.is_blocked` поле є в моделі
- Немає перевірки при авторизації чи відкриванні нових замовлень

### ❌ Director роль
- `UserRole.director` є в enum
- `get_current_director()` dependency є в auth.py
- Ніде не використовується — немає director-specific endpoints або UI

### ⚠️ Менеджерський бот — чорний екран
- Причина: URL в BotFather Menu Button може бути невірним
- Має бути: `https://[vercel-domain]/admin/products`
- Перевірити через @BotFather → /mybots → @vestavto_manager_bot → Menu Button

### ⚠️ Продуктивність зображень
- `photos` зберігаються як JSON string у PostgreSQL TEXT колонці
- При великій кількості фото — нема оптимізації, lazy loading

---

## Env Variables

### Backend (Render.com)

| Variable | Обов'язкова | Де використовується |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Підпис JWT токенів |
| `TELEGRAM_CLIENT_BOT_TOKEN` | ✅ | Валідація initData клієнтів |
| `TELEGRAM_MANAGER_BOT_TOKEN` | ✅ | Валідація initData менеджерів |
| `TELEGRAM_MANAGER_CHAT_IDS` | ✅ | Куди надсилати сповіщення (comma-separated) |
| `MONOBANK_API_TOKEN` | ✅ | Monobank API (без нього — mock mode) |
| `MONOBANK_WEBHOOK_URL` | ✅ | URL для Monobank webhook callback |
| `NOVAPOSHTA_API_KEY` | ✅ | Nova Poshta API ключ |
| `NP_SENDER_REF` | ✅ | Ref відправника НП |
| `NP_CONTACT_SENDER_REF` | ✅ | Ref контакту відправника НП |
| `NP_SENDER_PHONE` | ✅ | Телефон відправника НП |
| `NP_CITY_SENDER_REF` | ✅ | Ref міста відправника НП |
| `NP_WAREHOUSE_SENDER_REF` | ✅ | Ref відділення відправника НП |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret |
| `ADMIN_USER` | ✅ | Логін SQLAdmin панелі |
| `ADMIN_PASS` | ✅ | Пароль SQLAdmin панелі |
| `FRONTEND_URL` | ✅ | CORS whitelist |
| `DEBUG` | ❌ | Режим дебагу |
| `PORT` | ❌ | Render автоматично виставляє 10000 |

### Frontend (Vercel)

| Variable | Обов'язкова | Де використовується |
|---|---|---|
| `VITE_API_URL` | ✅ | Backend API base URL |

---

## Важливі технічні рішення

### 1. Два Telegram боти
Клієнтський (`@vestavto_bot`) і менеджерський (`@vestavto_manager_bot`) боти.
`validate_init_data()` намагається обидва токени — будь-який валідний приймається.

### 2. Photos як JSON string
```python
# models.py
photos: Mapped[str] = mapped_column(Text, default="[]")

# schemas.py — validator парсить JSON
@field_validator('photos', mode='before')
def parse_photos(cls, v):
    if isinstance(v, str):
        return json.loads(v)
    return v or []
```
Зберігається як `'["url1","url2"]'` в PostgreSQL TEXT.

### 3. Lazy import Cloudinary
```python
# routes/products.py
async def upload_product_image(...):
    from app.services.cloudinary_service import upload_image  # lazy!
```
Причина: module-level import cloudinary ламав `GET /products` (asyncio context проблема).

### 4. Hooks до conditional returns (React)
```typescript
// Правильно:
const { data } = useQuery({...})          // ← всі хуки тут
const mutation = useMutation({...})

if (authLoading) return <Loading />       // ← conditional повернення після хуків
if (!isManager) return <Navigate to="/" />
```
Порушення цього правила призводило до empty edit fields і undefined behavior.

### 5. isSaving замість isPending для атомарного збереження
```typescript
// React Query isPending = false після mutationFn resolve
// onSuccess не входить в isPending window
// Тому: окремий useState для UX-контролю всього процесу
const [isSaving, setIsSaving] = useState(false)
const handleSave = async () => {
    setIsSaving(true)
    await api.post('/products', data)      // create
    await uploadPhotos(id, pendingPhotos)  // upload — кнопка все ще disabled
    setIsSaving(false)
}
```

### 6. Seeding pattern (prod)
Для seed даних в production використовується тимчасовий endpoint:
```python
# main.py — add → push → deploy (~90-180s) → use → remove → push
@app.post("/api/seed-manager")
async def seed_manager(x_admin_pass: str = Header(...)):
    ...
```

### 7. TTN автоматично після оплати
```python
# payments.py webhook handler
if payment_type == DEPOSIT:
    order.status = DEPOSIT_PAID
    background_tasks.add_task(create_ttn_for_order, order.id)
elif paid >= total:
    order.status = PAID
    background_tasks.add_task(create_ttn_for_order, order.id)
```
Payment method для НП: `Cash` (DEPOSIT_PAID) або `NonCash` (PAID).

### 8. BackwardDeliveryData
```python
"RedeliveryString": str(int(cash_on_delivery))  # залишок = total - paid
# НЕ: str(int(cost)) — то була вся сума товару
```

### 9. Tailwind custom color `ink`
```javascript
// tailwind.config.js
colors: { ink: '#1a1a2e' }
```
Потрібен тому що `--tg-theme-text-color` в Telegram dark theme стає білим,
що ламало текст на білому фоні карток.

---

## Deployment URLs

- **Backend:** `https://vestavto-backend-6keq.onrender.com`
- **Frontend:** Vercel (domain — перевірити в Vercel dashboard)
- **SQLAdmin:** `https://vestavto-backend-6keq.onrender.com/admin`
- **API docs:** `https://vestavto-backend-6keq.onrender.com/docs`

---

## Статус багів (хронологія git)

| Баг | Статус | Commit |
|---|---|---|
| GET /products 500 (cloudinary import) | ✅ Fixed | `943a559` |
| GET /products 500 (photos JSON parse) | ✅ Fixed | `de02030` |
| SQLAdmin crash on Products page | ✅ Fixed | `b7ed85f` |
| /admin/products redirect on reload | ✅ Fixed | `b7ed85f` |
| TTN не створювалась для deposit | ✅ Fixed | `65f2d30` |
| TTN: 6 підбагів (DateTime, env vars, etc) | ✅ Fixed | `65f2d30` |
| BackwardDeliveryData неправильна сума | ✅ Fixed | `94559ad` |
| Auth: тільки client bot token | ✅ Fixed | `72f42d6` |
| Payment URL в Mini App | ✅ Fixed | `2f062f6` |
| Білий текст на білому фоні | ✅ Fixed | `9f723b2` |
| Пусті поля при редагуванні (hooks order) | ✅ Fixed | `9f723b2` |
| Карусель фото на ProductPage | ✅ Fixed | `9f723b2` |
| Видалення існуючих фото | ✅ Fixed | `9f723b2` |
| Atomic save (create + upload) | ✅ Fixed | `9f723b2` |
| Monobank webhook signature | ❌ TODO | — |

---

## Бізнес-рішення (з планування)

| Рішення | Деталі |
|---------|--------|
| Завдаток | Сумується по кожному товару в кошику |
| Timeout 30 хв | Сповіщення менеджеру, НЕ авто-скасування |
| 2 замовлення від 1 клієнта | Об'єднувати в одну ТТН (TODO) |
| Зворотній зв'язок | Кнопка → прямий чат з менеджером в Telegram |

---

## TODO — План реалізації

### ~~1. Сповіщення клієнту в Telegram~~ ✅ DONE (`149c4ca`)

**Що:**
- Після оплати: "✅ Оплату отримано! Очікуйте відправлення."
- Після ТТН: "🚚 Замовлення відправлено. ТТН: {номер}. Відстежити: {link}"

**Як:**
1. Створити `services/telegram_client_notify.py` (аналог telegram_notify.py, але CLIENT_BOT_TOKEN)
2. В `payments.py` webhook після успішної оплати → `notify_client(telegram_id, message)`
3. В `novaposhta.py` після створення ТТН → `notify_client(telegram_id, message)`
4. Client.telegram_id вже є в моделі

**Файли:** `services/telegram_client_notify.py`, `routes/payments.py`, `services/novaposhta.py`

---

### ~~2. Timeout 30 хвилин~~ ✅ DONE (`next-commit`)

**Що:**
- Замовлення `new` або `pending_payment` більше 30 хв
- Менеджер отримує: "⚠️ Замовлення #{id} не оплачено 30+ хв. Клієнт: {name}, {phone}"
- НЕ скасовувати автоматично

**Як (Варіант — Background task):**
1. При створенні замовлення → `background_tasks.add_task(check_payment_timeout, order.id)`
2. `check_payment_timeout`: sleep 30 хв → перевірити статус → якщо ще не оплачено → notify_manager
3. Або: endpoint `GET /orders/check-timeouts` для виклику через Render Cron Job кожні 10 хв

**Файли:** `routes/orders.py` або `services/timeout_checker.py`

---

### 3. Кнопка "Запитати про товар" (Пріоритет: СЕРЕДНІЙ)

**Що:**
- На ProductPage кнопка "💬 Запитати про товар"
- Відкриває прямий чат з менеджером в Telegram
- Готовий текст: "Питання по товару: {назва} (ID: {id})"

**Як:**
1. В ProductPage додати кнопку біля "Додати в кошик"
2. onClick: `Telegram.WebApp.openTelegramLink('https://t.me/{MANAGER_USERNAME}?text=...')`
3. Додати env var `VITE_MANAGER_USERNAME` у Vercel (наприклад: `ivan_vestavto`)

**Файли:** `frontend/src/pages/ProductPage.tsx`, Vercel env vars

---

### 4. Косметика кольорів (Пріоритет: НИЗЬКИЙ)

- Замінити залишки #000000 на #1a1a2e (ink)
- Перевірити консистентність: HomePage, ProductPage, OrdersPage, Admin pages

---

### 5. Git cleanup перед передачею (Пріоритет: ПЕРЕД РЕЛІЗОМ)

- Видалити co-author Claude з комітів (git filter-branch або BFG)
- Перевірити що немає секретів в історії
- Squash commits якщо потрібно

---

## Порядок виконання

1. ✅ ~~Сповіщення клієнту~~ — DONE (`149c4ca`)
2. ✅ ~~Timeout 30 хв~~ — DONE
3. ✅ Далі: Кнопка "Запитати" (1 файл, 10 хв роботи)
4. 🔄 Косметика (можна паралельно)
5. 🔄 Git cleanup (перед релізом)
