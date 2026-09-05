# GroundZero: AI Groundwater Risk Intelligence

GroundZero is an AI-powered groundwater contamination analysis and risk intelligence dashboard. It provides actionable insights into water quality across various states and districts in India, leveraging data from the Central Ground Water Board (CGWB).

## Features

- **Interactive Map Visualization**: Explore groundwater quality across India with an interactive map showing well locations and their corresponding risk levels.
- **Water Quality Index (WQI) Dashboard**: View detailed metrics for individual wells, including a WQI gauge and parameter breakdown (pH, TDS, Hardness, Fluoride, Nitrate, Iron, Chloride) against BIS limits.
- **AI-Powered Risk Explainability**: Understand *why* a well is considered risky with SHAP value visualizations highlighting the most impactful contaminants.
- **Lab Report Analyzer**: Manually input parameters from a physical lab report to instantly calculate the Water Quality Index and assess safety.
- **Water Usability Classification**: Automatically classifies water suitability into 5 tiers based on chemical parameters:
  - 🚰 Safe for Drinking
  - 🛁 Safe for Cooking & Bathing
  - 👕 Safe for Washing & Cleaning
  - 🏭 Safe for Industrial/Agricultural Use
  - ☠️ Not Usable (Requires treatment)

## Tech Stack

### Frontend
- **React.js** (Vite)
- **TailwindCSS** for styling (Neubrutalism design system)
- **Recharts** for data visualization and gauges
- **React-Leaflet** for interactive maps
- **Axios** for API communication

### Backend
- **FastAPI** (Python) for high-performance REST APIs
- **SQLite** + **SQLAlchemy** for database management and querying
- **Pandas** for data processing
- **Uvicorn** as the ASGI server

## Getting Started

### Prerequisites
- Node.js (v16+)
- Python 3.9+

### Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## License
MIT License
