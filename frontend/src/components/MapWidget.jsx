import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const RISK_COLORS = {
  green: "#00CC66",
  yellow: "#FFE600",
  red: "#FF3333",
};

function FitBounds({ wells }) {
  const map = useMap();
  useEffect(() => {
    if (wells.length > 0) {
      const lats = wells.map((w) => w.lat);
      const lngs = wells.map((w) => w.lng);
      map.fitBounds([
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ]);
    }
  }, [wells, map]);
  return null;
}

export default function MapWidget({ wells, onSelectWell, selectedWellId }) {
  if (!wells || wells.length === 0) {
    return (
      <div className="neu-card h-[500px] flex items-center justify-center">
        <p className="text-xl font-bold">Loading map data...</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <MapContainer
        center={[22.5, 80]}
        zoom={5}
        scrollWheelZoom={true}
        style={{ height: "500px", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds wells={wells} />
        {wells.map((well) => (
          <CircleMarker
            key={well.id}
            center={[well.lat, well.lng]}
            radius={well.id === selectedWellId ? 10 : 6}
            pathOptions={{
              color: "#000",
              weight: well.id === selectedWellId ? 3 : 2,
              fillColor: RISK_COLORS[well.color] || "#00CC66",
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: () => onSelectWell(well),
            }}
          >
            <Popup>
              <div className="p-2 min-w-[220px]">
                <h3 className="text-base font-bold uppercase tracking-wide border-b-3 border-black pb-1 mb-2">
                  {well.location || well.district}
                </h3>
                <div className="space-y-1 text-sm font-medium">
                  <p>
                    <span className="font-bold">Risk:</span>{" "}
                    <span
                      className="inline-block px-2 py-0.5 text-xs font-bold uppercase border-2 border-black"
                      style={{
                        backgroundColor: RISK_COLORS[well.color],
                        color: well.color === "red" ? "#fff" : "#000",
                      }}
                    >
                      {well.risk_level} — {well.wqi}%
                    </span>
                  </p>
                  <p>
                    <span className="font-bold">Contaminant:</span>{" "}
                    {well.dominant_driver || "N/A"}
                  </p>
                  <p>
                    <span className="font-bold">Usability:</span>{" "}
                    {well.usability}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {well.state} → {well.district} ({well.year})
                  </p>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Map Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white border-3 border-black p-3" style={{ boxShadow: "4px 4px 0px rgba(0,0,0,1)" }}>
        <p className="text-xs font-bold uppercase tracking-wider mb-2">Risk Level</p>
        <div className="space-y-1">
          {[
            { color: "#00CC66", label: "Low" },
            { color: "#FFE600", label: "Moderate" },
            { color: "#FF3333", label: "High" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs font-medium">
              <span
                className="w-4 h-4 border-2 border-black inline-block"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
