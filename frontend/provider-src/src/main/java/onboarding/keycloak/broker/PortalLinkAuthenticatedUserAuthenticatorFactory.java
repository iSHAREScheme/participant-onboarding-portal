package onboarding.keycloak.broker;

import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

public final class PortalLinkAuthenticatedUserAuthenticatorFactory implements AuthenticatorFactory {
  public static final String PROVIDER_ID = "portal-link-authenticated-user";

  private static final PortalLinkAuthenticatedUserAuthenticator SINGLETON =
      new PortalLinkAuthenticatedUserAuthenticator();

  private static final Requirement[] REQUIREMENT_CHOICES =
      new Requirement[] {Requirement.REQUIRED, Requirement.ALTERNATIVE, Requirement.DISABLED};

  private static final ProviderConfigProperty IDP_ALIASES = new ProviderConfigProperty();

  static {
    IDP_ALIASES.setName(PortalLinkAuthenticatedUserAuthenticator.IDENTITY_PROVIDER_ALIASES);
    IDP_ALIASES.setLabel("Identity provider aliases");
    IDP_ALIASES.setType(ProviderConfigProperty.STRING_TYPE);
    IDP_ALIASES.setHelpText(
        "Comma-separated provider aliases that may reuse the currently authenticated portal user."
            + " Leave blank to allow all providers.");
    IDP_ALIASES.setDefaultValue("eHerkenning");
  }

  @Override
  public String getId() {
    return PROVIDER_ID;
  }

  @Override
  public String getDisplayType() {
    return "Portal link authenticated user";
  }

  @Override
  public String getHelpText() {
    return "When first broker login starts while a portal user is already authenticated in this"
        + " browser, reuse that user instead of creating a broker-only account.";
  }

  @Override
  public String getReferenceCategory() {
    return "portalLinkCurrentUser";
  }

  @Override
  public Authenticator create(KeycloakSession session) {
    return SINGLETON;
  }

  @Override
  public void init(Config.Scope config) {}

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {}

  @Override
  public boolean isConfigurable() {
    return true;
  }

  @Override
  public Requirement[] getRequirementChoices() {
    return REQUIREMENT_CHOICES;
  }

  @Override
  public boolean isUserSetupAllowed() {
    return false;
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return List.of(IDP_ALIASES);
  }
}
