from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from database import init_db, get_db_stats
from query_routes import router as query_router
from detection_routes import router as detection_router

app = FastAPI(title="PatrolTrack API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(query_router, prefix="/api")
app.include_router(detection_router, prefix="/api")

@app.on_event("startup")
async def startup():
    init_db()

@app.get("/api/health")
def health():
    return {"status":"ok",**get_db_stats()}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
