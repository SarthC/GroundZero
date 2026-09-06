import { useEffect, useState } from "react";
import { fetchStats } from "../api";
import { Droplets, AlertTriangle, MapPin, Activity } from "lucide-react";

const STAT_CARDS = [
  { key: "total_wells", label: "Total Wells", icon: MapPin, bg: "#FAFAFA" },
  { key: "high_risk", label: "High Risk", icon: AlertTriangle, bg: "#621d1d" },
  { key: "moderate_risk", label: "Moderate Risk", icon: Activity, bg: "#f7fa99" },
  { key: "low_risk", label: "Low Risk", icon: Droplets, bg: "#e4fee1" },
  { key: "avg_wqi", label: "Avg WQI", icon: Droplets, bg: "#fce5bf" },
  { key: "states_covered", label: "States", icon: MapPin, bg: "#eafed0" },
];

export default function StatsBar() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    fetchStats()
      .then((res) => setStats(res.data))
      .catch(console.error);
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {STAT_CARDS.map(({ key, label, icon: Icon, bg }) => (
        <div
          key={key}
          className="border-4 border-black p-4 flex flex-col items-center text-center transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]"
          style={{
            backgroundColor: bg,
            boxShadow: "6px 6px 0px rgba(0,0,0,1)",
            color: key === "high_risk" ? "#fff" : "#000",
          }}
        >
          <Icon size={22} strokeWidth={3} />
          <span className="text-2xl font-bold mono mt-1">
            {stats[key] !== undefined ? stats[key].toLocaleString() : "—"}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider mt-1">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
