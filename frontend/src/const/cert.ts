// OIDs
export const QC_STATEMENTS_OID = '1.3.6.1.5.5.7.1.3'     // id-pe-qcStatements
export const QC_COMPLIANCE_OID = '0.4.0.1862.1.1'        // id-etsi-qcs-QcCompliance
export const QC_TYPE_ESIGN_OID = '0.4.0.1862.1.6.1'
export const QC_TYPE_ESEAL_OID = '0.4.0.1862.1.6.2'
export const QC_TYPE_WEB_OID   = '0.4.0.1862.1.6.3'
export const CERT_POLICIES_OID = '2.5.29.32'

// ETSI EN 319 411-2 Qualified Certificate Policies
export const QCP_POLICY_OIDS = new Set([
  '0.4.0.194112.1.0', // QCP-n
  '0.4.0.194112.1.1', // QCP-l
  '0.4.0.194112.1.2', // QCP-n-qscd
  '0.4.0.194112.1.3', // QCP-l-qscd
  '0.4.0.194112.1.4'  // QCP-w
])