"use client";

import React, { useState, useEffect } from "react";
import { X, AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  email: string;
  onSuccess?: (requestedName: string, reason: string) => void;
}

function CorrectionModalInner({
  onClose,
  currentName,
  email,
  onSuccess,
}: Omit<CorrectionModalProps, "isOpen">) {
  const [requestedName, setRequestedName] = useState(currentName);
  const [reason, setReason] = useState<string>("Typo in name");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedName.trim()) {
      setError("Please provide the corrected participant name.");
      return;
    }
    if (requestedName.trim().toLowerCase() === currentName.trim().toLowerCase() && reason !== "Casing correction") {
      setError("Requested name is identical to the current certificate name.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    // Simulate review submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      if (onSuccess) {
        onSuccess(requestedName, reason);
      }
    }, 900);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
    >
      <div 
        className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl p-6 sm:p-8 space-y-6 text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Correction Request Submitted</h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Your request to adjust the name to <strong className="text-neutral-200">{requestedName}</strong> has been logged into the organizer review queue.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-400 text-left space-y-1">
              <div className="flex justify-between">
                <span>Request Reference:</span>
                <span className="text-red-400 font-semibold">[MOCK-CORR-782]</span>
              </div>
              <div className="flex justify-between">
                <span>Associated Email:</span>
                <span className="text-neutral-300">{email}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="text-amber-400">PENDING_ORGANIZER_REVIEW</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500">
              [Phase 1 Demo] Organizers can view, approve, or reject this correction in the Organizer Dashboard (`/admin`).
            </p>

            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition-colors"
            >
              Close Window
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-red-500 bg-red-950/60 border border-red-900/40 px-2 py-0.5 rounded">
                  Self-Service
                </span>
                <span className="text-[10px] font-mono text-neutral-500">[MOCK WORKFLOW]</span>
              </div>
              <h2 id="modal-title" className="text-lg sm:text-xl font-bold text-white">
                Request Name Correction
              </h2>
              <p className="text-xs text-neutral-400">
                Notice a typo or spelling error on your Algothon’26 certificate? Submit a formal correction request for organizer review.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-400 font-medium mb-1">
                  Current Name on Certificate:
                </label>
                <div className="px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 font-mono">
                  {currentName}
                </div>
              </div>

              <div>
                <label htmlFor="requested-name" className="block text-neutral-200 font-medium mb-1">
                  Corrected Full Name (as it should appear): *
                </label>
                <input
                  id="requested-name"
                  type="text"
                  required
                  value={requestedName}
                  onChange={(e) => setRequestedName(e.target.value)}
                  placeholder="e.g. Alex M. Chen"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-white placeholder-neutral-600 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="reason" className="block text-neutral-200 font-medium mb-1">
                  Reason for Correction: *
                </label>
                <select
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-white transition-colors"
                >
                  <option value="Typo in name">Typo or misspelling in name</option>
                  <option value="Casing correction">Casing formatting (e.g. lowercase to Title Case)</option>
                  <option value="Missing middle name">Missing middle name or initial</option>
                  <option value="Other">Other / Full legal name matching</option>
                </select>
              </div>

              <div>
                <label htmlFor="notes" className="block text-neutral-200 font-medium mb-1">
                  Additional Notes (Optional):
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Explain why this change is necessary..."
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-white placeholder-neutral-600 transition-colors"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-red-950/40"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function CorrectionModal(props: CorrectionModalProps) {
  if (!props.isOpen) return null;
  return <CorrectionModalInner key={props.currentName} {...props} />;
}
