import { Certificate } from 'pkijs'
import * as asn1js from 'asn1js'
import { 
  QC_STATEMENTS_OID, 
  QC_COMPLIANCE_OID, 
  CERT_POLICIES_OID, 
  QCP_POLICY_OIDS, 
  QC_TYPE_ESIGN_OID, 
  QC_TYPE_ESEAL_OID, 
  QC_TYPE_WEB_OID 
} from 'const/cert'

/**
 * Validate an uploaded X.509 certificate before sending it to the registry.
 * Qualified-certificate statements are optional unless explicitly required by
 * the deployment's onboarding settings.
 */
export default async function preValidateEidasCert (
  file: File,
  requireQualifiedCertificate = false
) {
  if (!(file.type === 'application/pkix-cert' || file.type === 'application/x-x509-ca-cert' || file.type === '')) {
    const n = file.name.toLowerCase()
    const allowed = n.endsWith('.cer') || n.endsWith('.crt') || n.endsWith('.der') || n.endsWith('.pem')
    if (!allowed) {
      throw Error("Upload a PEM/DER X.509 certificate (.cer/.crt/.der/.pem).")
    }
  }

  // Validate eIDAS certificate (LoA >= 3 equivalent: Qualified / substantial+)
  try {
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.p12') || lowerName.endsWith('.pfx')) {
      throw Error("PKCS#12/PFX containers are not supported. Please upload the X.509 certificate file (PEM/DER).")
    }

    const inputBuffer = await file.arrayBuffer()

    // Helper: decode PEM to DER if needed
    const tryPemToDer = (buf: ArrayBuffer): ArrayBuffer | null => {
      const txt = new TextDecoder('utf-8').decode(buf)
      const m = txt.match(/-----BEGIN[^-]*CERTIFICATE-----([\s\S]*?)-----END[^-]*CERTIFICATE-----/)
      if (!m) return null
      const b64 = m[1].replace(/\\s+/g, '')
      const bin = atob(b64)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out.buffer
    }

    let der = inputBuffer
    const firstByte = new Uint8Array(der)[0]
    if (firstByte !== 0x30) {
      const maybeDer = tryPemToDer(inputBuffer)
      if (!maybeDer) {
        throw Error("Unsupported certificate format. Provide PEM (.pem/.crt/.cer) or DER (.der) encoded X.509 certificate.")
      }
      der = maybeDer
    }

    // Parse X.509
    const asn1 = asn1js.fromBER(der)
    if (asn1.offset === -1) {
      throw Error("Invalid X.509 certificate (ASN.1 parse failed).")
    }
    const cert = new Certificate({ schema: asn1.result })

    // Check validity period
    const now = new Date()
    // const notBefore: Date | undefined =
    //   (cert as any).notBefore?.value instanceof Date ? (cert as any).notBefore.value : undefined
    const notAfter: Date | undefined =
      (cert as any).notAfter?.value instanceof Date ? (cert as any).notAfter.value : undefined

    // if (notBefore && now < notBefore) {
    //   throw Error(`Certificate is not yet valid. Starts on ${notBefore.toISOString().slice(0, 10)}.`)
    //   return
    // }
    if (notAfter && now > notAfter) {
      throw Error(`Certificate expired on ${notAfter.toISOString().slice(0, 10)}.`)
    }

    const exts = cert.extensions || []
    const getExt = (oid: string) => exts.find(e => e.extnID === oid)

    // Parse QCStatements
    const qcExt = getExt(QC_STATEMENTS_OID)
    let hasQcCompliance = false
    let qcTypes: string[] = []

    if (qcExt) {
      const qcAsn1 = asn1js.fromBER(qcExt.extnValue.valueBlock.valueHex)
      if (qcAsn1.offset !== -1 && qcAsn1.result?.valueBlock?.value) {
        const items = qcAsn1.result.valueBlock.value
        for (const item of items) {
          // item: SEQUENCE { statementId OBJECT IDENTIFIER, statementInfo ANY DEFINED BY statementId OPTIONAL }
          const statementId = item.valueBlock.value?.[0]
          const oid = statementId?.valueBlock?.toString?.()
          if (oid === QC_COMPLIANCE_OID) hasQcCompliance = true

          // try to extract QCType OID if present in statementInfo
          const info = item.valueBlock.value?.[1]
          if (info && info.idBlock?.tagNumber === 16 /* SEQUENCE */) {
            const inner = info.valueBlock.value?.[0]
            const typeOid = inner?.valueBlock?.toString?.()
            if (typeOid) qcTypes.push(typeOid)
          }
        }
      }
    }

    // Parse certificatePolicies (optional)
    const policiesExt = getExt(CERT_POLICIES_OID)
    let hasQualifiedPolicy = false
    if (policiesExt) {
      const polAsn1 = asn1js.fromBER(policiesExt.extnValue.valueBlock.valueHex)
      if (polAsn1.offset !== -1 && polAsn1.result?.valueBlock?.value) {
        for (const pol of polAsn1.result.valueBlock.value) {
          const policyId = pol.valueBlock.value?.[0]
          const oid = policyId?.valueBlock?.toString?.()
          if (oid && QCP_POLICY_OIDS.has(oid)) {
            hasQualifiedPolicy = true
            break
          }
        }
      }
    }

    const hasQualifiedType = qcTypes.some(oid =>
      oid === QC_TYPE_ESIGN_OID || oid === QC_TYPE_ESEAL_OID || oid === QC_TYPE_WEB_OID
    )

    // Optional qualified-certificate rule. Basic parsing, expiry and registry
    // trust validation remain active when this stricter rule is disabled.
    if (requireQualifiedCertificate && !(hasQcCompliance && (hasQualifiedPolicy || hasQualifiedType))) {
      throw Error("The uploaded certificate is not an EU Qualified (eIDAS) certificate at substantial/high level. Please provide a Qualified certificate (with QCCompliance and QCP/QCType).")
    }

    return true
    
  } catch (err: any) {
    console.error("eIDAS validation error", err)
    throw Error(err?.message || "Failed to validate the eIDAS certificate. Ensure it is a valid X.509 Qualified certificate (PEM/DER).")
  }
  
}
