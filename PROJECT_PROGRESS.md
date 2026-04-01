# VestAvto MVP — Project Progress

> Останнє оновлення: 2026-04-01

---

## Архітектура

```
vestavto-mvp/
├── backend/              FastAPI + SQLAlchemy async + PostgreSQL (prod) / SQLite (dev)
│   ├── app/
│   │   ├── routes/       auth, products, orders, payments, delivery
│   │   ├── services/     monobank, novaposhta, telegram_notify, cloudinary_service
│   │   ├── models.py     SQLAlchemy ORM: Manager, Client, Product, Order, OrderItem, Payment
│   │   ├── schemas.py    Pydantic v2: request/response моделі
│   │   ├── auth.py       Telegram initData HMAC-SHA256 + JWT
│   │   ├── database.py   AsyncEngine + per-migration transactions
│   │   └── admin.py      SQLAdmin панель
│   ├── main.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/             React 18 + TypeScript + Vite + Tailwind CSS
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx          Каталог з фільтрами + inline пошук
│       │   ├── ProductPage.tsx       Деталі + carousel + deep link target
│       │   ├── CartPage.tsx          Кошик
│       │   ├── CheckoutPage.tsx      Оформлення + НП + оплата
│       │   ├── OrdersPage.tsx        Мої замовлення
│       │   ├── OrderPage.tsx         Деталі замовлення + трекінг
│       │   └── admin/
│       │       ├── ProductsPage.tsx  CRUD товарів + full-screen modal + inline пошук
│       │       └── OrdersPage.tsx    Управління замовленнями
│       ├── store/
│       │   ├── auth.ts    Zustand (persists: token + isManager)
│       │   ├── cart.ts    Zustand (persists: items)
│       │   └── toast.ts   Zustand (in-app toast notifications)
│       ├── components/
│       │   ├── Layout.tsx  Header + nav + outlet
│       │   └── Toast.tsx   In-app toast (success/error/info, 2.8s auto-hide)
│       └── api.ts          Axios instance + auth interceptor
│
├── render.yaml           Backend: Render.com Docker + PostgreSQL
└── docker-compose.yml    Local dev
```

---

## ✅ Реалізовано

### Авторизація
- Telegram initData HMAC-SHA256 валідація
- Два bot токени: `TELEGRAM_CLIENT_BOT_TOKEN` + `TELEGRAM_MANAGER_BOT_TOKEN`
- JWT 7 днів, persisted у Zustand localStorage
- Ролі: `client`, `manager`, `director`
- auth_date перевіряється (не старше 24 год)

### Каталог товарів
- Фільтрація за `category`, `car_model`, `available_only`
- Пошук inline: autocomplete dropdown, відкривається від лупи (замінює кнопки)
- Публічний каталог не показує `is_reserved=true` і `is_available=false` товари
- Deep link: `t.me/vestavto_client_bot/shop?startapp=product_XX` → відкриває ProductPage

### Товар — статуси (is_available + is_reserved)
- **В наявності** (`is_available=true, is_reserved=false`) — видно в каталозі, можна купити
- **Заброньовано** (`is_available=true, is_reserved=true`) — приховано з каталогу, доступно по прямому посиланню (deep link)
- **Продано** (`is_available=false`) — показується сіра кнопка "Продано"

### Договірна ціна (is_negotiable)
- Чекбокс у формі адмінки, ховає поля ціни/завдатку
- В каталозі показує "Ціна договірна"
- На ProductPage показує кнопку "💬 Запитати ціну" → Telegram DM до менеджера
- Excel export/import підтримує поле

### Кошик
- Zustand + localStorage persistence
- addItem / removeItem / updateQuantity / clearCart
- Toast "Додано в кошик" при додаванні

### Checkout + Oплата (Monobank)
- Валідація: ім'я (2+ слова), телефон (10 цифр)
- Nova Poshta autocomplete: міста + відділення
- Тип оплати: завдаток або повна
- POST /orders → POST /payments/create → openLink (Monobank)
- Monobank webhook: ECDSA підпис верифікується через public key API

### Nova Poshta — Доставка
- Пошук міст + відділень (autocomplete)
- Ручне та автоматичне (після webhook) створення ТТН
- Трекінг статусу ТТН
- BackwardDeliveryData (накладений платіж) для DEPOSIT_PAID замовлень

### Управління товарами (менеджер)
- CRUD: POST/PUT/DELETE (manager only)
- Full-screen modal форма (не треба скролити)
- Inline пошук (замінює рядок кнопок, як у магазині)
- Dropdown статусів: В наявності / Заброньовано / Продано
- Кнопка 🔗 копіює deep link товару в буфер обміну
- Фото: Cloudinary upload, перегляд, видалення, atomic save
- Excel: export (id/name/desc/price/deposit/category/car_model/is_available/is_negotiable/is_reserved), import з id-or-name lookup

### Управління замовленнями (менеджер)
- Статус dropdown з українськими назвами
- Розгорнуті картки з позиціями товарів (ID + назва + кількість)
- Редагування контактних даних (до створення ТТН)
- Ручне створення ТТН

### Telegram сповіщення
- Нове замовлення → менеджеру
- Успішна оплата → менеджеру + клієнту
- ТТН створено → клієнту
- Помилка ТТН → менеджеру
- `TELEGRAM_MANAGER_CHAT_IDS` — кілька менеджерів

### Toast повідомлення (замість alert)
- Компонент `Toast.tsx` — фіксований внизу, fade in/out, 2.8 сек
- success / error / info типи
- Замінено всі `alert()` в AdminProductsPage та AdminOrdersPage
- "Додано в кошик", "Товар збережено", "Статус оновлено", "ТТН створено" тощо

### Security
- Monobank webhook: ECDSA signature verification (cryptography lib)
- Публічний ключ кешується в пам'яті, отримується від `api.monobank.ua/api/merchant/pubkey`
- Невалідний підпис → 400 + лог з IP
- JWT_SECRET обов'язковий env var
- Telegram initData HMAC-SHA256

### Deep links
- Формат: `https://t.me/vestavto_client_bot/shop?startapp=product_25`
- `StartParamHandler` в App.tsx читає `initDataUnsafe.start_param` один раз при mount
- `useRef` флаг — navigate тільки раз, не блокує подальшу навігацію
- `replace: true` — back button веде на головну

### Cloudinary
- Upload фото через multipart POST
- Папка: `vestavto/products`, трансформація 1200×1200, quality auto:good

### SQLAdmin
- `/admin` — CRUD для Manager, Client, Product, Order, Payment

### Розподіл інтерфейсів (клієнт / менеджер)
- `validate_init_data` повертає `(TelegramUser, bot_mode)` — визначає по HMAC якому боту належить initData
- Клієнтський бот: завжди `role=client`, незалежно від таблиці managers
- Менеджерський бот: перевіряє таблицю managers, повертає 403 для чужих
- `bot_mode` повертається в `TokenResponse`, зберігається в Zustand (persisted)
- Фронтенд: `IndexRoute` редіректить на `/admin/products` якщо `botMode=manager`
- Менеджерська навігація: 📦 Товари | 📋 Замовлення | 📊 Аналітика (без "Магазин" для manager bot)

### Трекінг джерел трафіку (source)
- `clients.source` і `orders.source` — VARCHAR(200) NULL
- Парсинг `start_param` на фронтенді при mount:
  - `product_25` → `product_deeplink`
  - `src_facebook_may` → `facebook_may`
  - порожній → `direct`
- При авторизації нового клієнта — зберігається source
- При існуючому клієнті — оновлюється якщо було NULL (перший deep link)
- При створенні замовлення — source копіюється з клієнта в order
- `GET /api/admin/analytics/sources` — агрегована таблиця: source | clients | orders

### Аналітика (адмін-панель)
- Нова сторінка `/admin/analytics` — `AdminAnalyticsPage.tsx`
- Таблиця: Джерело | Клієнтів | Замовлень + рядок "Всього"
- Сортування по клієнтах (desc) на бекенді

---

## TODO перед production

### Платіжна система (вибрати варіант)
- **Варіант 1**: Monobank Acquiring (клієнт відкриває ФОП) — поточна інтеграція готова, замінити тестовий токен
- **Варіант 2**: LiqPay (ПриватБанк) — потребує окремої інтеграції
- Перевірити що `MONOBANK_API_TOKEN` встановлений в prod (інакше mock режим)

### Аналітика / трекінг
- Трекінг джерел трафіку через `?start=` параметр (перед запуском реклами)
- Опціонально: власний домен, VPS

### Дрібниці
- Автоматичне оновлення статусу доставки (polling або NP webhook)
- Об'єднання ТТН для кількох замовлень одного клієнта
- Видалення старих фото з Cloudinary при редагуванні товару

### Розширена аналітика (пост-MVP)
- Таблиця `analytics_events`: events-based воронка (session_start → product_view → order_created → payment_completed)
- Конверсія між кроками воронки
- Графіки по днях (сесії, замовлення, revenue)
- Per-product аналітика (перегляди, конверсія)
- `analytics_sessions` для точної атрибуції по сесіях

---

## Виправлені баги (хронологія)

| Баг | Статус | Commit |
|---|---|---|
| GET /products 500 (cloudinary import) | ✅ Fixed | `943a559` |
| GET /products 500 (photos JSON parse) | ✅ Fixed | `de02030` |
| SQLAdmin crash on Products page | ✅ Fixed | `b7ed85f` |
| TTN не створювалась для deposit | ✅ Fixed | `65f2d30` |
| BackwardDeliveryData неправильна сума | ✅ Fixed | `94559ad` |
| Auth: тільки client bot token | ✅ Fixed | `72f42d6` |
| Payment URL в Mini App | ✅ Fixed | `2f062f6` |
| Білий текст на білому фоні (Tailwind ink) | ✅ Fixed | `9f723b2` |
| Пусті поля при редагуванні (hooks order) | ✅ Fixed | `9f723b2` |
| Atomic save (create + upload фото) | ✅ Fixed | `9f723b2` |
| parseFloat NaN при збереженні ціни | ✅ Fixed | `b4306eb` |
| is_available зникає при збереженні | ✅ Fixed | `b4306eb` |
| PostgreSQL міграції — aborted transaction | ✅ Fixed | `96545bc` |
| Deep link navigate спрацьовує повторно | ✅ Fixed | `a58d8df` |
| Monobank webhook без підпису | ✅ Fixed | `2ce2243` |

---

## Важливі технічні рішення

### 1. PostgreSQL міграції — кожна в окремій транзакції
```python
# БУЛО: одна транзакція — якщо ALTER TABLE fails → вся TX aborted
async with engine.begin() as conn:
    ALTER TABLE is_negotiable  # FAIL → TX вбита
    ALTER TABLE is_reserved    # ігнорується

# СТАЛО: ізольовані транзакції
for sql in migrations:
    try:
        async with engine.begin() as conn:
            await conn.execute(text(sql))
    except Exception:
        pass  # column already exists — OK
```

### 2. Два Telegram боти
`validate_init_data()` намагається обидва токени — будь-який валідний приймається.

### 3. Photos як JSON string
```python
photos: Mapped[str] = mapped_column(Text)
# Pydantic field_validator парсить при відповіді
```

### 4. isSaving замість isPending
React Query `isPending` = false після `mutationFn` resolve, але `onSuccess` ще виконується.
Окремий `useState(isSaving)` контролює весь процес create → upload фото.

### 5. Deep link — navigate тільки раз
```typescript
const handled = useRef(false)
useEffect(() => {
    if (handled.current) return
    handled.current = true
    // navigate(...)
}, [])
```

### 6. Tailwind custom color `ink`
`#1a1a2e` — замість `text-color` з Telegram theme (білий у dark mode ламав UI).

---

## Env Variables

### Backend (Render.com)

| Variable | Обов'язкова | Де |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL |
| `JWT_SECRET` | ✅ | JWT підпис |
| `TELEGRAM_CLIENT_BOT_TOKEN` | ✅ | Валідація initData |
| `TELEGRAM_MANAGER_BOT_TOKEN` | ✅ | Валідація initData |
| `TELEGRAM_MANAGER_CHAT_IDS` | ✅ | Сповіщення (comma-separated) |
| `MONOBANK_API_TOKEN` | ✅ | Monobank API (без нього — mock) |
| `MONOBANK_WEBHOOK_URL` | ✅ | Webhook callback URL |
| `NOVAPOSHTA_API_KEY` | ✅ | НП API ключ |
| `NP_SENDER_REF` | ✅ | Ref відправника НП |
| `NP_CONTACT_SENDER_REF` | ✅ | Ref контакту |
| `NP_SENDER_PHONE` | ✅ | Телефон відправника |
| `NP_CITY_SENDER_REF` | ✅ | Ref міста відправника |
| `NP_WAREHOUSE_SENDER_REF` | ✅ | Ref відділення відправника |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary |
| `ADMIN_USER` | ✅ | SQLAdmin логін |
| `ADMIN_PASS` | ✅ | SQLAdmin пароль |
| `FRONTEND_URL` | ✅ | CORS whitelist |

### Frontend (Vercel)

| Variable | Обов'язкова | Де |
|---|---|---|
| `VITE_API_URL` | ✅ | Backend API base URL |
| `VITE_BOT_USERNAME` | ✅ | Deep link генерація |
| `VITE_MANAGER_USERNAME` | ✅ | "Запитати" кнопка |

---

## Deployment URLs

- **Backend:** `https://vestavto-backend-6keq.onrender.com`
- **Frontend:** `https://vestavto-mvp.vercel.app`
- **SQLAdmin:** `https://vestavto-backend-6keq.onrender.com/admin`
- **API docs:** `https://vestavto-backend-6keq.onrender.com/docs`
- **Mini App:** `https://t.me/vestavto_client_bot/shop`
