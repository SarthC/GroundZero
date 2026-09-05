import { useState } from "react";
import { postAnalyzeReport } from "../api";

export default function LabReportAnalyzer() {
  const [params, setParams] = useState({
    ph: "",
    tds: "",
    hardness: "",
    fluoride: "",
    nitrate: "",
    iron: "",
    chloride: "",
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setParams({
      ...params,
      [e.target.name]: e.target.value
    });
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      // Filter out empty values and convert to numbers
      const dataToSubmit = {};
      Object.entries(params).forEach(([key, val]) => {
        if (val !== "") {
          dataToSubmit[key] = parseFloat(val);
        }
      });
      
      if (Object.keys(dataToSubmit).length === 0) {
        setError("Please enter at least one parameter to analyze.");
        setLoading(false);
        return;
      }
      
      const response = await postAnalyzeReport(dataToSubmit);
      setResult(response.data);
    } catch (err) {
      console.error("Error analyzing report:", err);
      setError("Failed to analyze the report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="neu-card">
        <h3 className="text-lg font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4">
          🧪 Lab Report Analyzer
        </h3>
        <p className="text-sm font-medium mb-4 text-gray-700">
          Enter parameter values from a lab report to instantly calculate the Water Quality Index (WQI) and determine usability.
        </p>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { id: 'ph', label: 'pH' },
            { id: 'tds', label: 'TDS (mg/L)' },
            { id: 'hardness', label: 'Hardness (mg/L)' },
            { id: 'fluoride', label: 'Fluoride (mg/L)' },
            { id: 'nitrate', label: 'Nitrate (mg/L)' },
            { id: 'iron', label: 'Iron (mg/L)' },
            { id: 'chloride', label: 'Chloride (mg/L)' },
          ].map((field) => (
            <div key={field.id} className="flex flex-col">
              <label className="text-xs font-bold mb-1 uppercase">{field.label}</label>
              <input
                type="number"
                step="any"
                name={field.id}
                value={params[field.id]}
                onChange={handleChange}
                placeholder="Enter value"
                className="neu-input p-2 text-sm"
              />
            </div>
          ))}
        </div>
        
        {error && (
          <div className="bg-red-100 border-2 border-black p-2 mb-4 text-red-700 font-bold text-sm">
            {error}
          </div>
        )}
        
        <button 
          onClick={handleAnalyze} 
          disabled={loading}
          className="neu-btn w-full justify-center bg-[#AEFF00]"
        >
          {loading ? "Analyzing..." : "Analyze Report"}
        </button>
      </div>

      {/* Analysis Result */}
      {result && (
        <div className="neu-card-yellow slide-up">
          <h3 className="text-lg font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-4">
            📊 Analysis Results
          </h3>
          
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-sm font-bold uppercase text-gray-600">Calculated WQI</p>
              <p className="text-3xl font-bold mono">{result.wqi.toFixed(1)}</p>
            </div>
            <div className="text-right">
              <span 
                className="neu-badge text-lg"
                style={{
                  backgroundColor: 
                    result.wqi <= 25 ? "#00CC66" :
                    result.wqi <= 50 ? "#AEFF00" :
                    result.wqi <= 75 ? "#FFE600" : "#FF3333"
                }}
              >
                {result.wqi_category}
              </span>
            </div>
          </div>
          
          {/* Detailed Parameter Status */}
          <div className="mt-4 mb-4">
            <h4 className="text-sm font-bold uppercase mb-2">Parameter Status</h4>
            <div className="space-y-2">
              {Object.entries(result.analysis).map(([param, data]) => (
                <div key={param} className="flex justify-between items-center text-sm border-b-2 border-black border-dashed pb-1">
                  <span className="font-bold uppercase">{param}</span>
                  <div className="flex items-center gap-2">
                    <span className="mono">{data.value}</span>
                    <span 
                      className="px-2 py-0.5 border-2 border-black text-[10px] font-bold"
                      style={{
                        backgroundColor: 
                          data.status === "Desirable" ? "#00CC66" :
                          data.status === "Permissible" ? "#FFE600" : "#FF3333"
                      }}
                    >
                      {data.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Usability Tiers */}
          {result.usability_tiers && (
            <div className="mt-4">
              <h4 className="text-sm font-bold uppercase mb-2">Water Usability</h4>
              <div className="space-y-2">
                {result.usability_tiers.map((tier) => (
                  <div 
                    key={tier.tier}
                    className={`p-2 border-2 border-black ${tier.is_current ? 'bg-white shadow-neu-sm' : 'bg-transparent border-opacity-30'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tier.emoji}</span>
                      <span className={`font-bold text-sm ${tier.is_current ? 'text-black' : 'text-gray-500'}`}>
                        {tier.label}
                      </span>
                    </div>
                    {tier.is_current && tier.blockers && tier.blockers.length > 0 && (
                      <p className="text-[10px] font-bold text-red-600 mt-1 ml-6">
                        Blockers: {tier.blockers.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
