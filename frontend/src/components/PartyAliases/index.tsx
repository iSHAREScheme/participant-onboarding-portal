import { useLanguage } from "../../context/LanguageContext";
import styles from "styles/ParticipantDetail.module.css";

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));

/**
 * The party's EORI/DID aliases, taken from the v3 `alsoKnownAs` field (snake_case
 * and `aka` tolerated), with blanks and the party's own id dropped so the primary
 * id is never repeated as one of its own aliases.
 */
export const partyAliases = (party: any, primaryId = ""): string[] => {
  const raw = party?.alsoKnownAs ?? party?.also_known_as ?? party?.aka;
  return (Array.isArray(raw) ? raw : [])
    .map(str)
    .map((alias) => alias.trim())
    .filter(Boolean)
    .filter((alias) => alias !== primaryId);
};

/**
 * The "also known as" row of a party detail header. Always rendered: an empty
 * row says "no aliases registered", which is itself information. Shared by the
 * admin participant page and the applicant's own party page so both present a
 * party's identity identically.
 */
const PartyAliases = ({
  party,
  primaryId = "",
}: {
  party: any;
  primaryId?: string;
}) => {
  const { t } = useLanguage();
  const aliases = partyAliases(party, primaryId);
  return (
    <div className={styles.akaRow}>
      <span className={styles.akaLabel}>
        {t("participants.detail.fields.alsoKnownAs")}
      </span>
      {aliases.length > 0 ? (
        <div className={styles.chips}>
          {aliases.map((alias, i) => (
            <span className={styles.chip} key={i} title={alias}>
              {alias}
            </span>
          ))}
        </div>
      ) : (
        <span className={styles.factValue}>—</span>
      )}
    </div>
  );
};

export default PartyAliases;
