# MizigoX

Freight marketplace: a client posts cargo, the transportation admin sends it to transporters, transporters accept and provide trucks, and drivers take the job.

Quotes are in **USD only**, from distance, weight (tonnes), vehicle type, urgency, and recent market trend.

## Run locally

**Backend** (FastAPI, http://127.0.0.1:8000)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (Vite, http://localhost:5173)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173/MizigoX/ and use a demo account:

| Role | Email | Password |
| --- | --- | --- |
| Client | `hannington@mizigox.com` | `cargo` |
| Admin | `dispatcher@mizigox.com` | `dispatcher` |
| Transporter | `transporter@mizigox.com` | `transporter` |
| Driver | `driver@mizigox.com` | `driver` |

## Flow

1. **Client** posts cargo: commodity, containers, tonnes, vehicle type (e.g. double difference), loading date, urgency, and cargo notes.
2. **Admin** sees the post and sends it to every transporter and driver (notification).
3. **Transporter** accepts and sends truck details to the client (how many trucks, spec, lead unit).
4. **Driver** takes the job. Transporters and the client get a confirmation that the driver accepted.
5. Driver updates status: loaded → on the way → delivered.
