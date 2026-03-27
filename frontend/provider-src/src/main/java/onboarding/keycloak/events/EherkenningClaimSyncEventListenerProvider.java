package onboarding.keycloak.events;

import com.fasterxml.jackson.core.type.TypeReference;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.jboss.logging.Logger;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.FederatedIdentityModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.util.JsonSerialization;

final class EherkenningClaimSyncEventListenerProvider implements EventListenerProvider {
  private static final Logger LOG =
      Logger.getLogger(EherkenningClaimSyncEventListenerProvider.class);

  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
  private static final String PROVIDER_ALIAS = "eHerkenning";
  private static final String LEGAL_SUBJECT_ID_CLAIM = "urn:etoegang:core:LegalSubjectID";
  private static final String COMPANY_NAME_CLAIM =
      "urn:etoegang:1.11:attribute-represented:CompanyName";
  private static final String LEGACY_KVK_CLAIM = "kvk";
  private static final String EVENT_DETAIL_IDP = "identity_provider";

  private final KeycloakSession session;

  EherkenningClaimSyncEventListenerProvider(KeycloakSession session) {
    this.session = session;
  }

  @Override
  public void onEvent(Event event) {
    if (!isRelevantEvent(event)) {
      return;
    }

    RealmModel realm = session.realms().getRealm(event.getRealmId());
    if (realm == null) {
      return;
    }

    UserModel user = session.users().getUserById(realm, event.getUserId());
    if (user == null) {
      return;
    }

    String requestedAlias =
        event.getDetails() != null ? event.getDetails().get(EVENT_DETAIL_IDP) : null;
    if (requestedAlias != null
        && !requestedAlias.isBlank()
        && !requestedAlias.equalsIgnoreCase(PROVIDER_ALIAS)) {
      return;
    }

    FederatedIdentityModel identity =
        session.users().getFederatedIdentity(realm, user, PROVIDER_ALIAS);
    if (identity == null) {
      return;
    }

    Map<String, Object> claims = readClaims(identity.getToken());
    if (claims.isEmpty()) {
      LOG.warnf(
          "No claims could be parsed from federated token for user '%s' and provider '%s'",
          user.getUsername(),
          PROVIDER_ALIAS);
      return;
    }

    String kvk = firstClaimValue(claims, LEGAL_SUBJECT_ID_CLAIM, LEGACY_KVK_CLAIM);
    String companyName = firstClaimValue(claims, COMPANY_NAME_CLAIM);

    boolean changed = false;
    changed |= upsertUserAttribute(user, "kvk", kvk);
    changed |= upsertUserAttribute(user, "companyName", companyName);

    if (changed) {
      LOG.infof(
          "Synchronized eHerkenning attributes for user '%s' (kvk=%s, companyName=%s)",
          user.getUsername(),
          kvk != null ? "present" : "missing",
          companyName != null ? "present" : "missing");
    }
  }

  @Override
  public void close() {}

  @Override
  public void onEvent(AdminEvent event, boolean includeRepresentation) {}

  private static boolean isRelevantEvent(Event event) {
    if (event == null || event.getType() == null || event.getUserId() == null) {
      return false;
    }

    String type = event.getType().name();
    return "LOGIN".equals(type) || type.startsWith("IDENTITY_PROVIDER");
  }

  private static boolean upsertUserAttribute(UserModel user, String attributeName, String value) {
    if (value == null || value.isBlank()) {
      return false;
    }

    List<String> existing = user.getAttributeStream(attributeName).toList();
    if (existing.size() == 1 && value.equals(existing.get(0))) {
      return false;
    }

    user.setAttribute(attributeName, List.of(value));
    return true;
  }

  private static String firstClaimValue(Map<String, Object> claims, String... claimNames) {
    for (String claimName : claimNames) {
      if (claimName == null || claimName.isBlank()) {
        continue;
      }

      String direct = toTrimmedString(claims.get(claimName));
      if (direct != null) {
        return direct;
      }

      String escaped = claimName.replace(".", "\\.");
      if (!escaped.equals(claimName)) {
        String escapedValue = toTrimmedString(claims.get(escaped));
        if (escapedValue != null) {
          return escapedValue;
        }
      }

      for (Map.Entry<String, Object> entry : claims.entrySet()) {
        if (!claimName.equals(normalizeClaimKey(entry.getKey()))) {
          continue;
        }

        String resolved = toTrimmedString(entry.getValue());
        if (resolved != null) {
          return resolved;
        }
      }
    }

    return null;
  }

  private static Map<String, Object> readClaims(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return Map.of();
    }

    String token = rawToken.trim();
    try {
      if (token.startsWith("{")) {
        Map<String, Object> payload = JsonSerialization.readValue(token, MAP_TYPE);

        Object idToken = payload.get("id_token");
        if (idToken instanceof String idTokenString && !idTokenString.isBlank()) {
          Map<String, Object> claims = readJwtClaims(idTokenString);
          if (!claims.isEmpty()) {
            return claims;
          }
        }

        Object accessToken = payload.get("access_token");
        if (accessToken instanceof String accessTokenString && !accessTokenString.isBlank()) {
          Map<String, Object> claims = readJwtClaims(accessTokenString);
          if (!claims.isEmpty()) {
            return claims;
          }
        }

        return payload;
      }

      return readJwtClaims(token);
    } catch (Exception error) {
      LOG.warnf(error, "Failed to parse federated token for eHerkenning claim sync");
      return Map.of();
    }
  }

  private static Map<String, Object> readJwtClaims(String jwt) throws Exception {
    String[] parts = jwt.split("\\.");
    if (parts.length < 2) {
      return Map.of();
    }

    byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
    return JsonSerialization.readValue(new String(payload, StandardCharsets.UTF_8), MAP_TYPE);
  }

  private static String normalizeClaimKey(String key) {
    if (key == null) {
      return null;
    }

    String normalized = key.trim();
    if (normalized.isEmpty()) {
      return null;
    }

    return normalized.replace("\\.", ".");
  }

  private static String toTrimmedString(Object value) {
    if (value == null) {
      return null;
    }

    if (value instanceof String stringValue) {
      return stringValue.isBlank() ? null : stringValue.trim();
    }

    if (value instanceof List<?> list) {
      return list.stream()
          .map(EherkenningClaimSyncEventListenerProvider::toTrimmedString)
          .filter(Objects::nonNull)
          .findFirst()
          .orElse(null);
    }

    String stringified = String.valueOf(value);
    if (stringified == null || stringified.isBlank()) {
      return null;
    }

    return stringified.trim();
  }
}
