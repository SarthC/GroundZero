"""
FastAPI backend for AI Groundwater Contamination Risk Intelligence System.
Run: uvicorn main:app --reload --port 8000
"""
import math
import os
import random
import difflib
import json
import urllib.request
import urllib.parse
import re
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, text, distinct

from database import get_db, engine
from models import Well

# ---------------------------------------------------------------------------
# Load trained ML model for forecasting
# ---------------------------------------------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.pkl")
RAINFALL_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "district_rainfall.csv")

_model_data = None
_rainfall_df = None

try:
    _model_data = joblib.load(MODEL_PATH)
    _rainfall_df = pd.read_csv(RAINFALL_CSV)
    print(f"[ML] Model loaded: R²={_model_data['r2']:.4f}, MAE={_model_data['mae']:.2f}")
except Exception as e:
    print(f"[ML] Warning: Could not load model ({e}). Forecast will use fallback.")


app = FastAPI(title="Groundwater Risk Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# BIS 10500:2012 Standards (shared across endpoints)
# ---------------------------------------------------------------------------

BIS_DESIRABLE = {
    "pH": (6.5, 8.5), "TDS": 500, "TH": 200, "Cl": 250, "SO4": 200,
    "NO3": 45, "F": 1.0, "Fe": 0.3, "Ca": 75, "Mg": 30, "Na": 200,
    "EC": 1500, "CO3": 200, "HCO3": 200, "K": 12, "U": 0.03,
}

BIS_PERMISSIBLE = {
    "pH": (6.5, 8.5), "TDS": 2000, "TH": 600, "Cl": 1000, "SO4": 400,
    "NO3": 45, "F": 1.5, "Fe": 1.0, "Ca": 200, "Mg": 100, "Na": 200,
    "EC": 3000, "CO3": 600, "HCO3": 600, "K": 12, "U": 0.06,
}

# Hazardous thresholds — beyond these, water is considered unsafe for any use
HAZARDOUS = {
    "F": 5.0, "NO3": 100, "Fe": 3.0, "pH": (4.0, 11.0), "TDS": 5000,
    "U": 0.1, "TH": 1500,
}

PARAM_NAMES = {
    "pH": "pH", "EC": "Electrical Conductivity (µS/cm)", "TDS": "Total Dissolved Solids (mg/L)",
    "NO3": "Nitrate (mg/L)", "Cl": "Chloride (mg/L)", "SO4": "Sulphate (mg/L)",
    "TH": "Total Hardness (mg/L)", "F": "Fluoride (mg/L)", "Fe": "Iron (mg/L)",
    "Ca": "Calcium (mg/L)", "Mg": "Magnesium (mg/L)", "Na": "Sodium (mg/L)",
    "K": "Potassium (mg/L)", "CO3": "Carbonate (mg/L)", "HCO3": "Bicarbonate (mg/L)",
    "SiO2": "Silica (mg/L)", "U": "Uranium (mg/L)", "PO4": "Phosphate (mg/L)",
}


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _risk_color(risk_level: str) -> str:
    mapping = {"Low": "green", "Moderate": "yellow", "High": "red"}
    return mapping.get(risk_level, "green")


def _usability_label(wqi: float, risk_level: str) -> str:
    if risk_level == "High":
        return "Not safe for drinking — lab test recommended"
    if risk_level == "Moderate":
        return "Safe for irrigation, not for drinking"
    return "Safe for drinking and irrigation"


def _check_param(param: str, value: float, limits: dict) -> bool:
    """Check if a parameter value exceeds a limit. Returns True if within limit."""
    limit = limits.get(param)
    if limit is None:
        return True
    if isinstance(limit, tuple):
        return limit[0] <= value <= limit[1]
    return value <= limit


def _compute_wqi(params: dict) -> tuple:
    """
    Compute WQI from raw parameter values using weighted arithmetic method.
    Returns (wqi_score, category, risk_level).
    """
    bis_limits = {
        "pH": 8.5, "EC": 3000, "TDS": 500, "NO3": 45,
        "Cl": 250, "SO4": 200, "TH": 300, "F": 1.0, "Fe": 0.3,
    }
    weights = {
        "pH": 0.15, "TDS": 0.15, "NO3": 0.15, "F": 0.12,
        "Fe": 0.10, "TH": 0.10, "Cl": 0.08, "SO4": 0.08, "EC": 0.07,
    }

    total_weight = 0
    weighted_sum = 0
    for p, w in weights.items():
        val = params.get(p)
        limit = bis_limits.get(p)
        if val is not None and limit:
            qi = (val / limit) * 100  # quality sub-index
            weighted_sum += qi * w
            total_weight += w

    if total_weight == 0:
        return (50.0, "Unknown", "Low")

    wqi = weighted_sum / total_weight
    wqi = min(100, max(0, wqi))

    if wqi <= 25:
        category = "Excellent"
    elif wqi <= 50:
        category = "Good"
    elif wqi <= 75:
        category = "Poor"
    elif wqi <= 100:
        category = "Very Poor"
    else:
        category = "Unsuitable"

    if wqi > 75:
        risk_level = "High"
    elif wqi > 50:
        risk_level = "Moderate"
    else:
        risk_level = "Low"

    return (round(wqi, 2), category, risk_level)


def _classify_usability(params: dict) -> list:
    """
    Classify water into 5 usability tiers based on parameter values.
    Returns a list of tier dicts with suitability info.
    """
    # Count exceedances at each level
    desirable_breaches = []
    permissible_breaches = []
    hazardous_breaches = []

    for p, val in params.items():
        if val is None:
            continue
        if not _check_param(p, val, BIS_DESIRABLE):
            desirable_breaches.append(p)
        if not _check_param(p, val, BIS_PERMISSIBLE):
            permissible_breaches.append(p)
        if not _check_param(p, val, HAZARDOUS):
            hazardous_breaches.append(p)

    tiers = [
        {
            "tier": 1,
            "label": "Safe for Drinking",
            "emoji": "🟢",
            "description": "All parameters within BIS desirable limits — safe for direct consumption",
            "suitable": len(desirable_breaches) == 0,
            "blockers": desirable_breaches[:3] if desirable_breaches else [],
        },
        {
            "tier": 2,
            "label": "Cooking & Bathing",
            "emoji": "🔵",
            "description": "Within BIS permissible limits — safe for cooking, bathing, and personal hygiene",
            "suitable": len(permissible_breaches) == 0,
            "blockers": permissible_breaches[:3] if permissible_breaches else [],
        },
        {
            "tier": 3,
            "label": "Washing & Domestic",
            "emoji": "🟡",
            "description": "Minor exceedances — suitable for washing clothes, utensils, and cleaning",
            "suitable": len(permissible_breaches) <= 2 and len(hazardous_breaches) == 0,
            "blockers": (permissible_breaches + hazardous_breaches)[:3],
        },
        {
            "tier": 4,
            "label": "Industrial Use Only",
            "emoji": "🟠",
            "description": "Significant contamination — only suitable for industrial or irrigation use",
            "suitable": len(hazardous_breaches) == 0,
            "blockers": hazardous_breaches[:3],
        },
        {
            "tier": 5,
            "label": "Not Usable",
            "emoji": "🔴",
            "description": "Hazardous contamination levels — not safe for any human use without treatment",
            "suitable": False,  # always shown as fallback
            "blockers": hazardous_breaches[:3],
        },
    ]

    # Determine the best (lowest) usable tier
    best_tier = 5
    for t in tiers:
        if t["suitable"]:
            best_tier = t["tier"]
            break

    for t in tiers:
        t["is_current"] = (t["tier"] == best_tier)

    return tiers


# ---------------------------------------------------------------------------
# 1. Wells endpoints (map + detail)
# ---------------------------------------------------------------------------

@app.get("/api/wells")
def get_wells(
    state: Optional[str] = None,
    district: Optional[str] = None,
    year: Optional[int] = None,
    risk_level: Optional[str] = None,
    limit: int = Query(default=5000, le=10000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Return wells for the map — lightweight payload with nationwide coverage."""
    q = db.query(
        Well.id, Well.sl_no, Well.well_id, Well.state, Well.district,
        Well.location, Well.latitude, Well.longitude, Well.year,
        Well.wqi, Well.wqi_category, Well.risk_level, Well.risk_band,
        Well.dominant_driver, Well.n_exceedances,
    )
    if state:
        q = q.filter(Well.state == state)
    if district:
        q = q.filter(Well.district == district)
    if year:
        q = q.filter(Well.year == year)
    if risk_level:
        q = q.filter(Well.risk_level == risk_level)

    total = q.count()

    # When no filters are applied, use random sampling for nationwide coverage
    has_filters = any([state, district, year, risk_level])
    if has_filters:
        rows = q.order_by(Well.id).offset(offset).limit(limit).all()
    else:
        # Random sample for nationwide map coverage
        rows = q.order_by(func.random()).limit(limit).all()

    return {
        "total": total,
        "wells": [
            {
                "id": r.id,
                "sl_no": r.sl_no,
                "well_id": r.well_id,
                "state": r.state,
                "district": r.district,
                "location": r.location,
                "lat": r.latitude,
                "lng": r.longitude,
                "year": r.year,
                "wqi": round(r.wqi, 2) if r.wqi else None,
                "wqi_category": r.wqi_category,
                "risk_level": r.risk_level,
                "risk_band": r.risk_band,
                "color": _risk_color(r.risk_level),
                "dominant_driver": r.dominant_driver,
                "n_exceedances": r.n_exceedances,
                "usability": _usability_label(r.wqi or 0, r.risk_level or "Low"),
            }
            for r in rows
        ],
    }


@app.get("/api/wells/{well_db_id}")
def get_well_detail(well_db_id: int, db: Session = Depends(get_db)):
    """Full detail for a single well including parameters for charts."""
    w = db.query(Well).filter(Well.id == well_db_id).first()
    if not w:
        return {"error": "Well not found"}

    # Build parameter breakdown for bar chart
    params = {}
    for p in ["pH", "EC", "TDS", "NO3", "Cl", "SO4", "TH", "F", "Fe"]:
        val = getattr(w, p, None)
        if val is not None:
            params[p] = round(float(val), 2)

    # BIS limits for reference lines
    bis_limits = {
        "pH": 8.5, "EC": 3000, "TDS": 500, "NO3": 45,
        "Cl": 250, "SO4": 200, "TH": 300, "F": 1.0, "Fe": 0.3,
    }

    # SHAP-like importance (mock: compute deviation from BIS)
    shap_values = []
    for p, limit in bis_limits.items():
        val = params.get(p)
        if val is not None and limit:
            deviation = (val - limit) / limit
            shap_values.append({"param": p, "impact": round(deviation, 3)})
    shap_values.sort(key=lambda x: abs(x["impact"]), reverse=True)

    # Get usability classification
    all_params = {}
    for p in ["pH", "EC", "TDS", "NO3", "Cl", "SO4", "TH", "F", "Fe", "Ca", "Mg", "Na", "K", "U"]:
        val = getattr(w, p, None)
        if val is not None:
            all_params[p] = float(val)
    usability_tiers = _classify_usability(all_params)

    return {
        "id": w.id,
        "sl_no": w.sl_no,
        "well_id": w.well_id,
        "state": w.state,
        "district": w.district,
        "block": w.block,
        "location": w.location,
        "lat": w.latitude,
        "lng": w.longitude,
        "year": w.year,
        "wqi": round(w.wqi, 2) if w.wqi else None,
        "wqi_category": w.wqi_category,
        "risk_level": w.risk_level,
        "risk_band": w.risk_band,
        "dominant_driver": w.dominant_driver,
        "n_exceedances": w.n_exceedances,
        "permissible_breaches": w.permissible_breaches,
        "usability": _usability_label(w.wqi or 0, w.risk_level or "Low"),
        "color": _risk_color(w.risk_level or "Low"),
        "params": params,
        "bis_limits": bis_limits,
        "shap": shap_values[:5],
        "usability_tiers": usability_tiers,
    }


# ---------------------------------------------------------------------------
# 2. Forecasting endpoint (ML model-based predictions)
# ---------------------------------------------------------------------------

def _get_well_rainfall(state: str, district: str, year: int) -> float:
    """Look up the base annual rainfall for a well's district."""
    if _rainfall_df is None:
        return 1100.0  # fallback
    match = _rainfall_df[
        (_rainfall_df["state"].str.lower() == state.lower()) &
        (_rainfall_df["district"].str.lower() == district.lower()) &
        (_rainfall_df["year"] == year)
    ]
    if not match.empty:
        return float(match.iloc[0]["annual_rainfall_mm"])
    # Try state average
    state_match = _rainfall_df[_rainfall_df["state"].str.lower() == state.lower()]
    if not state_match.empty:
        return float(state_match["annual_rainfall_mm"].mean())
    return 1100.0


def _predict_wqi(well, rainfall_mm: float) -> float:
    """Use the trained model to predict WQI for given parameters + rainfall."""
    if _model_data is None:
        return well.wqi or 50.0

    model = _model_data["model"]
    features = _model_data["features"]
    medians = _model_data["feature_medians"]

    # First, collect raw water quality values for interaction feature computation
    raw_vals = {}
    for feat in ["pH", "TDS", "TH", "F", "NO3", "Fe", "Cl", "SO4", "Na", "Ca", "Mg"]:
        val = getattr(well, feat, None)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            val = medians.get(feat, 0)
        raw_vals[feat] = float(val)

    # Build feature vector from the well's actual water quality parameters
    feature_values = []
    for feat in features:
        if feat == "annual_rainfall_mm":
            feature_values.append(rainfall_mm)
        elif feat == "rainfall_x_TDS":
            feature_values.append(rainfall_mm * raw_vals.get("TDS", medians.get("TDS", 0)))
        elif feat == "rainfall_x_NO3":
            feature_values.append(rainfall_mm * raw_vals.get("NO3", medians.get("NO3", 0)))
        elif feat == "rainfall_x_TH":
            feature_values.append(rainfall_mm * raw_vals.get("TH", medians.get("TH", 0)))
        elif feat == "rainfall_inv":
            feature_values.append(1.0 / max(rainfall_mm, 1.0))
        elif feat == "rainfall_per_TDS":
            tds = raw_vals.get("TDS", medians.get("TDS", 1))
            feature_values.append(rainfall_mm / max(tds, 1.0))
        else:
            val = raw_vals.get(feat)
            if val is None:
                val = medians.get(feat, 0)
            feature_values.append(float(val))

    X = np.array([feature_values])
    predicted = model.predict(X)[0]
    return float(max(0, min(100, predicted)))


@app.get("/api/forecast/{well_db_id}")
def get_forecast(
    well_db_id: int,
    horizon: int = Query(default=12, ge=1, le=60),
    rainfall_delta: float = Query(default=0.0),
    db: Session = Depends(get_db),
):
    """
    Returns historical WQI trend for the well (across years) and a
    ML model-based forecast going `horizon` months into the future.
    The rainfall_delta (%) adjusts the base rainfall to simulate
    what-if scenarios.
    """
    # Get the well record
    w = db.query(Well).filter(Well.id == well_db_id).first()
    if not w:
        return {"error": "Well not found"}

    # Gather historical data points for this well_id across different years
    siblings = (
        db.query(Well)
        .filter(Well.well_id == w.well_id)
        .order_by(Well.year)
        .all()
    )
    if not siblings:
        siblings = [w]

    historical = [
        {"date": f"{s.year}-06", "wqi": round(s.wqi, 2) if s.wqi else 50}
        for s in siblings
    ]

    # Get base rainfall for this district
    last_year = siblings[-1].year if siblings else 2023
    base_rainfall = _get_well_rainfall(w.state, w.district, last_year)

    # Apply rainfall delta (e.g., +30% means 30% more rainfall)
    adjusted_rainfall = base_rainfall * (1 + rainfall_delta / 100.0)

    # Rainfall sensitivity factor: higher rainfall dilutes contaminants
    # (lowers WQI), lower rainfall concentrates them (raises WQI).
    # The ML model under-weights rainfall (~0.04% importance), so we apply
    # a post-prediction correction based on the hydrological dilution effect.
    # At ±50% rainfall change, this shifts WQI by up to ±15 points.
    rainfall_ratio = adjusted_rainfall / max(base_rainfall, 1.0)
    # Invert: more rain → lower WQI (better quality); log scale for realism
    rainfall_wqi_shift = -30.0 * math.log(max(rainfall_ratio, 0.01))

    # Generate ML-based forecast
    forecast = []
    # Include rainfall_delta in seed so noise varies with scenario
    random.seed(well_db_id + int(rainfall_delta * 100))

    for m in range(1, horizon + 1):
        month_offset = m
        year = last_year + (5 + month_offset) // 12
        month = ((5 + month_offset) % 12) + 1

        # Add slight seasonal variation to rainfall
        seasonal_factor = 1.0 + 0.05 * math.sin(2 * math.pi * month / 12)
        month_rainfall = adjusted_rainfall * seasonal_factor

        # Add small random variation per month (±3%)
        month_rainfall *= random.uniform(0.97, 1.03)

        # Predict WQI using the trained model
        predicted_wqi = _predict_wqi(w, month_rainfall)

        # Apply rainfall sensitivity correction
        # Effect grows slightly over time to show compounding impact
        time_factor = 1.0 + 0.3 * (m / horizon)
        predicted_wqi += rainfall_wqi_shift * time_factor

        # Add small noise for natural variation (±2 WQI points)
        noise = random.uniform(-2, 2)
        predicted_wqi = max(0, min(100, predicted_wqi + noise))

        # Confidence interval (wider as horizon extends, also wider with
        # larger rainfall deltas since scenario uncertainty increases)
        rainfall_uncertainty = abs(rainfall_delta) / 100.0 * 3
        uncertainty = 3 + (m / horizon) * 8 + rainfall_uncertainty
        lower = max(0, predicted_wqi - uncertainty)
        upper = min(100, predicted_wqi + uncertainty)

        forecast.append({
            "date": f"{year}-{month:02d}",
            "wqi": round(predicted_wqi, 2),
            "lower": round(lower, 2),
            "upper": round(upper, 2),
        })

    return {
        "well_id": w.well_id,
        "historical": historical,
        "forecast": forecast,
        "base_rainfall_mm": round(base_rainfall, 1),
        "adjusted_rainfall_mm": round(adjusted_rainfall, 1),
        "rainfall_wqi_impact": round(rainfall_wqi_shift, 2),
    }


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 3. NLP endpoint (keyword‑based demo with nearest location resolution)
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two lat/lon points in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(max(0.0, a)), math.sqrt(max(0.0, 1.0 - a)))
    return R * c


def _geocode_place(place_name: str):
    """
    Geocode a place name using OpenStreetMap Nominatim and Open-Meteo APIs
    with India bias and browser-like user agent.
    """
    cleaned_name = place_name.strip()
    if not cleaned_name:
        return None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GroundwaterIntelligenceApp/2.0 contact@groundwater.local"
    }

    # Strategy 1: Nominatim with India countrycode
    try:
        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(cleaned_name)}&countrycodes=in&format=json&limit=1"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode())
            if data and len(data) > 0:
                return float(data[0]["lat"]), float(data[0]["lon"]), data[0].get("display_name", cleaned_name)
    except Exception:
        pass

    # Strategy 2: Nominatim with explicit ', India'
    try:
        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(cleaned_name + ', India')}&format=json&limit=1"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode())
            if data and len(data) > 0:
                return float(data[0]["lat"]), float(data[0]["lon"]), data[0].get("display_name", cleaned_name)
    except Exception:
        pass

    # Strategy 3: Open-Meteo Geocoding API
    try:
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(cleaned_name)}&count=1&country_code=IN&language=en&format=json"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode())
            if data and "results" in data and data["results"]:
                res = data["results"][0]
                display_name = f"{res.get('name', cleaned_name)}, {res.get('admin1', '')}, India"
                return float(res["latitude"]), float(res["longitude"]), display_name
    except Exception:
        pass

    return None


def _format_param_line(param: str, value: float) -> str:
    """Format a water quality parameter with unit and standard comparison."""
    if value is None:
        return ""
    unit = "mg/L"
    if param == "pH":
        unit = ""
    elif param == "EC":
        unit = "µS/cm"

    val_str = f"{value:.1f}".rstrip("0").rstrip(".") if isinstance(value, float) else str(value)
    if unit:
        val_str += f" {unit}"

    des = BIS_DESIRABLE.get(param)
    perm = BIS_PERMISSIBLE.get(param)

    status = "✅ Normal"
    if des:
        if isinstance(des, tuple):
            if not (des[0] <= value <= des[1]):
                status = "⚠️ Out of desirable range (6.5–8.5)"
            else:
                status = "✅ Desirable (6.5–8.5)"
        else:
            if perm and value > perm:
                status = f"🔴 Exceeded max limit ({perm})"
            elif value > des:
                status = f"🟡 Permissible (Desirable: {des}, Max: {perm})"
            else:
                status = f"✅ Desirable (Limit: {des})"

    label_names = {
        "pH": "pH",
        "TDS": "Total Dissolved Solids (TDS)",
        "F": "Fluoride (F)",
        "NO3": "Nitrate (NO3)",
        "TH": "Total Hardness (TH)",
        "EC": "Electrical Conductivity (EC)",
        "Cl": "Chloride (Cl)",
        "SO4": "Sulphate (SO4)",
        "Fe": "Iron (Fe)",
        "Ca": "Calcium (Ca)",
        "Mg": "Magnesium (Mg)",
        "Na": "Sodium (Na)",
        "K": "Potassium (K)",
    }
    label = label_names.get(param, param)
    return f"• {label}: **{val_str}** — {status}"


NLP_STOP_WORDS = {
    "what", "where", "how", "why", "who", "which", "when",
    "is", "are", "was", "were", "can", "could", "would", "should",
    "do", "does", "did", "tell", "give", "show", "find", "get", "check",
    "know", "fetch", "display", "provide", "see", "please", "kindly",
    "the", "a", "an", "in", "at", "near", "of", "for", "to", "from",
    "on", "about", "around", "by", "with", "and", "or",
    "wqi", "water", "groundwater", "quality", "parameter", "parameters",
    "value", "values", "score", "index", "reading", "readings", "level",
    "levels", "data", "details", "info", "information", "report", "summary",
    "stats", "statistics", "analysis", "trend", "trends",
    "safe", "safety", "drink", "drinking", "potable", "drinkable", "usable",
    "use", "irrigation", "domestic", "risk", "hazard", "danger",
    "contamination", "contaminants", "polluted", "pollution",
    "well", "wells", "borewell", "borewells", "tubewell", "tubewells",
    "station", "stations", "place", "location", "locations", "area",
    "areas", "region", "regions", "point", "points", "site", "sites",
    "village", "city", "town", "district", "state", "its", "their",
    "hey", "hi", "hello", "there", "thanks", "thank", "you", "me", "us", "we", "i"
}


@app.post("/api/nlp")
def nlp_query(payload: dict, db: Session = Depends(get_db)):
    """
    NLP query endpoint for groundwater quality intelligence.
    Extracts location name, checks exact dataset matches, and if not directly found,
    geocodes the location to find and return water quality parameters from the
    geographically nearest monitoring station.
    """
    question = payload.get("question", "").strip()
    if not question:
        return {"answer": "Please ask a question about groundwater quality or enter a location name (e.g. 'Kunjirwadi' or 'Pune')."}

    q_lower = question.lower()
    tokens = re.findall(r'[a-zA-Z0-9]+', q_lower)

    # Check if user explicitly asked for national/system-wide overview
    is_national_overview = any(
        phrase in q_lower for phrase in [
            "all wells", "across india", "whole india", "entire india",
            "countrywide", "whole dataset", "system overview", "total wells"
        ]
    )

    # Extract probable place name by filtering stop words
    clean_words = [t for t in tokens if t not in NLP_STOP_WORDS]
    searched_place = " ".join(clean_words).title() if clean_words else None

    # Distinct check for direct database matches
    matched_location = None
    matched_district = None
    matched_state = None

    if searched_place:
        # Check direct location match in DB
        loc_row = db.query(Well.location).filter(func.lower(Well.location) == searched_place.lower()).first()
        if loc_row and loc_row[0]:
            matched_location = loc_row[0]

        # Check direct district match
        if not matched_location:
            dist_row = db.query(Well.district).filter(func.lower(Well.district) == searched_place.lower()).first()
            if dist_row and dist_row[0]:
                matched_district = dist_row[0]

        # Check direct state match
        if not matched_location and not matched_district:
            state_row = db.query(Well.state).filter(func.lower(Well.state) == searched_place.lower()).first()
            if state_row and state_row[0]:
                matched_state = state_row[0]

    nearest_note = ""
    is_nearest = False

    # Step 2: If no direct match and not a general overview, resolve nearest location via geocoding
    if not matched_location and not matched_district and not matched_state and not is_national_overview:
        if not searched_place:
            return {
                "answer": (
                    "👋 Please enter a location name (e.g. **'Kunjirwadi'**, **'Pune'**, or **'Loni Kalbhor'**) "
                    "to view its groundwater quality parameters and WQI risk score."
                )
            }

        # Attempt to geocode place name to (latitude, longitude)
        geo = _geocode_place(searched_place)
        if geo:
            plat, plon, display_name = geo
            # Query candidate wells using progressive bounding box for performance
            candidates = []
            for delta in [0.3, 0.8, 2.0, 5.0]:
                candidates = (
                    db.query(Well)
                    .filter(
                        Well.latitude.between(plat - delta, plat + delta),
                        Well.longitude.between(plon - delta, plon + delta)
                    )
                    .all()
                )
                if candidates:
                    break

            # Fallback to all wells with coords if bounding box yields nothing
            if not candidates:
                candidates = db.query(Well).filter(Well.latitude.isnot(None), Well.longitude.isnot(None)).all()

            if candidates:
                best_well = min(
                    candidates,
                    key=lambda w: _haversine_km(plat, plon, w.latitude, w.longitude)
                )
                dist_km = _haversine_km(plat, plon, best_well.latitude, best_well.longitude)
                is_nearest = True
                loc_name = best_well.location or f"{best_well.district} Station"

                nearest_note = (
                    f"📍 **'{searched_place}'** was not directly found in our monitoring dataset.\n"
                    f"Showing water quality parameters from the nearest monitoring station: **{loc_name}** "
                    f"({best_well.district}, {best_well.state}) — approx. **{dist_km:.1f} km** away."
                )

                if best_well.location:
                    matched_location = best_well.location
                else:
                    matched_district = best_well.district
        else:
            # Check if any token matches an existing district in DB as fallback
            for t in clean_words:
                dist_check = db.query(Well.district).filter(func.lower(Well.district) == t.lower()).first()
                if dist_check and dist_check[0]:
                    matched_district = dist_check[0]
                    nearest_note = f"📍 **'{searched_place}'** was not found directly. Showing monitoring data for **{matched_district} District**."
                    break

            if not matched_district:
                return {
                    "answer": (
                        f"📍 Location **'{searched_place}'** was not found in our monitoring dataset, "
                        f"and its geographic coordinates could not be resolved to find a nearby station.\n\n"
                        f"Please check the spelling or try searching by major district (e.g. Pune, Nashik, Jaipur, Hyderabad) or nearby city."
                    )
                }

    # Step 3: Fetch monitoring data
    q = db.query(Well)
    label = "the selected area"

    if matched_location:
        q = q.filter(Well.location == matched_location)
        label = matched_location
    elif matched_district:
        q = q.filter(Well.district == matched_district)
        label = f"{matched_district} District"
    elif matched_state:
        q = q.filter(Well.state == matched_state)
        label = matched_state
    elif is_national_overview:
        label = "All Dataset Wells (National Overview)"
    else:
        return {
            "answer": "Please ask a question about a specific location or groundwater quality."
        }

    wells = q.all()
    if not wells:
        return {"answer": f"I couldn't find any wells matching your query about '{question}'."}

    total = len(wells)
    high = sum(1 for w in wells if w.risk_level == "High")
    mod = sum(1 for w in wells if w.risk_level == "Moderate")
    low = sum(1 for w in wells if w.risk_level == "Low")
    valid_wqis = [w.wqi for w in wells if w.wqi is not None]
    avg_wqi = sum(valid_wqis) / max(1, len(valid_wqis)) if valid_wqis else 50.0

    # Risk level & category
    if avg_wqi <= 25:
        category = "Excellent"
    elif avg_wqi <= 50:
        category = "Good"
    elif avg_wqi <= 75:
        category = "Poor"
    elif avg_wqi <= 100:
        category = "Very Poor"
    else:
        category = "Unsuitable"

    if avg_wqi > 75:
        risk_level = "High"
        risk_emoji = "🔴"
    elif avg_wqi > 50:
        risk_level = "Moderate"
        risk_emoji = "🟡"
    else:
        risk_level = "Low"
        risk_emoji = "🟢"

    # Compute key chemical and physical parameter averages/values
    param_keys = ["pH", "TDS", "F", "NO3", "TH", "EC", "Cl", "SO4", "Fe", "Ca", "Mg", "U", "As_"]
    params_summary = {}

    # If nearest station has multiple records, prefer latest year for parameters
    sorted_wells = sorted(wells, key=lambda w: (w.year or 0), reverse=True)
    for p in param_keys:
        p_attr = p if p != "As_" else "As_"
        vals = [getattr(w, p_attr) for w in sorted_wells if getattr(w, p_attr, None) is not None]
        if vals:
            params_summary[p.replace("As_", "As")] = vals[0] if is_nearest else (sum(vals) / len(vals))

    header = nearest_note if nearest_note else f"📍 **{label}**: Analyzed {total} monitoring observation{'s' if total != 1 else ''}."

    answer = f"{header}\n\n"
    answer += f"• Water Quality Index (WQI): **{avg_wqi:.1f}** / 100 — **{category}** ({risk_emoji} {risk_level} Risk)\n"
    answer += f"• Usability: {_usability_label(avg_wqi, risk_level)}\n"

    if total > 1 and not is_nearest:
        answer += f"• Risk Distribution: 🟢 {low} Low | 🟡 {mod} Moderate | 🔴 {high} High\n"

    if params_summary:
        answer += "\n🔬 **Key Water Quality Parameters:**\n"
        for p, val in params_summary.items():
            line = _format_param_line(p, val)
            if line:
                answer += f"{line}\n"

    # Health & Safety advisory
    if risk_level == "High" or (high / max(total, 1) > 0.3):
        answer += "\n⚠️ **Safety Advisory**: Water in this area shows elevated contamination — filtration or lab testing strongly advised before drinking."
    elif risk_level == "Moderate" or (high / max(total, 1) > 0.1):
        answer += "\n⚡ **Safety Advisory**: Moderate mineral content / hardness. Safe for domestic & irrigation use; purification recommended for drinking."
    else:
        answer += "\n✅ **Safety Advisory**: Water parameters are generally within standard limits and safe for domestic and drinking use."

    return {"answer": answer}


# ---------------------------------------------------------------------------
# 4. Actionable intelligence endpoints
# ---------------------------------------------------------------------------

@app.get("/api/priority-wells")
def priority_wells(limit: int = 15, db: Session = Depends(get_db)):
    """Wells that should be lab‑tested next — high WQI, moderate confidence."""
    rows = (
        db.query(Well)
        .filter(Well.risk_level.in_(["Moderate", "High"]))
        .filter(Well.wqi_confidence != "High")
        .order_by(Well.wqi.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": w.id,
            "location": w.location or w.district,
            "state": w.state,
            "district": w.district,
            "wqi": round(w.wqi, 2) if w.wqi else None,
            "risk_level": w.risk_level,
            "dominant_driver": w.dominant_driver,
            "confidence": w.wqi_confidence,
            "reason": f"WQI {w.wqi:.0f} with {w.wqi_confidence or 'Unknown'} confidence — needs lab verification",
        }
        for w in rows
    ]


@app.get("/api/retest-alerts")
def retest_alerts(limit: int = 15, db: Session = Depends(get_db)):
    """Wells where surrounding conditions may have changed (simulated drift)."""
    rows = (
        db.query(Well)
        .filter(Well.n_exceedances >= 3)
        .order_by(Well.n_exceedances.desc(), Well.wqi.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": w.id,
            "location": w.location or w.district,
            "state": w.state,
            "district": w.district,
            "wqi": round(w.wqi, 2) if w.wqi else None,
            "risk_level": w.risk_level,
            "n_exceedances": w.n_exceedances,
            "alert": f"{w.n_exceedances} parameter exceedances detected — land-use drift suspected",
        }
        for w in rows
    ]


@app.get("/api/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    """High-level stats for the dashboard header."""
    total = db.query(func.count(Well.id)).scalar()
    high = db.query(func.count(Well.id)).filter(Well.risk_level == "High").scalar()
    mod = db.query(func.count(Well.id)).filter(Well.risk_level == "Moderate").scalar()
    low = db.query(func.count(Well.id)).filter(Well.risk_level == "Low").scalar()
    avg_wqi = db.query(func.avg(Well.wqi)).scalar()
    states = db.query(func.count(distinct(Well.state))).scalar()
    districts = db.query(func.count(distinct(Well.district))).scalar()
    return {
        "total_wells": total,
        "high_risk": high,
        "moderate_risk": mod,
        "low_risk": low,
        "avg_wqi": round(avg_wqi, 1) if avg_wqi else 0,
        "states_covered": states,
        "districts_covered": districts,
    }


@app.get("/api/filters")
def get_filters(db: Session = Depends(get_db)):
    """Distinct filter values for the frontend dropdowns."""
    states = [r[0] for r in db.query(distinct(Well.state)).order_by(Well.state).all() if r[0]]
    years = [r[0] for r in db.query(distinct(Well.year)).order_by(Well.year).all() if r[0]]
    return {"states": states, "years": years}


@app.get("/api/districts/{state}")
def get_districts(state: str, db: Session = Depends(get_db)):
    """Get districts for a given state."""
    districts = [
        r[0]
        for r in db.query(distinct(Well.district))
        .filter(Well.state == state)
        .order_by(Well.district)
        .all()
        if r[0]
    ]
    return {"districts": districts}


# ---------------------------------------------------------------------------
# 5. Lab Report Analysis endpoint
# ---------------------------------------------------------------------------

@app.post("/api/analyze-report")
def analyze_report(payload: dict):
    """
    Accepts raw water quality parameter values (from a lab report),
    computes WQI, classifies usability, and returns a full analysis report.
    """
    params = payload.get("params", {})
    if not params:
        return {"error": "No parameters provided. Please enter at least pH and TDS."}

    CANONICAL_MAP = {
        "ph": "pH", "tds": "TDS", "hardness": "TH", "th": "TH",
        "fluoride": "F", "f": "F", "nitrate": "NO3", "no3": "NO3",
        "iron": "Fe", "fe": "Fe", "chloride": "Cl", "cl": "Cl",
        "ec": "EC", "so4": "SO4", "sulphate": "SO4", "ca": "Ca",
        "mg": "Mg", "na": "Na", "k": "K", "u": "U"
    }

    # Sanitize — convert to floats and map keys to canonical parameter names
    clean = {}
    for key, val in params.items():
        canon_key = CANONICAL_MAP.get(key.lower(), key)
        try:
            clean[canon_key] = float(val)
        except (ValueError, TypeError):
            continue

    if len(clean) < 2:
        return {"error": "Please provide at least 2 parameters (e.g., pH, TDS)."}

    # Compute WQI
    wqi, category, risk_level = _compute_wqi(clean)

    # BIS comparison
    bis_limits = {
        "pH": 8.5, "EC": 3000, "TDS": 500, "NO3": 45,
        "Cl": 250, "SO4": 200, "TH": 300, "F": 1.0, "Fe": 0.3,
    }

    param_analysis = []
    for p, val in clean.items():
        des_limit = BIS_DESIRABLE.get(p)
        perm_limit = BIS_PERMISSIBLE.get(p)

        if isinstance(des_limit, tuple):
            within_des = des_limit[0] <= val <= des_limit[1]
        elif des_limit is not None:
            within_des = val <= des_limit
        else:
            within_des = True

        if isinstance(perm_limit, tuple):
            within_perm = perm_limit[0] <= val <= perm_limit[1]
        elif perm_limit is not None:
            within_perm = val <= perm_limit
        else:
            within_perm = True

        if within_des:
            status = "✅ Within Desirable"
        elif within_perm:
            status = "⚠️ Above Desirable"
        else:
            status = "❌ Exceeds Permissible"

        param_analysis.append({
            "param": p,
            "name": PARAM_NAMES.get(p, p),
            "value": val,
            "desirable_limit": des_limit if not isinstance(des_limit, tuple) else f"{des_limit[0]}-{des_limit[1]}",
            "permissible_limit": perm_limit if not isinstance(perm_limit, tuple) else f"{perm_limit[0]}-{perm_limit[1]}",
            "status": status,
        })

    # Build simple analysis map for frontend components expecting result.analysis
    analysis_dict = {}
    for item in param_analysis:
        p_name = item["param"]
        val = item["value"]
        st = item["status"]
        simple_st = "Desirable" if "Desirable" in st and "Above" not in st else ("Permissible" if "Above" in st or "Permissible" in st else "Hazardous")
        analysis_dict[p_name] = {"value": val, "status": simple_st}

    # Usability tiers
    usability_tiers = _classify_usability(clean)

    # SHAP-like deviation analysis
    shap_values = []
    for p, limit in bis_limits.items():
        val = clean.get(p)
        if val is not None and limit:
            deviation = (val - limit) / limit
            shap_values.append({"param": p, "impact": round(deviation, 3)})
    shap_values.sort(key=lambda x: abs(x["impact"]), reverse=True)

    return {
        "wqi": wqi,
        "wqi_category": category,
        "risk_level": risk_level,
        "color": _risk_color(risk_level),
        "usability": _usability_label(wqi, risk_level),
        "params": clean,
        "bis_limits": bis_limits,
        "param_analysis": param_analysis,
        "analysis": analysis_dict,
        "shap": shap_values[:5],
        "usability_tiers": usability_tiers,
        "n_params": len(clean),
    }


# ---------------------------------------------------------------------------
# 6. Usability classification for existing well
# ---------------------------------------------------------------------------

@app.get("/api/usability/{well_db_id}")
def well_usability(well_db_id: int, db: Session = Depends(get_db)):
    """Classify a well's water into 5 usability tiers."""
    w = db.query(Well).filter(Well.id == well_db_id).first()
    if not w:
        return {"error": "Well not found"}

    params = {}
    for p in ["pH", "EC", "TDS", "NO3", "Cl", "SO4", "TH", "F", "Fe", "Ca", "Mg", "Na", "K", "U"]:
        val = getattr(w, p, None)
        if val is not None:
            params[p] = float(val)

    tiers = _classify_usability(params)

    return {
        "well_id": w.well_id,
        "location": w.location or w.district,
        "state": w.state,
        "district": w.district,
        "tiers": tiers,
    }
