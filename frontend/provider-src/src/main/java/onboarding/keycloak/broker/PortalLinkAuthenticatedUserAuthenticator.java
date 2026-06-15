package onboarding.keycloak.broker;

import com.fasterxml.jackson.core.type.TypeReference;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.broker.AbstractIdpAuthenticator;
import org.keycloak.authentication.authenticators.broker.util.SerializedBrokeredIdentityContext;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.FederatedIdentityModel;
import org.keycloak.models.IdentityProviderModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.services.managers.AuthenticationManager;
import org.keycloak.util.JsonSerialization;

public final class PortalLinkAuthenticatedUserAuthenticator extends AbstractIdpAuthenticator {
  private static final Logger LOG =
      Logger.getLogger(PortalLinkAuthenticatedUserAuthenticator.class);

  static final String IDENTITY_PROVIDER_ALIASES = "identity.provider.aliases";
  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
  private static final String LEGAL_SUBJECT_ID_CLAIM = "urn:etoegang:core:LegalSubjectID";
  private static final String COMPANY_NAME_CLAIM =
      "urn:etoegang:1.11:attribute-represented:CompanyName";

  @Override
  protected void authenticateImpl(
      AuthenticationFlowContext context,
      SerializedBrokeredIdentityContext serializedCtx,
      BrokeredIdentityContext brokerContext) {
    if (brokerContext == null
        || brokerContext.getIdpConfig() == null
        || !supportsProvider(context.getAuthenticatorConfig(), brokerContext.getIdpConfig())) {
      context.attempted();
      return;
    }

    String providerAlias = brokerContext.getIdpConfig().getAlias();
    UserModel browserUser = getCurrentUser(context.getSession(), context.getRealm());
    UserModel authenticatedUser = context.getAuthenticationSession().getAuthenticatedUser();
    UserModel targetUser = authenticatedUser != null ? authenticatedUser : browserUser;

    if (targetUser == null) {
      context.attempted();
      return;
    }

    if (authenticatedUser != null
        && browserUser != null
        && !authenticatedUser.getId().equals(browserUser.getId())) {
      LOG.warnf(
          "Authentication session user '%s' differs from browser user '%s' during broker link with '%s'; skipping auto-link",
          authenticatedUser.getUsername(),
          browserUser.getUsername(),
          providerAlias);
      context.attempted();
      return;
    }

    LOG.debugf(
        "Using already-authenticated user '%s' for broker linking with '%s'",
        targetUser.getUsername(),
        providerAlias);

    importEherkenningClaims(
        context.getSession(), context.getRealm(), serializedCtx, brokerContext, targetUser);
    if (authenticatedUser == null) {
      context.setUser(targetUser);
    }
    context.success();
  }

  @Override
  protected void actionImpl(
      AuthenticationFlowContext context,
      SerializedBrokeredIdentityContext serializedCtx,
      BrokeredIdentityContext brokerContext) {
    authenticateImpl(context, serializedCtx, brokerContext);
  }

  @Override
  public boolean requiresUser() {
    return false;
  }

  @Override
  public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
    return true;
  }

  private static void importEherkenningClaims(
      KeycloakSession session,
      RealmModel realm,
      SerializedBrokeredIdentityContext serializedCtx,
      BrokeredIdentityContext brokerContext,
      UserModel currentUser) {
    Map<String, Object> claims =
        readBrokerClaims(session, realm, currentUser, brokerContext, serializedCtx);
    if (claims.isEmpty()) {
      LOG.warnf(
          "No broker claims available for attribute import for user '%s' and provider '%s'",
          currentUser.getUsername(),
          brokerContext != null && brokerContext.getIdpConfig() != null
              ? brokerContext.getIdpConfig().getAlias()
              : "unknown");
      return;
    }

    LOG.infof(
        "Importing eHerkenning claims for user '%s'; available keys: %s",
        currentUser.getUsername(),
        claims.keySet().stream().sorted().collect(Collectors.joining(",")));

    setClaimBackedAttribute(currentUser, claims, LEGAL_SUBJECT_ID_CLAIM, "kvk");
    setClaimBackedAttribute(currentUser, claims, COMPANY_NAME_CLAIM, "companyName");
  }

  private static void setClaimBackedAttribute(
      UserModel currentUser, Map<String, Object> claims, String claimName, String attributeName) {
    String value = resolveClaimStringValue(claims, claimName);
    if (value == null || value.isBlank()) {
      return;
    }

    currentUser.setAttribute(attributeName, List.of(value.trim()));
  }

  private static Map<String, Object> readBrokerClaims(
      KeycloakSession session,
      RealmModel realm,
      UserModel currentUser,
      BrokeredIdentityContext brokerContext, SerializedBrokeredIdentityContext serializedCtx) {
    Map<String, Object> claims = readClaims(brokerContext != null ? brokerContext.getToken() : null);
    if (!claims.isEmpty()) {
      return claims;
    }

    claims = readClaims(serializedCtx != null ? serializedCtx.getToken() : null);
    if (!claims.isEmpty()) {
      return claims;
    }

    claims = readClaimsFromAttributes(serializedCtx);
    if (!claims.isEmpty()) {
      return claims;
    }

    claims = readClaimsFromContextData(brokerContext);
    if (!claims.isEmpty()) {
      return claims;
    }

    claims = readClaimsFromContextData(serializedCtx);
    if (!claims.isEmpty()) {
      return claims;
    }

    return readClaimsFromLinkedIdentity(session, realm, currentUser, brokerContext);
  }

  private static Map<String, Object> readClaims(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return Map.of();
    }

    String token = rawToken.trim();

    try {
      if (token.startsWith("{")) {
        Map<String, Object> tokenPayload = JsonSerialization.readValue(token, MAP_TYPE);
        Object idToken = tokenPayload.get("id_token");
        if (idToken instanceof String idTokenString && !idTokenString.isBlank()) {
          Map<String, Object> claims = readJwtClaims(idTokenString);
          if (!claims.isEmpty()) {
            return claims;
          }
        }

        Object accessToken = tokenPayload.get("access_token");
        if (accessToken instanceof String accessTokenString && !accessTokenString.isBlank()) {
          Map<String, Object> claims = readJwtClaims(accessTokenString);
          if (!claims.isEmpty()) {
            return claims;
          }
        }

        return tokenPayload;
      }

      return readJwtClaims(token);
    } catch (Exception error) {
      LOG.warnf(error, "Failed to parse broker token for user attribute import");
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

  private static Map<String, Object> readClaimsFromAttributes(
      SerializedBrokeredIdentityContext serializedCtx) {
    if (serializedCtx == null) {
      return Map.of();
    }

    Map<String, List<String>> attributes = serializedCtx.getAttributes();
    if (attributes == null || attributes.isEmpty()) {
      return Map.of();
    }

    Map<String, Object> claims = new LinkedHashMap<>();
    attributes.forEach(
        (name, values) -> {
          String key = normalizeClaimKey(name);
          String value = firstNonBlank(values);
          if (key == null || value == null) {
            return;
          }
          claims.put(key, value);
        });
    return claims;
  }

  private static Map<String, Object> readClaimsFromContextData(Object brokerCtx) {
    if (brokerCtx == null) {
      return Map.of();
    }

    Object contextData = invokeNoArgMethod(brokerCtx, "getContextData");
    if (!(contextData instanceof Map<?, ?> rawMap) || rawMap.isEmpty()) {
      return Map.of();
    }

    Map<String, Object> directClaims = new LinkedHashMap<>();
    for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
      String rawKey = entry.getKey() instanceof String key ? key : null;
      if (rawKey == null || rawKey.isBlank()) {
        continue;
      }

      String key = normalizeClaimKey(rawKey);
      if (key == null) {
        continue;
      }

      Object value = entry.getValue();
      if (value instanceof Map<?, ?> nestedMap) {
        Map<String, Object> nestedClaims = mapToStringObjectMap(nestedMap);
        if (!nestedClaims.isEmpty()) {
          return nestedClaims;
        }
        continue;
      }

      Map<String, Object> parsedTokenCarrier = readClaimsFromTokenCarrier(value);
      if (!parsedTokenCarrier.isEmpty()) {
        return parsedTokenCarrier;
      }

      String normalizedValue = toTrimmedString(value);
      if (normalizedValue != null) {
        directClaims.put(key, normalizedValue);
      }
    }

    return directClaims;
  }

  private static Map<String, Object> readClaimsFromTokenCarrier(Object value) {
    if (value == null) {
      return Map.of();
    }

    if (value instanceof String tokenString) {
      return readClaims(tokenString);
    }

    for (String getterName : List.of("getIdToken", "getAccessToken", "getToken")) {
      Object candidate = invokeNoArgMethod(value, getterName);
      if (candidate instanceof String token && !token.isBlank()) {
        Map<String, Object> parsed = readClaims(token);
        if (!parsed.isEmpty()) {
          return parsed;
        }
      }
    }

    String asString = value.toString();
    if (asString != null && asString.startsWith("{")) {
      Map<String, Object> parsed = readClaims(asString);
      if (!parsed.isEmpty()) {
        return parsed;
      }
    }

    return Map.of();
  }

  private static Map<String, Object> readClaimsFromLinkedIdentity(
      KeycloakSession session,
      RealmModel realm,
      UserModel currentUser,
      BrokeredIdentityContext brokerContext) {
    if (session == null || realm == null || currentUser == null) {
      return Map.of();
    }

    String providerAlias =
        brokerContext != null && brokerContext.getIdpConfig() != null
            ? brokerContext.getIdpConfig().getAlias()
            : null;

    FederatedIdentityModel link = null;
    if (providerAlias != null && !providerAlias.isBlank()) {
      link = session.users().getFederatedIdentity(realm, currentUser, providerAlias);
    }

    if (link == null) {
      try (Stream<FederatedIdentityModel> stream =
          session.users().getFederatedIdentitiesStream(realm, currentUser)) {
        link =
            stream
                .filter(Objects::nonNull)
                .filter(
                    identity ->
                        providerAlias == null
                            || providerAlias.isBlank()
                            || identity.getIdentityProvider().equalsIgnoreCase(providerAlias))
                .findFirst()
                .orElse(null);
      }
    }

    if (link == null) {
      return Map.of();
    }

    return readClaims(link.getToken());
  }

  private static Map<String, Object> mapToStringObjectMap(Map<?, ?> input) {
    if (input.isEmpty()) {
      return Map.of();
    }

    Map<String, Object> output = new LinkedHashMap<>();
    for (Map.Entry<?, ?> entry : input.entrySet()) {
      String key = entry.getKey() instanceof String rawKey ? normalizeClaimKey(rawKey) : null;
      if (key == null) {
        continue;
      }

      Object value = entry.getValue();
      if (value == null) {
        continue;
      }

      output.put(key, value);
    }
    return output;
  }

  private static Object invokeNoArgMethod(Object target, String methodName) {
    try {
      return target.getClass().getMethod(methodName).invoke(target);
    } catch (Exception ignored) {
      return null;
    }
  }

  private static String resolveClaimStringValue(Map<String, Object> claims, String claimName) {
    if (claims == null || claims.isEmpty() || claimName == null || claimName.isBlank()) {
      return null;
    }

    String direct = toTrimmedString(claims.get(claimName));
    if (direct != null) {
      return direct;
    }

    String escapedDots = claimName.replace(".", "\\.");
    if (!escapedDots.equals(claimName)) {
      String escaped = toTrimmedString(claims.get(escapedDots));
      if (escaped != null) {
        return escaped;
      }
    }

    for (Map.Entry<String, Object> entry : claims.entrySet()) {
      String key = normalizeClaimKey(entry.getKey());
      if (key == null || !key.equals(claimName)) {
        continue;
      }

      String resolved = toTrimmedString(entry.getValue());
      if (resolved != null) {
        return resolved;
      }
    }

    return null;
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

  private static String firstNonBlank(List<String> values) {
    if (values == null || values.isEmpty()) {
      return null;
    }

    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
  }

  private static String toTrimmedString(Object rawValue) {
    if (rawValue == null) {
      return null;
    }

    if (rawValue instanceof String stringValue) {
      return stringValue.isBlank() ? null : stringValue.trim();
    }

    if (rawValue instanceof List<?> values) {
      return values.stream()
          .map(PortalLinkAuthenticatedUserAuthenticator::toTrimmedString)
          .filter(Objects::nonNull)
          .findFirst()
          .orElse(null);
    }

    String stringified = String.valueOf(rawValue);
    if (stringified == null || stringified.isBlank()) {
      return null;
    }

    return stringified.trim();
  }

  private static UserModel getCurrentUser(KeycloakSession session, RealmModel realm) {
    AuthenticationManager.AuthResult authResult =
        AuthenticationManager.authenticateIdentityCookie(session, realm, true);
    if (authResult == null) {
      return null;
    }

    UserModel currentUser = authResult.getUser();
    if (currentUser == null || !currentUser.isEnabled()) {
      return null;
    }

    return currentUser;
  }

  private static boolean supportsProvider(
      AuthenticatorConfigModel authenticatorConfig, IdentityProviderModel identityProvider) {
    if (identityProvider == null) {
      return false;
    }

    if (authenticatorConfig == null) {
      return true;
    }

    Map<String, String> config = authenticatorConfig.getConfig();
    if (config == null) {
      return true;
    }

    String allowedAliases = config.get(IDENTITY_PROVIDER_ALIASES);
    if (allowedAliases == null || allowedAliases.isBlank()) {
      return true;
    }

    String currentAlias = identityProvider.getAlias();
    return Stream.of(allowedAliases.split(","))
        .map(String::trim)
        .filter(alias -> !alias.isEmpty())
        .map(alias -> alias.toLowerCase(Locale.ROOT))
        .anyMatch(alias -> alias.equals(currentAlias.toLowerCase(Locale.ROOT)));
  }
}
