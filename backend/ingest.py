"""
Data ingestion script — loads wells_scored.csv into the SQLite database.
Run once: python ingest.py
"""
import os
import pandas as pd
from database import engine, Base
from models import Well  # noqa: F401

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
CSV_PATH = os.path.join(DATA_DIR, "wells_scored.csv")


def ingest():
    # Drop & recreate tables via ORM (ensures the `id` column exists)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print(f"Reading {CSV_PATH} ...")
    df = pd.read_csv(CSV_PATH, low_memory=False)

    # Rename 'As' column to match ORM column name
    if "As" in df.columns:
        df.rename(columns={"As": "As_col"}, inplace=True)

    # Convert synthetic_id / eclipsed to bool
    for col in ["synthetic_id", "eclipsed"]:
        if col in df.columns:
            df[col] = df[col].map({"True": True, "False": False, True: True, False: False})

    # Ensure numeric columns are actually numeric
    numeric_cols = [
        "latitude", "longitude", "pH", "EC", "CO3", "HCO3", "Cl", "SO4",
        "NO3", "PO4", "TH", "Ca", "Mg", "Na", "K", "F", "SiO2", "TDS",
        "U", "Fe", "As_col", "wqi", "n_exceedances", "permissible_breaches",
        "wqi_n_params"
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Add an explicit `id` column (1-indexed)
    df.insert(0, "id", range(1, len(df) + 1))

    # Rename columns to match the DB table exactly
    col_map = {"As_col": "As"}
    df.rename(columns=col_map, inplace=True)

    print(f"Inserting {len(df)} rows into the database ...")
    # Use append mode since we already created the table via ORM
    df.to_sql("wells", con=engine, if_exists="append", index=False)
    print("Done!")


if __name__ == "__main__":
    ingest()
