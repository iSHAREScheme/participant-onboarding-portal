import { NextPage } from "next";
import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import ProtectedRoute from "components/ProtectedRoute";
import { Skeleton } from "components";
import CredentialsSection from "components/CredentialsSection";
import API from "api/client";
import { useLanguage } from "../context/LanguageContext";
import styles from "styles/ParticipantDetail.module.css";

// Read-only view of the applicant's own registered party. Mirrors the visual
// language of the admin participant-detail page (shares its CSS module) but is a
// simpler, non-editable projection driven by /registry/me/party.
type Party = Record<string, any>;

const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);
const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const val = (s: string): ReactNode => s || "—";
const truncate = (s: string, n = 64): string => (s.length > n ? s.slice(0, n) + "…" : s);
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
const claimFieldLabel = (k: string): string =>
  k
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const humanize = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const Pill = ({ value }: { value: string }) =>
  value ? (
    <span className={`${styles.pill} ${isActive(value) ? styles.active : styles.inactive}`}>
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

const MyParty: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const [party, setParty] = useState<Party | null>(null);
  const [status, setStatus] = useState<string>("");
  const [partyId, setPartyId] = useState<string>("");
  const [partyName, setPartyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      const res = await new API().getMyParty();
      const d = res?.data || {};
      setStatus(str(d.status));
      setPartyId(str(d.partyId));
      setPartyName(str(d.partyName));
      setParty(d.data && typeof d.data === "object" ? d.data : null);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const f = (k: string) => t(`participants.detail.fields.${k}`);
  const sec = (k: string) => t(`participants.detail.sections.${k}`);
  const claimTypeLabel = (type: string): string => {
    const key = `submit.claimTypes.${type}`;
    const label = t(key);
    return label === key ? humanize(type) : label;
  };

  // Aliases / identity surfaced in the summary header.
  const aliases: string[] = asArray(
    party?.alsoKnownAs ?? party?.also_known_as ?? party?.aka
  )
    .map(str)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((a) => a !== str(party?.party_id ?? party?.id));
  const claimRegistrarId = Array.isArray(party?.claims)
    ? str((party.claims.find((c: any) => str(c?.registrarId)) || {}).registrarId)
    : "";
  const registrarId = party ? str(party.registrar_id) || claimRegistrarId : "";
  const capabilityUrl = party ? str(party.capability_url) : "";
  const name = str(party?.party_name ?? party?.name) || partyName;
  const id = str(party?.party_id ?? party?.id) || partyId;
  const hasClaims = Array.isArray(party?.claims) && party.claims.length > 0;

  const renderClaimCards = () => {
    const claims: { type: string; statusVal?: string; fields: { label: string; value: ReactNode }[] }[] = [];
    if (hasClaims) {
      party!.claims.forEach((c: any) => {
        const skip = new Set(["type", "id", "status", "additionalInfo"]);
        const fields: { label: string; value: ReactNode }[] = [];
        const push = (k: string, v: any) => {
          if (v === null || v === undefined || typeof v === "object") return;
          const s = str(v);
          const value =
            k === "startDate" || k === "endDate"
              ? fmtDate(v)
              : /url|website/i.test(k)
              ? renderLink(s)
              : s.length > 80
              ? <code className={styles.mono}>{truncate(s, 48)}</code>
              : val(s);
          fields.push({ label: claimFieldLabel(k), value });
        };
        Object.entries(c || {}).forEach(([k, v]) => {
          if (!skip.has(k)) push(k, v);
        });
        if (c?.additionalInfo && typeof c.additionalInfo === "object") {
          Object.entries(c.additionalInfo).forEach(([k, v]) => push(k, v));
        }
        claims.push({ type: str(c?.type), statusVal: str(c?.status), fields });
      });
    } else {
      const adherence = party?.adherence ?? {};
      const ai = party?.additional_info ?? {};
      claims.push({
        type: "frameworkCompliance",
        statusVal: str(adherence.status),
        fields: [
          { label: f("capabilityUrl"), value: renderLink(str(party?.capability_url)) },
          { label: f("startDate"), value: fmtDate(adherence.start_date) },
          { label: f("endDate"), value: fmtDate(adherence.end_date) },
          { label: f("description"), value: val(str(ai.description)) },
          { label: f("website"), value: renderLink(str(ai.website)) },
          { label: f("companyEmail"), value: val(str(ai.company_email)) },
        ],
      });
      asArray(party?.roles).forEach((r) =>
        claims.push({
          type: "frameworkRole",
          fields: [
            { label: f("role"), value: val(str(r.role)) },
            { label: f("loa"), value: val(str(r.loa)) },
            { label: f("startDate"), value: fmtDate(r.start_date) },
            { label: f("endDate"), value: fmtDate(r.end_date) },
          ],
        })
      );
      asArray(party?.agreements).forEach((a) =>
        claims.push({
          type: "frameworkAgreement",
          statusVal: str(a.status),
          fields: [
            { label: f("agreementType"), value: val(str(a.type)) },
            { label: f("title"), value: val(str(a.title)) },
            { label: f("signDate"), value: fmtDate(a.sign_date) },
            { label: f("expiryDate"), value: fmtDate(a.expiry_date) },
          ],
        })
      );
    }
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{sec("claims")}</h2>
        <div className={styles.cards}>
          {claims.map((c, i) => (
            <div className={styles.claimCard} key={i}>
              <div className={styles.claimHead}>
                <span className={styles.claimType}>{claimTypeLabel(c.type)}</span>
                {c.statusVal ? <Pill value={c.statusVal} /> : null}
              </div>
              <div className={styles.grid}>
                {c.fields.map((fld, j) => (
                  <Row key={j} label={fld.label}>
                    {fld.value}
                  </Row>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  // The "not yet admitted" states keyed off the proposal status.
  const statusKey =
    status === "rejected"
      ? "rejected"
      : status === "none" || status === ""
      ? "none"
      : "processing";

  return (
    <ProtectedRoute fetchData={load}>
      <div className={styles.container}>
        <div className={styles.header}>
          <button className={styles.back} onClick={() => router.push("/")}>
            ← {t("party.back")}
          </button>
        </div>

        {loading ? (
          <div aria-busy="true">
            <div className={styles.titleRow}>
              <Skeleton width={240} height={26} radius={6} />
            </div>
            <div className={styles.body}>
              <section className={styles.section}>
                <Skeleton width={150} height={16} radius={6} style={{ marginBottom: 12 }} />
                <div className={styles.claimCard}>
                  <div className={styles.grid}>
                    {Array.from({ length: 4 }).map((_, r) => (
                      <div className={styles.row} key={r}>
                        <Skeleton width="38%" height={13} />
                        <Skeleton width="52%" height={13} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : errored ? (
          <div className={styles.error}>{t("party.loadError")}</div>
        ) : party ? (
          <div className={styles.body}>
            <div className={styles.welcome}>
              <svg
                className={styles.welcomeIcon}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="12" fill="currentColor" opacity="0.12" />
                <path
                  d="M7 12.5l3.2 3.2L17 9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <h1 className={styles.welcomeTitle}>
                  {t("party.welcome.title", { name: name || id })}
                </h1>
                <p className={styles.welcomeMessage}>{t("party.welcome.message")}</p>
              </div>
            </div>
            <header className={styles.summary}>
              <div className={styles.summaryTop}>
                <div className={styles.titleBlock}>
                  <h1 className={styles.title}>{name || id || "—"}</h1>
                  {id && <code className={styles.idValue}>{id}</code>}
                </div>
                <span className={styles.schema}>{t("party.admitted")}</span>
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
                      <span className={styles.factLabel}>{f("capabilityUrl")}</span>
                      <span className={styles.factValue}>{renderLink(capabilityUrl)}</span>
                    </div>
                  )}
                </div>
              )}
            </header>
            {renderClaimCards()}
            <CredentialsSection />
          </div>
        ) : (
          <div className={styles.body}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t(`party.${statusKey}.title`)}</h2>
              <p className={styles.empty}>{t(`party.${statusKey}.message`)}</p>
              {id && (
                <p className={styles.empty}>
                  {f("partyId")}: <code className={styles.mono}>{id}</code>
                </p>
              )}
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button className={styles.back} onClick={load}>
                  ↻ {t("party.refresh")}
                </button>
                {statusKey === "none" && (
                  <button className={styles.back} onClick={() => router.push("/register")}>
                    {t("party.start")} →
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
};

export default MyParty;
