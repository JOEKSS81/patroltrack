import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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

# Serveix el frontend compilat
frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend/dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/")
    def serve_frontend():
        return FileResponse(os.path.join(frontend_dist, "index.html"))

    # Fallback SPA: qualsevol ruta no-API torna l'index.html
    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}, 404
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
