import { useState, useEffect } from "react";
import { postPollutionTrace } from "../api";
import {
  Search,
  ArrowRight,
  AlertTriangle,
  MapPin,
  Waves,
  MousePointerClick,
  RotateCcw,
  Building2,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const RISK_COLORS = {
  green: "#e4fee1",
  yellow: "#f7fa99",
  red: "#621d1d",
};

// Component to handle clicks on the map for picking points
function MapClickHandler({ selectionMode, onPointSelect }) {
  useMapEvents({
    click(e) {
      if (selectionMode) {
        onPointSelect(selectionMode, e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// Auto fit bounds when points or corridor changes
function FitCorridorBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      const validPoints = points.filter((p) => p && p[0] && p[1]);
      if (validPoints.length === 1) {
        map.setView(validPoints[0], 10);
      } else if (validPoints.length > 1) {
        map.fitBounds(validPoints, { padding: [50, 50] });
      }
    }
  }, [points, map]);
  return null;
}

export default function PollutionTracer({ wells = [] }) {
  const [inputMode, setInputMode] = useState("map"); // "map" or "text"
  const [upstreamName, setUpstreamName] = useState("");
  const [downstreamName, setDownstreamName] = useState("");

  // Map selection coordinates & display labels
  const [upstreamPoint, setUpstreamPoint] = useState(null); // { lat, lng, label }
  const [downstreamPoint, setDownstreamPoint] = useState(null); // { lat, lng, label }
  const [activeSelection, setActiveSelection] = useState("upstream"); // "upstream" | "downstream" | null

  const [bufferKm, setBufferKm] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handlePointSelect = (type, lat, lng, name = null) => {
    const formatted = {
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
      label: name || `Coord (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
    };

    if (type === "upstream") {
      setUpstreamPoint(formatted);
      setUpstreamName(formatted.label);
      setActiveSelection("downstream");
    } else {
      setDownstreamPoint(formatted);
      setDownstreamName(formatted.label);
      setActiveSelection(null);
    }
  };

  const resetSelection = () => {
    setUpstreamPoint(null);
    setDownstreamPoint(null);
    setUpstreamName("");
    setDownstreamName("");
    setResult(null);
    setError("");
    setActiveSelection("upstream");
  };

  const handleTrace = async () => {
    setError("");

    if (inputMode === "map") {
      if (!upstreamPoint || !downstreamPoint) {
        setError("Please click on the map to select both Upstream and Downstream locations.");
        return;
      }
    } else {
      if (!upstreamName.trim() || !downstreamName.trim()) {
        setError("Please enter both upstream and downstream location names.");
        return;
      }
    }

    setLoading(true);
    setResult(null);

    const payload = {
      buffer_km: bufferKm,
    };

    if (inputMode === "map" && upstreamPoint && downstreamPoint) {
      payload.upstream_coords = { lat: upstreamPoint.lat, lng: upstreamPoint.lng };
      payload.downstream_coords = { lat: downstreamPoint.lat, lng: downstreamPoint.lng };
      payload.upstream_name = upstreamPoint.label;
      payload.downstream_name = downstreamPoint.label;
    } else {
      payload.upstream_name = upstreamName;
      payload.downstream_name = downstreamName;
    }

    try {
      const res = await postPollutionTrace(payload);
      if (res.data.error) {
        setError(res.data.error);
      } else {
        setResult(res.data);
        if (res.data.upstream) {
          setUpstreamPoint({
            lat: res.data.upstream.lat,
            lng: res.data.upstream.lng,
            label: res.data.upstream.name,
          });
        }
        if (res.data.downstream) {
          setDownstreamPoint({
            lat: res.data.downstream.lat,
            lng: res.data.downstream.lng,
            label: res.data.downstream.name,
          });
        }
      }
    } catch {
      setError("Failed to run pollution trace. Please check server connection and try again.");
    }
    setLoading(false);
  };

  const severityColor = (severity) => {
    switch (severity) {
      case "Severe":
        return { bg: "#621d1d", text: "#fff" };
      case "Moderate":
        return { bg: "#f7fa99", text: "#000" };
      case "Mild":
        return { bg: "#eafed0", text: "#000" };
      default:
        return { bg: "#e0e0e0", text: "#000" };
    }
  };

  const riskEmoji = (risk) => {
    switch (risk) {
      case "High":
        return "🔴";
      case "Moderate":
        return "🟡";
      default:
        return "🟢";
    }
  };

  // Collect points for map fitting
  const mapPointsToFit = [];
  if (upstreamPoint) mapPointsToFit.push([upstreamPoint.lat, upstreamPoint.lng]);
  if (downstreamPoint) mapPointsToFit.push([downstreamPoint.lat, downstreamPoint.lng]);
  if (result && result.industries) {
    result.industries.forEach((ind) => mapPointsToFit.push([ind.lat, ind.lng]));
  }

  return (
    <div className="space-y-6">
      {/* ─── Control & Selection Header ─── */}
      <div className="neu-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b-3 border-black pb-3 mb-4 gap-3">
          <h3 className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
            <Waves size={20} strokeWidth={3} />
            River Pollution Source Tracer
          </h3>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-gray-600">Select via:</span>
            <div className="inline-flex border-2 border-black" style={{ boxShadow: "2px 2px 0px rgba(0,0,0,1)" }}>
              <button
                type="button"
                onClick={() => setInputMode("map")}
                className={`px-3 py-1 text-xs font-bold uppercase flex items-center gap-1.5 transition-colors ${
                  inputMode === "map" ? "bg-[#f7fa99] text-black" : "bg-white text-gray-700"
                }`}
              >
                <MousePointerClick size={14} strokeWidth={2.5} />
                Click Map
              </button>
              <button
                type="button"
                onClick={() => setInputMode("text")}
                className={`px-3 py-1 text-xs font-bold uppercase border-l-2 border-black flex items-center gap-1.5 transition-colors ${
                  inputMode === "text" ? "bg-[#f7fa99] text-black" : "bg-white text-gray-700"
                }`}
              >
                <Search size={14} strokeWidth={2.5} />
                Type Names
              </button>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-700 font-medium mb-4">
          Pinpoint an upstream river location (cleaner water) and downstream location (polluted water)
          to automatically scan the corridor for industrial sewage and effluent dischargers.
        </p>

        {/* ─── Interactive Map Selection UI ─── */}
        {inputMode === "map" && (
          <div className="space-y-3 mb-4">
            <div className="flex flex-wrap items-center gap-2 p-2 bg-yellow-50 border-2 border-black">
              <span className="text-xs font-bold uppercase">Selection Status:</span>
              <button
                type="button"
                onClick={() => setActiveSelection("upstream")}
                className={`px-2.5 py-1 text-xs font-bold uppercase border-2 border-black transition-all ${
                  activeSelection === "upstream"
                    ? "bg-[#621d1d] text-white shadow-none translate-x-[1px] translate-y-[1px]"
                    : upstreamPoint
                    ? "bg-[#eafed0] text-black"
                    : "bg-white text-black"
                }`}
                style={{ boxShadow: activeSelection === "upstream" ? "none" : "2px 2px 0px rgba(0,0,0,1)" }}
              >
                1. Pick Upstream (Clean) {upstreamPoint ? "✓" : "📍"}
              </button>
              <button
                type="button"
                onClick={() => setActiveSelection("downstream")}
                className={`px-2.5 py-1 text-xs font-bold uppercase border-2 border-black transition-all ${
                  activeSelection === "downstream"
                    ? "bg-[#621d1d] text-white shadow-none translate-x-[1px] translate-y-[1px]"
                    : downstreamPoint
                    ? "bg-[#eafed0] text-black"
                    : "bg-white text-black"
                }`}
                style={{ boxShadow: activeSelection === "downstream" ? "none" : "2px 2px 0px rgba(0,0,0,1)" }}
              >
                2. Pick Downstream (Polluted) {downstreamPoint ? "✓" : "📍"}
              </button>

              {(upstreamPoint || downstreamPoint) && (
                <button
                  type="button"
                  onClick={resetSelection}
                  className="ml-auto px-2 py-1 text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={12} strokeWidth={2.5} />
                  Reset Points
                </button>
              )}
            </div>

            {/* Interactive Leaflet Map */}
            <div
              className="relative border-3 border-black overflow-hidden"
              style={{ boxShadow: "4px 4px 0px rgba(0,0,0,1)" }}
            >
              <div className="absolute top-2 left-2 z-[400] bg-white border-2 border-black px-2.5 py-1 text-xs font-bold pointer-events-none">
                {activeSelection
                  ? `👉 Click anywhere on map to select ${activeSelection.toUpperCase()} location`
                  : "✓ Both points selected! Click 'Trace Pollution Sources' below."}
              </div>

              <MapContainer
                center={[18.5204, 73.8567]}
                zoom={7}
                scrollWheelZoom={true}
                className="z-0 h-[400px] w-full cursor-crosshair"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler
                  selectionMode={activeSelection}
                  onPointSelect={handlePointSelect}
                />
                {mapPointsToFit.length > 0 && <FitCorridorBounds points={mapPointsToFit} />}

                {/* Background Monitoring Wells */}
                {wells.slice(0, 1500).map((well) => (
                  <CircleMarker
                    key={well.id}
                    center={[well.lat, well.lng]}
                    radius={4}
                    pathOptions={{
                      color: "#000",
                      weight: 1,
                      fillColor: RISK_COLORS[well.color] || "#e4fee1",
                      fillOpacity: 0.7,
                    }}
                    eventHandlers={{
                      click: (e) => {
                        e.originalEvent.stopPropagation();
                        if (activeSelection) {
                          handlePointSelect(
                            activeSelection,
                            well.lat,
                            well.lng,
                            well.location || well.district
                          );
                        }
                      },
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-bold">
                        <p>{well.location || well.district}</p>
                        <p className="text-gray-600">WQI: {well.wqi} ({well.risk_level})</p>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeSelection) {
                              handlePointSelect(
                                activeSelection,
                                well.lat,
                                well.lng,
                                well.location || well.district
                              );
                            }
                          }}
                          className="mt-1 px-2 py-0.5 bg-black text-white text-[10px] font-bold uppercase cursor-pointer"
                        >
                          Select as {activeSelection || "Point"}
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                {/* Upstream Selected Marker */}
                {upstreamPoint && (
                  <CircleMarker
                    center={[upstreamPoint.lat, upstreamPoint.lng]}
                    radius={12}
                    pathOptions={{
                      color: "#000",
                      weight: 3,
                      fillColor: "#22c55e",
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-bold">
                        <span className="text-green-700">⬆️ Upstream Point</span>
                        <p>{upstreamPoint.label}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                )}

                {/* Downstream Selected Marker */}
                {downstreamPoint && (
                  <CircleMarker
                    center={[downstreamPoint.lat, downstreamPoint.lng]}
                    radius={12}
                    pathOptions={{
                      color: "#000",
                      weight: 3,
                      fillColor: "#ef4444",
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-bold">
                        <span className="text-red-700">⬇️ Downstream Point</span>
                        <p>{downstreamPoint.label}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                )}

                {/* Corridor Line */}
                {upstreamPoint && downstreamPoint && (
                  <Polyline
                    positions={[
                      [upstreamPoint.lat, upstreamPoint.lng],
                      [downstreamPoint.lat, downstreamPoint.lng],
                    ]}
                    pathOptions={{
                      color: "#000",
                      weight: 4,
                      dashArray: "6, 8",
                    }}
                  />
                )}

                {/* Found Industries Markers */}
                {result &&
                  result.industries &&
                  result.industries.map((ind, i) => (
                    <CircleMarker
                      key={`ind-${i}`}
                      center={[ind.lat, ind.lng]}
                      radius={8}
                      pathOptions={{
                        color: "#000",
                        weight: 2,
                        fillColor: "#f59e0b",
                        fillOpacity: 0.9,
                      }}
                    >
                      <Popup>
                        <div className="text-xs font-bold">
                          <p className="text-amber-800">🏭 {ind.name}</p>
                          <p className="text-gray-600">{ind.type}</p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            {ind.distance_from_upstream_km} km from upstream
                          </p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
              </MapContainer>
            </div>
          </div>
        )}

        {/* ─── Text Input Mode UI ─── */}
        {inputMode === "text" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1 block">
                📍 Upstream Location (Clean Water)
              </label>
              <input
                type="text"
                value={upstreamName}
                onChange={(e) => setUpstreamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrace()}
                placeholder="e.g. Pune, Nashik, Loni Kalbhor"
                className="neu-input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1 block">
                📍 Downstream Location (Polluted Water)
              </label>
              <input
                type="text"
                value={downstreamName}
                onChange={(e) => setDownstreamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrace()}
                placeholder="e.g. Solapur, Sangamner"
                className="neu-input w-full"
              />
            </div>
          </div>
        )}

        {/* ─── Shared Controls (Buffer & Submit) ─── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 pt-2 border-t-2 border-black">
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-1">
                Corridor Width: <span className="text-blue-700">{bufferKm} km</span> buffer
              </label>
              <input
                type="range"
                min="1"
                max="15"
                value={bufferKm}
                onChange={(e) => setBufferKm(Number(e.target.value))}
                className="w-48 accent-black cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={handleTrace}
            disabled={loading}
            className="neu-btn-green flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            {loading ? (
              <span className="animate-pulse font-bold">Scanning Corridor via OSM...</span>
            ) : (
              <>
                <Search size={16} strokeWidth={3} />
                Trace Pollution Sources
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 border-3 border-red-600 bg-red-50 text-sm font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle size={18} strokeWidth={3} />
            {error}
          </div>
        )}
      </div>

      {/* ─── Trace Results ─── */}
      {result && (
        <>
          {/* Comparison Cards */}
          <div className="neu-card">
            <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4 flex items-center gap-2">
              <MapPin size={18} strokeWidth={3} />
              Water Quality Comparison Along River Corridor
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Upstream Card */}
              <div
                className="p-4 border-3 border-black bg-[#eafed0]"
                style={{ boxShadow: "4px 4px 0px rgba(0,0,0,1)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-green-900">
                    ⬆️ Upstream Point
                  </p>
                  <span className="text-xs px-2 py-0.5 bg-white border border-black font-bold">
                    Clean
                  </span>
                </div>
                <p className="text-base font-bold truncate">{result.upstream.name}</p>
                <p className="text-xs text-gray-700">
                  {result.upstream.district}, {result.upstream.state}
                </p>
                <div className="mt-3">
                  <span className="text-3xl font-extrabold">{result.upstream.wqi}</span>
                  <span className="text-xs ml-1 font-bold text-gray-600">/ 100 WQI</span>
                </div>
                <p className="text-xs font-bold mt-2">
                  {riskEmoji(result.upstream.risk_level)} {result.upstream.category} — {result.upstream.risk_level} Risk
                </p>
              </div>

              {/* Corridor Difference Summary */}
              <div className="flex flex-col items-center justify-center p-3 text-center">
                <ArrowRight size={32} strokeWidth={3} className="hidden md:block mb-1 text-gray-800" />
                <p className="text-xs font-extrabold uppercase tracking-wider text-gray-600">
                  {result.corridor.distance_km} km Corridor
                </p>
                <div
                  className="mt-2 px-3 py-1.5 border-3 border-black text-xs font-bold"
                  style={{
                    backgroundColor: severityColor(result.degradation.severity).bg,
                    color: severityColor(result.degradation.severity).text,
                    boxShadow: "3px 3px 0px rgba(0,0,0,1)",
                  }}
                >
                  {result.degradation.severity} Degradation
                </div>
                {result.degradation.wqi_change > 0 && (
                  <p className="text-xs font-bold text-red-600 mt-2">
                    WQI increased by +{result.degradation.wqi_change} points
                  </p>
                )}
                {result.degradation.wqi_change <= 0 && (
                  <p className="text-xs font-bold text-green-700 mt-2">
                    WQI change: {result.degradation.wqi_change} points
                  </p>
                )}
              </div>

              {/* Downstream Card */}
              <div
                className="p-4 border-3 border-black bg-[#fee2e2]"
                style={{ boxShadow: "4px 4px 0px rgba(0,0,0,1)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-900">
                    ⬇️ Downstream Point
                  </p>
                  <span className="text-xs px-2 py-0.5 bg-white border border-black font-bold">
                    Polluted
                  </span>
                </div>
                <p className="text-base font-bold truncate">{result.downstream.name}</p>
                <p className="text-xs text-gray-700">
                  {result.downstream.district}, {result.downstream.state}
                </p>
                <div className="mt-3">
                  <span className="text-3xl font-extrabold">{result.downstream.wqi}</span>
                  <span className="text-xs ml-1 font-bold text-gray-600">/ 100 WQI</span>
                </div>
                <p className="text-xs font-bold mt-2">
                  {riskEmoji(result.downstream.risk_level)} {result.downstream.category} — {result.downstream.risk_level} Risk
                </p>
              </div>
            </div>
          </div>

          {/* Degradation Parameter Breakdown */}
          {result.degradation.degraded_params.length > 0 && (
            <div className="neu-card-yellow">
              <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-3 flex items-center gap-2">
                <AlertTriangle size={18} strokeWidth={3} />
                Pollution Analysis & Inferred Sources
              </h3>

              <p className="text-sm font-bold mb-3">{result.degradation.cause_summary}</p>

              {/* Parameter change chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                {Object.entries(result.degradation.param_changes).map(([param, data]) => (
                  <div
                    key={param}
                    className="flex items-center justify-between p-2 border-2 border-black bg-white text-xs font-medium"
                  >
                    <span className="font-bold">{param}</span>
                    <span>
                      {data.upstream} → <span className="text-red-600 font-bold">{data.downstream}</span>
                      <span className="ml-1 text-[11px] text-gray-500 font-bold">
                        ({data.pct_change > 0 ? "+" : ""}
                        {data.pct_change}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Likely industrial facility tags */}
              {result.degradation.likely_sources.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2">
                    Likely Industrial Dischargers:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.degradation.likely_sources.map((src, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 border-2 border-black bg-white text-xs font-bold"
                        style={{ boxShadow: "2px 2px 0px rgba(0,0,0,1)" }}
                      >
                        {src.emoji} {src.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Industry Cards */}
          <div className="neu-card">
            <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-3 flex items-center gap-2">
              <Building2 size={18} strokeWidth={3} />
              Identified Facilities in River Stretch ({result.corridor.total_industries} Found)
            </h3>

            {result.industries.length === 0 ? (
              <p className="text-sm text-gray-600 font-medium">
                No registered industrial facilities located directly inside the {bufferKm} km corridor.
                Consider increasing the corridor width slider.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                {result.industries.map((ind, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 border-3 border-black bg-white hover:bg-yellow-50 transition-colors"
                    style={{ boxShadow: "3px 3px 0px rgba(0,0,0,1)" }}
                  >
                    <span
                      className="text-xs font-bold bg-black text-white w-6 h-6 flex items-center justify-center shrink-0"
                      style={{ minWidth: 24 }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{ind.name}</p>
                      <p className="text-xs text-gray-600 font-medium">{ind.type}</p>
                      <p className="text-xs font-medium text-gray-700 mt-1">
                        📏 {ind.distance_from_upstream_km} km from upstream • {ind.distance_from_downstream_km} km from downstream
                      </p>
                    </div>
                    <span className="text-lg shrink-0">🏭</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
