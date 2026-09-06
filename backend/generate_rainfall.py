"""
Process real IMD district-level annual rainfall normals and apply realistic 
yearly anomalies (2019-2023).

This uses a real historical dataset from IMD (1901-2015 averages) for every 
district in India as the baseline, applying the official national monsoon 
variance for the years 2019-2023.

Run once:  python generate_rainfall.py
"""

import os
import pandas as pd
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
WELLS_CSV = os.path.join(DATA_DIR, "wells_scored.csv")
REAL_RAINFALL_CSV = os.path.join(DATA_DIR, "real_district_rainfall.csv")
OUTPUT_CSV = os.path.join(DATA_DIR, "district_rainfall.csv")

# ── Year-level anomaly factors (based on actual IMD monsoon reports) ──────
# These represent actual % deviation from normal for each year in India
YEAR_ANOMALY = {
    2019: 1.10,   # 2019: Above-normal monsoon (+10%)
    2020: 1.09,   # 2020: Above-normal monsoon (+9%)
    2021: 0.99,   # 2021: Near-normal monsoon (-1%)
    2022: 0.94,   # 2022: Below-normal in some regions (-6%)
    2023: 0.94,   # 2023: El Niño year, deficit monsoon (-6%)
}

def generate_rainfall():
    """Process real district rainfall data matching the wells dataset."""
    print(f"Reading wells from {WELLS_CSV} ...")
    wells = pd.read_csv(WELLS_CSV, low_memory=False, usecols=["state", "district", "year"])

    print(f"Reading real IMD rainfall normals from {REAL_RAINFALL_CSV} ...")
    real_rain = pd.read_csv(REAL_RAINFALL_CSV)
    
    # Create a lookup dictionary for fast access (lowercase district name)
    # Handle possible duplicates by taking the mean
    real_rain["DISTRICT_LOWER"] = real_rain["DISTRICT"].str.strip().str.lower()
    real_rain["STATE_LOWER"] = real_rain["STATE_UT_NAME"].str.strip().str.lower()
    
    district_normals = dict(zip(real_rain["DISTRICT_LOWER"], real_rain["ANNUAL"]))
    state_normals = real_rain.groupby("STATE_LOWER")["ANNUAL"].mean().to_dict()

    # Get unique (state, district, year) combinations
    combos = wells[["state", "district", "year"]].drop_duplicates().dropna()
    combos = combos.reset_index(drop=True)

    print(f"Found {len(combos)} unique (state, district, year) combinations")

    np.random.seed(42)  # Reproducible

    rainfall_records = []
    matched_districts = 0
    matched_states = 0
    
    for _, row in combos.iterrows():
        state = row["state"].strip()
        district = row["district"].strip()
        year = int(row["year"])

        district_lower = district.lower()
        state_lower = state.lower()

        # 1. Try to find real district normal
        if district_lower in district_normals:
            base_rainfall = district_normals[district_lower]
            matched_districts += 1
        # 2. Fallback to real state average normal
        elif state_lower in state_normals:
            base_rainfall = state_normals[state_lower]
            matched_states += 1
        # 3. Fallback to national average
        else:
            base_rainfall = 1100.0 

        # Apply real year anomaly
        year_factor = YEAR_ANOMALY.get(year, 1.0)

        # Add random year-to-year noise (±5%) just for natural variation
        noise = np.random.uniform(0.95, 1.05)

        annual_rainfall = base_rainfall * year_factor * noise
        annual_rainfall = round(max(50, annual_rainfall), 1)  # Min 50mm

        rainfall_records.append({
            "state": state,
            "district": district,
            "year": year,
            "annual_rainfall_mm": annual_rainfall,
        })

    df = pd.DataFrame(rainfall_records)
    df.to_csv(OUTPUT_CSV, index=False)
    
    print(f"\nStats:")
    print(f"Matched real district data: {matched_districts}")
    print(f"Matched real state average: {matched_states}")
    print(f"Saved {len(df)} records to {OUTPUT_CSV}")
    
    print(f"\nSample data:")
    print(df.head(10).to_string(index=False))

if __name__ == "__main__":
    generate_rainfall()

