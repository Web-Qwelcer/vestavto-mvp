# VestAvto MVP

Telegram Mini App — магазин б/у автозапчастин для Skoda Superb / VW Passat / Touareg.

## Tech Stack

| Шар | Технологія |
|---|---|
| Backend | FastAPI + SQLAlchemy async + PostgreSQL |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State | Zustand (cart, auth, toast) |
| Data fetching | TanStack React Query v5 |
| Payments | Monobank Acquiring (ECDSA webhook verification) |
| Delivery | Nova Poshta API (TTN creation + tracking) |
| Storage | Cloudinary (product photos) |
| Auth | Telegram initData HMAC-SHA256 + JWT |
| Deploy | Render (backend) + Vercel (frontend) |

## Основні функції

**Клієнт:**
- Каталог з фільтрами (категорія, модель авто) та пошуком
- Сторінка товару з каруселлю фото
- Кошик + оформлення замовлення (Nova Poshta autocomplete)
- Оплата через Monobank (завдаток або повна сума)
- Відстеження статусу замовлення та ТТН
- Deep links: `t.me/vestavto_client_bot/shop?startapp=product_25`
- Кнопка "Запитати ціну" → Telegram DM до менеджера

**Менеджер:**
- CRUD товарів (full-screen modal, фото upload на Cloudinary)
- Статуси товарів: В наявності / Заброньовано / Продано
- Бронювання: товар прихований з каталогу, але доступний по прямому посиланню
- Договірна ціна (is_negotiable)
- Управління замовленнями: статуси, контактні дані, ТТН
- Excel імпорт/експорт товарів
- Копіювання deep link товару
- Inline пошук по ID та назві

## Запуск локально

### Backend

```bash
cd backend
cp .env.example .env   # заповнити ключами
pip install -r requirements.txt
python main.py
```

- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Admin: http://localhost:8000/admin

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000/api" > .env
npm run dev
```

- App: http://localhost:5173

### Docker (опціонально)

```bash
docker-compose up -d
```

## Змінні середовища

### Backend (.env)

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/vestavto

# Auth
JWT_SECRET=your-secret-key-min-32-chars

# Telegram
TELEGRAM_CLIENT_BOT_TOKEN=...
TELEGRAM_MANAGER_BOT_TOKEN=...
TELEGRAM_MANAGER_CHAT_IDS=123456789,987654321

# Monobank
MONOBANK_API_TOKEN=...
MONOBANK_WEBHOOK_URL=https://your-backend.onrender.com/api/payments/webhook

# Nova Poshta
NOVAPOSHTA_API_KEY=...
NP_SENDER_REF=...
NP_CONTACT_SENDER_REF=...
NP_SENDER_PHONE=380...
NP_CITY_SENDER_REF=...
NP_WAREHOUSE_SENDER_REF=...

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Admin panel
ADMIN_USER=admin
ADMIN_PASS=your-password

# CORS
FRONTEND_URL=https://your-app.vercel.app
```

### Frontend (.env)

```env
VITE_API_URL=https://your-backend.onrender.com/api
VITE_BOT_USERNAME=vestavto_client_bot
VITE_MANAGER_USERNAME=your_manager_telegram
```

## Структура проєкту

```
vestavto-mvp/
├── backend/
│   ├── app/
│   │   ├── routes/         auth, products, orders, payments, delivery
│   │   ├── services/       monobank, novaposhta, telegram_notify, cloudinary
│   │   ├── models.py       ORM моделі
│   │   ├── schemas.py      Pydantic v2 схеми
│   │   ├── auth.py         Telegram + JWT
│   │   └── database.py     AsyncEngine + міграції
│   ├── main.py
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── HomePage.tsx
        │   ├── ProductPage.tsx
        │   ├── CartPage.tsx
        │   ├── CheckoutPage.tsx
        │   ├── OrdersPage.tsx
        │   ├── OrderPage.tsx
        │   └── admin/
        │       ├── ProductsPage.tsx
        │       └── OrdersPage.tsx
        ├── store/           auth, cart, toast (Zustand)
        ├── components/      Layout, Toast
        └── api.ts           Axios + interceptors
```

## API

### Auth
```
POST /api/auth/telegram     Авторизація через initData
GET  /api/auth/me           Поточний користувач
```

### Products
```
GET    /api/products              Список (фільтри: category, car_model, available_only)
GET    /api/products/{id}         Деталі
POST   /api/products              Створити (manager)
PUT    /api/products/{id}         Оновити (manager)
DELETE /api/products/{id}         Видалити (manager)
POST   /api/products/{id}/upload-image  Завантажити фото (manager)
GET    /api/products/export       Excel export (manager)
POST   /api/products/import       Excel import (manager)
```

### Orders
```
POST   /api/orders                Створити замовлення
GET    /api/orders                Список (manager — всі, client — свої)
GET    /api/orders/{id}           Деталі
PATCH  /api/orders/{id}/status    Оновити статус (manager)
PATCH  /api/orders/{id}/contact   Редагувати контакт (manager)
```

### Payments
```
POST /api/payments/create         Створити Monobank invoice
POST /api/payments/webhook        Webhook від Monobank (ECDSA verified)
POST /api/payments/{id}/verify    Ручна верифікація (manager)
```

### Delivery
```
GET  /api/delivery/cities         Пошук міст НП
GET  /api/delivery/warehouses     Відділення НП
POST /api/delivery/{id}/create-ttn  Створити ТТН (manager)
GET  /api/delivery/{id}/track     Трекінг
```

## Deploy

### Render (Backend)

1. Створити Web Service з GitHub
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Додати всі env vars
5. Додати PostgreSQL addon

### Vercel (Frontend)

1. Import з GitHub
2. Framework: Vite
3. Додати `VITE_API_URL`, `VITE_BOT_USERNAME`, `VITE_MANAGER_USERNAME`

### Telegram BotFather

```
/mybots → @vestavto_client_bot → Bot Settings → Menu Button
URL: https://your-app.vercel.app

Mini App (для deep links):
/newapp → short name: shop → URL: https://your-app.vercel.app
```

## Додати менеджера

Через SQLAdmin (`/admin`) або SQL:

```sql
INSERT INTO managers (telegram_id, full_name, role, is_active)
VALUES (123456789, 'Ім''я Менеджера', 'manager', true);
```

## Флоу оплати

```
Клієнт оформляє замовлення
  → POST /orders (створюється в БД)
  → POST /payments/create (Monobank invoice)
  → Клієнт оплачує на сторінці Monobank
  → Monobank надсилає webhook (X-Sign ECDSA)
  → Backend верифікує підпис
  → Оновлює статус замовлення
  → Background task: створює ТТН (Nova Poshta)
  → Сповіщення клієнту + менеджеру в Telegram
```
