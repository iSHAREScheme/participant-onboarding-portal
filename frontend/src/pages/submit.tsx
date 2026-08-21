import { isSatelliteOperator } from "utils/roles";
import React, { useState, useRef, useEffect } from "react";
import { NextPage } from "next";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FormInput, Button, FormSelect } from "components";
import { useSubmitInfo } from "hooks";
import { useLanguage } from "context/LanguageContext";
import { useKeycloak } from "@react-keycloak/web";
import { useRouter } from "next/router";
import styles from "styles/Submit.module.css";
import ProtectedRoute from "../components/ProtectedRoute";
import SubmitClaimsForm from "../components/SubmitClaimsForm";
import API from "api/client";
import { getSatelliteVersion, usesClaimModel } from "config/publicEnv";
import {
  AdherenceStatusOptions,
  AuthorisationRegistryIDOptions,
  AuthorisationRegistryNameOptions,
} from "const";

const validationSchema = Yup.object({
  party_id: Yup.string().required("Party ID is required"),
  party_name: Yup.string().required("Party Name is required"),
  capability_url: Yup.string().url("Invalid URL"),
  registrar_id: Yup.string().required("Registrar ID is required"),
  status: Yup.string(),
  adherence: Yup.object()
    .shape({
      status: Yup.string().required("Adherence status is required"),
      start_date: Yup.date().required("Start date is required"),
      end_date: Yup.date().required("End date is required"),
    })
    .required("Adherence is required"),
  authregistries: Yup.array()
    .of(
      Yup.object().shape({
        authregistery_name: Yup.string().required(
          "Authregistry name is required"
        ),
        authregistery_id: Yup.string().required("Authregistry ID is required"),
        authregistery_url: Yup.string()
          .required("Authregistry URL is required")
          .url("Invalid URL"),
        dataspace_id: Yup.string(),
        dataspace_title: Yup.string(),
      })
    )
    .required("Authregistries is required"),
  additional_info: Yup.object().shape({
    description: Yup.string(),
    logo: Yup.string(),
    website: Yup.string().url("Invalid URL"),
    company_phone: Yup.string(),
    company_email: Yup.string().email("Invalid email"),
    publicly_publishable: Yup.string(),
    countries_operation: Yup.array().of(Yup.string()),
    sector_industry: Yup.array().of(Yup.string()),
    tags: Yup.string(),
  }),
  agreements: Yup.array().of(
    Yup.object().shape({
      type: Yup.string().required("Agreement type is required"),
      title: Yup.string().required("Agreement title is required"),
      status: Yup.string().required("Agreement status is required"),
      sign_date: Yup.date().required("Sign date is required"),
      expiry_date: Yup.date().required("Expiry date is required"),
      agreement_file: Yup.string().required("Agreement file is required"),
      framework: Yup.string().required("Framework is required"),
      dataspace_id: Yup.string(),
      dataspace_title: Yup.string(),
      complaiancy_verified: Yup.string().required(
        "Compliance verified is required"
      ),
    })
  ),
  spor: Yup.object()
    .shape({
      signed_request: Yup.string().required("Signed request is required"),
    })
    .required("spor"),
  roles: Yup.array().of(
    Yup.object().shape({
      role: Yup.string().required("Role is required"),
      start_date: Yup.date().required("Start date is required"),
      end_date: Yup.date().required("End date is required"),
      loa: Yup.string().required("LOA is required"),
      complaiancy_verified: Yup.string().required(
        "Compliance verified is required"
      ),
      legal_adherence: Yup.string().required("Legal adherence is required"),
    })
  ),
});

const Submit: NextPage = () => {
  const { t } = useLanguage();
  const { keycloak } = useKeycloak();
  const router = useRouter();
  // /submit registers a party directly in the satellite (POST /party, /parties —
  // now admin-only on the backend). Keep non-admins out so they never reach a
  // form the API will reject; the applicant onboarding flow lives at /register.
  const isAdmin = Boolean(
    keycloak?.authenticated &&
    isSatelliteOperator(keycloak)
  );
  useEffect(() => {
    if (keycloak?.authenticated && !isAdmin) router.replace("/");
  }, [keycloak?.authenticated, isAdmin, router]);
  // The interface (v2 party form vs v3 claims form) must follow the satellite's
  // actual version. The backend auto-detects it — the same source the Settings
  // page shows — which can differ from the static client env. Seed from the env
  // for the first paint, then confirm with the backend.
  const [claimModel, setClaimModel] = useState<boolean>(() =>
    usesClaimModel(getSatelliteVersion())
  );
  useEffect(() => {
    let active = true;
    new API()
      .fetchSatelliteVersion()
      .then((res) => {
        if (active && res?.data) setClaimModel(Boolean(res.data.claimModel));
      })
      .catch(() => {
        /* keep the env-based fallback */
      });
    return () => {
      active = false;
    };
  }, []);
  const { createParty, loading, error, response } = useSubmitInfo();
  const [showAuthRegistryForm, setShowAuthRegistryForm] =
    useState<boolean>(false);
  const [showAgreementForm, setShowAgreementForm] = useState<boolean>(false);
  const [showRoleForm, setShowRoleForm] = useState<boolean>(false);

  const certInputRef = useRef<HTMLInputElement>(null);
  const [certError, setCertError] = useState<string>("");
  const [isDraggingCert, setIsDraggingCert] = useState<boolean>(false);

  const formik = useFormik({
    initialValues: {
      certificate: null as File | null,
      party_id: "",
      party_name: "",
      capability_url: "",
      registrar_id: "",
      status: "",
      adherence: {
        status: "",
        start_date: "",
        end_date: "",
      },
      authregistries: [
        {
          authregistery_name: "",
          authregistery_id: "",
          authregistery_url: "",
          dataspace_id: "",
          dataspace_title: "",
        },
      ],
      additional_info: {
        description: "",
        logo: "",
        website: "",
        company_phone: "",
        company_email: "",
        publicly_publishable: "false",
        tags: "",
      },
      agreements: [
        {
          type: "",
          title: "",
          status: "",
          sign_date: "",
          expiry_date: "",
          agreement_file: "",
          framework: "",
          dataspace_id: "",
          dataspace_title: "",
          complaiancy_verified: "",
        },
      ],
      spor: {
        signed_request: "",
      },
      roles: [
        {
          role: "",
          start_date: "",
          end_date: "",
          loa: "",
          complaiancy_verified: "",
          legal_adherence: "",
        },
      ],
    },
    validationSchema,
    onSubmit: (values) => {
      values.agreements.push(values.agreements[0]);
      values.agreements[1].type = "AccessionAgreement";
      // console.log("values: ", values);
      createParty(values);
    },
  });

  const handleAddAuthRegistry = () => {
    // console.log("add auth clicked");
    setShowAuthRegistryForm(true);
    const newAuthRegistry = {
      authregistery_name: "",
      authregistery_id: "",
      authregistery_url: "",
      dataspace_id: "",
      dataspace_title: "",
    };
    formik.setFieldValue("authregistries", [
      ...formik.values.authregistries,
      newAuthRegistry,
    ]);
  };
  const handleSaveAuthRegistry = () => { };
  const handleCancelAuthRegistry = () => {
    setShowAuthRegistryForm(false);
  };

  const handleAddAgreement = () => {
    setShowAgreementForm(true);
  };
  const handleSaveAgreement = () => { };
  const handleCancelAgreement = () => {
    setShowAgreementForm(false);
  };

  const handleCertificateFile = (file: File) => {
    setCertError("");
    if (!/\.(pem|crt|cer|der)$/i.test(file.name)) {
      setCertError("Invalid file type. Allowed: .pem, .crt, .cer, .der");
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      setCertError("File size exceeds 1MB limit");
      return;
    }
    formik.setFieldValue("certificate", file);
  };

  const handleCertInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCertificateFile(file);
    // Reset so the same file can be selected again
    e.target.value = "";
  };

  const handleCertDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCert(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleCertificateFile(file);
  };

  const removeCertificate = () => {
    formik.setFieldValue("certificate", null);
    setCertError("");
  };

  const handleAddRole = () => {
    setShowRoleForm(true);
  };
  const handleSaveRole = () => { };
  const handleCancelRole = () => {
    setShowRoleForm(false);
  };

  const handleAdherenceStatusChange = (value: string) => {
    formik.setFieldValue("adherence.status", value);
  };

  const handleAuthorisationRegistryIDChange = (value: string) => {
    formik.setFieldValue("authregistries[0].authregistery_id", value);
  };
  const handleAuthorisationRegistryNameChange = (value: string) => {
    formik.setFieldValue("authregistries[0].authregistery_name", value);
  };

  // Authenticated non-admins are redirected away by the effect above; render
  // nothing meanwhile so the operator form never flashes for them.
  if (keycloak?.authenticated && !isAdmin) {
    return null;
  }

  return (
    <ProtectedRoute fetchData={() => { }}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("submit.title")}</h1>
        {claimModel ? (
          <SubmitClaimsForm />
        ) : (
        <form onSubmit={formik.handleSubmit}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("submit.v2.sections.participant")}</h2>
            <div className={styles.formGrid}>
              <FormInput
                label={t("submit.identity.partyId")}
                id="party_id"
                name="party_id"
                type="text"
                placeholder={t("submit.v2.placeholders.partyId")}
                required
                value={formik.values.party_id}
                onChange={formik.handleChange}
                error={
                  formik.touched.party_id ? formik.errors.party_id : undefined
                }
              />
              <FormInput
                label={t("submit.identity.partyName")}
                id="party_name"
                name="party_name"
                placeholder={t("submit.identity.partyNamePlaceholder")}
                type="text"
                required
                value={formik.values.party_name}
                onChange={formik.handleChange}
                error={
                  formik.touched.party_name
                    ? formik.errors.party_name
                    : undefined
                }
              />
              <FormInput
                label={t("submit.claim.startDate")}
                id="adherence.start_date"
                name="adherence.start_date"
                type="text"
                placeholder={t("submit.placeholders.date")}
                required
                value={formik.values.adherence.start_date}
                onChange={formik.handleChange}
                error={
                  formik.touched.adherence?.start_date
                    ? formik.errors.adherence?.start_date
                    : undefined
                }
              />
              <FormInput
                label={t("submit.claim.endDate")}
                id="adherence.end_date"
                name="adherence.end_date"
                type="text"
                placeholder={t("submit.placeholders.date")}
                required
                value={formik.values.adherence.end_date}
                onChange={formik.handleChange}
                error={
                  formik.touched.adherence?.end_date
                    ? formik.errors.adherence?.end_date
                    : undefined
                }
              />
              <FormSelect
                label={t("submit.claim.status")}
                options={AdherenceStatusOptions}
                value={formik.values.adherence.status}
                onChange={handleAdherenceStatusChange}
                required
              />
              <FormInput
                label={t("submit.claim.capabilityUrl")}
                id="capability_url"
                name="capability_url"
                placeholder={t("submit.placeholders.url")}
                type="text"
                value={formik.values.capability_url}
                onChange={formik.handleChange}
                error={
                  formik.touched.capability_url
                    ? formik.errors.capability_url
                    : undefined
                }
              />
              <FormInput
                label={t("submit.claim.registrarId")}
                id="registrar_id"
                name="registrar_id"
                placeholder={t("submit.v2.placeholders.registrarId")}
                type="text"
                required
                value={formik.values.registrar_id}
                onChange={formik.handleChange}
                error={
                  formik.touched.registrar_id
                    ? formik.errors.registrar_id
                    : undefined
                }
              />
              {/* <FormInput
                                label='Status'
                                id='status'
                                name='status'
                                type='text'
                                value={formik.values.status}
                                onChange={formik.handleChange}
                                error={formik.touched.status ? formik.errors.status : undefined}
                            /> */}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionBar}></div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t("submit.v2.sections.certificate")}</h2>
            </div>
            <div
              className={`${styles.uploadContainer} ${
                isDraggingCert ? styles.dragActive : ""
              }`}
              onDrop={handleCertDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingCert(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingCert(false);
              }}
              onClick={() => certInputRef.current?.click()}
            >
              <input
                type="file"
                ref={certInputRef}
                accept=".pem,.crt,.cer,.der"
                onChange={handleCertInput}
                style={{ display: "none" }}
              />
              <div className={styles.uploadIcon}>🔒</div>
              <div className={styles.uploadText}>
                {t("submit.upload.certText")}
              </div>
              <div className={styles.orText}>{t("submit.upload.or")}</div>
              <div className={styles.browseButton}>{t("submit.upload.browse")}</div>
            </div>
            {certError && (
              <div className={styles.errorMessage}>{certError}</div>
            )}
            {formik.values.certificate && (
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>
                  {formik.values.certificate.name}
                </span>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={removeCertificate}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionBar}></div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t("submit.v2.sections.authRegistries")}</h2>
              {!showAuthRegistryForm && (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<div>+</div>}
                  onClick={handleAddAuthRegistry}
                >
                  {t("submit.v2.actions.addAuthRegistry")}
                </Button>
              )}
              {showAuthRegistryForm && (
                <div className={styles.buttonGroup}>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<div>+</div>}
                    onClick={handleCancelAuthRegistry}
                  >
                    {t("submit.v2.actions.cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<div>+</div>}
                    onClick={handleAddAuthRegistry}
                  >
                    {t("submit.v2.actions.save")}
                  </Button>
                </div>
              )}
            </div>
            {showAuthRegistryForm && (
              <div className={styles.formGrid}>
                <FormSelect
                  label={t("submit.claim.authRegistryId")}
                  options={AuthorisationRegistryIDOptions}
                  value={formik.values.authregistries[0].authregistery_id}
                  onChange={handleAuthorisationRegistryIDChange}
                  required
                />
                <FormSelect
                  label={t("submit.claim.authRegistryName")}
                  options={AuthorisationRegistryNameOptions}
                  value={formik.values.authregistries[0].authregistery_name}
                  onChange={handleAuthorisationRegistryNameChange}
                  required
                />
                <FormInput
                  label={t("submit.claim.authRegistryUrl")}
                  id={`authregistries[0].authregistery_url`}
                  name={`authregistries[0].authregistery_url`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.authregistries?.[0]?.authregistery_url
                      ? formik.errors.authregistries?.[0]?.authregistery_url
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.dataspaceId")}
                  id={`authregistries[0].dataspace_id`}
                  name={`authregistries[0].dataspace_id`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.authregistries?.[0]?.dataspace_id
                      ? formik.errors.authregistries?.[0]?.dataspace_id
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.v2.fields.dataspaceTitle")}
                  id={`authregistries[0].dataspace_title`}
                  name={`authregistries[0].dataspace_title`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.authregistries?.[0]?.dataspace_title
                      ? formik.errors.authregistries?.[0]?.dataspace_title
                      : undefined
                  }
                />
              </div>
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionBar}></div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t("submit.v2.sections.additionalInfo")}</h2>
            </div>
            <div className={styles.formGrid}>
              <FormInput
                label={t("submit.claim.description")}
                id="additional_info.description"
                name="additional_info.description"
                type="text"
                value={formik.values.additional_info.description}
                onChange={formik.handleChange}
                error={
                  formik.touched.additional_info?.description
                    ? formik.errors.additional_info?.description
                    : undefined
                }
              />
              <FormInput
                label={t("submit.claim.website")}
                id="additional_info.website"
                name="additional_info.website"
                type="text"
                value={formik.values.additional_info.website}
                onChange={formik.handleChange}
                error={
                  formik.touched.additional_info?.website
                    ? formik.errors.additional_info?.website
                    : undefined
                }
              />
              <FormInput
                label={t("submit.v2.fields.logo")}
                id="additional_info.logo"
                name="additional_info.logo"
                type="text"
                value={formik.values.additional_info.logo}
                onChange={formik.handleChange}
                error={
                  formik.touched.additional_info?.logo
                    ? formik.errors.additional_info?.logo
                    : undefined
                }
              />
              <FormInput
                label={t("submit.claim.companyEmail")}
                id="additional_info.company_email"
                name="additional_info.company_email"
                type="text"
                value={formik.values.additional_info.company_email}
                onChange={formik.handleChange}
                error={
                  formik.touched.additional_info?.company_email
                    ? formik.errors.additional_info?.company_email
                    : undefined
                }
              />
              <FormInput
                label={t("submit.v2.fields.companyPhone")}
                id="additional_info.company_phone"
                name="additional_info.company_phone"
                type="text"
                value={formik.values.additional_info.company_phone}
                onChange={formik.handleChange}
                error={
                  formik.touched.additional_info?.company_phone
                    ? formik.errors.additional_info?.company_phone
                    : undefined
                }
              />
              <FormInput
                label={t("submit.v2.fields.tags")}
                id="additional_info.tags"
                name="additional_info.tags"
                type="text"
                value={formik.values.additional_info.tags}
                onChange={formik.handleChange}
                error={
                  formik.touched.additional_info?.tags
                    ? formik.errors.additional_info?.tags
                    : undefined
                }
              />
              <FormInput
                label={t("submit.claim.publiclyPublishable")}
                id="additional_info.publicly_publishable"
                name="additional_info.publicly_publishable"
                type="text"
                value={formik.values.additional_info.publicly_publishable}
                onChange={formik.handleChange}
                error={
                  formik.touched.additional_info?.publicly_publishable
                    ? formik.errors.additional_info?.publicly_publishable
                    : undefined
                }
              />
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionBar}></div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t("submit.v2.sections.agreements")}</h2>
              {!showAgreementForm && (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<div>+</div>}
                  className={styles.minButton}
                  onClick={handleAddAgreement}
                >
                  {t("submit.v2.actions.addAgreement")}
                </Button>
              )}
              {showAgreementForm && (
                <div className={styles.buttonGroup}>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<div>+</div>}
                    onClick={handleCancelAgreement}
                  >
                    {t("submit.v2.actions.cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<div>+</div>}
                    onClick={handleSaveAgreement}
                  >
                    {t("submit.v2.actions.save")}
                  </Button>
                </div>
              )}
            </div>
            {showAgreementForm && (
              <div className={styles.formGrid}>
                <FormInput
                  label={t("submit.claim.agreementType")}
                  id={`agreements[0].type`}
                  name={`agreements[0].type`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.type
                      ? formik.errors.agreements?.[0]?.type
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.title")}
                  id={`agreements[0].title`}
                  name={`agreements[0].title`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.title
                      ? formik.errors.agreements?.[0]?.title
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.status")}
                  id={`agreements[0].status`}
                  name={`agreements[0].status`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.status
                      ? formik.errors.agreements?.[0]?.status
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.v2.fields.signDate")}
                  id={`agreements[0].sign_date`}
                  name={`agreements[0].sign_date`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.sign_date
                      ? formik.errors.agreements?.[0]?.sign_date
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.v2.fields.expiryDate")}
                  id={`agreements[0].expiry_date`}
                  name={`agreements[0].expiry_date`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.expiry_date
                      ? formik.errors.agreements?.[0]?.expiry_date
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.v2.fields.framework")}
                  id={`agreements[0].framework`}
                  name={`agreements[0].framework`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.framework
                      ? formik.errors.agreements?.[0]?.framework
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.dataspaceId")}
                  id={`agreements[0].dataspace_id`}
                  name={`agreements[0].dataspace_id`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.dataspace_id
                      ? formik.errors.agreements?.[0]?.dataspace_id
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.v2.fields.dataspaceTitle")}
                  id={`agreements[0].dataspace_title`}
                  name={`agreements[0].dataspace_title`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.dataspace_title
                      ? formik.errors.agreements?.[0]?.dataspace_title
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.v2.fields.contractFile")}
                  id={`agreements[0].agreement_file`}
                  name={`agreements[0].agreement_file`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.agreement_file
                      ? formik.errors.agreements?.[0]?.agreement_file
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.compliancyVerified")}
                  id={`agreements[0].complaiancy_verified`}
                  name={`agreements[0].complaiancy_verified`}
                  type="text"
                  value={""}
                  required
                  onChange={formik.handleChange}
                  error={
                    formik.touched.agreements?.[0]?.complaiancy_verified
                      ? formik.errors.agreements?.[0]?.complaiancy_verified
                      : undefined
                  }
                />
                {/* <FormCheckbox
                                        label='Complaiancy Verified'
                                        name={`agreements[0].complaiancy_verified`}
                                        checked={agreement.complaiancy_verified}
                                        onChange={formik.handleChange}
                                        error={formik.touched.agreements?.[0]?.complaiancy_verified ? formik.errors.agreements?.[0]?.complaiancy_verified : undefined}
                                    /> */}
              </div>
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionBar}></div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t("submit.v2.sections.roles")}</h2>
              {!showRoleForm && (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<div>+</div>}
                  className={styles.minButton}
                  onClick={handleAddRole}
                >
                  {t("submit.v2.actions.addRole")}
                </Button>
              )}
              {showRoleForm && (
                <div className={styles.buttonGroup}>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<div>+</div>}
                    onClick={handleCancelRole}
                  >
                    {t("submit.v2.actions.cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<div>+</div>}
                    onClick={handleSaveRole}
                  >
                    {t("submit.v2.actions.save")}
                  </Button>
                </div>
              )}
            </div>
            {showRoleForm && (
              <div className={styles.formGrid}>
                <FormInput
                  label={t("submit.v2.fields.role")}
                  id={`roles[0].role`}
                  name={`roles[0].role`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.roles?.[0]?.role
                      ? formik.errors.roles?.[0]?.role
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.startDate")}
                  id={`roles[0].start_date`}
                  name={`roles[0].start_date`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.roles?.[0]?.start_date
                      ? formik.errors.roles?.[0]?.start_date
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.endDate")}
                  id={`roles[0].end_date`}
                  name={`roles[0].end_date`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.roles?.[0]?.end_date
                      ? formik.errors.roles?.[0]?.end_date
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.loa")}
                  id={`roles[0].loa`}
                  name={`roles[0].loa`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.roles?.[0]?.loa
                      ? formik.errors.roles?.[0]?.loa
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.compliancyVerified")}
                  id={`roles[0].complaiancy_verified`}
                  name={`roles[0].complaiancy_verified`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.roles?.[0]?.complaiancy_verified
                      ? formik.errors.roles?.[0]?.complaiancy_verified
                      : undefined
                  }
                />
                <FormInput
                  label={t("submit.claim.legalAdherence")}
                  id={`roles[0].legal_adherence`}
                  name={`roles[0].legal_adherence`}
                  type="text"
                  value={""}
                  onChange={formik.handleChange}
                  error={
                    formik.touched.roles?.[0]?.legal_adherence
                      ? formik.errors.roles?.[0]?.legal_adherence
                      : undefined
                  }
                />
              </div>
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionBar}></div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t("submit.v2.sections.spor")}</h2>
            </div>
            <div className={styles.formGrid}>
              <FormInput
                label={t("submit.v2.fields.signedRequest")}
                id="spor.signed_request"
                name="spor.signed_request"
                type="text"
                value={formik.values.spor.signed_request}
                onChange={formik.handleChange}
                error={
                  formik.touched.spor?.signed_request
                    ? formik.errors.spor?.signed_request
                    : undefined
                }
              />
            </div>
          </div>

          {error && (
            <div className={styles.errorMessage}>
              {t("submit.messages.submitError", {
                message: String((error as any)?.message || ""),
              })}
            </div>
          )}
          {response && (
            <div className={styles.uploadText}>
              {t("submit.messages.submitSuccess")}
            </div>
          )}

          <div className={styles.buttonGroup}>
            <Button
              type="button"
              variant="secondary"
              icon={<div>+</div>}
              onClick={() => router.push("/admin")}
            >
              {t("submit.v2.actions.back")}
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? t("submit.actions.submitting") : t("submit.actions.create")}
            </Button>
          </div>
        </form>
        )}
      </div>
    </ProtectedRoute>
  );
};

export default Submit;
