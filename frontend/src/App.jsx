import { useState, useEffect } from "react";
import { fetchWells, fetchWellDetail, fetchFilters, fetchDistricts } from "./api";
import StatsBar from "./components/StatsBar";
import MapWidget from "./components/MapWidget";
import WQIDashboard from "./components/WQIDashboard";
import ForecastingWidget from "./components/ForecastingWidget";
import ActionableIntelligence from "./components/ActionableIntelligence";
import LabReportAnalyzer from "./components/LabReportAnalyzer";
import FlickeringGrid from "./components/FlickeringGrid";
import { Droplets, Filter, RefreshCw } from "lucide-react";

export default function App() {
  const [wells, setWells] = useState([]);
  const [selectedWell, setSelectedWell] = useState(null);
  const [wellDetail, setWellDetail] = useState(null);
  const [filters, setFilters] = useState({ states: [], years: [] });
  const [districts, setDistricts] = useState([]);
  const [activeTab, setActiveTab] = useState("map");

  // Filter state
  const [filterState, setFilterState] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const [loading, setLoading] = useState(false);

  // Load filters on mount
  useEffect(() => {
    fetchFilters()
      .then((res) => setFilters(res.data))
      .catch(console.error);
  }, []);

  // Load districts when state changes
  useEffect(() => {
    if (filterState) {
      fetchDistricts(filterState)
        .then((res) => setDistricts(res.data.districts))
        .catch(console.error);
    } else {
      setDistricts([]);
    }
    setFilterDistrict("");
  }, [filterState]);

  // Load wells
  const loadWells = () => {
    setLoading(true);
    const params = {};
    if (filterState) params.state = filterState;
    if (filterDistrict) params.district = filterDistrict;
    if (filterYear) params.year = filterYear;
    if (filterRisk) params.risk_level = filterRisk;
    fetchWells(params)
      .then((res) => {
        setWells(res.data.wells);
        setSelectedWell(null);
        setWellDetail(null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWells();
  }, []);

  // Load well detail when a well is selected
  const handleSelectWell = (well) => {
    setSelectedWell(well);
    fetchWellDetail(well.id)
      .then((res) => setWellDetail(res.data))
      .catch(console.error);
  };

  const TABS = [
    { id: "map", label: "🗺️ Map & WQI" },
    { id: "forecast", label: "📈 Forecast" },
    { id: "intel", label: "🧠 Intelligence" },
    { id: "lab", label: "🧪 Lab Analyzer" },
  ];

  return (
    <div className="min-h-screen bg-[#d0eff5] relative">
      {/* ─── Flickering Grid Background ─── */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
        <FlickeringGrid
          squareSize={4}
          gridGap={6}
          color="#2e6c7a"
          maxOpacity={0.4}
          flickerChance={0.1}
        />
      </div>

      {/* ─── Content ─── */}
      <div className="relative z-10">
      {/* ─── Header ─── */}
      <header className="bg-black text-white border-b-4 border-black">
        <div className="max-w-[1800px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div
              className="w-12 h-12 flex items-center justify-center border-4 border-white shrink-0"
              style={{ backgroundColor: "#eafed0", boxShadow: "4px 4px 0px rgba(255,255,255,0.3)" }}
            >
              <Droplets size={24} strokeWidth={3} color="#000" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold uppercase tracking-wider">
                Groundwater Risk Intelligence
              </h1>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                AI-Powered Contamination Analysis Dashboard
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-6 space-y-6">
        {/* ─── Stats ─── */}
        <StatsBar />

        {/* ─── Filters ─── */}
        <div className="neu-card flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-3">
          <div className="flex items-center gap-2 mr-2 mb-2 sm:mb-0 w-full sm:w-auto">
            <Filter size={18} strokeWidth={3} />
            <span className="font-bold uppercase tracking-wider text-sm">Filters</span>
          </div>

          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="neu-select w-full sm:w-auto"
          >
            <option value="">All States</option>
            {filters.states?.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={filterDistrict}
            onChange={(e) => setFilterDistrict(e.target.value)}
            className="neu-select w-full sm:w-auto"
            disabled={!filterState}
          >
            <option value="">All Districts</option>
            {districts?.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="neu-select w-full sm:w-auto"
          >
            <option value="">All Years</option>
            {filters.years?.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value)}
            className="neu-select w-full sm:w-auto"
          >
            <option value="">All Risk Levels</option>
            <option value="Low">🟢 Low</option>
            <option value="Moderate">🟡 Moderate</option>
            <option value="High">🔴 High</option>
          </select>

          <button onClick={loadWells} className="neu-btn flex items-center justify-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <RefreshCw size={14} strokeWidth={3} className={loading ? "animate-spin" : ""} />
            Apply
          </button>

          <span className="text-xs font-bold text-gray-500 ml-auto">
            {wells.length} wells loaded
          </span>
        </div>

        {/* ─── Tab Navigation ─── */}
        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 font-bold uppercase tracking-wider text-sm border-4 border-black transition-all ${
                activeTab === tab.id
                  ? "bg-[#f7fa99] shadow-none translate-x-[2px] translate-y-[2px]"
                  : "bg-white"
              }`}
              style={{
                boxShadow: activeTab === tab.id ? "none" : "4px 4px 0px rgba(0,0,0,1)",
                marginLeft: tab.id !== "map" ? -4 : 0,
                minWidth: "max-content",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Tab Content ─── */}
        {activeTab === "map" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
            {/* Map - 2 cols */}
            <div className="lg:col-span-2 space-y-6">
              <MapWidget
                wells={wells}
                onSelectWell={handleSelectWell}
                selectedWellId={selectedWell?.id}
              />
              {selectedWell && (
                <div className="neu-card-green">
                  <p className="text-sm font-bold uppercase tracking-wider">
                    Selected: {selectedWell.location || selectedWell.district}
                  </p>
                  <p className="text-xs font-medium">
                    {selectedWell.state} • {selectedWell.district} • Year {selectedWell.year} • WQI: {selectedWell.wqi}
                  </p>
                </div>
              )}
            </div>

            {/* WQI Panel - 1 col */}
            <div className="lg:col-span-1 space-y-6">
              <WQIDashboard wellDetail={wellDetail} />
            </div>
          </div>
        )}

        {activeTab === "forecast" && (
          <div className="animate-slide-up">
            <ForecastingWidget selectedWell={selectedWell} />
          </div>
        )}

        {activeTab === "intel" && (
          <div className="animate-slide-up">
            <ActionableIntelligence />
          </div>
        )}

        {activeTab === "lab" && (
          <div className="max-w-2xl mx-auto animate-slide-up">
            <LabReportAnalyzer />
          </div>
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="bg-black text-white border-t-4 border-black mt-8">
        <div className="max-w-[1800px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="text-xs font-medium text-gray-400">
            AI Groundwater Risk Intelligence System • Data: CGWB India
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
