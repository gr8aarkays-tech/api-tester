# API Tester Backend

This directory contains the Node.js backend that handles **database connections**. The browser frontend never connects to the database directly — all DB operations go through this server.

## Setup

```bash
cd server
npm install
npm start
```

The server runs on **http://localhost:4001** by default. Override with `PORT=5000 npm start`.

## Supported Databases

| Type | Default Port |
|------|-------------|
| PostgreSQL | 5432 |
| MySQL | 3306 |
| Microsoft SQL Server | 1433 |
| Oracle | 1521 |
| SQLite | (file path) |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/db/test` | Test a DB connection |
| POST | `/db/query` | Execute a SQL query |

## Security

- Passwords are **never logged**
- Credentials are **never returned** to the frontend
- The server only accepts connections from localhost by default (CORS)

## Environment Variables

Copy `.env.example` to `.env` to customise:

```
PORT=4001
```
