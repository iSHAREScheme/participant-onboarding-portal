import React, { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLanguage } from "../../context/LanguageContext";
import { Skeleton } from "components";
import API from "api/client";
import styles from "styles/components/Credentials.module.css";

// One credential offer/result as returned by the issuer's poll contract (relayed by
// the portal). Results with a credential_offer_uri are renderable as a wallet offer;
// results without one (action "unchanged") mean the credential is already issued.
interface OfferResult {
  credential_type: string;
  subject_key?: string;
  action?: string; // issued | reissued | unchanged | revoked
  credential_offer_uri?: string;
  offer_expires_at?: string;
}
interface OffersResponse {
  issuerConfigured: boolean;
  // pending | processing | ready | failed | unavailable | none | (proposal status)
  status: string;
  results: OfferResult[];
  generated_at?: string;
  error?: string;
}

// The credential types the issuer can build from registry claims (it exposes no
// "list eligible types" endpoint, so the portal presents this fixed catalogue and
// the user requests each; the issuer issues only the ones buildable from their
// claims). Keep in sync with the issuer's builders.
const CATALOGUE = [
  "PartyCredential",
  "iSHAREParticipantCredential",
  "DataspaceParticipantCredential",
];

// Poll cadence while the issuer is still preparing credentials (after a request).
const POLL_MS = 3000;
const MAX_POLLS = 15;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const fmtWhen = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};
const isExpired = (iso?: string): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
};
const isProcessing = (s?: string): boolean => s === "pending" || s === "processing";

// The party's credential wallet hand-off. The portal never signs: an external
// iSHARE VC issuer builds + signs the credentials on demand and exposes OID4VCI
// credential-offer URIs (a pre-authorized pull — the holder's wallet app claims the
// credential from the offer; nothing is "connected" to the party). Issuance is
// portal-driven: the user requests each credential they're entitled to; this section
// then polls for the offer and renders it as a QR code / wallet deep link.
const CredentialsSection: React.FC = () => {
  const { t } = useLanguage();
  const [data, setData] = useState<OffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // "" | check | retry | req:<type> | link:<type>
  const [busy, setBusy] = useState<string>("");
  const [copied, setCopied] = useState<string>("");
  // Types requested this session — lets us show "not available" only after a request
  // has settled with no offer (the type wasn't buildable from the party's claims).
  const [requested, setRequested] = useState<Set<string>>(new Set());
  // Issued types we tried to mint a wallet link for that produced none — surfaces an
  // honest note instead of a button that appears to do nothing.
  const [noLink, setNoLink] = useState<Set<string>>(new Set());
  const aliveRef = useRef(true);

  const fetchOffers = useCallback(async (): Promise<OffersResponse | null> => {
    try {
      const res = await new API().getMyCredentialOffers();
      const d: OffersResponse = res?.data || null;
      if (aliveRef.current) setData(d);
      return d;
    } catch {
      if (aliveRef.current) setData({ issuerConfigured: true, status: "unavailable", results: [] });
      return null;
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  // Poll until the issuer job settles (no longer pending/processing) or we hit the
  // cap. Fully awaited — so a caller's "busy" state persists for the whole job
  // instead of clearing after the first fetch (which briefly flashed wrong states).
  const poll = useCallback(async (): Promise<OffersResponse | null> => {
    let d = await fetchOffers();
    let n = 0;
    while (aliveRef.current && isProcessing(d?.status) && n < MAX_POLLS) {
      n += 1;
      await sleep(POLL_MS);
      if (!aliveRef.current) break;
      d = await fetchOffers();
    }
    return d;
  }, [fetchOffers]);

  useEffect(() => {
    aliveRef.current = true;
    // Defer to a microtask so the loaders' setState stays out of the synchronous
    // effect body (react-hooks/set-state-in-effect), matching the other pages.
    queueMicrotask(() => {
      poll();
    });
    return () => {
      aliveRef.current = false;
    };
  }, [poll]);

  // Request on-demand issuance of one credential type, then poll for the offer.
  const requestType = async (type: string) => {
    setBusy(`req:${type}`);
    setRequested((s) => new Set(s).add(type));
    setNoLink((s) => {
      const n = new Set(s);
      n.delete(type);
      return n;
    });
    try {
      await new API().requestMyCredentials([type]);
    } catch {
      /* surfaced by the subsequent poll / the "not available" state */
    }
    await poll();
    if (aliveRef.current) setBusy("");
  };

  // Mint a fresh wallet offer (QR) for an already-issued credential. If the issuer
  // returns no offer for it, remember that so the card shows an honest note.
  const getWalletLink = async (type: string) => {
    setBusy(`link:${type}`);
    try {
      await new API().refreshMyCredentialOffers();
    } catch {
      /* surfaced below */
    }
    const d = await poll();
    if (aliveRef.current) {
      const got = (d?.results || []).some(
        (r) => r.credential_type === type && r.credential_offer_uri
      );
      if (!got) setNoLink((s) => new Set(s).add(type));
      setBusy("");
    }
  };

  const doRetry = async () => {
    setBusy("retry");
    try {
      await new API().reprocessMyCredentials();
    } catch {
      /* surfaced by the subsequent poll */
    }
    await poll();
    if (aliveRef.current) setBusy("");
  };

  const doCheck = async () => {
    setBusy("check");
    await poll();
    if (aliveRef.current) setBusy("");
  };

  const copy = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(uri);
      setTimeout(() => aliveRef.current && setCopied(""), 1500);
    } catch {
      /* clipboard blocked — the QR is still scannable */
    }
  };

  // Localised credential-type label, falling back to a light de-camel-case so the
  // issuer can emit new types without an i18n entry.
  const typeLabel = (type: string): string => {
    const key = `party.credentials.types.${type}`;
    const label = t(key);
    if (label !== key) return label;
    return type.replace(/Credential$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || type;
  };
  const typeDescription = (type: string): string => {
    const key = `party.credentials.typeDescriptions.${type}`;
    const label = t(key);
    return label === key ? "" : label;
  };

  const status = data?.status || "none";
  const settled = !isProcessing(status);
  const results = data?.results || [];

  // One issued offer card (QR + wallet hand-off).
  const renderOffer = (o: OfferResult, key: string): React.ReactNode => {
    const expired = isExpired(o.offer_expires_at);
    return (
      <div className={styles.offerCard} key={key}>
        <div className={styles.cardHead}>
          <span className={styles.badge}>{t("party.credentials.vcLabel")}</span>
        </div>
        <h3 className={styles.cardTitle}>{typeLabel(o.credential_type)}</h3>
        <div className={`${styles.qrWrap} ${expired ? styles.qrExpired : ""}`}>
          <QRCodeSVG value={o.credential_offer_uri as string} size={148} includeMargin />
        </div>
        <p className={styles.scanHint}>{t("party.credentials.scanHint")}</p>
        <div className={styles.actions}>
          <a className={styles.primaryBtn} href={o.credential_offer_uri}>
            {t("party.credentials.addToWallet")}
          </a>
          <button
            className={styles.secondaryBtn}
            onClick={() => copy(o.credential_offer_uri as string)}
          >
            {copied === o.credential_offer_uri
              ? t("party.credentials.copied")
              : t("party.credentials.copyOffer")}
          </button>
        </div>
        {o.offer_expires_at && (
          <p className={expired ? styles.expiredNote : styles.expiry}>
            {expired
              ? t("party.credentials.expired")
              : t("party.credentials.expires", { when: fmtWhen(o.offer_expires_at) })}
          </p>
        )}
      </div>
    );
  };

  // A catalogue card for a type with no current offer: loading, already-issued
  // (mint a wallet link), requestable, or not available for this party.
  const renderTypeCard = (type: string): React.ReactNode => {
    const requesting = busy === `req:${type}`;
    const gettingLink = busy === `link:${type}`;
    const issued = results.some(
      (r) => r.credential_type === type && r.action && r.action !== "revoked"
    );
    const desc = typeDescription(type);

    let inner: React.ReactNode;
    if (requesting) {
      // Loading state while the async issuance job runs.
      inner = (
        <>
          <Skeleton width={140} height={140} radius={8} style={{ margin: "4px auto 12px" }} />
          <p className={styles.scanHint}>{t("party.credentials.requesting")}</p>
        </>
      );
    } else if (issued) {
      inner = (
        <>
          <p className={styles.scanHint}>{t("party.credentials.issued")}</p>
          {noLink.has(type) ? (
            <p className={styles.expiredNote}>{t("party.credentials.noWalletLink")}</p>
          ) : (
            <div className={styles.actions}>
              <button className={styles.secondaryBtn} onClick={() => getWalletLink(type)} disabled={busy !== ""}>
                {gettingLink ? t("party.credentials.gettingLink") : t("party.credentials.getWalletLink")}
              </button>
            </div>
          )}
        </>
      );
    } else if (settled && requested.has(type)) {
      inner = <p className={styles.expiredNote}>{t("party.credentials.notAvailable")}</p>;
    } else {
      inner = (
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={() => requestType(type)} disabled={busy !== ""}>
            {t("party.credentials.request")}
          </button>
        </div>
      );
    }

    return (
      <div className={styles.offerCard} key={`cat-${type}`}>
        <div className={styles.cardHead}>
          <span className={styles.badge}>{t("party.credentials.vcLabel")}</span>
        </div>
        <h3 className={styles.cardTitle}>{typeLabel(type)}</h3>
        {desc && <p className={styles.scanHint}>{desc}</p>}
        {inner}
      </div>
    );
  };

  // Each catalogue type renders either its issued offer(s) (QR) or a state card.
  const renderCatalogue = (): React.ReactNode => (
    <div className={styles.grid}>
      {CATALOGUE.flatMap((type) => {
        const requesting = busy === `req:${type}`;
        const offers = results.filter(
          (r) => r.credential_type === type && r.credential_offer_uri
        );
        if (!requesting && offers.length > 0) {
          return offers.map((o, i) => renderOffer(o, `${type}-${o.subject_key || ""}-${i}`));
        }
        return [renderTypeCard(type)];
      })}
    </div>
  );

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div className={styles.grid}>
        {[0, 1].map((i) => (
          <div className={styles.offerCard} key={i}>
            <Skeleton width="55%" height={14} radius={6} style={{ marginBottom: 12 }} />
            <Skeleton width={140} height={140} radius={8} style={{ marginBottom: 12 }} />
            <Skeleton width="80%" height={12} radius={6} />
          </div>
        ))}
      </div>
    );
  } else if (!data?.issuerConfigured) {
    body = <div className={styles.note}>{t("party.credentials.notConfigured")}</div>;
  } else if (status === "unavailable") {
    body = (
      <>
        <div className={styles.error}>{t("party.credentials.unavailable")}</div>
        <div className={styles.sectionActions}>
          <button className={styles.secondaryBtn} onClick={doCheck} disabled={busy !== ""}>
            {busy === "check" ? t("party.credentials.checking") : t("party.credentials.checkAgain")}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {status === "failed" && (
          <div className={styles.error}>
            <strong>{t("party.credentials.failed.title")}</strong>
            <div>{data?.error || t("party.credentials.failed.message")}</div>
            <div className={styles.actions}>
              <button className={styles.primaryBtn} onClick={doRetry} disabled={busy !== ""}>
                {busy === "retry" ? t("party.credentials.retrying") : t("party.credentials.retry")}
              </button>
            </div>
          </div>
        )}
        <p className={styles.requestHint}>{t("party.credentials.requestSectionHint")}</p>
        {renderCatalogue()}
        <div className={styles.sectionActions}>
          <button className={styles.secondaryBtn} onClick={doCheck} disabled={busy !== ""}>
            {busy === "check" ? t("party.credentials.checking") : t("party.credentials.checkAgain")}
          </button>
        </div>
      </>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t("party.credentials.title")}</h2>
      </div>
      <p className={styles.description}>{t("party.credentials.description")}</p>
      {body}
    </section>
  );
};

export default CredentialsSection;
