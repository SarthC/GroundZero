import { useState } from "react";
import { postPollutionTrace } from "../api";
import { Search, ArrowRight, AlertTriangle, MapPin, Waves } from "lucide-react";

export default function PollutionTracer() {
  const [upstreamName, setUpstreamName] = useState("");
  const [downstreamName, setDownstreamName] = useState("");
  const [bufferKm, setBufferKm] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleTrace = async () => {
    if (!upstreamName.trim() || !downstreamName.trim()) {
      setError("Please enter both upstream and downstream location names.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await postPollutionTrace({
        upstream_name: upstreamName,
        downstream_name: downstreamName,
        buffer_km: bufferKm,
      });
      if (res.data.error) {
        setError(res.data.error);
      } else {
        setResult(res.data);
      }
    } catch {
      setError("Something went wrong. Please try again.");
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

  return (
    <div className="space-y-4">
      {/* ─── Input Section ─── */}
      <div className="neu-card">
        <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4 flex items-center gap-2">
          <Waves size={18} strokeWidth={3} />
          River Pollution Source Tracer
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Enter an upstream (clean water) and downstream (polluted water) location to
          identify potential industrial pollution sources between them.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block">
              📍 Upstream Location (Clean Water)
            </label>
            <input
              type="text"
              value={upstreamName}
              onChange={(e) => setUpstreamName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrace()}
              placeholder="e.g. Nashik, Pune, Loni Kalbhor"
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
              placeholder="e.g. Sangamner, Solapur"
              className="neu-input w-full"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block">
              Search Radius: {bufferKm} km
            </label>
            <input
              type="range"
              min="1"
              max="15"
              value={bufferKm}
              onChange={(e) => setBufferKm(Number(e.target.value))}
              className="w-40 accent-black"
            />
          </div>
          <button
            onClick={handleTrace}
            disabled={loading}
            className="neu-btn-green flex items-center gap-2"
          >
            {loading ? (
              <span className="animate-pulse font-bold">Tracing...</span>
            ) : (
              <>
                <Search size={16} strokeWidth={3} />
                Trace Pollution Sources
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 border-3 border-red-600 bg-red-50 text-sm font-bold text-red-700">
            ❌ {error}
          </div>
        )}
      </div>

      {/* ─── Results ─── */}
      {result && (
        <>
          {/* ─── Upstream vs Downstream Comparison ─── */}
          <div className="neu-card">
            <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4 flex items-center gap-2">
              <MapPin size={18} strokeWidth={3} />
              Water Quality Comparison
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Upstream */}
              <div
                className="p-4 border-3 border-black bg-green-50"
                style={{ boxShadow: "4px 4px 0px rgba(0,0,0,1)" }}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-green-700 mb-1">
                  ⬆️ Upstream
                </p>
                <p className="text-sm font-bold">{result.upstream.name}</p>
                <p className="text-xs text-gray-600">
                  {result.upstream.district}, {result.upstream.state}
                </p>
                <div className="mt-2">
                  <span className="text-2xl font-bold">{result.upstream.wqi}</span>
                  <span className="text-xs ml-1 font-medium">/ 100 WQI</span>
                </div>
                <p className="text-xs font-bold mt-1">
                  {riskEmoji(result.upstream.risk_level)} {result.upstream.category} —{" "}
                  {result.upstream.risk_level} Risk
                </p>
              </div>

              {/* Arrow / Summary */}
              <div className="flex flex-col items-center justify-center py-2">
                <ArrowRight
                  size={32}
                  strokeWidth={3}
                  className="hidden md:block"
                />
                <p className="text-xs font-bold text-gray-500 mt-1">
                  {result.corridor.distance_km} km apart
                </p>
                <div
                  className="mt-2 px-3 py-1 border-3 border-black text-xs font-bold"
                  style={{
                    backgroundColor: severityColor(result.degradation.severity).bg,
                    color: severityColor(result.degradation.severity).text,
                    boxShadow: "3px 3px 0px rgba(0,0,0,1)",
                  }}
                >
                  {result.degradation.severity} Degradation
                </div>
                {result.degradation.wqi_change > 0 && (
                  <p className="text-xs font-bold text-red-600 mt-1">
                    WQI +{result.degradation.wqi_change} ↑
                  </p>
                )}
                {result.degradation.wqi_change <= 0 && (
                  <p className="text-xs font-bold text-green-600 mt-1">
                    WQI {result.degradation.wqi_change} ↓
                  </p>
                )}
              </div>

              {/* Downstream */}
              <div
                className="p-4 border-3 border-black bg-red-50"
                style={{ boxShadow: "4px 4px 0px rgba(0,0,0,1)" }}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-red-700 mb-1">
                  ⬇️ Downstream
                </p>
                <p className="text-sm font-bold">{result.downstream.name}</p>
                <p className="text-xs text-gray-600">
                  {result.downstream.district}, {result.downstream.state}
                </p>
                <div className="mt-2">
                  <span className="text-2xl font-bold">{result.downstream.wqi}</span>
                  <span className="text-xs ml-1 font-medium">/ 100 WQI</span>
                </div>
                <p className="text-xs font-bold mt-1">
                  {riskEmoji(result.downstream.risk_level)} {result.downstream.category} —{" "}
                  {result.downstream.risk_level} Risk
                </p>
              </div>
            </div>
          </div>

          {/* ─── Degradation Analysis ─── */}
          {result.degradation.degraded_params.length > 0 && (
            <div className="neu-card-yellow">
              <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-3 flex items-center gap-2">
                <AlertTriangle size={18} strokeWidth={3} />
                Degradation Analysis
              </h3>

              <p className="text-sm font-medium mb-3">
                {result.degradation.cause_summary}
              </p>

              {/* Parameter change table */}
              <div className="space-y-2 mb-4">
                {Object.entries(result.degradation.param_changes).map(
                  ([param, data]) => (
                    <div
                      key={param}
                      className="flex items-center justify-between p-2 border-2 border-black bg-white text-sm"
                    >
                      <span className="font-bold">{param}</span>
                      <span>
                        {data.upstream} →{" "}
                        <span className="text-red-600 font-bold">
                          {data.downstream}
                        </span>
                        <span className="text-xs ml-1 text-gray-500">
                          ({data.pct_change > 0 ? "+" : ""}
                          {data.pct_change}%)
                        </span>
                      </span>
                    </div>
                  )
                )}
              </div>

              {/* Likely pollution source badges */}
              {result.degradation.likely_sources.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2">
                    Likely Pollution Source Types:
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

          {/* ─── No Degradation ─── */}
          {result.degradation.degraded_params.length === 0 && (
            <div className="neu-card-green">
              <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-3">
                ✅ No Significant Degradation Detected
              </h3>
              <p className="text-sm font-medium">
                Water quality parameters between these two locations are relatively
                stable. No significant industrial pollution impact detected on this
                stretch.
              </p>
            </div>
          )}

          {/* ─── Industries Found ─── */}
          <div className="neu-card">
            <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-3 flex items-center gap-2">
              🏭 Industries Found in Corridor
              <span
                className="ml-auto px-2 py-0.5 border-2 border-black text-xs"
                style={{ boxShadow: "2px 2px 0px rgba(0,0,0,1)" }}
              >
                {result.corridor.total_industries} total
              </span>
            </h3>

            {result.industries.length === 0 ? (
              <p className="text-sm text-gray-600 font-medium">
                No industrial facilities found in the {bufferKm} km corridor. Try
                increasing the search radius.
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
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
                      <p className="text-xs text-gray-600">{ind.type}</p>
                      <p className="text-xs font-medium mt-1">
                        📏 {ind.distance_from_upstream_km} km from upstream •{" "}
                        {ind.distance_from_downstream_km} km from downstream
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
