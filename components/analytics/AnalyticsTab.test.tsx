import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalyticsTab } from "./AnalyticsTab";
import type { Transaction } from "@/lib/types";

// Mock the hook so we control the data without needing providers
vi.mock("@/lib/soroban/useLiveTransactions", () => ({
  useLiveTransactions: vi.fn(),
}));

import { useLiveTransactions } from "@/lib/soroban/useLiveTransactions";

const mockUseLiveTransactions = useLiveTransactions as ReturnType<typeof vi.fn>;

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: crypto.randomUUID(),
  asset: "USDC",
  amount: 10,
  status: "COMPLETED",
  timestamp: Date.now(),
  from: "GA",
  to: "GB",
  memo: "",
  callback_url: "",
  retries: 0,
  created_at: Date.now() - 5000,
  ...overrides,
});

describe("AnalyticsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    mockUseLiveTransactions.mockReturnValue([]);
    render(<AnalyticsTab />);
    expect(screen.getByTestId("analytics-tab")).toBeInTheDocument();
  });

  it("shows empty state when there are no transactions", () => {
    mockUseLiveTransactions.mockReturnValue([]);
    render(<AnalyticsTab />);
    const emptyStates = screen.getAllByTestId("empty-state");
    expect(emptyStates.length).toBeGreaterThanOrEqual(3);
  });

  it("shows session disclaimer text", () => {
    mockUseLiveTransactions.mockReturnValue([]);
    render(<AnalyticsTab />);
    expect(screen.getByText(/locally observed history since this session/)).toBeInTheDocument();
  });

  it("renders charts when transactions are present", () => {
    mockUseLiveTransactions.mockReturnValue([
      makeTx({ status: "COMPLETED" }),
      makeTx({ status: "FAILED" }),
      makeTx({ status: "PENDING" }),
    ]);
    render(<AnalyticsTab />);
    // No empty states when data is present
    expect(screen.queryAllByTestId("empty-state")).toHaveLength(0);
  });

  it("shows TRANSACTION VOLUME OVER TIME panel", () => {
    mockUseLiveTransactions.mockReturnValue([makeTx()]);
    render(<AnalyticsTab />);
    expect(screen.getByText("TRANSACTION VOLUME OVER TIME")).toBeInTheDocument();
  });

  it("shows SUCCESS / FAIL RATE panel", () => {
    mockUseLiveTransactions.mockReturnValue([makeTx()]);
    render(<AnalyticsTab />);
    expect(screen.getByText("SUCCESS / FAIL RATE")).toBeInTheDocument();
  });

  it("shows AVG TIME-IN-STAGE panel", () => {
    mockUseLiveTransactions.mockReturnValue([makeTx()]);
    render(<AnalyticsTab />);
    expect(screen.getByText("AVG TIME-IN-STAGE")).toBeInTheDocument();
  });

  it("shows correct tx count in disclaimer", () => {
    mockUseLiveTransactions.mockReturnValue([makeTx(), makeTx()]);
    render(<AnalyticsTab />);
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument();
  });

  it("shows singular form for one transaction", () => {
    mockUseLiveTransactions.mockReturnValue([makeTx()]);
    render(<AnalyticsTab />);
    expect(screen.getByText(/1\s+transaction(?![a-z])/i)).toBeInTheDocument();
  });

  it("renders volume chart bars", () => {
    mockUseLiveTransactions.mockReturnValue([makeTx()]);
    render(<AnalyticsTab />);
    const chart = screen.getByRole("img", { name: /transaction volume bar chart/i });
    expect(chart).toBeInTheDocument();
  });

  it("renders status ratio meters", () => {
    mockUseLiveTransactions.mockReturnValue([
      makeTx({ status: "COMPLETED" }),
      makeTx({ status: "FAILED" }),
    ]);
    render(<AnalyticsTab />);
    const meters = screen.getAllByRole("meter");
    // 4 status meters (ratio) + 4 stage duration meters
    expect(meters.length).toBeGreaterThanOrEqual(4);
  });
});
