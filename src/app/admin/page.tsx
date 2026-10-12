"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { 
  Users, 
  Award, 
  Download, 
  FileEdit, 
  Search, 
  Filter, 
  Upload, 
  CheckCircle2, 
  ExternalLink, 
  FileSpreadsheet, 
  RefreshCw, 
  Check, 
  X, 
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  FileCode,
  Info
} from "lucide-react";
import { 
  MOCK_METRICS, 
  MOCK_PARTICIPANTS, 
  MOCK_CORRECTIONS, 
  MockCorrectionRequest 
} from "@/lib/mockData";
import {
  parseAndValidateParticipantCsv,
  getSyntheticTestCsvContent,
  CsvImportResult
} from "@/lib/csvImport";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<"roster" | "import" | "corrections">("roster");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  
  // Interactive state for corrections
  const [corrections, setCorrections] = useState<MockCorrectionRequest[]>(MOCK_CORRECTIONS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // CSV Import state
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [csvParsing, setCsvParsing] = useState<boolean>(false);
  const [previewFilter, setPreviewFilter] = useState<"ALL" | "ACCEPTED" | "FLAGGED_FOR_REVIEW" | "DUPLICATE" | "REJECTED">("ALL");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleProcessCsvText = (text: string, fileName: string) => {
    setCsvParsing(true);
    setCsvFileName(fileName);
    setTimeout(() => {
      const existing = MOCK_PARTICIPANTS.map((p) => ({
        email: p.email,
        fullName: p.fullName,
        certificateStatus: p.certificateStatus,
      }));
      const result = parseAndValidateParticipantCsv(text, existing);
      setCsvResult(result);
      setCsvParsing(false);
      showToast(
        `Parsed ${result.summary.totalRows} rows: ${result.summary.acceptedCount} accepted, ${result.summary.flaggedCount} flagged for review.`
      );
    }, 300);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || "";
      handleProcessCsvText(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleLoadSyntheticBenchmark = () => {
    const text = getSyntheticTestCsvContent();
    handleProcessCsvText(text, "Synthetic_Algothon26_Benchmark.csv");
  };

  // Filter participants
  const filteredParticipants = MOCK_PARTICIPANTS.filter((p) => {
    const matchesSearch =
      p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.certificateId && p.certificateId.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "ALL") return true;
    if (statusFilter === "ISSUED") return p.certificateStatus === "ISSUED";
    if (statusFilter === "PENDING") return p.certificateStatus === "PENDING_ISSUANCE";
    if (statusFilter === "INELIGIBLE") return p.certificateStatus === "INELIGIBLE";
    return true;
  });

  const handleApproveCorrection = (id: string, name: string) => {
    setCorrections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "APPROVED" as const } : c))
    );
    showToast(`Approved correction for ${name}. Certificate queued for reissue.`);
  };

  const handleRejectCorrection = (id: string, name: string) => {
    setCorrections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "REJECTED" as const } : c))
    );
    showToast(`Rejected correction request for ${name}.`);
  };

  const handleClearCsv = () => {
    setCsvResult(null);
    setCsvFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const displayedCsvRows = (csvResult?.rows || []).filter((r) => {
    if (previewFilter === "ALL") return true;
    return r.validationStatus === previewFilter;
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-neutral-900 border border-red-500/50 shadow-2xl text-xs text-white flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Dashboard Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest bg-red-950/70 border border-red-800 text-red-400 font-semibold">
                ORGANIZER CONTROL PANEL
              </span>
              <span className="text-[10px] font-mono text-neutral-500">[MOCK DATA]</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Algothon&apos;26 Operations Dashboard
            </h1>
            <p className="text-xs text-neutral-400">
              Manage participant records, batch issuance, CSV ingestion, and self-service correction appeals.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/portal"
              className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-300 border border-neutral-800 transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Participant Portal
            </Link>
            <button
              onClick={() => showToast("Metrics refreshed against mock in-memory store.")}
              className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-300 border border-neutral-800 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-neutral-400" />
              Refresh
            </button>
          </div>
        </div>

        {/* Overview Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1 */}
          <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
              <span>Registrations</span>
              <Users className="w-4 h-4 text-neutral-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {MOCK_METRICS.totalRegistrations}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">[MOCK - Form Responses]</div>
          </div>

          {/* Card 2 */}
          <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
              <span>Issued Certs</span>
              <Award className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-red-400">
              {MOCK_METRICS.certificatesIssued}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">[MOCK - Approved]</div>
          </div>

          {/* Card 3 */}
          <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
              <span>Downloads</span>
              <Download className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {MOCK_METRICS.downloadedByParticipants}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">[MOCK - 80% Claimed]</div>
          </div>

          {/* Card 4 */}
          <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
              <span>Corrections</span>
              <FileEdit className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {corrections.filter((c) => c.status === "PENDING_REVIEW").length}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">[MOCK - Pending Review]</div>
          </div>

          {/* Card 5 */}
          <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
              <span>Public Queries</span>
              <ShieldCheck className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {MOCK_METRICS.totalVerificationQueries}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">[MOCK - SHA-256 Hits]</div>
          </div>
        </div>

        {/* Dashboard Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
          <button
            onClick={() => setActiveTab("roster")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "roster"
                ? "bg-red-600 text-white shadow-md shadow-red-950/50"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <Users className="w-4 h-4" />
            Participant Roster ({MOCK_PARTICIPANTS.length} Sample Records)
          </button>

          <button
            onClick={() => setActiveTab("import")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "import"
                ? "bg-red-600 text-white shadow-md shadow-red-950/50"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <Upload className="w-4 h-4" />
            Batch CSV Ingestion Simulator
          </button>

          <button
            onClick={() => setActiveTab("corrections")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 relative ${
              activeTab === "corrections"
                ? "bg-red-600 text-white shadow-md shadow-red-950/50"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <FileEdit className="w-4 h-4" />
            Name Correction Queue
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-black font-bold">
              {corrections.filter((c) => c.status === "PENDING_REVIEW").length}
            </span>
          </button>
        </div>

        {/* =========================================================================
            TAB 1: PARTICIPANT ROSTER
           ========================================================================= */}
        {activeTab === "roster" && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 p-3 rounded-xl">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter name, email, or cert ID..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Filter className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-xs text-neutral-400">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 focus:outline-none focus:border-red-500"
                >
                  <option value="ALL">All Records</option>
                  <option value="ISSUED">Issued (150 mock)</option>
                  <option value="PENDING">Pending Issuance (16 mock)</option>
                  <option value="INELIGIBLE">Ineligible (4 mock)</option>
                </select>
              </div>
            </div>

            {/* Participants Table */}
            <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-neutral-950 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Participant Name</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Confirmation</th>
                    <th className="py-3 px-4">Certificate ID</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-sans">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        No participants match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p) => (
                      <tr key={p.id} className="hover:bg-neutral-800/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                          <span>{p.fullName}</span>
                          {p.hasCorrectionPending && (
                            <span className="w-2 h-2 rounded-full bg-amber-400" title="Correction pending"></span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-400">{p.email}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            p.confirmationStatus === "CONFIRMED"
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-900/60"
                              : p.confirmationStatus === "PENDING_ORGANIZER_APPROVAL"
                              ? "bg-amber-950/60 text-amber-400 border border-amber-900/60"
                              : "bg-red-950/60 text-red-400 border border-red-900/60"
                          }`}>
                            {p.confirmationStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {p.certificateId ? (
                            <Link
                              href={`/verify/${p.certificateId}`}
                              className="text-red-400 hover:underline flex items-center gap-1"
                            >
                              {p.certificateId}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-neutral-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            p.certificateStatus === "ISSUED"
                              ? "bg-emerald-950 text-emerald-300"
                              : p.certificateStatus === "PENDING_ISSUANCE"
                              ? "bg-neutral-800 text-neutral-300"
                              : "bg-red-950 text-red-300"
                          }`}>
                            {p.certificateStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {p.certificateId ? (
                              <Link
                                href={`/verify/${p.certificateId}`}
                                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] text-neutral-300 transition-colors"
                              >
                                Verify
                              </Link>
                            ) : (
                              <button
                                onClick={() => showToast(`Simulated issuance queued for ${p.fullName}`)}
                                className="px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-[11px] transition-colors"
                              >
                                Approve Issuance
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Mock footer */}
            <div className="flex items-center justify-between text-xs text-neutral-500 font-mono pt-2">
              <span>Showing {filteredParticipants.length} of 170 mock participant entries</span>
              <div className="flex items-center gap-2">
                <button disabled className="p-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-neutral-400">Page 1 of 15</span>
                <button onClick={() => showToast("Pagination simulation: Page 2")} className="p-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: BATCH CSV INGESTION & PRE-VALIDATION
           ========================================================================= */}
        {activeTab === "import" && (
          <div className="space-y-6">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="p-6 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-900">
                      Authoritative Import Engine
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">[PHASE A PRE-VALIDATION]</span>
                  </div>
                  <h2 className="text-lg font-bold text-white">
                    Participant CSV Ingestion & Pre-Issuance Validation
                  </h2>
                  <p className="text-xs text-neutral-400 max-w-3xl">
                    Parses RFC 4180 CSV files (Google Forms responses or Unstop exports). Automatically normalizes emails and title-cases names, detects in-file duplicates, flags cross-check conflicts against existing records, and enforces attendance/confirmation before any certificate issuance.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadSyntheticBenchmark}
                    className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-medium transition-colors flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-red-500" />
                    Load Synthetic Benchmark
                  </button>
                  {csvResult && (
                    <button
                      type="button"
                      onClick={handleClearCsv}
                      className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 text-xs transition-colors flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all ${
                  csvResult
                    ? "border-emerald-500/50 bg-emerald-950/10"
                    : "border-neutral-700 hover:border-red-500/50 bg-neutral-950/60 hover:bg-neutral-900/40"
                }`}
              >
                {csvParsing ? (
                  <div className="space-y-3 py-4">
                    <RefreshCw className="w-8 h-8 text-red-500 animate-spin mx-auto" />
                    <p className="text-sm text-neutral-300 font-mono">Parsing & running validation checks on {csvFileName}...</p>
                  </div>
                ) : csvResult ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <strong className="text-white text-sm font-semibold">{csvFileName}</strong>
                      <p className="text-xs text-neutral-400 font-mono mt-0.5">
                        {csvResult.summary.totalRows} Rows Parsed • {csvResult.summary.acceptedCount} Eligible for Issuance • {csvResult.summary.flaggedCount} Flagged
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">
                        ✓ In-Memory Validation Complete
                      </span>
                      <span className="text-[10px] text-neutral-400">Click to load a different CSV</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full bg-neutral-900 text-neutral-400 flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <strong className="text-white text-sm font-medium">Click to select participant CSV file</strong>
                      <p className="text-xs text-neutral-500 mt-1">
                        Accepts Google Forms export (.csv) or standard format with headers: <code className="text-neutral-400">Timestamp</code>, <code className="text-neutral-400">First Name</code>, <code className="text-neutral-400">Last Name</code>, <code className="text-neutral-400">Email Address</code>, <code className="text-neutral-400">Confirmation</code>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Supported Schema Spec Banner */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  <FileCode className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Schema Mapping Specifications Supported</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800 text-neutral-300">
                    <span className="text-red-400 font-semibold block mb-0.5">Google Forms Header Format:</span>
                    Timestamp, First Name, Last Name, Email Address, Confirmation
                  </div>
                  <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800 text-neutral-300">
                    <span className="text-red-400 font-semibold block mb-0.5">Standard / Unstop Format:</span>
                    Registration ID, Full Name, Email, Attendance, Eligibility
                  </div>
                </div>
              </div>

              {/* Summary Cards when result is present */}
              {csvResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Total Rows</div>
                      <div className="text-2xl font-bold text-white mt-1">{csvResult.summary.totalRows}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">Parsed lines</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">Eligible / Accepted</div>
                      <div className="text-2xl font-bold text-emerald-400 mt-1">{csvResult.summary.acceptedCount}</div>
                      <div className="text-[10px] text-emerald-600 mt-0.5">Ready for issuance</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Flagged For Review</div>
                      <div className="text-2xl font-bold text-amber-400 mt-1">{csvResult.summary.flaggedCount}</div>
                      <div className="text-[10px] text-amber-600 mt-0.5">Name conflict / Unconfirmed</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-blue-400">Duplicate Rows</div>
                      <div className="text-2xl font-bold text-blue-400 mt-1">{csvResult.summary.duplicateCount}</div>
                      <div className="text-[10px] text-blue-600 mt-0.5">Safe idempotent skip</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/30">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-red-400">Ineligible / Rejected</div>
                      <div className="text-2xl font-bold text-red-400 mt-1">{csvResult.summary.rejectedCount}</div>
                      <div className="text-[10px] text-red-600 mt-0.5">Missing info / Ineligible</div>
                    </div>
                  </div>

                  {/* Filter Pills for CSV Preview Table */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
                      {(["ALL", "ACCEPTED", "FLAGGED_FOR_REVIEW", "DUPLICATE", "REJECTED"] as const).map((filterKey) => (
                        <button
                          key={filterKey}
                          type="button"
                          onClick={() => setPreviewFilter(filterKey)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            previewFilter === filterKey
                              ? "bg-neutral-800 text-white shadow-sm"
                              : "text-neutral-400 hover:text-neutral-200"
                          }`}
                        >
                          {filterKey === "ALL" && `All (${csvResult.rows.length})`}
                          {filterKey === "ACCEPTED" && `Accepted (${csvResult.summary.acceptedCount})`}
                          {filterKey === "FLAGGED_FOR_REVIEW" && `Flagged (${csvResult.summary.flaggedCount})`}
                          {filterKey === "DUPLICATE" && `Duplicates (${csvResult.summary.duplicateCount})`}
                          {filterKey === "REJECTED" && `Rejected (${csvResult.summary.rejectedCount})`}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          showToast(`Simulated commit: ${csvResult.summary.acceptedCount} records staged for Phase B database import.`);
                        }}
                        disabled={csvResult.summary.acceptedCount === 0}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-md shadow-red-950/50"
                      >
                        <Award className="w-3.5 h-3.5" />
                        Stage {csvResult.summary.acceptedCount} Eligible for Phase B DB
                      </button>
                    </div>
                  </div>

                  {/* CSV Rows Table */}
                  <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950/60">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-neutral-800 bg-neutral-900/50 text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                            <th className="py-3 px-3">#</th>
                            <th className="py-3 px-4">Participant Name</th>
                            <th className="py-3 px-4">Email</th>
                            <th className="py-3 px-3">Status</th>
                            <th className="py-3 px-3">Confirmation / Source</th>
                            <th className="py-3 px-4">Validation Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60 font-mono text-xs">
                          {displayedCsvRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-neutral-500">
                                No rows match filter &quot;{previewFilter}&quot;.
                              </td>
                            </tr>
                          ) : (
                            displayedCsvRows.map((row) => {
                              const isAccepted = row.validationStatus === "ACCEPTED";
                              const isFlagged = row.validationStatus === "FLAGGED_FOR_REVIEW";
                              const isDuplicate = row.validationStatus === "DUPLICATE";

                              return (
                                <tr key={row.rowNumber} className="hover:bg-neutral-900/40 transition-colors">
                                  <td className="py-3 px-3 text-neutral-500 text-[11px]">{row.rowNumber}</td>
                                  <td className="py-3 px-4 font-sans font-medium text-white">
                                    <span>{row.fullName || <span className="text-neutral-600 italic">Empty</span>}</span>
                                  </td>
                                  <td className="py-3 px-4 text-neutral-300 text-[11px]">{row.email}</td>
                                  <td className="py-3 px-3">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                        isAccepted
                                          ? "bg-emerald-950/70 border border-emerald-800 text-emerald-400"
                                          : isFlagged
                                          ? "bg-amber-950/70 border border-amber-800 text-amber-400"
                                          : isDuplicate
                                          ? "bg-blue-950/70 border border-blue-800 text-blue-400"
                                          : "bg-red-950/70 border border-red-800 text-red-400"
                                      }`}
                                    >
                                      {isAccepted && <CheckCircle2 className="w-3 h-3" />}
                                      {isFlagged && <AlertTriangle className="w-3 h-3" />}
                                      {isDuplicate && <Info className="w-3 h-3" />}
                                      {!isAccepted && !isFlagged && !isDuplicate && <AlertCircle className="w-3 h-3" />}
                                      {row.validationStatus === "FLAGGED_FOR_REVIEW" ? "FLAGGED" : row.validationStatus}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-[11px] text-neutral-400">
                                    {row.rawConfirmation || row.registrationStatus || row.source}
                                  </td>
                                  <td className="py-3 px-4 text-[11px] text-neutral-400 font-sans">
                                    {row.validationNotes.join("; ")}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: NAME CORRECTION REVIEW QUEUE
           ========================================================================= */}
        {activeTab === "corrections" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-amber-500" />
                Participant Name Correction Queue
              </h2>
              <p className="text-xs text-neutral-400">
                Review participant-submitted correction requests. Approving will update the record and queue reissuance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {corrections.map((corr) => (
                <div
                  key={corr.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    corr.status === "APPROVED"
                      ? "bg-neutral-950/60 border-emerald-500/30"
                      : corr.status === "REJECTED"
                      ? "bg-neutral-950/60 border-red-500/30 opacity-70"
                      : "bg-neutral-900/80 border-neutral-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-[10px] font-mono text-neutral-500 block">
                        {corr.id} • {corr.submittedAt.slice(0, 10)}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-0.5">{corr.email}</h3>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                      corr.status === "APPROVED"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : corr.status === "REJECTED"
                        ? "bg-red-950 text-red-400 border border-red-800"
                        : "bg-amber-950 text-amber-400 border border-amber-800"
                    }`}>
                      {corr.status}
                    </span>
                  </div>

                  {/* Comparison Box */}
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-2 text-xs font-mono mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Current Name:</span>
                      <span className="text-neutral-300 line-through">{corr.currentFullName}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-neutral-800/60 pt-1.5">
                      <span className="text-emerald-400 font-semibold">Requested:</span>
                      <span className="text-emerald-400 font-bold">{corr.requestedFullName}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 mb-4">
                    <div className="text-neutral-400">
                      <strong>Reason:</strong> {corr.reason}
                    </div>
                    <div className="text-neutral-500 italic text-[11px]">
                      &quot;{corr.notes}&quot;
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {corr.status === "PENDING_REVIEW" ? (
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                      <button
                        onClick={() => handleApproveCorrection(corr.id, corr.requestedFullName)}
                        className="w-1/2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve & Reissue
                      </button>
                      <button
                        onClick={() => handleRejectCorrection(corr.id, corr.currentFullName)}
                        className="w-1/2 py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject Request
                      </button>
                    </div>
                  ) : (
                    <div className="pt-2 text-[11px] font-mono text-neutral-500 text-center">
                      Action finalized in mock memory store.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
