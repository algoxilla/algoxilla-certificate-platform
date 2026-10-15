// Algoxilla Certificate Platform - Phase 1 Mock Data Store
// STRICT PHASE 1 COMPLIANCE:
// All data contained herein is purely synthetic mock data for UI testing and layout validation.
// No real participant identities, email addresses, or actual verification hashes from Algothon'26
// are stored or queried in this file.

export interface MockParticipant {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  event: string;
  eventDate: string;
  confirmationStatus: "CONFIRMED" | "PENDING_ORGANIZER_APPROVAL" | "UNCONFIRMED";
  certificateStatus: "ISSUED" | "PENDING_ISSUANCE" | "INELIGIBLE";
  certificateId?: string;
  issueDate?: string;
  verificationHash?: string;
  hasCorrectionPending?: boolean;
  correctionNote?: string;
  isMock?: boolean;
}

export interface MockCorrectionRequest {
  id: string;
  participantId: string;
  currentFullName: string;
  requestedFullName: string;
  email: string;
  reason: "Typo in name" | "Casing correction" | "Missing middle name" | "Other";
  notes: string;
  submittedAt: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  isMock: true;
}

export interface MockDashboardMetrics {
  totalRegistrations: number;
  certificatesIssued: number;
  downloadedByParticipants: number;
  pendingCorrections: number;
  totalVerificationQueries: number;
  isMock: true;
}

export const MOCK_METRICS: MockDashboardMetrics = {
  totalRegistrations: 170,
  certificatesIssued: 150,
  downloadedByParticipants: 120,
  pendingCorrections: 4,
  totalVerificationQueries: 318,
  isMock: true,
};

export const MOCK_PARTICIPANTS: MockParticipant[] = [
  {
    id: "part-001",
    firstName: "Alex",
    lastName: "Chen",
    fullName: "Alex Chen",
    email: "alex.chen@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-8942",
    issueDate: "4 October 2026",
    verificationHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    hasCorrectionPending: false,
    isMock: true,
  },
  {
    id: "part-002",
    firstName: "Priya",
    lastName: "Sharma",
    fullName: "Priya Sharma",
    email: "priya.sharma@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-3104",
    issueDate: "4 October 2026",
    verificationHash: "sha256:a2b3c4d5e6f70819283746501928374650192837465019283746501928374650",
    hasCorrectionPending: true,
    correctionNote: "Requested capitalization correction to official title format.",
    isMock: true,
  },
  {
    id: "part-003",
    firstName: "Michael",
    lastName: "O'Connor",
    fullName: "Michael O'Connor",
    email: "michael.oconnor@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-7251",
    issueDate: "4 October 2026",
    verificationHash: "sha256:f1e2d3c4b5a697887766554433221100ffeeddccbbaa99887766554433221100",
    hasCorrectionPending: true,
    correctionNote: "Apostrophe formatting verification.",
    isMock: true,
  },
  {
    id: "part-004",
    firstName: "Rohit",
    lastName: "Verma",
    fullName: "Rohit Verma",
    email: "rohit.verma@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-5591",
    issueDate: "4 October 2026",
    verificationHash: "sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
    hasCorrectionPending: true,
    correctionNote: "Missing middle initial 'K.' in registration name.",
    isMock: true,
  },
  {
    id: "part-005",
    firstName: "Ananya",
    lastName: "Gupta",
    fullName: "Ananya Gupta",
    email: "ananya.gupta@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-1189",
    issueDate: "4 October 2026",
    verificationHash: "sha256:3344556677889900aabbccddeeff11223344556677889900aabbccddeeff1122",
    hasCorrectionPending: true,
    correctionNote: "Full legal name update requested.",
    isMock: true,
  },
  {
    id: "part-006",
    firstName: "Marcus",
    lastName: "Vance",
    fullName: "Marcus Vance",
    email: "marcus.vance@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-6420",
    issueDate: "4 October 2026",
    verificationHash: "sha256:556677889900aabbccddeeff11223344556677889900aabbccddeeff11223344",
    hasCorrectionPending: false,
    isMock: true,
  },
  {
    id: "part-007",
    firstName: "Aarav",
    lastName: "Patel",
    fullName: "Aarav Patel",
    email: "aarav.patel@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-9011",
    issueDate: "4 October 2026",
    verificationHash: "sha256:77889900aabbccddeeff11223344556677889900aabbccddeeff112233445566",
    hasCorrectionPending: false,
    isMock: true,
  },
  {
    id: "part-008",
    firstName: "Sophia",
    lastName: "Rodriguez",
    fullName: "Sophia Rodriguez",
    email: "sophia.rodriguez@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "ISSUED",
    certificateId: "MOCK-ALGO26-4432",
    issueDate: "4 October 2026",
    verificationHash: "sha256:9900aabbccddeeff11223344556677889900aabbccddeeff1122334455667788",
    hasCorrectionPending: false,
    isMock: true,
  },
  {
    id: "part-009",
    firstName: "David",
    lastName: "Kim",
    fullName: "David Kim",
    email: "david.kim@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "PENDING_ISSUANCE",
    certificateId: undefined,
    issueDate: undefined,
    verificationHash: undefined,
    hasCorrectionPending: false,
    isMock: true,
  },
  {
    id: "part-010",
    firstName: "Zara",
    lastName: "Hassan",
    fullName: "Zara Hassan",
    email: "zara.hassan@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "CONFIRMED",
    certificateStatus: "PENDING_ISSUANCE",
    certificateId: undefined,
    issueDate: undefined,
    verificationHash: undefined,
    hasCorrectionPending: false,
    isMock: true,
  },
  {
    id: "part-011",
    firstName: "Jordan",
    lastName: "Taylor",
    fullName: "Jordan Taylor",
    email: "jordan.taylor@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "PENDING_ORGANIZER_APPROVAL",
    certificateStatus: "PENDING_ISSUANCE",
    certificateId: undefined,
    issueDate: undefined,
    verificationHash: undefined,
    hasCorrectionPending: false,
    isMock: true,
  },
  {
    id: "part-012",
    firstName: "Sam",
    lastName: "Morgan",
    fullName: "Sam Morgan",
    email: "sam.morgan@example.com",
    event: "Algothon'26 — A National Level Hackathon",
    eventDate: "4 October 2026",
    confirmationStatus: "UNCONFIRMED",
    certificateStatus: "INELIGIBLE",
    certificateId: undefined,
    issueDate: undefined,
    verificationHash: undefined,
    hasCorrectionPending: false,
    isMock: true,
  },
];

export const MOCK_CORRECTIONS: MockCorrectionRequest[] = [
  {
    id: "corr-101",
    participantId: "part-002",
    currentFullName: "priya sharma",
    requestedFullName: "Priya Sharma",
    email: "priya.sharma@example.com",
    reason: "Casing correction",
    notes: "Registration form had lowercase letters throughout.",
    submittedAt: "2026-10-05T14:32:00Z",
    status: "PENDING_REVIEW",
    isMock: true,
  },
  {
    id: "corr-102",
    participantId: "part-003",
    currentFullName: "Michael O Connor",
    requestedFullName: "Michael O'Connor",
    email: "michael.oconnor@example.com",
    reason: "Typo in name",
    notes: "Apostrophe was omitted in initial submission.",
    submittedAt: "2026-10-06T09:15:00Z",
    status: "PENDING_REVIEW",
    isMock: true,
  },
  {
    id: "corr-103",
    participantId: "part-004",
    currentFullName: "Rohit Verma",
    requestedFullName: "Rohit K. Verma",
    email: "rohit.verma@example.com",
    reason: "Missing middle name",
    notes: "Need middle initial for college academic credit submission.",
    submittedAt: "2026-10-07T11:45:00Z",
    status: "PENDING_REVIEW",
    isMock: true,
  },
  {
    id: "corr-104",
    participantId: "part-005",
    currentFullName: "Ananya Gupta",
    requestedFullName: "Ananya S. Gupta",
    email: "ananya.gupta@example.com",
    reason: "Other",
    notes: "Full legal passport name matching required.",
    submittedAt: "2026-10-08T16:20:00Z",
    status: "PENDING_REVIEW",
    isMock: true,
  },
];

// Helper functions for mock client-side queries
export function findMockParticipantByEmail(email: string): MockParticipant | undefined {
  const normalized = email.trim().toLowerCase();
  return MOCK_PARTICIPANTS.find((p) => p.email.toLowerCase() === normalized);
}

export function findMockCertificateById(certificateId: string): MockParticipant | undefined {
  const normalized = certificateId.trim().toUpperCase();
  return MOCK_PARTICIPANTS.find(
    (p) => p.certificateId && p.certificateId.toUpperCase() === normalized
  );
}
