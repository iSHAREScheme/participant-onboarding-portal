import { Certificate } from "pkijs";
import * as asn1js from "asn1js";

/**
 * Fields extracted from an uploaded X.509 certificate, shaped for the v3
 * `x509Certificate` claim:
 *   - x5c:        base64 (standard, padded) of the DER bytes        — RFC 7517
 *   - thumbprint: base64url (unpadded) SHA-256 of the DER (x5t#S256) — RFC 7517
 *   - subjectName: human-readable subject DN, e.g. "CN=…, O=…, C=NL"
 */
export interface CertificateFields {
  x5c: string;
  thumbprint: string;
  subjectName: string;
  issuerName: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  organizationIdentifier?: string;
  organizationName?: string;
  kvkNumber?: string;
  partyId?: string;
  subjectAttributes: SubjectAttribute[];
  issuerAttributes: SubjectAttribute[];
}

// Subset of attribute-type OIDs commonly seen in a subject DN.
const OID_TO_SHORT: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.9": "STREET",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.5": "SERIALNUMBER",
  "2.5.4.97": "ORGANIZATIONIDENTIFIER",
  "1.2.840.113549.1.9.1": "E",
  "0.9.2342.19200300.100.1.25": "DC",
};

export type SubjectAttribute = {
  oid: string;
  shortName: string;
  value: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    parts.push(String.fromCharCode.apply(null, sub as unknown as number[]));
  }
  return btoa(parts.join(""));
}

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function firstSubjectValue(attributes: SubjectAttribute[], ...names: string[]) {
  const normalizedNames = names.map((name) => name.toUpperCase());
  return (
    attributes.find((attribute) =>
      normalizedNames.includes(attribute.shortName.toUpperCase()) ||
      normalizedNames.includes(attribute.oid)
    )?.value.trim() || ""
  );
}

function derivePartyIdentity(organizationIdentifier: string) {
  const identifier = organizationIdentifier.trim();
  if (!identifier) {
    return {};
  }

  if (
    identifier.toLowerCase().startsWith("did:ishare:") ||
    identifier.toUpperCase().startsWith("EU.EORI.")
  ) {
    return { partyId: identifier };
  }

  // eIDAS legal-person certificates commonly expose the ETSI
  // organizationIdentifier value as NTR<country>-<registration-number>.
  // For Dutch trade-register identifiers, the portal already represents parties
  // as EU.EORI.NL.KVK<digits>, so keep that canonical form across identity paths.
  const ntrNl = identifier.match(/^NTRNL-?(\d{8,})$/i);
  const kvk = identifier.match(/(?:^|[^A-Z0-9])KVK[\s.-]*(\d{8,})(?:$|[^0-9])/i);
  const kvkNumber = ntrNl?.[1] || kvk?.[1] || "";
  if (kvkNumber) {
    return {
      kvkNumber,
      partyId: `EU.EORI.NL.KVK${kvkNumber}`,
    };
  }

  return { partyId: identifier };
}

function extractAttributes(typesAndValues: Certificate["subject"]["typesAndValues"]) {
  return typesAndValues.map((tv) => {
    const short = OID_TO_SHORT[tv.type] || tv.type;
    const value = (tv.value as any)?.valueBlock?.value ?? "";
    return {
      oid: tv.type,
      shortName: short,
      value: String(value),
    };
  });
}

function formatDistinguishedName(attributes: SubjectAttribute[]) {
  return attributes
    .map((attribute) => `${attribute.shortName}=${attribute.value}`)
    .join(", ");
}

function formatSerialNumber(serialNumber: Certificate["serialNumber"]) {
  const value = (serialNumber as any)?.valueBlock?.toString?.();
  return value ? String(value) : String(serialNumber);
}

// Decode a PEM-wrapped certificate to its DER bytes, or null if not PEM.
function pemToDer(buffer: ArrayBuffer): ArrayBuffer | null {
  const txt = new TextDecoder("utf-8").decode(buffer);
  const m = txt.match(
    /-----BEGIN[^-]*CERTIFICATE-----([\s\S]*?)-----END[^-]*CERTIFICATE-----/
  );
  if (!m) return null;
  const b64 = m[1].replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Parse an uploaded X.509 certificate (PEM or DER) and derive the fields the
 * v3 `x509Certificate` claim needs. Throws with a user-facing message when the
 * file is not a parseable certificate.
 */
export async function extractCertificateFields(
  file: File
): Promise<CertificateFields> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".p12") || name.endsWith(".pfx")) {
    throw new Error(
      "PKCS#12/PFX containers are not supported. Upload the X.509 certificate (PEM/DER)."
    );
  }

  const inputBuffer = await file.arrayBuffer();

  // DER starts with a SEQUENCE tag (0x30); otherwise treat the input as PEM.
  let der: ArrayBuffer = inputBuffer;
  if (new Uint8Array(der)[0] !== 0x30) {
    const maybeDer = pemToDer(inputBuffer);
    if (!maybeDer) {
      throw new Error(
        "Unsupported certificate format. Provide a PEM or DER encoded X.509 certificate."
      );
    }
    der = maybeDer;
  }

  const asn1 = asn1js.fromBER(der);
  if (asn1.offset === -1) {
    throw new Error("Invalid X.509 certificate (ASN.1 parse failed).");
  }
  const cert = new Certificate({ schema: asn1.result });

  const derBytes = new Uint8Array(der);
  const x5c = bytesToBase64(derBytes);

  const digest = await crypto.subtle.digest("SHA-256", der);
  const thumbprint = base64ToBase64Url(bytesToBase64(new Uint8Array(digest)));

  const subjectAttributes = extractAttributes(cert.subject.typesAndValues);
  const issuerAttributes = extractAttributes(cert.issuer.typesAndValues);
  const subjectName = formatDistinguishedName(subjectAttributes);
  const issuerName = formatDistinguishedName(issuerAttributes);
  const organizationIdentifier = firstSubjectValue(
    subjectAttributes,
    "ORGANIZATIONIDENTIFIER",
    "2.5.4.97",
    "SERIALNUMBER",
    "2.5.4.5"
  );
  const organizationName = firstSubjectValue(subjectAttributes, "O", "2.5.4.10");
  const derivedIdentity = derivePartyIdentity(organizationIdentifier);

  return {
    x5c,
    thumbprint,
    subjectName,
    issuerName,
    serialNumber: formatSerialNumber(cert.serialNumber),
    validFrom: cert.notBefore.value?.toISOString(),
    validTo: cert.notAfter.value?.toISOString(),
    organizationIdentifier: organizationIdentifier || undefined,
    organizationName: organizationName || undefined,
    subjectAttributes,
    issuerAttributes,
    ...derivedIdentity,
  };
}
