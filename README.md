# Fullstack React App with Express and PostgreSQL

This project is a fullstack application with React frontend, Express backend, and PostgreSQL database.

## Project Structure

```
fullstack-app/
├── frontend/             # React frontend
└── backend/              # Express backend
    ├── db/               # Database related files
    ├── routes/           # API routes
    ├── .env              # Environment variables
    ├── index.js          # Main server file
    └── seed.js           # Database seed file
```

## Prerequisites

- Node.js (v14+)
- npm
- PostgreSQL

## Setup Instructions

### Database Setup

1. Create a PostgreSQL database:
   ```sql
   CREATE DATABASE fullstack_app;
   ```

2. Adjust the database connection settings in `backend/.env` if needed.

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Seed the database:
   ```
   npm run seed
   ```

4. Start the server:
   ```
   npm run dev
   ```

The backend will be running at http://localhost:5000

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm start
   ```

The frontend will be running at http://localhost:3000

## API Endpoints

- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get a specific item
- `POST /api/items` - Create a new item
- `PUT /api/items/:id` - Update an item
- `DELETE /api/items/:id` - Delete an item # Care_eco_assignment
