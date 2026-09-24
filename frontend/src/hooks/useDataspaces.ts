import { useEffect, useState } from "react";
import API from "api/client";

/** One agreement or role a dataspace or framework defines. */
export interface CatalogueEntry {
  id: string;
  title: string;
  /** For a role: the agreement ids it requires. */
  agreements?: string[];
}

/** A dataspace as registered in the Participant Registry. */
export interface Dataspace {
  id: string;
  title: string;
  /** The agreements this dataspace defines (agreementType vocabulary). */
  agreements?: CatalogueEntry[];
  /** The roles this dataspace defines (roleId vocabulary). */
  roles?: CatalogueEntry[];
}

/** Normalise a registry catalogue list ({id, title, agreements?}[]) defensively. */
export const parseCatalogue = (raw: unknown): CatalogueEntry[] =>
  Array.isArray(raw)
    ? raw
        .map((entry: any) => ({
          id: String(entry?.id ?? "").trim(),
          title: String(entry?.title ?? "").trim(),
          ...(Array.isArray(entry?.agreements)
            ? {
                agreements: entry.agreements
                  .filter((a: unknown): a is string => typeof a === "string")
                  .map((a: string) => a.trim())
                  .filter(Boolean),
              }
            : {}),
        }))
        .filter((entry: CatalogueEntry) => entry.id !== "")
    : [];

/** A ready-made option for a <select> / <FormSelect>. */
export interface DataspaceOption {
  value: string;
  label: string;
}

// Label a dataspace the same way on every screen: the human title leads, the id
// stays visible in brackets because the id is what gets stored on the claim.
export const dataspaceLabel = (ds: Dataspace): string =>
  ds.title ? `${ds.title} (${ds.id})` : ds.id;

/**
 * Loads the dataspaces registered in the Participant Registry once per mount, so
 * every dataspace field can offer the registered list instead of asking for a
 * free-text id. Shared by the claim forms (add/edit/submit) so the option set and
 * its labelling are identical everywhere.
 *
 * The list is a convenience, never a gate: an unreachable registry or an empty
 * response leaves `dataspaces` empty and `available` false, which lets callers
 * fall back to manual entry rather than blocking the form.
 *
 * @param enabled pass false to skip the request entirely (e.g. a form that has
 *                no dataspace field on the currently selected claim type).
 */
export const useDataspaces = (enabled = true) => {
  const [dataspaces, setDataspaces] = useState<Dataspace[]>([]);
  // Whether the request has come back (either way); `loading` derives from it so
  // the effect never has to set state synchronously.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    new API()
      .fetchDataspaces()
      .then((res) => {
        if (!mounted) return;
        const rows = Array.isArray(res?.data?.dataspaces) ? res.data.dataspaces : [];
        setDataspaces(
          rows
            .map((d: any) => ({
              id: String(d?.id ?? "").trim(),
              title: String(d?.title ?? "").trim(),
              agreements: parseCatalogue(d?.agreements),
              roles: parseCatalogue(d?.roles),
            }))
            .filter((d: Dataspace) => d.id !== "")
        );
      })
      .catch(() => {
        // Selector-only data: keep the list empty so callers degrade to free text.
        if (mounted) setDataspaces([]);
      })
      .finally(() => {
        if (mounted) setSettled(true);
      });
    return () => {
      mounted = false;
    };
  }, [enabled]);

  const loading = enabled && !settled;

  const options: DataspaceOption[] = dataspaces.map((ds) => ({
    value: ds.id,
    label: dataspaceLabel(ds),
  }));

  /**
   * The options plus `current` when the registry does not list it, so a value
   * stored earlier (or entered before the list loaded) is still shown by the
   * select instead of being silently dropped.
   */
  const optionsWith = (current: string): DataspaceOption[] =>
    current && !dataspaces.some((ds) => ds.id === current)
      ? [...options, { value: current, label: current }]
      : options;

  /** Display label for a stored dataspace id; falls back to the raw id. */
  const labelFor = (id: string): string => {
    const ds = dataspaces.find((d) => d.id === id);
    return ds ? dataspaceLabel(ds) : id;
  };

  /** Registered title of a dataspace id, or "" when the registry has no match. */
  const titleFor = (id: string): string =>
    dataspaces.find((ds) => ds.id === id)?.title ?? "";

  /** The agreements a dataspace defines; empty when unknown or none registered. */
  const agreementsFor = (id: string): CatalogueEntry[] =>
    dataspaces.find((ds) => ds.id === id)?.agreements ?? [];

  /** The roles a dataspace defines; empty when unknown or none registered. */
  const rolesFor = (id: string): CatalogueEntry[] =>
    dataspaces.find((ds) => ds.id === id)?.roles ?? [];

  return {
    dataspaces,
    options,
    optionsWith,
    labelFor,
    titleFor,
    agreementsFor,
    rolesFor,
    loading,
    available: dataspaces.length > 0,
  };
};
