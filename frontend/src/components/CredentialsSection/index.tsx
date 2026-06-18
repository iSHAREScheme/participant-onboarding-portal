import React, { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLanguage } from "../../context/LanguageContext";
import { Skeleton } from "components";
import API from "api/client";
import styles from "styles/components/Credentials.module.css";

// One credential offer as returned by the issuer's poll contract (relayed by the
// portal). Results without a credential_offer_uri (e.g. action="revoked") are not
// rendered.
interface OfferResult {
  credential_type: string;
  action?: string;
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

// Poll cadence while the issuer is still preparing credentials.
const POLL_MS = 4000;
const MAX_POLLS = 12;

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

// The party's credential wallet hand-off. The portal never signs: an external
// iSHARE VC issuer builds + signs the credentials (driven by a PR webhook on
// admission) and exposes OID4VCI credential-offer URIs, which this section polls
// for and renders as QR codes / wallet deep links. While the issuer is still
// reconciling (pending/processing) it auto-polls; failures surface a retry.
const CredentialsSection: React.FC = () => {
  const { t } = useLanguage();
  const [data, setData] = useState<OffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "refresh" | "retry" | "check">("");
  const [copied, setCopied] = useState<string>("");
  const pollsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Poll while the issuer is still working, backing off after MAX_POLLS so the
  // page doesn't hammer the issuer indefinitely (the user can re-check manually).
  const poll = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pollsRef.current = 0;
    const loop = async () => {
      const d = await fetchOffers();
      const st = d?.status;
      if ((st === "pending" || st === "processing") && pollsRef.current < MAX_POLLS) {
        pollsRef.current += 1;
        timerRef.current = setTimeout(loop, POLL_MS);
      }
    };
    await loop();
  }, [fetchOffers]);

  useEffect(() => {
    aliveRef.current = true;
    poll();
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  const doRefresh = async () => {
    setBusy("refresh");
    try {
      await new API().refreshMyCredentialOffers();
    } catch {
      /* surfaced by the subsequent poll */
    }
    await poll();
    if (aliveRef.current) setBusy("");
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

  const status = data?.status || "none";
  const offers = (data?.results || []).filter((r) => r.credential_offer_uri);

  const renderActions = (extra?: React.ReactNode) => (
    <div className={styles.sectionActions}>
      <button className={styles.secondaryBtn} onClick={doCheck} disabled={busy !== ""}>
        {busy === "check" ? t("party.credentials.checking") : t("party.credentials.checkAgain")}
      </button>
      {extra}
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
        {renderActions()}
      </>
    );
  } else if (status === "failed") {
    body = (
      <>
        <div className={styles.error}>
          <strong>{t("party.credentials.failed.title")}</strong>
          <div>{data?.error || t("party.credentials.failed.message")}</div>
        </div>
        {renderActions(
          <button className={styles.primaryBtn} onClick={doRetry} disabled={busy !== ""}>
            {busy === "retry" ? t("party.credentials.retrying") : t("party.credentials.retry")}
          </button>
        )}
      </>
    );
  } else if (status === "pending" || status === "processing") {
    body = (
      <>
        <div className={styles.note}>
          <strong>{t("party.credentials.preparing.title")}</strong>
          <div>{t("party.credentials.preparing.message")}</div>
        </div>
        {renderActions()}
      </>
    );
  } else if (offers.length === 0) {
    body = (
      <>
        <div className={styles.note}>{t("party.credentials.empty")}</div>
        {renderActions(
          <button className={styles.secondaryBtn} onClick={doRefresh} disabled={busy !== ""}>
            {busy === "refresh" ? t("party.credentials.refreshing") : t("party.credentials.refresh")}
          </button>
        )}
      </>
    );
  } else {
    body = (
      <>
        <div className={styles.grid}>
          {offers.map((o, i) => {
            const expired = isExpired(o.offer_expires_at);
            return (
              <div className={styles.offerCard} key={`${o.credential_type}-${i}`}>
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
          })}
        </div>
        {renderActions(
          <button className={styles.secondaryBtn} onClick={doRefresh} disabled={busy !== ""}>
            {busy === "refresh" ? t("party.credentials.refreshing") : t("party.credentials.refresh")}
          </button>
        )}
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
