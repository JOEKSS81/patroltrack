from fastapi import APIRouter, Query
from probability import get_probability, get_heatmap_data

router = APIRouter()

@router.get("/probability")
def probability(zone: str = Query(...), hour: int = Query(..., ge=0, le=23)):
    return {"zone":zone,"hour":hour,**get_probability(zone,hour)}

@router.get("/heatmap")
def heatmap():
    return get_heatmap_data()
