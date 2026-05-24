from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from database import get_recent_detections, insert_detection

router = APIRouter()

class ManualDetection(BaseModel):
    zone: str
    zone_norm: str
    patrol_type: str
    source: str
    raw_message: Optional[str] = ""
    confidence: Optional[str] = "mitja"
    group_name: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None

@router.get("/detections")
def list_detections(limit: int = 30):
    return get_recent_detections(limit)

@router.post("/detections/manual")
def manual_detection(det: ManualDetection):
    return {"ok":True,"id":insert_detection(det.dict())}
