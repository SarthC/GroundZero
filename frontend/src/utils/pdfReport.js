import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/*
 * GroundZero — Well PDF Report Generator
 * ---------------------------------------
 * Pure function: takes the SAME `wellDetail` object already fetched by the
 * app (GET /api/wells/{id}, see api.js / App.jsx) and renders it into a
 * professionally formatted PDF. No WQI/risk values are recalculated here —
 * every number is read directly from the existing payload.
 */

/* Friendly display names for the raw parameter codes returned by the API. */
const PARAM_LABELS = {
  pH: { label: "pH", unit: "" },
  TDS: { label: "Total Dissolved Solids (TDS)", unit: "mg/L" },
  TH: { label: "Total Hardness", unit: "mg/L" },
  F: { label: "Fluoride", unit: "mg/L" },
  NO3: { label: "Nitrate", unit: "mg/L" },
  Fe: { label: "Iron", unit: "mg/L" },
  Cl: { label: "Chloride", unit: "mg/L" },
  EC: { label: "Electrical Conductivity", unit: "µS/cm" },
  SO4: { label: "Sulphate", unit: "mg/L" },
};

/* The parameters we report on, in a sensible reading order. */
const REPORT_PARAM_ORDER = ["pH", "TDS", "TH", "F", "NO3", "Fe", "Cl"];

/* Brand palette (kept close to the app's neo-brutalist theme, but toned
 * down for a print-friendly document). */
const COLORS = {
  black: [0, 0, 0],
  headerBg: [15, 23, 23],
  brandGreen: [234, 254, 208], // #eafed0
  border: [0, 0, 0],
  mutedText: [90, 90, 90],
  low: { bg: [228, 247, 232], text: [22, 101, 52] }, // green
  moderate: { bg: [253, 246, 199], text: [133, 100, 4] }, // yellow
  high: { bg: [250, 224, 224], text: [98, 29, 29] }, // brand red #621d1d
  unknown: { bg: [237, 237, 237], text: [60, 60, 60] },
};

const fmt = (value, unit = "", digits = 2) => {
  if (value === null || value === undefined || value === "" || Number.isNaN(value)) {
    return "N/A";
  }
  if (typeof value === "number") {
    const rounded = Number.isInteger(value) ? value : Number(value.toFixed(digits));
    return unit ? `${rounded} ${unit}` : `${rounded}`;
  }
  return String(value);
};

const riskPalette = (riskLevel) => {
  if (riskLevel === "Low") return COLORS.low;
  if (riskLevel === "Moderate") return COLORS.moderate;
  if (riskLevel === "High") return COLORS.high;
  return COLORS.unknown;
};

/**
 * Generates and downloads a PDF report for a single well.
 * @param {object} wellDetail - the object returned by GET /api/wells/{id}
 */
export function generateWellReportPDF(wellDetail) {
  if (!wellDetail) return;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const bottomMargin = 18;
  const topContinuedY = 24; // where content resumes on page 2+, leaving room for a running header

  let y = 0;

  /* Ensures there is enough vertical room left on the current page for the
   * next block; otherwise starts a new page and resets the cursor. */
  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - bottomMargin) {
      doc.addPage();
      y = topContinuedY;
    }
  };

  const sectionHeading = (title) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.black);
    doc.text(title, marginX, y);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.6);
    doc.line(marginX, y + 1.5, pageWidth - marginX, y + 1.5);
    y += 8;
  };

  /* ---------------------------------------------------------------
   * 1. Header / Title
   * --------------------------------------------------------------- */
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, 30, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("GroundZero", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("AI-Powered Groundwater Contamination Risk Intelligence", marginX, 21);

  doc.setFontSize(9);
  const generatedOn = new Date().toLocaleString();
  doc.text(`Report generated: ${generatedOn}`, marginX, 27);

  y = 40;

  const wellTitle =
    wellDetail.location || wellDetail.district || wellDetail.well_id
      ? `Well Report — ${wellDetail.location || wellDetail.district || wellDetail.well_id}`
      : "Well Report";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.black);
  doc.text(wellTitle, marginX, y);
  y += 9;

  /* ---------------------------------------------------------------
   * 2. Well / Location Information (compact table)
   * --------------------------------------------------------------- */
  sectionHeading("Well & Location Information");

  const infoRows = [
    ["Well ID", fmt(wellDetail.well_id)],
    ["Location", fmt(wellDetail.location)],
    ["State", fmt(wellDetail.state)],
    ["District", fmt(wellDetail.district)],
  ];
  if (wellDetail.block) infoRows.push(["Block", fmt(wellDetail.block)]);
  infoRows.push(["Year of Sample", fmt(wellDetail.year)]);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX, top: topContinuedY },
    theme: "grid",
    body: infoRows,
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 2.5,
      lineColor: COLORS.border,
      lineWidth: 0.2,
      textColor: COLORS.black,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 45 },
      1: { cellWidth: contentWidth - 45 },
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  /* ---------------------------------------------------------------
   * 3. WQI & Risk — prominent summary box
   * --------------------------------------------------------------- */
  sectionHeading("Water Quality Index (WQI) & Risk Level");

  const boxHeight = 28;
  ensureSpace(boxHeight + 6);

  const palette = riskPalette(wellDetail.risk_level);
  doc.setFillColor(...palette.bg);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.4);
  doc.rect(marginX, y, contentWidth, boxHeight, "FD");

  const colW = contentWidth / 3;

  // WQI score
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.black);
  doc.text(fmt(wellDetail.wqi, "", 1), marginX + colW / 2, y + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("WQI Score (0-100)", marginX + colW / 2, y + 21, { align: "center" });

  // Category
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(fmt(wellDetail.wqi_category), marginX + colW * 1.5, y + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("WQI Category", marginX + colW * 1.5, y + 21, { align: "center" });

  // Risk level
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...palette.text);
  doc.text(fmt(wellDetail.risk_level), marginX + colW * 2.5, y + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.black);
  doc.text("Risk Level", marginX + colW * 2.5, y + 21, { align: "center" });

  // Divider lines between the three columns
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(marginX + colW, y + 3, marginX + colW, y + boxHeight - 3);
  doc.line(marginX + colW * 2, y + 3, marginX + colW * 2, y + boxHeight - 3);

  y += boxHeight + 6;

  const extraContext = [];
  if (wellDetail.dominant_driver) extraContext.push(`Dominant driver: ${wellDetail.dominant_driver}`);
  if (wellDetail.n_exceedances !== null && wellDetail.n_exceedances !== undefined) {
    extraContext.push(`Parameters exceeding BIS limits: ${wellDetail.n_exceedances}`);
  }
  if (extraContext.length > 0) {
    ensureSpace(6);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.mutedText);
    doc.text(extraContext.join("   |   "), marginX, y);
    doc.setTextColor(...COLORS.black);
    y += 8;
  }

  /* ---------------------------------------------------------------
   * 4. Water Quality Parameters (table)
   * --------------------------------------------------------------- */
  sectionHeading("Water Quality Parameters");

  const params = wellDetail.params || {};
  const bisLimits = wellDetail.bis_limits || {};

  const paramRows = REPORT_PARAM_ORDER.map((key) => {
    const meta = PARAM_LABELS[key] || { label: key, unit: "" };
    const value = params[key];
    const limit = bisLimits[key];

    let status = "\u2014"; // em dash
    if (value !== null && value !== undefined && limit !== null && limit !== undefined) {
      status = value <= limit ? "Within Limit" : "Exceeds Limit";
    } else if (value === null || value === undefined) {
      status = "No Data";
    }

    return [
      meta.label,
      fmt(value, "", 2),
      limit !== null && limit !== undefined ? fmt(limit, "", 2) : "N/A",
      meta.unit || "-",
      status,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX, top: topContinuedY },
    theme: "grid",
    head: [["Parameter", "Value", "BIS Limit", "Unit", "Status"]],
    body: paramRows,
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: 2.5,
      lineColor: COLORS.border,
      lineWidth: 0.2,
      textColor: COLORS.black,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [20, 20, 20],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        if (data.cell.raw === "Exceeds Limit") {
          data.cell.styles.textColor = COLORS.high.text;
          data.cell.styles.fontStyle = "bold";
        } else if (data.cell.raw === "Within Limit") {
          data.cell.styles.textColor = COLORS.low.text;
        }
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  /* ---------------------------------------------------------------
   * 5. AI / SHAP Risk Explanation
   * --------------------------------------------------------------- */
  sectionHeading("AI Risk Explanation");

  const shapValues = Array.isArray(wellDetail.shap) ? wellDetail.shap : [];
  if (shapValues.length === 0) {
    ensureSpace(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("All parameters are within safe limits — no significant risk drivers detected.", marginX, y);
    y += 8;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    shapValues.forEach((s, i) => {
      ensureSpace(7);
      const meta = PARAM_LABELS[s.param] || { label: s.param };
      const pct = Math.abs((s.impact || 0) * 100).toFixed(0);
      const direction = s.impact > 0 ? "above" : "below";
      const line = `${i + 1}. ${meta.label} is ${pct}% ${direction} the permissible limit.`;
      const wrapped = doc.splitTextToSize(line, contentWidth);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 5 + 2;
    });
    y += 2;
  }

  /* ---------------------------------------------------------------
   * 6. Water Usability & Recommendations
   * --------------------------------------------------------------- */
  sectionHeading("Water Usability & Recommendations");

  ensureSpace(8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Overall Usability:", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.text(fmt(wellDetail.usability), marginX + 38, y);
  y += 8;

  const tiers = Array.isArray(wellDetail.usability_tiers) ? wellDetail.usability_tiers : [];
  const currentTier = tiers.find((t) => t.is_current);

  if (currentTier) {
    ensureSpace(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${currentTier.emoji || ""} ${currentTier.label || ""}`.trim(), marginX, y);
    y += 6;

    if (currentTier.description) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const wrapped = doc.splitTextToSize(currentTier.description, contentWidth);
      ensureSpace(wrapped.length * 5 + 2);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 5 + 2;
    }

    if (currentTier.blockers && currentTier.blockers.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...COLORS.high.text);
      const blockerLine = `Blockers: ${currentTier.blockers
        .map((b) => (PARAM_LABELS[b] || { label: b }).label)
        .join(", ")}`;
      const wrapped = doc.splitTextToSize(blockerLine, contentWidth);
      ensureSpace(wrapped.length * 5 + 2);
      doc.text(wrapped, marginX, y);
      doc.setTextColor(...COLORS.black);
      y += wrapped.length * 5 + 2;
    }
  } else {
    ensureSpace(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text("No detailed usability classification available for this well.", marginX, y);
    y += 6;
  }

  /* ---------------------------------------------------------------
   * 7. Footer — page numbers + running header on continued pages
   * --------------------------------------------------------------- */
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Running header on continuation pages (page 1 already has the full banner)
    if (i > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.mutedText);
      doc.text("GroundZero — Well Report (continued)", marginX, 12);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(marginX, 14, pageWidth - marginX, 14);
    }

    // Footer
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.mutedText);
    doc.text("GroundZero AI Groundwater Risk Intelligence System", marginX, pageHeight - 7);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, pageHeight - 7, { align: "right" });
    doc.setTextColor(...COLORS.black);
  }

  /* ---------------------------------------------------------------
   * 8. Save
   * --------------------------------------------------------------- */
  const safeWellId = String(wellDetail.well_id || wellDetail.id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`GroundZero_Well_${safeWellId}_Report.pdf`);
}

/**
 * Generates and downloads a comprehensive Actionable Intelligence & Risk PDF report.
 * @param {Array} priorityWells - List of priority wells
 * @param {Array} retestAlerts - List of retest alerts
 */
export function generateDistrictSummaryPDF(priorityWells = [], retestAlerts = []) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const bottomMargin = 18;

  let y = 0;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - bottomMargin) {
      doc.addPage();
      y = 24;
    }
  };

  // Header Banner
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("GroundZero", marginX, 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  doc.text("Actionable Intelligence & District Groundwater Risk Report", marginX, 18);

  const generatedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFontSize(8);
  doc.text(`Generated: ${generatedOn}`, pageWidth - marginX, 18, { align: "right" });

  y = 36;

  // Executive Summary Box
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.black);
  doc.text("Executive Summary & Risk Overview", marginX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const summaryText =
    "This automated intelligence report summarizes high-priority test wells, re-test alerts, and water quality parameters requiring urgent field intervention. Priority scores are calculated based on WQI thresholds, contamination breach count, and historical variance.";
  const wrappedSummary = doc.splitTextToSize(summaryText, contentWidth);
  doc.text(wrappedSummary, marginX, y);
  y += wrappedSummary.length * 5 + 6;

  // Section 1: Priority Wells Table
  if (priorityWells && priorityWells.length > 0) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`1. Test-Priority Wells (${priorityWells.length} Wells Identified)`, marginX, y);
    y += 4;

    const tableRows = priorityWells.map((w, idx) => [
      `#${idx + 1}`,
      w.location || "N/A",
      `${w.district || ""}, ${w.state || ""}`,
      w.wqi != null ? String(w.wqi) : "N/A",
      w.risk_level || "Unknown",
      w.reason || "High risk parameters",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["#", "Location", "District / State", "WQI", "Risk", "Priority Reason"]],
      body: tableRows,
      theme: "grid",
      headStyles: {
        fillColor: COLORS.headerBg,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8.5,
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 35 },
        2: { cellWidth: 40 },
        3: { cellWidth: 16 },
        4: { cellWidth: 22 },
        5: { cellWidth: "auto" },
      },
      didDrawPage: (data) => {
        y = data.cursor.y + 8;
      },
    });
  }

  // Section 2: Re-test Alerts Table
  if (retestAlerts && retestAlerts.length > 0) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.black);
    doc.text(`2. Re-Test & Contamination Alerts (${retestAlerts.length} Active Alerts)`, marginX, y);
    y += 4;

    const alertRows = retestAlerts.map((a, idx) => [
      `#${idx + 1}`,
      a.location || "N/A",
      `${a.district || ""}, ${a.state || ""}`,
      a.alert || "Parameter anomaly detected",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["#", "Location", "District / State", "Alert Details"]],
      body: alertRows,
      theme: "grid",
      headStyles: {
        fillColor: [180, 40, 40],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8.5,
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 45 },
        2: { cellWidth: 45 },
        3: { cellWidth: "auto" },
      },
      didDrawPage: (data) => {
        y = data.cursor.y + 8;
      },
    });
  }

  // Section 3: Recommended Actionable Protocols
  ensureSpace(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.black);
  doc.text("3. Recommended Action Protocols", marginX, y);
  y += 6;

  const protocols = [
    "• High-Risk Wells (WQI > 75): Issue immediate drinking water advisory; initiate lab re-sampling within 48 hours.",
    "• Nitrate & Fluoride Breaches: Install reverse osmosis (RO) or activated alumina defluoridation filtration units.",
    "• Iron & Hardness Breaches: Apply aeration and water softening treatment prior to domestic distribution.",
    "• Seasonal Monitoring: Increase sampling frequency during post-monsoon recharge cycles.",
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  protocols.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, contentWidth);
    ensureSpace(wrapped.length * 5);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 5 + 1;
  });

  // Footer & Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.mutedText);
      doc.text("GroundZero — District Risk Summary Report (continued)", marginX, 12);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(marginX, 14, pageWidth - marginX, 14);
    }
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.mutedText);
    doc.text("GroundZero AI Groundwater Risk Intelligence System", marginX, pageHeight - 7);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, pageHeight - 7, { align: "right" });
  }

  doc.save("GroundZero_District_Risk_Report.pdf");
}

export default generateWellReportPDF;
