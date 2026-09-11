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

## Run on the internet (from this GitHub repo)

GitHub Pages can only host the login screen. It cannot run FastAPI, so sign-in will fail there.

To run the **full app** (login + data), deploy this repository to a host that builds the Docker image. [Render](https://render.com) is the included option:

1. Open [https://dashboard.render.com/select-repo?type=web](https://dashboard.render.com/select-repo?type=web)
2. Sign in with GitHub and select **Gasasira250/MizigoX**
3. Set the branch to **`tms`** (that branch has this TMS app)
4. Runtime: **Docker**. Health check path: `/health`
5. Create the web service and wait for the first deploy

Then open `https://YOUR-SERVICE.onrender.com/MizigoX/` and sign in with a demo account. The first request can take a minute on the free plan.

## Flow

1. **Client** posts cargo: commodity, containers, tonnes, vehicle type (e.g. double difference), loading date, urgency, and cargo notes.
2. **Admin** sees the post and sends it to every transporter and driver (notification).
3. **Transporter** accepts and sends truck details to the client (how many trucks, spec, lead unit).
4. **Driver** takes the job. Transporters and the client get a confirmation that the driver accepted.
5. Driver updates status: loaded → on the way → delivered.
