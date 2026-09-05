import { useState, useEffect, useRef } from "react";
import { fetchPriorityWells, fetchRetestAlerts, postNlpQuery } from "../api";
import { FlaskConical, AlertTriangle, MessageCircle, FileText, Send, ChevronDown, ChevronUp } from "lucide-react";

/* ─── Priority Wells Panel ─── */
function PriorityList() {
  const [wells, setWells] = useState([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetchPriorityWells()
      .then((res) => setWells(res.data))
      .catch(console.error);
  }, []);

  return (
    <div className="neu-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between border-b-3 border-black pb-2 mb-3"
      >
        <h3 className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
          <FlaskConical size={18} strokeWidth={3} />
          Test-Priority Wells
        </h3>
        {expanded ? <ChevronUp size={18} strokeWidth={3} /> : <ChevronDown size={18} strokeWidth={3} />}
      </button>
      {expanded && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {wells.length === 0 && <p className="text-sm font-medium text-gray-500">Loading...</p>}
          {wells.map((w, i) => (
            <div
              key={w.id}
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
                <p className="text-sm font-bold truncate">{w.location}</p>
                <p className="text-xs text-gray-600">{w.district}, {w.state}</p>
                <p className="text-xs font-medium mt-1">{w.reason}</p>
              </div>
              <span
                className="neu-badge text-xs shrink-0"
                style={{
                  backgroundColor: w.risk_level === "High" ? "#FF3333" : "#FFE600",
                  color: w.risk_level === "High" ? "#fff" : "#000",
                }}
              >
                WQI {w.wqi}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Re-test Alert Panel ─── */
function RetestAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetchRetestAlerts()
      .then((res) => setAlerts(res.data))
      .catch(console.error);
  }, []);

  return (
    <div className="neu-card-yellow">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between border-b-3 border-black pb-2 mb-3"
      >
        <h3 className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle size={18} strokeWidth={3} />
          Re-test Alerts
        </h3>
        {expanded ? <ChevronUp size={18} strokeWidth={3} /> : <ChevronDown size={18} strokeWidth={3} />}
      </button>
      {expanded && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {alerts.length === 0 && <p className="text-sm font-medium text-gray-500">Loading...</p>}
          {alerts.map((a, i) => (
            <div
              key={a.id}
              className="flex items-start gap-3 p-3 border-3 border-black bg-white"
              style={{ boxShadow: "3px 3px 0px rgba(0,0,0,1)" }}
            >
              <span className="text-lg">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{a.location}</p>
                <p className="text-xs text-gray-600">{a.district}, {a.state}</p>
                <p className="text-xs font-medium mt-1 text-red-600">{a.alert}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── NLP Chat Box ─── */
function NlpChatBox() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    { role: "system", text: "👋 Ask me anything about groundwater quality! Try: \"Is water safe near Pune?\"" },
  ]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!question.trim() || loading) return;
    const userMsg = { role: "user", text: question };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await postNlpQuery(question);
      setMessages((prev) => [...prev, { role: "assistant", text: res.data.answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "❌ Sorry, something went wrong. Try again!" }]);
    }
    setLoading(false);
  };

  return (
    <div className="neu-card">
      <h3 className="text-base font-bold uppercase tracking-wider border-b-3 border-black pb-2 mb-3 flex items-center gap-2">
        <MessageCircle size={18} strokeWidth={3} />
        Ask About Water Quality
      </h3>

      <div className="h-[250px] overflow-y-auto space-y-3 mb-3 p-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] p-3 text-sm font-medium border-3 border-black ${
                msg.role === "user"
                  ? "bg-[#AEFF00]"
                  : msg.role === "system"
                  ? "bg-[#00D4FF]"
                  : "bg-white"
              }`}
              style={{ boxShadow: "3px 3px 0px rgba(0,0,0,1)", whiteSpace: "pre-wrap" }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="p-3 text-sm font-bold border-3 border-black bg-white animate-pulse" style={{ boxShadow: "3px 3px 0px rgba(0,0,0,1)" }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Is water safe near Pune?"
          className="neu-input flex-1"
        />
        <button onClick={handleSend} className="neu-btn-green flex items-center gap-1">
          <Send size={16} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

/* ─── Main Actionable Intelligence ─── */
export default function ActionableIntelligence() {
  const handleGenerateReport = () => {
    alert("📄 PDF Report generation would be triggered here.\nIn production, this calls the backend to generate a district summary PDF.");
  };

  return (
    <div className="space-y-4">
      <PriorityList />
      <RetestAlerts />
      <NlpChatBox />

      {/* PDF Report Button */}
      <button
        onClick={handleGenerateReport}
        className="w-full neu-btn-red flex items-center justify-center gap-3 py-4 text-base"
      >
        <FileText size={20} strokeWidth={3} />
        Auto-Generate District PDF Report
      </button>
    </div>
  );
}
