import { NextPage } from "next";
import { useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import ParticipantEditForm from "components/ParticipantEditForm";
import { Skeleton } from "components";
import API from "api/client";
import { cacheParticipants, getCachedParticipant } from "util/participantCache";
import { useLanguage } from "../../context/LanguageContext";
import { getSatelliteVersion, usesClaimModel } from "config/publicEnv";
import styles from "styles/ParticipantDetail.module.css";

// The satellite /parties payload is party-shaped on every schema version we've
// seen (party_id/adherence/roles/agreements/authregistery/certificates/
// additional_info), so the detail view consumes one such object and presents it
// either as classic party sections (2.x) or as iSHARE v3 claim cards (3.0).
type Party = Record<string, any>;

const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);
const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const val = (s: string): ReactNode => s || "—";

// Turn a camelCase claim type into a readable label, used as a fallback when
// there's no i18n entry (the satellite can emit claim types beyond our known set,
// e.g. dataspaceAgreement) so the raw translation key never shows.
const humanize = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

// Merge a freshly fetched party over the cached one, taking incoming values only
// where they actually carry data. The satellite's single-party (?eori=) lookup
// can return a sparser object than the list page provided — omitting top-level
// fields like id/name (and even claims, which would flip the view back to v2) —
// so this stops the background refresh from blanking out details already on screen.
const mergeParty = (prev: any, next: any): any => {
  if (!prev) return next;
  if (!next || typeof next !== "object") return prev;
  const out: any = { ...prev };
  for (const key of Object.keys(next)) {
    const v = (next as any)[key];
    const empty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
    if (!empty) out[key] = v;
  }
  return out;
};
const truncate = (s: string, n = 64): string =>
  s.length > n ? s.slice(0, n) + "…" : s;

const fmtDate = (v: any): string => {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
};

const renderLink = (url: string): ReactNode => {
  const u = str(url);
  if (!u) return "—";
  const href = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={styles.link}>
      {u}
    </a>
  );
};

const isActive = (s: string): boolean => {
  const l = s.toLowerCase();
  return l === "active" || l === "accepted";
};

const Pill = ({ value }: { value: string }): JSX.Element =>
  value ? (
    <span
      className={`${styles.pill} ${isActive(value) ? styles.active : styles.inactive}`}
    >
      {value}
    </span>
  ) : (
    <>—</>
  );

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={styles.row}>
    <span className={styles.rowLabel}>{label}</span>
    <span className={styles.rowValue}>{children}</span>
  </div>
);

interface ClaimView {
  type: string; // key under submit.claimTypes.*
  status?: string;
  fields: { label: string; value: ReactNode; raw?: string }[];
}

// Humanise a claim field key for display ("capabilityUrl" → "Capability Url").
const claimFieldLabel = (k: string): string =>
  k
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Map a real iSHARE v3 claim object (as returned by a v3 satellite) to a display
// card: scalar fields shown as-is (dates formatted, URLs linked), nested
// additionalInfo flattened in. type/id/status are rendered by the card chrome.
const claimViewFromReal = (c: any): ClaimView => {
  const skip = new Set(["type", "id", "status", "additionalInfo"]);
  const fields: { label: string; value: ReactNode; raw?: string }[] = [];
  const push = (k: string, v: any) => {
    if (v === null || v === undefined || typeof v === "object") return;
    const s = str(v);
    // Long values (e.g. an x509 x5c chain) are truncated in the card; the full
    // value is kept in `raw` and shown in the claim modal via "View more".
    const value =
      k === "startDate" || k === "endDate"
        ? fmtDate(v)
        : /url|website/i.test(k)
        ? renderLink(s)
        : s.length > 80
        ? <code className={styles.mono}>{truncate(s, 48)}</code>
        : val(s);
    fields.push({ label: claimFieldLabel(k), value, raw: s });
  };
  Object.entries(c || {}).forEach(([k, v]) => {
    if (!skip.has(k)) push(k, v);
  });
  if (c?.additionalInfo && typeof c.additionalInfo === "object") {
    Object.entries(c.additionalInfo).forEach(([k, v]) => push(k, v));
  }
  return { type: str(c?.type), status: str(c?.status), fields };
};

const ParticipantDetail: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const rawId = router.query.id;
  const id = typeof rawId === "string" ? rawId : "";

  const [party, setParty] = useState<Party | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [editing, setEditing] = useState(false);
  // Claim whose full data is shown in the modal (e.g. a long x509 certificate).
  const [openClaim, setOpenClaim] = useState<ClaimView | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    // Render instantly from the list's cached party if we have it; the satellite
    // single-party (?eori=) lookup costs ~2s, so we still refresh in the background
    // but the user doesn't wait. A deep-link / cache miss fetches with the loading
    // state as before.
    const cached = getCachedParticipant(id);
    if (cached) {
      setParty(cached);
      setErrorKey(null);
      setIsLoading(false);
    } else {
      setIsLoading(true);
      setErrorKey(null);
    }
    try {
      const api = new API();
      const res = await api.fetchParticipantDetail(id);
      const data = res?.data?.data ?? null;
      if (data && typeof data === "object") {
        // Merge over the cached party so a sparse refresh never blanks fields the
        // list already supplied (id/name/claims/…); prefer fetched values only
        // where they carry data.
        const merged = mergeParty(cached, data);
        setParty(merged);
        cacheParticipants([merged]); // keep the cache fresh for next time
      } else if (!cached) {
        setParty(null);
        setErrorKey("participants.detail.notFound");
      }
    } catch (e: any) {
      if (!cached) {
        setParty(null);
        setErrorKey(
          e?.response?.status === 404
            ? "participants.detail.notFound"
            : "participants.detail.error"
        );
      }
      // On a background-refresh failure, keep the cached party on screen.
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // AdminRoute flips this once the admin is authorized; fetching is driven by
  // the effect below (which also waits for the dynamic route id to hydrate).
  const onAuthorized = useCallback(() => setAuthorized(true), []);

  // load() optimistically sets state synchronously (instant cache render / loading
  // flag) before it awaits, so scheduling it in a microtask keeps that out of the
  // effect body (react-hooks/set-state-in-effect) while still running before paint.
  useEffect(() => {
    if (authorized && id) queueMicrotask(load);
  }, [authorized, id, load]);

  // Adhere to the schema the satellite actually returned for THIS party: a real
  // v3 party carries a `claims` array. Fall back to the configured version so a
  // party-shaped payload still renders.
  const hasClaims = Array.isArray(party?.claims) && party.claims.length > 0;
  const claimModel = hasClaims || usesClaimModel(getSatelliteVersion());
  const version = hasClaims ? str(party?.schemaVersion) || "3.0" : getSatelliteVersion();
  // The satellite can PROJECT a party stored under an older schema into a newer
  // display model (e.g. an unmigrated v2 party surfaced as v3 claims). It signals
  // this with `displaySchemaVersion`; show it next to the stored schema when the
  // two differ, so the reader knows the claims shown are a projection rather than
  // the party's stored representation.
  const displayVersion = str(party?.displaySchemaVersion);
  const normalizeVer = (v: string) => v.trim().toLowerCase().replace(/^v/, "");
  const isProjected =
    !!displayVersion && normalizeVer(displayVersion) !== normalizeVer(version);
  // Editing is available from 2.2 onward (PUT) and on 3.0 (PATCH).
  const canEdit = version.startsWith("3") || version.startsWith("2.2");
  const partyName = party ? str(party.party_name ?? party.name) : "";
  const partyId = party ? str(party.party_id ?? party.id) : "";
  // EORI/DID aliases (v3 `alsoKnownAs`; tolerate snake_case / aka). Drop blanks
  // and the primary id so it isn't repeated as its own alias.
  const aliases: string[] = asArray(
    party?.alsoKnownAs ?? party?.also_known_as ?? party?.aka
  )
    .map(str)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((a) => a !== partyId);
  // Registrar id: v3 keeps it per-claim, so fall back to the first claim's value.
  const claimRegistrarId = Array.isArray(party?.claims)
    ? str((party.claims.find((c: any) => str(c?.registrarId)) || {}).registrarId)
    : "";
  const registrarId = party ? str(party.registrar_id) || claimRegistrarId : "";
  const capabilityUrl = party ? str(party.capability_url) : "";

  const f = (k: string) => t(`participants.detail.fields.${k}`);
  const sec = (k: string) => t(`participants.detail.sections.${k}`);
  // Translate a claim type, falling back to a humanised label for any type we
  // don't have an i18n entry for (t returns the key verbatim when it's missing).
  const claimTypeLabel = (type: string): string => {
    const key = `submit.claimTypes.${type}`;
    const label = t(key);
    return label === key ? humanize(type) : label;
  };

  // --- 3.0 claim cards. A real v3 party carries a `claims` array; older or
  //     party-shaped payloads are reorganised from the flat fields below. ----
  const deriveClaims = (p: Party): ClaimView[] => {
    if (Array.isArray(p.claims) && p.claims.length) {
      return p.claims.map(claimViewFromReal);
    }
    const out: ClaimView[] = [];
    const adherence = p.adherence ?? {};
    const ai = p.additional_info ?? {};

    out.push({
      type: "frameworkCompliance",
      status: str(adherence.status),
      fields: [
        { label: f("framework"), value: "iSHARE" },
        { label: f("capabilityUrl"), value: renderLink(str(p.capability_url)) },
        { label: f("startDate"), value: fmtDate(adherence.start_date) },
        { label: f("endDate"), value: fmtDate(adherence.end_date) },
        { label: f("description"), value: val(str(ai.description)) },
        { label: f("website"), value: renderLink(str(ai.website)) },
        { label: f("companyEmail"), value: val(str(ai.company_email)) },
        {
          label: f("publiclyPublishable"),
          value: val(str(ai.publicly_publishable)),
        },
      ],
    });

    asArray(p.roles).forEach((r) => {
      out.push({
        type: "frameworkRole",
        fields: [
          { label: f("role"), value: val(str(r.role)) },
          { label: f("loa"), value: val(str(r.loa)) },
          { label: f("legalAdherence"), value: val(str(r.legal_adherence)) },
          {
            label: f("compliancyVerified"),
            value: val(str(r.complaiancy_verified ?? r.compliancy_verified)),
          },
          { label: f("startDate"), value: fmtDate(r.start_date) },
          { label: f("endDate"), value: fmtDate(r.end_date) },
        ],
      });
    });

    asArray(p.agreements).forEach((a) => {
      out.push({
        type: "frameworkAgreement",
        status: str(a.status),
        fields: [
          { label: f("framework"), value: val(str(a.framework)) },
          { label: f("agreementType"), value: val(str(a.type)) },
          { label: f("title"), value: val(str(a.title)) },
          {
            label: f("hash"),
            value: (
              <code className={styles.mono} title={str(a.hash_file)}>
                {truncate(str(a.hash_file))}
              </code>
            ),
          },
          { label: f("signDate"), value: fmtDate(a.sign_date) },
          { label: f("expiryDate"), value: fmtDate(a.expiry_date) },
        ],
      });
    });

    asArray(p.authregistery ?? p.authregistries).forEach((ar) => {
      out.push({
        type: "authRegistry",
        fields: [
          { label: f("authRegistryName"), value: val(str(ar.authorizationRegistryName)) },
          { label: f("authRegistryId"), value: val(str(ar.authorizationRegistryID)) },
          {
            label: f("authRegistryUrl"),
            value: renderLink(str(ar.authorizationRegistryUrl)),
          },
          { label: f("dataspaceId"), value: val(str(ar.dataspaceID)) },
        ],
      });
    });

    asArray(p.certificates).forEach((cert) => {
      const fields =
        cert && typeof cert === "object"
          ? Object.entries(cert).map(([k, v]) => ({
              label: k,
              value: truncate(str(v)) as ReactNode,
              raw: str(v),
            }))
          : [{ label: f("hash"), value: truncate(str(cert)) as ReactNode, raw: str(cert) }];
      out.push({ type: "x509Certificate", fields });
    });

    return out;
  };

  const renderClaimView = () => {
    if (!party) return null;
    const claims = deriveClaims(party);
    return (
      <>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{sec("claims")}</h2>
          <div className={styles.cards}>
            {claims.map((c, i) => {
              const hasLong = c.fields.some(
                (fld) => (fld.raw || "").length > 80
              );
              return (
                <div className={styles.claimCard} key={i}>
                  <div className={styles.claimHead}>
                    <span className={styles.claimType}>
                      {claimTypeLabel(c.type)}
                    </span>
                    {c.status ? <Pill value={c.status} /> : null}
                  </div>
                  <div className={styles.grid}>
                    {c.fields.map((fld, j) => (
                      <Row key={j} label={fld.label}>
                        {fld.value}
                      </Row>
                    ))}
                  </div>
                  {hasLong && (
                    <button
                      type="button"
                      className={styles.viewMore}
                      onClick={() => setOpenClaim(c)}
                    >
                      {t("participants.detail.viewMore")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  };

  // --- 2.x: classic party sections. -----------------------------------------
  const renderPartyView = () => {
    if (!party) return null;
    const adherence = party.adherence ?? {};
    const ai = party.additional_info ?? {};
    const roles = asArray(party.roles);
    const agreements = asArray(party.agreements);
    const authRegs = asArray(party.authregistery ?? party.authregistries);
    const certs = asArray(party.certificates);

    return (
      <>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{sec("adherence")}</h2>
          <div className={styles.grid}>
            <Row label={f("status")}>
              <Pill value={str(adherence.status)} />
            </Row>
            <Row label={f("startDate")}>{fmtDate(adherence.start_date)}</Row>
            <Row label={f("endDate")}>{fmtDate(adherence.end_date)}</Row>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{sec("roles")}</h2>
          {roles.length ? (
            <div className={styles.cards}>
              {roles.map((r, i) => (
                <div className={styles.card} key={i}>
                  <div className={styles.grid}>
                    <Row label={f("role")}>{val(str(r.role))}</Row>
                    <Row label={f("loa")}>{val(str(r.loa))}</Row>
                    <Row label={f("legalAdherence")}>
                      {val(str(r.legal_adherence))}
                    </Row>
                    <Row label={f("compliancyVerified")}>
                      {val(str(r.complaiancy_verified ?? r.compliancy_verified))}
                    </Row>
                    <Row label={f("startDate")}>{fmtDate(r.start_date)}</Row>
                    <Row label={f("endDate")}>{fmtDate(r.end_date)}</Row>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>{t("participants.detail.empty.roles")}</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{sec("agreements")}</h2>
          {agreements.length ? (
            <div className={styles.cards}>
              {agreements.map((a, i) => (
                <div className={styles.card} key={i}>
                  <div className={styles.grid}>
                    <Row label={f("agreementType")}>{val(str(a.type))}</Row>
                    <Row label={f("title")}>{val(str(a.title))}</Row>
                    <Row label={f("framework")}>{val(str(a.framework))}</Row>
                    <Row label={f("status")}>
                      <Pill value={str(a.status)} />
                    </Row>
                    <Row label={f("signDate")}>{fmtDate(a.sign_date)}</Row>
                    <Row label={f("expiryDate")}>{fmtDate(a.expiry_date)}</Row>
                    <Row label={f("hash")}>
                      <code className={styles.mono} title={str(a.hash_file)}>
                        {truncate(str(a.hash_file))}
                      </code>
                    </Row>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              {t("participants.detail.empty.agreements")}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{sec("authRegistries")}</h2>
          {authRegs.length ? (
            <div className={styles.cards}>
              {authRegs.map((ar, i) => (
                <div className={styles.card} key={i}>
                  <div className={styles.grid}>
                    <Row label={f("authRegistryName")}>
                      {val(str(ar.authorizationRegistryName))}
                    </Row>
                    <Row label={f("authRegistryId")}>
                      {val(str(ar.authorizationRegistryID))}
                    </Row>
                    <Row label={f("authRegistryUrl")}>
                      {renderLink(str(ar.authorizationRegistryUrl))}
                    </Row>
                    <Row label={f("dataspaceId")}>{val(str(ar.dataspaceID))}</Row>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              {t("participants.detail.empty.authRegistries")}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{sec("certificates")}</h2>
          {certs.length ? (
            <div className={styles.cards}>
              {certs.map((cert, i) => (
                <div className={styles.card} key={i}>
                  <div className={styles.grid}>
                    {cert && typeof cert === "object" ? (
                      Object.entries(cert).map(([k, v]) => (
                        <Row key={k} label={k}>
                          <span title={str(v)}>{truncate(str(v))}</span>
                        </Row>
                      ))
                    ) : (
                      <Row label={f("hash")}>{truncate(str(cert))}</Row>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              {t("participants.detail.empty.certificates")}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{sec("additionalInfo")}</h2>
          <div className={styles.grid}>
            <Row label={f("description")}>{val(str(ai.description))}</Row>
            <Row label={f("website")}>{renderLink(str(ai.website))}</Row>
            <Row label={f("companyEmail")}>{val(str(ai.company_email))}</Row>
            <Row label={f("companyPhone")}>{val(str(ai.company_phone))}</Row>
            <Row label={f("publiclyPublishable")}>
              {val(str(ai.publicly_publishable))}
            </Row>
            <Row label={f("tags")}>{val(str(ai.tags))}</Row>
          </div>
        </section>
      </>
    );
  };

  return (
    <AdminRoute fetchData={onAuthorized}>
      <div className={styles.container}>
        <div className={styles.header}>
          <button
            className={styles.back}
            onClick={() => router.push("/participants")}
          >
            ← {t("participants.detail.back")}
          </button>
        </div>

        {isLoading && (
          <div aria-busy="true">
            <div className={styles.titleRow}>
              <div className={styles.titleBlock}>
                <Skeleton width={240} height={26} radius={6} />
                <Skeleton
                  width={300}
                  height={14}
                  radius={6}
                  style={{ marginTop: 8 }}
                />
              </div>
              <Skeleton width={96} height={28} radius={8} />
            </div>
            <div className={styles.body}>
              {Array.from({ length: 2 }).map((_, s) => (
                <section className={styles.section} key={`sk-sec-${s}`}>
                  <Skeleton
                    width={150}
                    height={16}
                    radius={6}
                    style={{ marginBottom: 12 }}
                  />
                  <div className={styles.cards}>
                    {Array.from({ length: 2 }).map((_, c) => (
                      <div className={styles.claimCard} key={`sk-card-${s}-${c}`}>
                        <div className={styles.grid}>
                          {Array.from({ length: 4 }).map((_, r) => (
                            <div className={styles.row} key={`sk-row-${r}`}>
                              <Skeleton width="38%" height={13} />
                              <Skeleton width="52%" height={13} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
        {!isLoading && errorKey && (
          <div className={styles.error}>{t(errorKey)}</div>
        )}

        {!isLoading && !errorKey && party && (
          <>
            <header className={styles.summary}>
              <div className={styles.summaryTop}>
                <div className={styles.titleBlock}>
                  <h1 className={styles.title}>{partyName || partyId || "—"}</h1>
                  {partyId && <code className={styles.idValue}>{partyId}</code>}
                </div>
                <div className={styles.titleActions}>
                  <span className={styles.schema}>
                    {t("participants.detail.schemaLabel")}: {version}
                  </span>
                  {isProjected && (
                    <span
                      className={styles.projection}
                      title={t("participants.detail.projectionHint")}
                    >
                      {t("participants.detail.projectionLabel")}: {displayVersion}
                    </span>
                  )}
                  {canEdit && !editing && (
                    <button
                      className={styles.editBtn}
                      onClick={() => setEditing(true)}
                    >
                      {t("participants.detail.edit.button")}
                    </button>
                  )}
                </div>
              </div>

              {aliases.length > 0 && (
                <div className={styles.akaRow}>
                  <span className={styles.akaLabel}>{f("alsoKnownAs")}</span>
                  <div className={styles.chips}>
                    {aliases.map((a, i) => (
                      <span className={styles.chip} key={i} title={a}>
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(registrarId || capabilityUrl) && (
                <div className={styles.keyFacts}>
                  {registrarId && (
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>{f("registrarId")}</span>
                      <span className={styles.factValue}>{registrarId}</span>
                    </div>
                  )}
                  {capabilityUrl && (
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>
                        {f("capabilityUrl")}
                      </span>
                      <span className={styles.factValue}>
                        {renderLink(capabilityUrl)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </header>

            {editing ? (
              <ParticipantEditForm
                party={party}
                id={partyId}
                onSaved={() => {
                  setEditing(false);
                  load();
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className={styles.body}>
                {claimModel ? renderClaimView() : renderPartyView()}
              </div>
            )}
          </>
        )}
      </div>

      {openClaim && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenClaim(null)}
        >
          <div
            className={styles.modalPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <span className={styles.claimType}>
                {claimTypeLabel(openClaim.type)}
              </span>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setOpenClaim(null)}
                aria-label={t("participants.detail.close")}
              >
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              {openClaim.fields.map((fld, j) => (
                <div className={styles.modalField} key={j}>
                  <span className={styles.modalFieldLabel}>{fld.label}</span>
                  {(fld.raw || "").length > 80 ? (
                    <pre className={styles.modalFieldValueBlock}>{fld.raw}</pre>
                  ) : (
                    <span className={styles.modalFieldValue}>
                      {fld.raw || "—"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminRoute>
  );
};

export default ParticipantDetail;
