"use client";

import React, { useState } from "react";
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
  ChevronRight
} from "lucide-react";
import { 
  MOCK_METRICS, 
  MOCK_PARTICIPANTS, 
  MOCK_CORRECTIONS, 
  MockCorrectionRequest 
} from "@/lib/mockData";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<"roster" | "import" | "corrections">("roster");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  
  // Interactive state for corrections
  const [corrections, setCorrections] = useState<MockCorrectionRequest[]>(MOCK_CORRECTIONS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // CSV Import simulation state
  const [csvFileUploaded, setCsvFileUploaded] = useState<boolean>(false);
  const [dryRunRunning, setDryRunRunning] = useState<boolean>(false);
  const [dryRunCompleted, setDryRunCompleted] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
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

  const handleSimulateDryRun = () => {
    setDryRunRunning(true);
    setDryRunCompleted(false);
    setTimeout(() => {
      setDryRunRunning(false);
      setDryRunCompleted(true);
      showToast("Dry run complete: 170 rows parsed, 150 eligible, 20 flagged.");
    }, 1200);
  };

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
            TAB 2: BATCH CSV INGESTION SIMULATOR
           ========================================================================= */}
        {activeTab === "import" && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-red-500 bg-red-950 px-2 py-0.5 rounded border border-red-900">
                    Phase 6 Spec Preview
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500">[MOCK SIMULATOR]</span>
                </div>
                <h2 className="text-lg font-bold text-white">
                  Batch Participant Spreadsheet Ingestion
                </h2>
                <p className="text-xs text-neutral-400">
                  Designed for the exact Google Forms export schema: <code className="text-red-400">Timestamp</code>, <code className="text-red-400">First Name</code>, <code className="text-red-400">Last Name</code>, <code className="text-red-400">Email Address</code>, <code className="text-red-400">Confirmation</code>.
                </p>
              </div>

              {/* Drag and Drop Zone */}
              <div 
                onClick={() => {
                  setCsvFileUploaded(true);
                  showToast("Attached mock file: 'Algothon26_Responses_Master.csv'");
                }}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  csvFileUploaded
                    ? "border-emerald-500/50 bg-emerald-950/10"
                    : "border-neutral-700 hover:border-red-500/50 bg-neutral-950/60 hover:bg-neutral-900/40"
                }`}
              >
                {csvFileUploaded ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <strong className="text-white text-sm">Algothon26_Responses_Master.csv</strong>
                      <p className="text-xs text-neutral-400 font-mono mt-0.5">
                        170 Rows Detected • Format: Validated Google Forms Export
                      </p>
                    </div>
                    <span className="inline-block text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">
                      ✓ Ready for validation
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full bg-neutral-900 text-neutral-400 flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <strong className="text-white text-sm">Click to simulate CSV file selection</strong>
                      <p className="text-xs text-neutral-500 mt-1">
                        Accepts .csv or .xlsx formatted responses export
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Format Column Reference Card */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider block">
                  Required Header Mapping Specification
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono text-neutral-400">
                  <div className="p-2 rounded bg-neutral-900 border border-neutral-800">1. Timestamp</div>
                  <div className="p-2 rounded bg-neutral-900 border border-neutral-800">2. First Name</div>
                  <div className="p-2 rounded bg-neutral-900 border border-neutral-800">3. Last Name</div>
                  <div className="p-2 rounded bg-neutral-900 border border-neutral-800">4. Email Address</div>
                  <div className="p-2 rounded bg-neutral-900 border border-neutral-800">5. Confirmation</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSimulateDryRun}
                  disabled={!csvFileUploaded || dryRunRunning}
                  className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white font-medium text-xs transition-colors flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${dryRunRunning ? "animate-spin" : ""}`} />
                  {dryRunRunning ? "Analyzing Records..." : "Simulate Validation Dry-Run"}
                </button>

                <button
                  type="button"
                  disabled={!dryRunCompleted}
                  onClick={() => showToast("Simulated batch issuance: 150 certificates stamped with SHA-256 hashes.")}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-md shadow-red-950/50"
                >
                  <Award className="w-3.5 h-3.5" />
                  Simulate Batch Issuance (150 Eligible)
                </button>
              </div>

              {/* Dry-Run Results Summary */}
              {dryRunCompleted && (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Validation Dry Run Completed Successfully
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800">
                      <span className="text-neutral-400">Eligible Rows:</span>{" "}
                      <strong className="text-emerald-400">150</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800">
                      <span className="text-neutral-400">Duplicate Emails:</span>{" "}
                      <strong className="text-neutral-300">0</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800">
                      <span className="text-neutral-400">Flagged For Review:</span>{" "}
                      <strong className="text-amber-400">20 (Unconfirmed)</strong>
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
                        {corr.id} • {new Date(corr.submittedAt).toLocaleDateString()}
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
