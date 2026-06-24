import React, { useState, useRef, useEffect } from "react";
import API from "api/client";
import { useLanguage } from "../../context/LanguageContext";
import styles from "styles/components/PartySearchSelect.module.css";

type Party = Record<string, any>;
const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const pid = (p: Party): string => str(p?.party_id ?? p?.id);
const pname = (p: Party): string => str(p?.party_name ?? p?.name);
const optLabel = (p: Party): string => {
  const id = pid(p);
  const n = pname(p);
  return n ? `${n} — ${id}` : id;
};

interface Props {
  label: string;
  value: string; // the committed party id
  onChange: (id: string) => void;
  required?: boolean;
}

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

// A searchable party picker: the operator types to search participants (matched
// server-side by the satellite) and picks one from the list, so the committed
// value is always a real party id — free-text mistakes are impossible. Styled to
// match FormInput / FormSelect (neutral border, 8px radius, floating label).
const PartySearchSelect: React.FC<Props> = ({ label, value, onChange, required = false }) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Debounced participant search while the menu is open. When the input still
  // shows a committed selection, search the general list (empty term) so the
  // menu stays useful instead of querying for the "name — id" label.
  useEffect(() => {
    if (!open) return;
    const term = selectedLabel && query === selectedLabel ? "" : query.trim();
    const id = ++reqRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await new API().fetchParticipants({
          name: term || undefined,
          pageSize: PAGE_SIZE,
        });
        if (id !== reqRef.current) return;
        const body: any = res?.data ?? {};
        const arr: Party[] = Array.isArray(body?.data)
          ? body.data
          : Array.isArray(body)
          ? body
          : [];
        setResults(arr);
      } catch {
        if (id === reqRef.current) setResults([]);
      } finally {
        if (id === reqRef.current) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, selectedLabel]);

  const choose = (p: Party) => {
    const lbl = optLabel(p);
    onChange(pid(p));
    setQuery(lbl);
    setSelectedLabel(lbl);
    setOpen(false);
  };

  const onType = (text: string) => {
    setQuery(text);
    setSelectedLabel("");
    if (value) onChange(""); // typing invalidates the committed selection
    setOpen(true);
  };

  const clear = () => {
    onChange("");
    setQuery("");
    setSelectedLabel("");
    setResults([]);
  };

  const isActive = open || query.length > 0;

  return (
    <div className={styles.container} ref={ref}>
      <div className={styles.control}>
        <input
          className={`${styles.input} ${value ? styles.hasValue : ""}`}
          value={query}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          spellCheck={false}
        />
        <label className={`${styles.label} ${isActive ? styles.labelActive : ""}`}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
        {(query || value) && (
          <button
            type="button"
            className={styles.clear}
            aria-label={t("common.clear")}
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className={styles.dropdown} role="listbox">
          {loading ? (
            <div className={styles.note}>{t("common.searching")}</div>
          ) : results.length === 0 ? (
            <div className={styles.note}>
              {searched ? t("common.noMatches") : t("common.searching")}
            </div>
          ) : (
            results.map((p, i) => (
              <div
                key={pid(p) || i}
                className={`${styles.option} ${pid(p) === value ? styles.optionSelected : ""}`}
                role="option"
                aria-selected={pid(p) === value}
                onClick={() => choose(p)}
              >
                {optLabel(p)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default PartySearchSelect;
