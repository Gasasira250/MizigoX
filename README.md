# Mizigox TMS

Carrier-side freight TMS: book loads, dispatch trucks and drivers, track delivery status, and keep BOL/POD files on the load.

## Run locally

**Backend** (FastAPI, http://127.0.0.1:8000)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If you already created the venv:

```powershell
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (Vite, http://localhost:5173)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with:

- Email: `dispatcher@mizigox.com`
- Password: `dispatcher`

Demo customers, fleet, and loads are seeded on first backend start.

## What you can do

1. Sign in as dispatcher
2. Create a load for a broker/shipper
3. Assign a driver + truck from Dispatch or the load page
4. Advance status: booked → dispatched → picked up → in transit → delivered
5. Upload a BOL or POD on the load
