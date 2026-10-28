# The Gourmet Walk

React + Vite frontend with an Express API, MySQL persistence, optional SMTP notifications, and optional Stripe Checkout.

## Requirements

- Node.js 20 or later
- npm
- MySQL 8-compatible database

## Run locally

1. Install dependencies: npm ci
2. Copy .env.example to .env and fill in your local MySQL credentials.
3. Apply the SQL schema and migrations in database/ to your database.
4. Start the frontend and API together: npm run dev
5. Open the Vite URL printed in your terminal (normally http://localhost:5173).

The API runs on port 3001 by default. Vite proxies /api requests to it.

## Test and build

    npm test
    npm run build
    npm start

The production build is written to dist/. In production, Express serves both the API and built frontend. The health endpoint is /api/health.

## Deployment (single web service)

Use a Node.js web-service host such as Render or Railway, plus a separately provisioned MySQL database.

- Build command: npm ci && npm run build
- Start command: npm start
- Health-check path: /api/health
- Node version: 20 or later

Set environment variables in the hosting provider dashboard; do not commit secrets. Required database variables are DB_HOST, DB_USER, and DB_NAME; also set DB_PASSWORD and DB_PORT as needed. Set NODE_ENV=production, a custom ADMIN_USERNAME, a strong unique ADMIN_PASSWORD, and a cryptographically random SESSION_SECRET of at least 32 characters. Set APP_BASE_URL to the public HTTPS site URL.

Before launch:
- Apply every required SQL schema/migration to the production MySQL database.
- Confirm the real business address, tour time zone, currency, prices, dates, capacities, and meeting details. Do not publish unverified demo schedules as bookable tours.
- Keep PAYMENT_MODE=test until ready to accept real payments. For Stripe, set PAYMENT_MODE=stripe, STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET, and configure the Stripe webhook endpoint at /api/stripe/webhook. Test the complete payment and webhook flow before launch.
- Configure SMTP variables if email notifications are required.
- Check every navigation item, mobile layout, booking, admin login, inquiry form, shop checkout, and payment flow on the deployed HTTPS domain.
- Back up the database and use a least-privilege database user.

## Environment variables

See .env.example for the configuration template. Never put production credentials in source control or frontend variables.

## Important

The schedule seed script creates upcoming schedule slots from the listings in server/tour-schedule.js. Review those listings carefully and use the correct time zone and real operational details before running npm run seed:tours against a production database.
