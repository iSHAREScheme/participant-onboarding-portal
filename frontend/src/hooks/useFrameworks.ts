import { useEffect, useState } from "react";
import API from "api/client";
import { parseCatalogue, type CatalogueEntry } from "./useDataspaces";

/** A framework as published by the Participant Registry's /frameworks. */
export interface Framework {
  id: string;
  title: string;
  agreements: CatalogueEntry[];
  roles: CatalogueEntry[];
}

/**
 * Loads the frameworks the Participant Registry publishes once per mount, so a
 * frameworkAgreement claim can pick its agreementType from the framework's own
 * agreement catalogue (Terms of Use, Accession Agreement, ...) instead of
 * asking for free text. Like useDataspaces this is a convenience, never a
 * gate: when the list cannot be loaded the caller degrades to manual entry.
 */
export const useFrameworks = (enabled = true) => {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    new API()
      .fetchFrameworks({ page: 1, pageSize: 100 })
      .then((res) => {
        if (!mounted) return;
        const rows = Array.isArray(res?.data?.frameworks) ? res.data.frameworks : [];
        setFrameworks(
          rows
            .map((row: any) => ({
              id: String(row?.id ?? "").trim(),
              title: String(row?.title ?? "").trim(),
              // The BFF flattens the catalogue onto the row; older builds only
              // carried it inside `raw`.
              agreements: parseCatalogue(row?.agreements ?? row?.raw?.agreements),
              roles: parseCatalogue(row?.roles ?? row?.raw?.roles),
            }))
            .filter((fw: Framework) => fw.id !== "")
        );
      })
      .catch(() => {
        if (mounted) setFrameworks([]);
      })
      .finally(() => {
        if (mounted) setSettled(true);
      });
    return () => {
      mounted = false;
    };
  }, [enabled]);

  /** The agreements a framework defines; empty when unknown or none published. */
  const agreementsFor = (frameworkId: string): CatalogueEntry[] =>
    frameworks.find((fw) => fw.id === frameworkId)?.agreements ?? [];

  return {
    frameworks,
    agreementsFor,
    loading: enabled && !settled,
    available: frameworks.length > 0,
  };
};
