import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, FolderOpen, MapPin, Calendar, Copy, Check, Stamp, ChevronDown, ChevronUp, FileSearch, Send, Trash2 } from "lucide-react";

const PAPER = "#EFE6D3";
const CARD = "#F8F3E7";
const INK = "#211D17";
const NAVY = "#1C2B3A";
const STAMP_RED = "#9E3324";
const SAGE = "#5F6B4E";
const HAIRLINE = "#C9BC9E";

// Calls our own /api/research serverless function (Tavily search + Groq drafting).
async function callResearch(body) {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Research request failed");
  }
  return data;
}

function extractJson(text) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const first = cleaned.indexOf("[");
    const last = cleaned.lastIndexOf("]");
    if (first >= 0 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (e2) {}
    }
    const first2 = cleaned.indexOf("{");
    const last2 = cleaned.lastIndexOf("}");
    if (first2 >= 0 && last2 > first2) {
      try { return JSON.parse(cleaned.slice(first2, last2 + 1)); } catch (e3) {}
    }
    return null;
  }
}

function StampLabel({ status }) {
  const map = {
    unreleased: { label: "UNRELEASED", color: STAMP_RED },
    low_coverage: { label: "LOW COVERAGE", color: SAGE },
    requested: { label: "REQUESTED", color: NAVY },
    new: { label: "NEW", color: STAMP_RED },
  };
  const s = map[status] || map.new;
  return (
    <span
      style={{
        display: "inline-block",
        border: `2px solid ${s.color}`,
        color: s.color,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        letterSpacing: "0.12em",
        padding: "2px 8px",
        transform: "rotate(-2deg)",
        fontWeight: 700,
      }}
    >
      {s.label}
    </span>
  );
}

export default function CaseFileScanner() {
  const [tab, setTab] = useState("scan");
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [cases, setCases] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const idCounter = useRef(0);

  const [autoScan, setAutoScan] = useState(null);
  const [loadingCases, setLoadingCases] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/cases");
        if (res.ok) setCases(await res.json());
      } catch (e) {}
      setLoadingCases(false);
    })();
    (async () => {
      try {
        const res = await fetch("/api/candidates");
        if (res.ok) {
          const data = await res.json();
          if (data && data.cases) setAutoScan(data);
        }
      } catch (e) {}
    })();
  }, []);

  async function persist(nextCases, changedCase) {
    setCases(nextCases);
    try {
      if (changedCase && changedCase._delete) {
        await fetch(`/api/cases?id=${encodeURIComponent(changedCase.id)}`, { method: "DELETE" });
      } else if (changedCase) {
        await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changedCase),
        });
      }
    } catch (e) {}
  }

  async function runScan() {
    setScanning(true);
    setScanError("");
    setCandidates([]);
    try {
      const data = await callResearch({ mode: "scan", focus: query || "any region, any case type involving a police response" });
      if (!data.cases || !Array.isArray(data.cases) || data.cases.length === 0) {
        setScanError("No matching cases found. Try a more specific search, e.g. a state or case type.");
      } else {
        setCandidates(data.cases);
      }
    } catch (e) {
      setScanError(e.message || "Search failed. Check your connection and try again.");
    }
    setScanning(false);
  }

  function addCandidate(candidate) {
    idCounter.current += 1;
    const newCase = {
      id: `case_${Date.now()}_${idCounter.current}`,
      ...candidate,
      department: null,
      custodian: null,
      statute: null,
      letter: null,
      status: "logged",
    };
    const next = [newCase, ...cases];
    persist(next, newCase);
    setTab("files");
  }

  async function findDepartmentAndDraft(caseItem) {
    setProcessingId(caseItem.id);
    try {
      const parsed = await callResearch({ mode: "draft", caseItem });
      if (parsed && parsed.letter) {
        const updated = {
          ...caseItem,
          department: parsed.department,
          custodian: parsed.custodian_title,
          statute: parsed.statute,
          deadline: parsed.response_deadline,
          letter: parsed.letter,
          status: "drafted",
        };
        const next = cases.map((c) => (c.id === caseItem.id ? updated : c));
        persist(next, updated);
        setExpanded(caseItem.id);
      }
    } catch (e) {}
    setProcessingId(null);
  }

  function markRequested(caseItem) {
    const updated = { ...caseItem, status: "requested" };
    const next = cases.map((c) => (c.id === caseItem.id ? updated : c));
    persist(next, updated);
  }

  function removeCase(caseItem) {
    const next = cases.filter((c) => c.id !== caseItem.id);
    persist(next, { id: caseItem.id, _delete: true });
  }

  function copyLetter(caseItem) {
    navigator.clipboard.writeText(caseItem.letter || "");
    setCopiedId(caseItem.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAPER,
        color: INK,
        fontFamily: "'Source Serif 4', Georgia, serif",
        padding: "0",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&family=Special+Elite&display=swap');
        * { box-sizing: border-box; }
        .folder-tab { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .folder-tab:hover { transform: translateY(-2px); box-shadow: 3px 5px 0 rgba(33,29,23,0.15); }
        button { cursor: pointer; font-family: inherit; }
        textarea, input { font-family: inherit; }
        ::selection { background: #D8CBA8; }
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
      `}</style>

      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "32px 20px 80px" }}>
        <header style={{ marginBottom: "28px", borderBottom: `3px double ${INK}`, paddingBottom: "16px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.15em", color: SAGE, marginBottom: "6px" }}>
            RECORDS INTAKE &amp; REQUEST DESK
          </div>
          <h1 style={{ fontFamily: "'Special Elite', monospace", fontSize: "28px", margin: 0, color: NAVY }}>
            Case File Scanner
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: "14px", color: "#544C3C" }}>
            Find under-covered cases. Identify the records custodian. Draft the request.
          </p>
        </header>

        <div style={{ display: "flex", gap: "0", marginBottom: "24px" }}>
          {[
            { key: "scan", label: "Scan for cases", icon: FileSearch },
            { key: "files", label: `Case files (${cases.length})`, icon: FolderOpen },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? CARD : "transparent",
                border: `1px solid ${HAIRLINE}`,
                borderBottom: tab === t.key ? `1px solid ${CARD}` : `1px solid ${HAIRLINE}`,
                padding: "10px 18px",
                marginBottom: "-1px",
                fontSize: "13px",
                fontWeight: 600,
                color: tab === t.key ? NAVY : "#847A63",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === "scan" && (
          <>
            {autoScan && (
              <div style={{ background: "#EAE0C6", border: `1px solid ${HAIRLINE}`, padding: "16px 20px", marginBottom: "18px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: SAGE, letterSpacing: "0.08em", marginBottom: "4px" }}>
                  AUTO-SCANNED TODAY ({autoScan.date}) · focus: {autoScan.focus}
                </div>
                <div style={{ fontSize: "13px", color: "#3A3428" }}>
                  {autoScan.cases.length} case{autoScan.cases.length === 1 ? "" : "s"} found automatically. Review them below and log the ones worth pursuing.
                </div>
                <button
                  onClick={() => setCandidates(autoScan.cases)}
                  style={{ marginTop: "10px", background: NAVY, color: PAPER, border: "none", padding: "7px 14px", fontSize: "12px", fontWeight: 600 }}
                >
                  Show today's results
                </button>
              </div>
            )}
          <div style={{ background: CARD, border: `1px solid ${HAIRLINE}`, padding: "22px" }}>
            <label style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: SAGE, letterSpacing: "0.08em" }}>
              SEARCH FOCUS (optional — state, case type, region) — or use the auto-scanned results above
            </label>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g. "Ohio home invasion 2021" or leave blank'
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: `1px solid ${HAIRLINE}`,
                  background: PAPER,
                  fontSize: "14px",
                  color: INK,
                }}
                onKeyDown={(e) => e.key === "Enter" && !scanning && runScan()}
              />
              <button
                onClick={runScan}
                disabled={scanning}
                style={{
                  background: NAVY,
                  color: PAPER,
                  border: "none",
                  padding: "10px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: scanning ? 0.6 : 1,
                }}
              >
                {scanning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={14} />}
                {scanning ? "Scanning" : "Scan"}
              </button>
            </div>

            {scanError && <p style={{ color: STAMP_RED, fontSize: "13px", marginTop: "14px" }}>{scanError}</p>}

            {candidates.length > 0 && (
              <div style={{ marginTop: "22px", display: "grid", gap: "12px" }}>
                {candidates.map((c, i) => {
                  const already = cases.some((existing) => existing.name === c.name);
                  return (
                    <div key={i} className="folder-tab" style={{ background: PAPER, border: `1px solid ${HAIRLINE}`, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "15px", color: NAVY }}>{c.name}</div>
                          <div style={{ fontSize: "12px", color: "#6B6250", display: "flex", gap: "12px", marginTop: "3px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={11} /> {c.location}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={11} /> {c.date}</span>
                          </div>
                        </div>
                        <StampLabel status={c.coverage} />
                      </div>
                      <p style={{ fontSize: "13px", margin: "10px 0", lineHeight: 1.5, color: "#3A3428" }}>{c.summary}</p>
                      <div style={{ fontSize: "11px", color: SAGE, marginBottom: "10px" }}>
                        Bodycam worn: {c.bodycam_worn ? "yes" : "unclear"} · {c.case_status}
                      </div>
                      <button
                        onClick={() => addCandidate(c)}
                        disabled={already}
                        style={{
                          background: already ? "transparent" : STAMP_RED,
                          color: already ? SAGE : PAPER,
                          border: already ? `1px solid ${HAIRLINE}` : "none",
                          padding: "7px 14px",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {already ? "Already logged" : "Log this case"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </>
        )}

        {tab === "files" && (
          <div style={{ display: "grid", gap: "12px" }}>
            {cases.length === 0 && (
              <div style={{ padding: "30px", textAlign: "center", color: "#8A8065", fontSize: "14px", border: `1px dashed ${HAIRLINE}` }}>
                No cases logged yet. Scan for cases and log the ones worth pursuing.
              </div>
            )}
            {cases.map((c) => (
              <div key={c.id} className="folder-tab" style={{ background: CARD, border: `1px solid ${HAIRLINE}` }}>
                <div
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px", color: NAVY }}>{c.name}</div>
                    <div style={{ fontSize: "12px", color: "#6B6250", marginTop: "2px" }}>{c.location} · {c.date}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <StampLabel status={c.status === "requested" ? "requested" : c.coverage} />
                    {expanded === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {expanded === c.id && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${HAIRLINE}` }}>
                    <p style={{ fontSize: "13px", color: "#3A3428", marginTop: "12px" }}>{c.summary}</p>

                    {!c.letter && (
                      <button
                        onClick={() => findDepartmentAndDraft(c)}
                        disabled={processingId === c.id}
                        style={{
                          background: NAVY,
                          color: PAPER,
                          border: "none",
                          padding: "9px 16px",
                          fontSize: "12px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          opacity: processingId === c.id ? 0.6 : 1,
                        }}
                      >
                        {processingId === c.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Stamp size={13} />}
                        {processingId === c.id ? "Identifying department & drafting..." : "Identify department & draft request"}
                      </button>
                    )}

                    {c.letter && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "12px", color: SAGE, marginBottom: "8px", lineHeight: 1.6 }}>
                          <strong>{c.department}</strong> · {c.custodian}<br />
                          Statute: {c.statute} · Response window: {c.deadline}
                        </div>
                        <textarea
                          readOnly
                          value={c.letter}
                          style={{
                            width: "100%",
                            minHeight: "220px",
                            padding: "12px",
                            fontSize: "12.5px",
                            lineHeight: 1.5,
                            border: `1px solid ${HAIRLINE}`,
                            background: PAPER,
                            color: INK,
                            resize: "vertical",
                          }}
                        />
                        <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                          <button
                            onClick={() => copyLetter(c)}
                            style={{ background: "transparent", border: `1px solid ${INK}`, padding: "8px 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                          >
                            {copiedId === c.id ? <Check size={13} /> : <Copy size={13} />} {copiedId === c.id ? "Copied" : "Copy letter"}
                          </button>
                          {c.status !== "requested" && (
                            <button
                              onClick={() => markRequested(c)}
                              style={{ background: SAGE, color: PAPER, border: "none", padding: "8px 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                            >
                              <Send size={13} /> Mark as sent
                            </button>
                          )}
                          <button
                            onClick={() => removeCase(c)}
                            style={{ background: "transparent", color: STAMP_RED, border: `1px solid ${STAMP_RED}`, padding: "8px 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <footer style={{ marginTop: "40px", fontSize: "11px", color: "#8A8065", borderTop: `1px solid ${HAIRLINE}`, paddingTop: "14px" }}>
          Letters are drafts based on AI research and should be reviewed against the named agency's current
          request process before sending. Fill in your name and contact details before submitting.
          Case files are saved to your database and available on any device. A new batch of candidate
          cases is scanned automatically once a day.
        </footer>
      </div>
    </div>
  );
}