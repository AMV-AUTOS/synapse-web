"use client";
import { useState, useRef, useEffect } from "react";
import { useContractSelection } from "@/lib/soroban/SorobanProvider";
import { useToast } from "@/components/ui/Toast";
import { shortId } from "@/lib/utils";
import { AMBER, BG1, BG2, BG3, BORDER, DIM, MONO, STATUS_META } from "@/lib/constants";

export function ContractSwitcher() {
  const { contractId, setContractId, availableContracts, addContract, removeContract } =
    useContractSelection();
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const currentContract = availableContracts.find((c) => c.id === contractId);
  const displayName = currentContract?.name ?? (contractId ? shortId(contractId) : "No Contract");

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingNew(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function handleSelect(id: string) {
    if (id === contractId) {
      setOpen(false);
      return;
    }
    setContractId(id);
    const target = availableContracts.find((c) => c.id === id);
    toast(`Switched contract to ${target?.name ?? shortId(id)}`, "info");
    setOpen(false);
  }

  function handleAddNew(e: React.FormEvent) {
    e.preventDefault();
    const trimmedId = newId.trim();
    if (!trimmedId) {
      toast("Contract ID cannot be empty", "error");
      return;
    }
    const trimmedName = newName.trim() || `Contract (${shortId(trimmedId)})`;
    addContract({
      id: trimmedId,
      name: trimmedName,
      isCustom: true,
    });
    setContractId(trimmedId);
    toast(`Added and switched to ${trimmedName}`, "success");
    setNewId("");
    setNewName("");
    setAddingNew(false);
    setOpen(false);
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Switcher Trigger Button */}
      <button
        type="button"
        id="contract-switcher-button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 12px",
          background: "rgba(245,166,35,0.06)",
          border: `1px solid ${contractId ? BORDER : "rgba(239,83,80,0.5)"}`,
          color: contractId ? "#fff" : STATUS_META.FAILED.color,
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: "0.05em",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = AMBER;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = contractId ? BORDER : "rgba(239,83,80,0.5)";
        }}
        title={contractId ? `Active Contract: ${contractId}` : "No contract selected"}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: contractId ? AMBER : STATUS_META.FAILED.color,
            boxShadow: contractId ? `0 0 6px 1px rgba(245,166,35,0.5)` : "none",
          }}
        />
        <span style={{ color: DIM, fontSize: 10, textTransform: "uppercase" }}>CONTRACT:</span>
        <span style={{ color: "#fff", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName}
        </span>
        <span style={{ fontSize: 9, color: DIM, marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          id="contract-switcher-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 320,
            background: BG1,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.75)",
            zIndex: 150,
            padding: 12,
            fontFamily: MONO,
          }}
          className="animate-fade-in"
        >
          <div
            style={{
              fontSize: 10,
              color: AMBER,
              letterSpacing: "0.1em",
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>TRACKED CONTRACTS</span>
            <span style={{ fontSize: 9, color: DIM }}>{availableContracts.length} available</span>
          </div>

          {/* List of Contracts */}
          <div
            style={{
              maxHeight: 180,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 10,
            }}
          >
            {availableContracts.length === 0 ? (
              <div style={{ fontSize: 10, color: DIM, padding: "8px 4px", fontStyle: "italic" }}>
                No contracts configured yet. Add one below.
              </div>
            ) : (
              availableContracts.map((c) => {
                const isSelected = c.id === contractId;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      background: isSelected ? "rgba(245,166,35,0.12)" : BG2,
                      border: `1px solid ${isSelected ? AMBER : "transparent"}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = BG3;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = BG2;
                      }
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? AMBER : "#eee",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.name}
                        </span>
                        {isSelected && (
                          <span
                            style={{
                              fontSize: 8,
                              padding: "1px 4px",
                              background: "rgba(245,166,35,0.2)",
                              color: AMBER,
                              border: `1px solid ${AMBER}66`,
                            }}
                          >
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 9, color: DIM, wordBreak: "break-all" }}>
                        {shortId(c.id, 8)}
                      </span>
                    </div>

                    {c.isCustom && (
                      <button
                        type="button"
                        title="Remove contract"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeContract(c.id);
                          toast(`Removed contract ${c.name}`, "info");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: DIM,
                          fontSize: 12,
                          cursor: "pointer",
                          padding: "2px 6px",
                          marginLeft: 6,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = STATUS_META.FAILED.color)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = DIM)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Add New Contract section */}
          {addingNew ? (
            <form
              onSubmit={handleAddNew}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px",
                background: BG2,
                border: `1px solid ${BORDER}`,
              }}
            >
              <div style={{ fontSize: 10, color: AMBER, letterSpacing: "0.06em", fontWeight: 600 }}>
                ADD DEPLOYED CONTRACT
              </div>
              <input
                type="text"
                placeholder="Contract ID (C... or 56-char hex)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                style={{
                  background: BG1,
                  border: `1px solid ${BORDER}`,
                  color: "#fff",
                  fontFamily: MONO,
                  fontSize: 10,
                  padding: "6px 8px",
                  outline: "none",
                }}
                required
                autoFocus
              />
              <input
                type="text"
                placeholder="Label (e.g. My Testnet Deployment)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{
                  background: BG1,
                  border: `1px solid ${BORDER}`,
                  color: "#fff",
                  fontFamily: MONO,
                  fontSize: 10,
                  padding: "6px 8px",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setAddingNew(false)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${BORDER}`,
                    color: DIM,
                    fontFamily: MONO,
                    fontSize: 10,
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: AMBER,
                    border: `1px solid ${AMBER}`,
                    color: "#000",
                    fontFamily: MONO,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 12px",
                    cursor: "pointer",
                  }}
                >
                  Save & Switch
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                id="add-contract-button"
                onClick={() => setAddingNew(true)}
                style={{
                  background: "transparent",
                  border: `1px dashed ${BORDER}`,
                  color: AMBER,
                  fontFamily: MONO,
                  fontSize: 10,
                  padding: "6px 12px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "center",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = AMBER;
                  e.currentTarget.style.background = "rgba(245,166,35,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                  e.currentTarget.style.background = "transparent";
                }}
              >
                + ADD CONTRACT ID
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
