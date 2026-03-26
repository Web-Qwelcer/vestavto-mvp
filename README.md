# VestAvto MVP

Telegram Mini App магазин б/у автозапчастин.

## Stack

- **Backend:** FastAPI + SQLAlchemy + SQLite/PostgreSQL
- **Frontend:** React + TypeScript + Tailwind + Vite
- **Admin:** SQLAdmin
- **Payments:** Monobank API
- **Delivery:** Nova Poshta API

## Quick Start

### 1. Backend

```bash
cd backend

# Створити .env
cp .env.example .env
# Заповнити реальними ключами!

# Встановити залежності
pip install -r requirements.txt

# Запустити
python main.py
```

Backend доступний на http://localhost:8000
- API docs: http://localhost:8000/docs
- Admin panel: http://localhost:8000/admin (admin / vestavto2026)

### 2. Frontend

```bash
cd frontend

# Встановити залежності
npm install

# Створити .env
echo "VITE_API_URL=http://localhost:8000/api" > .env

# Запустити
npm run dev
```

Frontend доступний на http://localhost:5173

### 3. Docker (optional)

```bash
docker-compose up -d
```

## Environment Variables

### Backend (.env)

```
# Telegram
TELEGRAM_CLIENT_BOT_TOKEN=your_bot_token
TELEGRAM_MANAGER_BOT_TOKEN=your_manager_bot_token

# Auth
JWT_SECRET=your-secret-key
ADMIN_USER=admin
ADMIN_PASS=your-admin-password

# Monobank
MONOBANK_API_TOKEN=your_monobank_token
MONOBANK_WEBHOOK_URL=https://your-domain.com/api/payments/webhook

# Nova Poshta
NOVAPOSHTA_API_KEY=your_np_key
NP_SENDER_REF=...
NP_CONTACT_SENDER_REF=...
NP_SENDER_PHONE=380...
NP_CITY_SENDER_REF=...
NP_WAREHOUSE_SENDER_REF=...

# Database (optional, default SQLite)
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/vestavto
```

### Frontend (.env)

```
VITE_API_URL=https://your-backend.com/api
```

## API Endpoints

### Auth
- `POST /api/auth/telegram` — авторизація через initData
- `GET /api/auth/me` — поточний користувач

### Products
- `GET /api/products` — список товарів
- `GET /api/products/{id}` — деталі товару
- `POST /api/products` — створити (manager)
- `PUT /api/products/{id}` — оновити (manager)
- `DELETE /api/products/{id}` — видалити (manager)

### Orders
- `POST /api/orders` — створити замовлення
- `GET /api/orders` — список замовлень
- `GET /api/orders/{id}` — деталі
- `PATCH /api/orders/{id}/status` — оновити статус (manager)

### Payments
- `POST /api/payments/create` — створити рахунок Monobank
- `POST /api/payments/webhook` — webhook Monobank
- `POST /api/payments/{order_id}/verify` — ручна верифікація (manager)

### Delivery
- `GET /api/delivery/cities?query=` — пошук міст НП
- `GET /api/delivery/warehouses?city_ref=` — відділення
- `POST /api/delivery/{order_id}/create-ttn` — створити ТТН (manager)
- `GET /api/delivery/{order_id}/track` — трекінг

## Deploy

### Render (Backend)

1. Create Web Service
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables

### Vercel (Frontend)

1. Import from GitHub
2. Framework: Vite
3. Add `VITE_API_URL` environment variable

### Telegram Bot Setup

1. Set WebApp URL in BotFather:
   ```
   /setmenubutton
   @vestavto_client_bot
   https://your-frontend.vercel.app
   ```

## Додати менеджера

```sql
INSERT INTO managers (telegram_id, full_name, role, is_active)
VALUES (123456789, 'Ім''я Менеджера', 'manager', true);
```

Або через SQLAdmin: http://localhost:8000/admin

## Flow

1. Клієнт відкриває Mini App → авторизація через initData
2. Переглядає каталог → додає в кошик
3. Оформлює замовлення → вибирає НП відділення
4. Оплачує через Monobank (завдаток або повна)
5. Webhook підтверджує оплату → автоматично створюється ТТН
6. Клієнт відстежує статус доставки
