"""
Train a Random Forest model that predicts WQI using water quality parameters
AND annual rainfall data. The rainfall data is joined from the separately
generated district_rainfall.csv.

The trained model is saved as model.pkl and used by the backend forecast
endpoint to provide real predictions when the rainfall slider is used.

Run once:  python train_model.py
Re-run whenever you update the rainfall data or want to retrain.
"""

import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
WELLS_CSV = os.path.join(DATA_DIR, "wells_scored.csv")
RAINFALL_CSV = os.path.join(DATA_DIR, "district_rainfall.csv")
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.pkl")

# Features used for prediction (water quality parameters + rainfall)
WATER_QUALITY_FEATURES = ["pH", "TDS", "TH", "F", "NO3", "Fe", "Cl", "SO4", "Na", "Ca", "Mg"]
RAINFALL_FEATURE = "annual_rainfall_mm"
ALL_FEATURES = WATER_QUALITY_FEATURES + [RAINFALL_FEATURE]
TARGET = "wqi"


def train():
    print("=" * 60)
    print("  GROUNDWATER RISK MODEL TRAINING")
    print("=" * 60)

    # ── Load wells data ──
    print(f"\n1. Loading wells data from {WELLS_CSV} ...")
    wells = pd.read_csv(WELLS_CSV, low_memory=False)
    print(f"   Wells records: {len(wells)}")

    # ── Load rainfall data ──
    print(f"\n2. Loading rainfall data from {RAINFALL_CSV} ...")
    rainfall = pd.read_csv(RAINFALL_CSV)
    print(f"   Rainfall records: {len(rainfall)}")

    # ── Merge datasets ──
    print("\n3. Merging datasets on (state, district, year) ...")
    # Normalize district names for better matching
    wells["district_lower"] = wells["district"].str.strip().str.lower()
    rainfall["district_lower"] = rainfall["district"].str.strip().str.lower()
    wells["state_lower"] = wells["state"].str.strip().str.lower()
    rainfall["state_lower"] = rainfall["state"].str.strip().str.lower()

    merged = wells.merge(
        rainfall[["state_lower", "district_lower", "year", RAINFALL_FEATURE]],
        on=["state_lower", "district_lower", "year"],
        how="left",
    )

    matched = merged[RAINFALL_FEATURE].notna().sum()
    print(f"   Matched records: {matched} / {len(merged)} ({100*matched/len(merged):.1f}%)")

    # Fill unmatched with state-level average rainfall
    state_avg = rainfall.groupby("state_lower")[RAINFALL_FEATURE].mean()
    for idx in merged[merged[RAINFALL_FEATURE].isna()].index:
        state = merged.loc[idx, "state_lower"]
        merged.loc[idx, RAINFALL_FEATURE] = state_avg.get(state, 1100)

    # ── Prepare feature matrix ──
    print("\n4. Preparing features ...")
    # Rename 'As' column if present
    if "As" in merged.columns:
        merged.rename(columns={"As": "As_col"}, inplace=True)

    # Select features and target
    df = merged[ALL_FEATURES + [TARGET]].copy()

    # Drop rows with missing target
    df = df.dropna(subset=[TARGET])

    # Fill missing features with median
    for col in ALL_FEATURES:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val)

    print(f"   Training samples: {len(df)}")
    print(f"   Features: {ALL_FEATURES}")

    X = df[ALL_FEATURES].values
    y = df[TARGET].values

    # ── Train/test split ──
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # ── Train Random Forest ──
    print("\n5. Training Random Forest model ...")
    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=15,
        min_samples_split=10,
        min_samples_leaf=5,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    # ── Evaluate ──
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    print(f"\n{'='*60}")
    print(f"  MODEL PERFORMANCE")
    print(f"{'='*60}")
    print(f"  MAE  (Mean Absolute Error):  {mae:.2f}")
    print(f"  R²   (R-squared Score):      {r2:.4f}")
    print(f"{'='*60}")

    # ── Feature importance ──
    print("\n  Feature Importances:")
    importances = model.feature_importances_
    for feat, imp in sorted(zip(ALL_FEATURES, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 50)
        print(f"    {feat:>25s}  {imp:.4f}  {bar}")

    # ── Save model ──
    print(f"\n6. Saving model to {MODEL_PATH} ...")

    # Save model along with metadata
    model_data = {
        "model": model,
        "features": ALL_FEATURES,
        "water_quality_features": WATER_QUALITY_FEATURES,
        "rainfall_feature": RAINFALL_FEATURE,
        "feature_medians": {col: float(df[col].median()) for col in ALL_FEATURES},
        "mae": mae,
        "r2": r2,
    }
    joblib.dump(model_data, MODEL_PATH)
    print(f"   Model saved successfully!")
    print(f"\n   Model file size: {os.path.getsize(MODEL_PATH) / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    train()
