import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, ReferenceLine,
} from "recharts";
import { fetchForecast } from "../api";

export default function ForecastingWidget({ selectedWell }) {
  const [horizon, setHorizon] = useState(12);
  const [rainfallDelta, setRainfallDelta] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedWell) return;
    setLoading(true);
    fetchForecast(selectedWell.id, { horizon, rainfall_delta: rainfallDelta })
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedWell?.id, horizon, rainfallDelta]);

  if (!selectedWell) {
    return (
      <div className="neu-card h-full flex items-center justify-center">
        <p className="text-lg font-bold text-center">
          ← Select a well to see contamination forecasts
        </p>
      </div>
    );
  }

  // Merge historical + forecast for the chart
  const chartData = [];
  if (data) {
    data.historical?.forEach((h) => {
      chartData.push({ date: h.date, historical: h.wqi, forecast: null, lower: null, upper: null });
    });
    // Bridge point
    if (data.historical?.length > 0 && data.forecast?.length > 0) {
      const last = data.historical[data.historical.length - 1];
      chartData.push({
        date: last.date,
        historical: last.wqi,
        forecast: last.wqi,
        lower: last.wqi,
        upper: last.wqi,
      });
    }
    data.forecast?.forEach((f) => {
      chartData.push({ date: f.date, historical: null, forecast: f.wqi, lower: f.lower, upper: f.upper });
    });
  }

  // Predicted risk after "what if" scenario
  const lastForecast = data?.forecast?.[data.forecast.length - 1];
  const predictedWqi = lastForecast?.wqi;
  const riskLabel =
    predictedWqi > 75 ? "High" : predictedWqi > 50 ? "Moderate" : "Low";
  const riskColor =
    predictedWqi > 75 ? "#621d1d" : predictedWqi > 50 ? "#f7fa99" : "#e4fee1";


  return (
    <div className="space-y-4">
      {/* Trend Graph */}
      <div className="neu-card">
        <h3 className="text-lg font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4">
          📈 Contamination Trend & Forecast
        </h3>
        {loading ? (
          <div className="h-[250px] flex items-center justify-center">
            <p className="font-bold animate-pulse">Loading forecast...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#000" strokeOpacity={0.1} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fontWeight: 600, fill: "#000" }}
                axisLine={{ stroke: "#000", strokeWidth: 2 }}
                tickLine={{ stroke: "#000", strokeWidth: 2 }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#000" }}
                axisLine={{ stroke: "#000", strokeWidth: 2 }}
                tickLine={{ stroke: "#000", strokeWidth: 2 }}
              />
              <Tooltip
                contentStyle={{
                  border: "3px solid #000",
                  borderRadius: 0,
                  boxShadow: "4px 4px 0px rgba(0,0,0,1)",
                  fontFamily: "Rovique",
                  fontWeight: 600,
                }}
              />
              <ReferenceLine y={75} stroke="#621d1d" strokeWidth={2} strokeDasharray="8 4" label={{ value: "High Risk", position: "right", fontSize: 10, fontWeight: 700, fill: "#621d1d" }} />
              {/* Confidence band */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="#f7fa99"
                fillOpacity={0.2}
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="#fff"
                fillOpacity={1}
              />
              {/* Historical line */}
              <Line
                type="monotone"
                dataKey="historical"
                stroke="#000"
                strokeWidth={3}
                dot={{ r: 5, fill: "#000", strokeWidth: 0 }}
                connectNulls={false}
              />
              {/* Forecast line (dashed) */}
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#FF6EC7"
                strokeWidth={3}
                strokeDasharray="8 4"
                dot={{ r: 4, fill: "#FF6EC7", stroke: "#000", strokeWidth: 2 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="flex items-center gap-4 mt-2 text-xs font-medium">
          <span className="flex items-center gap-1">
            <span className="w-6 h-1 bg-black inline-block" /> Historical
          </span>
          <span className="flex items-center gap-1">
            <span className="w-6 h-1 bg-[#FF6EC7] inline-block" style={{ borderTop: "2px dashed #FF6EC7" }} /> Forecast
          </span>
        </div>
      </div>

      {/* Horizon Slider */}
      <div className="neu-card-blue">
        <h3 className="text-base font-bold uppercase tracking-wider mb-3">
          🔮 Forecast Horizon
        </h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={12}
            max={60}
            step={12}
            value={horizon}
            onChange={(e) => setHorizon(parseInt(e.target.value))}
            className="flex-1 h-3 bg-black appearance-none cursor-pointer accent-yellow-400"
            style={{ accentColor: "#f7fa99" }}
          />
          <span className="neu-badge text-sm">{horizon / 12} year(s)</span>
        </div>
        <div className="flex justify-between text-xs font-bold mt-1 px-1">
          <span>1yr</span>
          <span>2yr</span>
          <span>3yr</span>
          <span>4yr</span>
          <span>5yr</span>
        </div>
      </div>

      {/* What-If Sliders */}
      <div className="neu-card-pink">
        <h3 className="text-base font-bold uppercase tracking-wider mb-3">
          🌧️ What-If Scenario
        </h3>
        <div>
          <label className="text-sm font-bold block mb-1">
            Rainfall change: <span className="mono">{rainfallDelta > 0 ? "+" : ""}{rainfallDelta}%</span>
          </label>
          <input
            type="range"
            min={-50}
            max={50}
            step={5}
            value={rainfallDelta}
            onChange={(e) => setRainfallDelta(parseInt(e.target.value))}
            className="w-full h-3 bg-black appearance-none cursor-pointer"
            style={{ accentColor: "#f7fa99" }}
          />
          <div className="flex justify-between text-xs font-bold mt-1">
            <span>−50%</span>
            <span>0%</span>
            <span>+50%</span>
          </div>
        </div>

        {predictedWqi !== undefined && (
          <div className="mt-4 p-3 border-3 border-black bg-white flex items-center justify-between" style={{ boxShadow: "4px 4px 0px rgba(0,0,0,1)" }}>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Predicted Risk</p>
              <p className="text-2xl font-bold mono">{predictedWqi?.toFixed(1)}</p>
            </div>
            <span
              className="neu-badge text-sm"
              style={{ backgroundColor: riskColor, color: predictedWqi > 75 ? "#fff" : "#000" }}
            >
              {riskLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
