"""
FastAPI backend for AI Groundwater Contamination Risk Intelligence System.
Run: uvicorn main:app --reload --port 8000
"""
import math
import random
from typing import Optional

from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, text, distinct

from database import get_db, engine
from models import Well

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
# 2. Forecasting endpoint (generates synthetic time‑series)
# ---------------------------------------------------------------------------

@app.get("/api/forecast/{well_db_id}")
def get_forecast(
    well_db_id: int,
    horizon: int = Query(default=6, ge=1, le=24),
    rainfall_delta: float = Query(default=0.0),
    db: Session = Depends(get_db),
):
    """
    Returns historical WQI trend for the well (across years) and a
    synthetic Prophet‑style forecast going `horizon` months into the future.
    """
    # Get all records for this well_id across years
    w = db.query(Well).filter(Well.id == well_db_id).first()
    if not w:
        return {"error": "Well not found"}

    # Gather historical data points for this well_id across different years
    siblings = (
        db.query(Well.year, Well.wqi)
        .filter(Well.well_id == w.well_id)
        .order_by(Well.year)
        .all()
    )
    if not siblings:
        siblings = [(w.year, w.wqi)]

    historical = [
        {"date": f"{s.year}-06", "wqi": round(s.wqi, 2) if s.wqi else 50}
        for s in siblings
    ]

    # Generate synthetic forecast
    last_wqi = historical[-1]["wqi"] if historical else 50
    last_year = int(historical[-1]["date"][:4]) if historical else 2023
    forecast = []
    for m in range(1, horizon + 1):
        month_offset = m
        year = last_year + (5 + month_offset) // 12
        month = ((5 + month_offset) % 12) + 1
        # Simple random walk with rainfall adjustment
        drift = random.uniform(-3, 5) + (rainfall_delta * 0.15)
        projected = max(0, min(100, last_wqi + drift))
        last_wqi = projected
        forecast.append({
            "date": f"{year}-{month:02d}",
            "wqi": round(projected, 2),
            "lower": round(max(0, projected - random.uniform(5, 12)), 2),
            "upper": round(min(100, projected + random.uniform(5, 12)), 2),
        })

    return {"well_id": w.well_id, "historical": historical, "forecast": forecast}


# ---------------------------------------------------------------------------
# 3. NLP endpoint (keyword‑based demo)
# ---------------------------------------------------------------------------

@app.post("/api/nlp")
def nlp_query(payload: dict, db: Session = Depends(get_db)):
    """Simple keyword matching NLP endpoint for demo purposes."""
    question = payload.get("question", "").strip()
    if not question:
        return {"answer": "Please ask a question about groundwater quality."}

    tokens = question.lower().split()

    # Try to find a district or state mentioned in the query
    districts = [r[0] for r in db.query(distinct(Well.district)).all() if r[0]]
    states = [r[0] for r in db.query(distinct(Well.state)).all() if r[0]]

    matched_district = None
    matched_state = None
    for d in districts:
        if d.lower() in question.lower():
            matched_district = d
            break
    for s in states:
        if s.lower() in question.lower():
            matched_state = s
            break

    q = db.query(Well)
    label = "the selected area"
    if matched_district:
        q = q.filter(Well.district == matched_district)
        label = matched_district
    elif matched_state:
        q = q.filter(Well.state == matched_state)
        label = matched_state

    wells = q.all()
    if not wells:
        return {"answer": f"I couldn't find any wells matching your query about '{question}'."}

    total = len(wells)
    high = sum(1 for w in wells if w.risk_level == "High")
    mod = sum(1 for w in wells if w.risk_level == "Moderate")
    low = sum(1 for w in wells if w.risk_level == "Low")
    avg_wqi = sum(w.wqi for w in wells if w.wqi) / max(1, sum(1 for w in wells if w.wqi))

    # Check for safety question
    if any(word in tokens for word in ["safe", "drink", "drinking", "potable"]):
        if high / max(total, 1) > 0.3:
            safety = "⚠️ Water in this area is NOT safe for drinking without treatment."
        elif high / max(total, 1) > 0.1:
            safety = "⚡ Some wells show elevated contamination — boiling or filtering recommended."
        else:
            safety = "✅ Water in most wells is generally safe for domestic use."
    else:
        safety = ""

    answer = (
        f"📍 **{label}**: Analyzed {total} wells.\n\n"
        f"• Average WQI: **{avg_wqi:.1f}** / 100\n"
        f"• 🟢 Low risk: {low} wells ({100*low/total:.0f}%)\n"
        f"• 🟡 Moderate risk: {mod} wells ({100*mod/total:.0f}%)\n"
        f"• 🔴 High risk: {high} wells ({100*high/total:.0f}%)\n"
    )
    if safety:
        answer += f"\n{safety}"

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

    # Sanitize — convert to floats
    clean = {}
    for key, val in params.items():
        try:
            clean[key] = float(val)
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
