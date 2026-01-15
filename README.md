# MyDTU Slot Monitor

Hệ thống giám sát slot tín chỉ MyDTU - Nhận thông báo qua Telegram & Email khi có slot mở.

## 🚀 Tính năng

- ✅ Theo dõi slot tín chỉ từ trang courses.duytan.edu.vn
- ✅ Kiểm tra tự động mỗi 10 phút
- ✅ Thông báo qua Telegram
- ✅ Thông báo qua Email
- ✅ Dashboard quản lý danh sách theo dõi
- ✅ Tối đa 10 lớp theo dõi/người dùng

## 🛠 Tech Stack

- **Backend**: Cloudflare Workers + Hono.js
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS + Modern CSS
- **Email**: Resend
- **Notifications**: Telegram Bot API

## 📦 Cài đặt

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Tạo D1 Database

```bash
# Tạo database
npx wrangler d1 create mydtu-db

# Copy database_id vào wrangler.toml
```

### 3. Migrate database

```bash
# Local
npm run db:migrate

# Production
npm run db:migrate:prod
```

### 4. Cấu hình secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put RESEND_API_KEY
```

### 5. Setup Telegram Webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mydtu.indevs.in/api/telegram/webhook"
```

## 🏃 Development

```bash
npm run dev
```

## 🚀 Deployment

```bash
npm run deploy
```

## 📁 Cấu trúc

```
mydtu/
├── src/
│   ├── index.ts          # Entry point
│   ├── types.ts          # TypeScript types
│   ├── routes/
│   │   ├── auth.ts       # Auth endpoints
│   │   ├── watch.ts      # Watch list endpoints
│   │   └── telegram.ts   # Telegram webhook
│   ├── services/
│   │   ├── parser.ts     # HTML parser
│   │   └── cron.ts       # Cron handler
│   └── db/
│       └── schema.sql    # Database schema
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── wrangler.toml
└── package.json
```

## 📝 License

MIT
