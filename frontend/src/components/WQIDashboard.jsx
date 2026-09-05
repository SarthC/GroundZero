import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LabelList,
} from "recharts";

/* ─── Speedometer / Gauge ─── */
function WQIGauge({ score, category }) {
  const clampedScore = Math.max(0, Math.min(100, score || 0));
  
  // Calculate angle for the needle (180deg to 0deg)
  // 180 is left (0 score), 0 is right (100 score)
  const angle = 180 - (clampedScore / 100) * 180;
  
  // Convert angle to radians for x, y coordinates
  const RADIAN = Math.PI / 180;
  const radius = 95; // Length of the needle
  const x = 130 + radius * Math.cos(-angle * RADIAN); // cx = 130
  const y = 145 + radius * Math.sin(-angle * RADIAN); // cy = 145

  const getColor = (s) => {
    if (s <= 25) return "#00CC66";
    if (s <= 50) return "#AEFF00";
    if (s <= 75) return "#FFE600";
    return "#FF3333";
  };

  const gaugeData = [
    { name: "Excellent", value: 25, color: "#00CC66" },
    { name: "Good", value: 25, color: "#AEFF00" },
    { name: "Poor", value: 25, color: "#FFE600" },
    { name: "Very Poor", value: 25, color: "#FF3333" },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 260, height: 160 }}>
        {/* Custom Needle Implementation */}
        <svg viewBox="0 0 260 160" className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none">
          {/* Needle Line */}
          <line
            x1="130"
            y1="145"
            x2={x}
            y2={y}
            stroke="#000"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Center Circle */}
          <circle cx="130" cy="145" r="10" fill="#000" />
        </svg>

        <ResponsiveContainer width="100%" height={260} className="absolute top-0 left-0 z-0">
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy={145}
              startAngle={180}
              endAngle={0}
              innerRadius={80}
              outerRadius={120}
              paddingAngle={0}
              dataKey="value"
              stroke="#000"
              strokeWidth={3}
            >
              {gaugeData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="text-center mt-2">
        <span className="text-5xl font-bold mono">{clampedScore.toFixed(0)}</span>
        <span className="text-lg font-bold ml-1">/100</span>
      </div>
      <span
        className="neu-badge mt-2"
        style={{ backgroundColor: getColor(clampedScore) }}
      >
        {category || "N/A"}
      </span>
    </div>
  );
}

/* ─── Parameter Bar Chart ─── */
function ParamBarChart({ params, bisLimits }) {
  if (!params) return null;

  const data = Object.entries(params).map(([key, value]) => ({
    name: key,
    value: value,
    limit: bisLimits?.[key] || null,
    exceeds: bisLimits?.[key] ? value > bisLimits[key] : false,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#000" strokeOpacity={0.15} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fontWeight: 700, fill: "#000" }}
          axisLine={{ stroke: "#000", strokeWidth: 2 }}
          tickLine={{ stroke: "#000", strokeWidth: 2 }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#000" }}
          axisLine={{ stroke: "#000", strokeWidth: 2 }}
          tickLine={{ stroke: "#000", strokeWidth: 2 }}
        />
        <Tooltip
          contentStyle={{
            border: "3px solid #000",
            borderRadius: 0,
            boxShadow: "4px 4px 0px rgba(0,0,0,1)",
            fontFamily: "Space Grotesk",
            fontWeight: 600,
          }}
        />
        <Bar dataKey="value" stroke="#000" strokeWidth={2}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.exceeds ? "#FF3333" : "#00D4FF"}
            />
          ))}
          <LabelList dataKey="value" position="top" style={{ fontSize: 10, fontWeight: 700, fill: "#000" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── SHAP Explainability Chart ─── */
function ShapChart({ shapValues }) {
  if (!shapValues || shapValues.length === 0) return null;

  const top3 = shapValues.slice(0, 3);
  const data = top3.map((s) => ({
    name: s.param,
    impact: s.impact,
    fill: s.impact > 0 ? "#FF3333" : "#00CC66",
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#000" strokeOpacity={0.1} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "#000" }}
          axisLine={{ stroke: "#000", strokeWidth: 2 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fontWeight: 700, fill: "#000" }}
          axisLine={{ stroke: "#000", strokeWidth: 2 }}
          width={50}
        />
        <Tooltip
          contentStyle={{
            border: "3px solid #000",
            borderRadius: 0,
            boxShadow: "4px 4px 0px rgba(0,0,0,1)",
            fontFamily: "Space Grotesk",
            fontWeight: 600,
          }}
        />
        <ReferenceLine x={0} stroke="#000" strokeWidth={2} />
        <Bar dataKey="impact" stroke="#000" strokeWidth={2}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Main WQI Dashboard ─── */
export default function WQIDashboard({ wellDetail }) {
  if (!wellDetail) {
    return (
      <div className="neu-card h-full flex items-center justify-center">
        <p className="text-lg font-bold text-center">
          ← Click a well on the map to see its Water Quality Index
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* WQI Gauge */}
      <div className="neu-card">
        <h3 className="text-lg font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4">
          ⚡ Water Quality Index
        </h3>
        <WQIGauge score={wellDetail.wqi} category={wellDetail.wqi_category} />
        <div className="mt-3 text-center">
          <p className="text-sm font-medium">
            <span className="font-bold">{wellDetail.location || wellDetail.district}</span>
            <span className="text-gray-600"> — {wellDetail.state}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">Year: {wellDetail.year}</p>
        </div>
      </div>

      {/* Usability Classification */}
      {wellDetail.usability_tiers && (
        <div className="neu-card-blue">
          <h3 className="text-lg font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4">
            🚰 Water Usability
          </h3>
          <div className="space-y-3">
            {wellDetail.usability_tiers.map((tier) => (
              <div 
                key={tier.tier}
                className={`p-3 border-3 border-black transition-all ${tier.is_current ? 'bg-white shadow-neu-sm -translate-y-1' : 'bg-transparent border-opacity-30'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{tier.emoji}</span>
                  <span className={`font-bold ${tier.is_current ? 'text-black' : 'text-gray-500'}`}>
                    {tier.label}
                  </span>
                  {tier.is_current && (
                    <span className="ml-auto neu-badge text-[10px]">CURRENT RATING</span>
                  )}
                </div>
                {tier.is_current && tier.blockers && tier.blockers.length > 0 && (
                  <p className="text-xs font-medium text-red-600 mt-2 ml-7">
                    Blockers: {tier.blockers.join(", ")}
                  </p>
                )}
                {tier.is_current && (
                  <p className="text-xs font-medium text-gray-700 mt-1 ml-7">
                    {tier.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parameter Breakdown */}
      <div className="neu-card">
        <h3 className="text-lg font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4">
          📊 Parameter Breakdown
        </h3>
        <ParamBarChart params={wellDetail.params} bisLimits={wellDetail.bis_limits} />
        <p className="text-xs text-gray-500 mt-2">
          <span className="inline-block w-3 h-3 bg-[#FF3333] border-2 border-black mr-1" />
          Exceeds BIS limit &nbsp;
          <span className="inline-block w-3 h-3 bg-[#00D4FF] border-2 border-black mr-1" />
          Within limit
        </p>
      </div>

      {/* SHAP Explainability */}
      <div className="neu-card-yellow">
        <h3 className="text-lg font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4">
          🧠 Why Is It Risky?
        </h3>
        {wellDetail.shap && wellDetail.shap.length > 0 ? (
          <>
            <ShapChart shapValues={wellDetail.shap} />
            <div className="mt-3 space-y-1">
              {wellDetail.shap.slice(0, 3).map((s, i) => (
                <p key={i} className="text-sm font-medium">
                  <span className="font-bold">{i + 1}.</span>{" "}
                  <span className="font-bold">{s.param}</span> is{" "}
                  {s.impact > 0 ? (
                    <span className="text-red-600 font-bold">
                      {(s.impact * 100).toFixed(0)}% above
                    </span>
                  ) : (
                    <span className="text-green-700 font-bold">
                      {Math.abs(s.impact * 100).toFixed(0)}% below
                    </span>
                  )}{" "}
                  the permissible limit
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm font-medium">All parameters within safe limits ✅</p>
        )}
      </div>
    </div>
  );
}
