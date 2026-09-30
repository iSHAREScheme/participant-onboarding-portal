import React, { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import API, {
  type VcSessionStart,
  type VerificationResult,
} from "api/client";
import { useLanguage } from "../../context/LanguageContext";
import styles from "styles/components/VcPresentation.module.css";
import wizard from "styles/Register.module.css";

// Credential-based onboarding, applicant side.
//
// Instead of typing their organisation's details and proving identity by
// uploading a certificate, the applicant presents credentials they already
// hold. The portal verifies them and fills in whatever they proved.
//
// Two routes to the same verifier:
//   - Wallet (cross-device OID4VP): the portal opens a session and renders its
//     request as a QR code; the wallet fetches the request and posts the
//     presentation straight back to the backend, so the browser just polls.
//   - Direct: paste or upload a presentation. No wallet needed, which also
//     makes the feature testable before any wallet is in the picture.
//
// Whatever comes back here is display only. The proposal carries the session
// id, and the backend re-reads the verified values from that session, so a
// tampered browser cannot claim a field was verified when it was not.

const POLL_MS = 2500;

export interface VcPresentationValue {
  sessionId: string;
  result: VerificationResult;
}

interface Props {
  // flowRoute scopes the session to the onboarding flow in use, so per-flow
  // overrides apply to the resulting proposal.
  flowRoute?: string;
  // value is the verification already held by the parent form, if any.
  value?: VcPresentationValue | null;
  onVerified: (value: VcPresentationValue) => void;
  onCleared: () => void;
}

type Mode = "wallet" | "direct";

// Human labels for the onboarding fields a credential can fill.
const FIELD_LABELS: Record<string, string> = {
  "idCheck.partyId": "Party identifier",
  "idCheck.partyName": "Party name",
  "idCheck.companyName": "Organisation",
  "idCheck.kvkNumber": "Chamber of Commerce number",
  "idCheck.certSubjectName": "Certificate subject",
  "idCheck.certX5c": "Certificate (x5c)",
  "idCheck.certX5tS256": "Certificate thumbprint",
  "idCheck.idpAssertion": "Identity provider assertion",
  "location.address": "Address",
  "location.zipCode": "Postal code",
  "location.city": "City",
  "location.country": "Country",
  "location.website": "Website",
  "association.authRegistry": "Authorisation registry",
  "association.authRegistryName": "Authorisation registry name",
  "association.authRegistryUrl": "Authorisation registry URL",
  "association.capabilitiesUrl": "Capabilities URL",
  "account.name": "Contact name",
  "account.email": "Contact email",
  "account.phone": "Contact phone",
};

const fieldLabel = (field: string): string => FIELD_LABELS[field] ?? field;

// Long opaque values (a certificate, an assertion) are shown truncated: the
// applicant only needs to see that they arrived, not read them.
const displayValue = (field: string, value: string): string => {
  const opaque =
    field === "idCheck.certX5c" ||
    field === "idCheck.idpAssertion" ||
    field === "idCheck.certX5tS256";
  if (opaque && value.length > 36) return `${value.slice(0, 33)}…`;
  return value;
};

const VcPresentation: React.FC<Props> = ({ flowRoute, value, onVerified, onCleared }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>("wallet");
  const [session, setSession] = useState<VcSessionStart | null>(null);
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pasted, setPasted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Guards the poll loop against running on after unmount or reset.
  const activeSession = useRef<string | null>(null);
  // The native file input is hidden behind a styled button, like the eIDAS upload.
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    activeSession.current = null;
  }, []);

  const fail = useCallback((err: unknown, fallback: string) => {
    const detail =
      (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
    setError(detail?.message || detail?.error || fallback);
  }, []);

  // poll walks the session until it leaves "pending".
  const poll = useCallback(
    async (sessionId: string) => {
      setPolling(true);
      try {
        while (activeSession.current === sessionId) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          if (activeSession.current !== sessionId) return;

          const { data } = await new API().fetchVcSession(sessionId);
          if (activeSession.current !== sessionId) return;

          if (data.status === "verified" && data.result) {
            activeSession.current = null;
            setSession(null);
            onVerified({ sessionId, result: data.result });
            return;
          }
          if (data.status === "failed" || data.status === "expired") {
            activeSession.current = null;
            setSession(null);
            setError(data.error || t("register.idCheck.vc.expired"));
            return;
          }
        }
      } catch (err) {
        if (activeSession.current === sessionId) {
          activeSession.current = null;
          fail(err, t("register.idCheck.vc.pollFailed"));
        }
      } finally {
        setPolling(false);
      }
    },
    [fail, onVerified, t]
  );

  const start = useCallback(async () => {
    setError("");
    setStarting(true);
    try {
      const { data } = await new API().startVcSession(flowRoute);
      setSession(data);
      activeSession.current = data.sessionId;
      void poll(data.sessionId);
    } catch (err) {
      fail(err, t("register.idCheck.vc.startFailed"));
    } finally {
      setStarting(false);
    }
  }, [fail, flowRoute, poll, t]);

  const submitDirect = useCallback(async () => {
    const presentation = pasted.trim();
    if (!presentation) return;
    setError("");
    setSubmitting(true);
    try {
      const { data } = await new API().verifyVcPresentation(presentation, flowRoute);
      if (data.result) {
        setPasted("");
        onVerified({ sessionId: data.sessionId, result: data.result });
      }
    } catch (err) {
      fail(err, t("register.idCheck.vc.verifyFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [fail, flowRoute, onVerified, pasted, t]);

  const onFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => setPasted(text))
      .catch(() => setError(t("register.idCheck.vc.readFailed")));
    // Allow re-selecting the same file after a failed attempt.
    event.target.value = "";
  }, [t]);

  const reset = useCallback(() => {
    activeSession.current = null;
    setSession(null);
    setError("");
    onCleared();
  }, [onCleared]);

  // ---- Verified state ------------------------------------------------------
  if (value) {
    const { result } = value;
    const filled = Object.keys(result.fields ?? {}).sort((a, b) => a.localeCompare(b));
    return (
      <div className={styles.verified}>
        <div className={styles.verifiedHead}>
          <span className={styles.check} aria-hidden="true">
            ✓
          </span>
          {t("register.idCheck.vc.verifiedTitle")}
        </div>

        <p className={styles.issuer}>
          {t("register.idCheck.vc.issuedBy")}{" "}
          <strong>
            {result.credentials
              .map((credential) => credential.issuerName || credential.issuer)
              .filter((name, index, all) => all.indexOf(name) === index)
              .join(", ")}
          </strong>
          {" — "}
          {result.credentials
            .map((credential) => credential.label || credential.type)
            .join(", ")}
        </p>

        {filled.length > 0 && (
          <table className={styles.fieldTable}>
            <thead>
              <tr>
                <th>{t("register.idCheck.vc.field")}</th>
                <th>{t("register.idCheck.vc.value")}</th>
              </tr>
            </thead>
            <tbody>
              {filled.map((field) => (
                <tr key={field}>
                  <td>
                    {fieldLabel(field)}
                    <div className={styles.source}>{result.fieldSources?.[field]}</div>
                  </td>
                  <td>{displayValue(field, result.fields[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!result.identitySatisfied && (
          <p className={styles.partial}>{t("register.idCheck.vc.stillNeedIdentity")}</p>
        )}

        {(result.warnings ?? []).map((warning) => (
          <div className={styles.warning} key={warning}>
            {warning}
          </div>
        ))}

        <button type="button" className={`${wizard.backButton} ${styles.resetButton}`} onClick={reset}>
          {t("register.idCheck.vc.presentAgain")}
        </button>
      </div>
    );
  }

  // ---- Collecting a presentation -------------------------------------------
  return (
    <div className={styles.panel}>
      <p className={styles.intro}>{t("register.idCheck.vc.intro")}</p>

      {session && session.acceptedCredentials?.length > 0 && (
        <div className={styles.accepted}>
          {t("register.idCheck.vc.accepted")}
          <ul className={styles.acceptedList}>
            {session.acceptedCredentials.map((accepted) => (
              <li key={accepted.type}>
                {accepted.label}
                {accepted.issuers.length > 0 && ` — ${accepted.issuers.join(", ")}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${mode === "wallet" ? styles.tabActive : ""}`}
          onClick={() => setMode("wallet")}
        >
          {t("register.idCheck.vc.tabWallet")}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${mode === "direct" ? styles.tabActive : ""}`}
          onClick={() => setMode("direct")}
        >
          {t("register.idCheck.vc.tabDirect")}
        </button>
      </div>

      {mode === "wallet" ? (
        <div>
          {session ? (
            <div className={styles.qrWrap}>
              <div className={styles.qrFrame}>
                <QRCodeSVG value={session.walletUrl} size={208} level="M" />
              </div>
              <p className={styles.qrHint}>{t("register.idCheck.vc.scanHint")}</p>
              <div className={styles.status}>
                {polling && <span className={styles.spinner} aria-hidden="true" />}
                {t("register.idCheck.vc.waiting")}
              </div>
              <a className={styles.walletLink} href={session.walletUrl}>
                {t("register.idCheck.vc.openWallet")}
              </a>
            </div>
          ) : (
            <div className={styles.actions}>
              <button type="button" className={wizard.continueButton} onClick={start} disabled={starting}>
                {starting
                  ? t("register.idCheck.vc.starting")
                  : t("register.idCheck.vc.start")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          <textarea
            className={styles.textarea}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={t("register.idCheck.vc.pastePlaceholder")}
            spellCheck={false}
          />
          <div className={styles.actions}>
            <input
              ref={fileInput}
              type="file"
              className={wizard.hiddenInput}
              accept=".json,.jwt,.txt,application/json"
              onChange={onFile}
            />
            <button type="button" className={wizard.browseButton} onClick={() => fileInput.current?.click()}>
              {t("register.idCheck.vc.chooseFile")}
            </button>
            <button
              type="button"
              className={wizard.continueButton}
              onClick={submitDirect}
              disabled={submitting || !pasted.trim()}
            >
              {submitting
                ? t("register.idCheck.vc.verifying")
                : t("register.idCheck.vc.verify")}
            </button>
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};

export default VcPresentation;
