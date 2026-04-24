"use client";

import { useState, useCallback } from "react";
import {
  initializePoll,
  castVote,
  getVoteCount,
  getWinner,
  CONTRACT_ADDRESS,
} from "@/hooks/contract";
import { AnimatedCard } from "@/components/ui/animated-card";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Icons ────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function VoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 12 2 2 4-4" />
      <path d="m5.2 18.2c.6.6 1.2.9 1.8.9s1.2-.3 1.8-.9c.6-.6.9-1.2.9-1.8s-.3-1.2-.9-1.8" />
      <path d="m7.8 13.2c.6.6 1.2.9 1.8.9s1.2-.3 1.8-.9c.6-.6.9-1.2.9-1.8s-.3-1.2-.9-1.8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ── Styled Input ─────────────────────────────────────────────

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-white/30">
        {label}
      </label>
      <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-px transition-all focus-within:border-[#7c6cf0]/30 focus-within:shadow-[0_0_20px_rgba(124,108,240,0.08)]">
        <input
          {...props}
          className="w-full rounded-[11px] bg-transparent px-4 py-3 font-mono text-sm text-white/90 placeholder:text-white/15 outline-none"
        />
      </div>
    </div>
  );
}

// ── Method Signature ─────────────────────────────────────────

function MethodSignature({
  name,
  params,
  returns,
  color,
}: {
  name: string;
  params: string;
  returns?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 font-mono text-sm">
      <span style={{ color }} className="font-semibold">fn</span>
      <span className="text-white/70">{name}</span>
      <span className="text-white/20 text-xs">{params}</span>
      {returns && (
        <span className="ml-auto text-white/15 text-[10px]">{returns}</span>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

type Tab = "vote" | "init" | "results";

interface ContractUIProps {
  walletAddress: string | null;
  onConnect: () => void;
  isConnecting: boolean;
}

export default function ContractUI({ walletAddress, onConnect, isConnecting }: ContractUIProps) {
  const [activeTab, setActiveTab] = useState<Tab>("vote");
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Init state
  const [candidatesInput, setCandidatesInput] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);

  // Vote state
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [isVoting, setIsVoting] = useState(false);

  // Results state
  const [candidateResults, setCandidateResults] = useState<Record<string, number>>({});
  const [winner, setWinner] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleInitialize = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    const candidates = candidatesInput.split(",").map(c => c.trim()).filter(c => c);
    if (candidates.length < 2) return setError("Enter at least 2 candidates (comma-separated)");
    setError(null);
    setIsInitializing(true);
    setTxStatus("Initializing poll...");
    try {
      await initializePoll(walletAddress, candidates);
      setTxStatus("Poll created on-chain!");
      setCandidatesInput("");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsInitializing(false);
    }
  }, [walletAddress, candidatesInput]);

  const handleVote = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    if (!selectedCandidate.trim()) return setError("Select a candidate");
    setError(null);
    setIsVoting(true);
    setTxStatus("Casting vote...");
    try {
      await castVote(walletAddress, selectedCandidate.trim());
      setTxStatus("Vote recorded on-chain!");
      setSelectedCandidate("");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsVoting(false);
    }
  }, [walletAddress, selectedCandidate]);

  const handleLoadResults = useCallback(async () => {
    setError(null);
    setIsLoadingResults(true);
    try {
      // For demo, let's assume candidates are: Alice, Bob, Charlie
      const candidates = ["Alice", "Bob", "Charlie"];
      const results: Record<string, number> = {};
      let maxVotes = 0;
      let currentWinner = "";
      
      for (const candidate of candidates) {
        const votes = await getVoteCount(candidate, walletAddress || undefined);
        results[candidate] = typeof votes === "number" ? votes : 0;
        if (results[candidate] > maxVotes) {
          maxVotes = results[candidate];
          currentWinner = candidate;
        }
      }
      
      setCandidateResults(results);
      setWinner(currentWinner || "No votes yet");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setIsLoadingResults(false);
    }
  }, [walletAddress]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "vote", label: "Vote", icon: <VoteIcon />, color: "#34d399" },
    { key: "init", label: "Create Poll", icon: <UsersIcon />, color: "#7c6cf0" },
    { key: "results", label: "Results", icon: <TrophyIcon />, color: "#fbbf24" },
  ];

  return (
    <div className="w-full max-w-2xl animate-fade-in-up-delayed">
      {/* Toasts */}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#f87171]/15 bg-[#f87171]/[0.05] px-4 py-3 backdrop-blur-sm animate-slide-down">
          <span className="mt-0.5 text-[#f87171]"><AlertIcon /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#f87171]/90">Error</p>
            <p className="text-xs text-[#f87171]/50 mt-0.5 break-all">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="shrink-0 text-[#f87171]/30 hover:text-[#f87171]/70 text-lg leading-none">&times;</button>
        </div>
      )}

      {txStatus && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#34d399]/15 bg-[#34d399]/[0.05] px-4 py-3 backdrop-blur-sm shadow-[0_0_30px_rgba(52,211,153,0.05)] animate-slide-down">
          <span className="text-[#34d399]">
            {txStatus.includes("on-chain") || txStatus.includes("recorded") || txStatus.includes("created") ? <CheckIcon /> : <SpinnerIcon />}
          </span>
          <span className="text-sm text-[#34d399]/90">{txStatus}</span>
        </div>
      )}

      {/* Main Card */}
      <Spotlight className="rounded-2xl">
        <AnimatedCard className="p-0" containerClassName="rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c6cf0]/20 to-[#4fc3f7]/20 border border-white/[0.06]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#7c6cf0]">
                  <path d="m9 12 2 2 4-4" />
                  <path d="m5.2 18.2c.6.6 1.2.9 1.8.9s1.2-.3 1.8-.9c.6-.6.9-1.2.9-1.8s-.3-1.2-.9-1.8" />
                  <path d="m7.8 13.2c.6.6 1.2.9 1.8.9s1.2-.3 1.8-.9c.6-.6.9-1.2.9-1.8s-.3-1.2-.9-1.8" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/90">Voting Dapp</h3>
                <p className="text-[10px] text-white/25 font-mono mt-0.5">{truncate(CONTRACT_ADDRESS)}</p>
              </div>
            </div>
            <Badge variant="info" className="text-[10px]">Soroban</Badge>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setError(null); }}
                className={cn(
                  "relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all",
                  activeTab === t.key ? "text-white/90" : "text-white/35 hover:text-white/55"
                )}
              >
                <span style={activeTab === t.key ? { color: t.color } : undefined}>{t.icon}</span>
                {t.label}
                {activeTab === t.key && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
                    style={{ background: `linear-gradient(to right, ${t.color}, ${t.color}66)` }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Vote */}
            {activeTab === "vote" && (
              <div className="space-y-5">
                <MethodSignature name="vote" params="(voter: Address, candidate: String)" color="#34d399" />
                
                {walletAddress ? (
                  <>
                    <div className="space-y-2">
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-white/30">Select Candidate</label>
                      <div className="flex gap-2">
                        {["Alice", "Bob", "Charlie"].map((c) => {
                          const active = selectedCandidate === c;
                          return (
                            <button
                              key={c}
                              onClick={() => setSelectedCandidate(c)}
                              className={cn(
                                "flex items-center gap-1.5 rounded-lg border px-4 py-3 text-sm font-medium transition-all active:scale-95",
                                active
                                  ? "border-[#34d399]/40 bg-[#34d399]/10 text-[#34d399]"
                                  : "border-white/[0.06] bg-white/[0.02] text-white/35 hover:text-white/55 hover:border-white/[0.1]"
                              )}
                            >
                              {active && <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />}
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <ShimmerButton onClick={handleVote} disabled={isVoting} shimmerColor="#34d399" className="w-full">
                      {isVoting ? <><SpinnerIcon /> Casting Vote...</> : <><VoteIcon /> Cast Vote</>}
                    </ShimmerButton>
                  </>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#34d399]/20 bg-[#34d399]/[0.03] py-4 text-sm text-[#34d399]/60 hover:border-[#34d399]/30 hover:text-[#34d399]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to vote
                  </button>
                )}
              </div>
            )}

            {/* Init */}
            {activeTab === "init" && (
              <div className="space-y-5">
                <MethodSignature name="init" params="(candidates: Vec<String>)" color="#7c6cf0" />
                
                {walletAddress ? (
                  <>
                    <Input 
                      label="Candidates (comma-separated)" 
                      value={candidatesInput} 
                      onChange={(e) => setCandidatesInput(e.target.value)} 
                      placeholder="Alice, Bob, Charlie" 
                    />
                    <ShimmerButton onClick={handleInitialize} disabled={isInitializing} shimmerColor="#7c6cf0" className="w-full">
                      {isInitializing ? <><SpinnerIcon /> Creating Poll...</> : <><UsersIcon /> Initialize Poll</>}
                    </ShimmerButton>
                  </>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#7c6cf0]/20 bg-[#7c6cf0]/[0.03] py-4 text-sm text-[#7c6cf0]/60 hover:border-[#7c6cf0]/30 hover:text-[#7c6cf0]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to create poll
                  </button>
                )}
              </div>
            )}

            {/* Results */}
            {activeTab === "results" && (
              <div className="space-y-5">
                <MethodSignature name="get_winner" params="() -> String" returns="winner" color="#fbbf24" />
                
                <ShimmerButton onClick={handleLoadResults} disabled={isLoadingResults} shimmerColor="#fbbf24" className="w-full">
                  {isLoadingResults ? <><SpinnerIcon /> Loading...</> : <><TrophyIcon /> Load Results</>}
                </ShimmerButton>

                {Object.keys(candidateResults).length > 0 && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-fade-in-up">
                    <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/25">Live Results</span>
                      {winner && (
                        <Badge variant="warning">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24] animate-pulse" />
                          Winner: {winner}
                        </Badge>
                      )}
                    </div>
                    <div className="p-4 space-y-3">
                      {Object.entries(candidateResults).map(([candidate, votes]) => {
                        const maxVotes = Math.max(...Object.values(candidateResults), 1);
                        const percentage = (votes / maxVotes) * 100;
                        return (
                          <div key={candidate} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm text-white/80">{candidate}</span>
                              <span className="font-mono text-sm text-white/60">{votes} votes</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                              <div 
                                className="h-full rounded-full bg-gradient-to-r from-[#7c6cf0] to-[#4fc3f7] transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.04] px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-white/15">Voting Dapp &middot; Soroban</p>
            <div className="flex items-center gap-2">
              {["Anonymous", "Immutable", "Transparent"].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("h-1 w-1 rounded-full", 
                    i === 0 ? "bg-[#7c6cf0]/50" : i === 1 ? "bg-[#4fc3f7]/50" : "bg-[#34d399]/50"
                  )} />
                  <span className="font-mono text-[9px] text-white/15">{s}</span>
                  {i < 2 && <span className="text-white/10 text-[8px]">&rarr;</span>}
                </span>
              ))}
            </div>
          </div>
        </AnimatedCard>
      </Spotlight>
    </div>
  );
}