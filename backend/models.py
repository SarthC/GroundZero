from sqlalchemy import Column, Integer, Float, String, Boolean
from database import Base


class Well(Base):
    __tablename__ = "wells"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sl_no = Column(String, index=True)
    well_id = Column(String, index=True)
    state = Column(String, index=True)
    district = Column(String, index=True)
    block = Column(String, nullable=True)
    location = Column(String, nullable=True)
    latitude = Column(Float)
    longitude = Column(Float)
    year = Column(Integer, index=True)

    # Water quality parameters
    pH = Column(Float, nullable=True)
    EC = Column(Float, nullable=True)
    CO3 = Column(Float, nullable=True)
    HCO3 = Column(Float, nullable=True)
    Cl = Column(Float, nullable=True)
    SO4 = Column(Float, nullable=True)
    NO3 = Column(Float, nullable=True)
    PO4 = Column(Float, nullable=True)
    TH = Column(Float, nullable=True)
    Ca = Column(Float, nullable=True)
    Mg = Column(Float, nullable=True)
    Na = Column(Float, nullable=True)
    K = Column(Float, nullable=True)
    F = Column(Float, nullable=True)
    SiO2 = Column(Float, nullable=True)
    TDS = Column(Float, nullable=True)
    U = Column(Float, nullable=True)
    Fe = Column(Float, nullable=True)
    As_ = Column("As", Float, nullable=True)

    # Metadata
    source_year = Column(Integer, nullable=True)
    source_file = Column(String, nullable=True)
    state_source = Column(String, nullable=True)
    synthetic_id = Column(Boolean, nullable=True)
    TDS_source = Column(String, nullable=True)

    # Scoring columns
    wqi = Column(Float, nullable=True)
    wqi_category = Column(String, nullable=True)
    risk_level = Column(String, nullable=True)
    risk_band = Column(String, nullable=True)
    risk_basis = Column(String, nullable=True)
    eclipsed = Column(Boolean, nullable=True)
    wqi_n_params = Column(Integer, nullable=True)
    wqi_confidence = Column(String, nullable=True)
    dominant_driver = Column(String, nullable=True)
    n_exceedances = Column(Integer, nullable=True)
    permissible_breaches = Column(Integer, nullable=True)
