package onboarding.keycloak.email;

import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.services.resource.RealmResourceProvider;
import org.keycloak.services.resource.RealmResourceProviderFactory;

public class ProposalEmailEndpointFactory implements RealmResourceProviderFactory {

  @Override
  public String getId() {
    // URL: /realms/{realm}/onboarding/...
    return "onboarding";
  }

  @Override
  public RealmResourceProvider create(KeycloakSession session) {
    return new RealmResourceProvider() {
      private final ProposalEmailEndpoint resource = new ProposalEmailEndpoint(session);

      @Override public Object getResource() { return resource; }
      @Override public void close() {}
    };
  }

  @Override public void init(org.keycloak.Config.Scope config) {}
  @Override public void postInit(KeycloakSessionFactory factory) {}
  @Override public void close() {}
}