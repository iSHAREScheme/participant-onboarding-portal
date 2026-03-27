package onboarding.keycloak.events;

import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

public final class EherkenningClaimSyncEventListenerProviderFactory
    implements EventListenerProviderFactory {
  public static final String ID = "eherkenning-claim-sync";

  @Override
  public EventListenerProvider create(KeycloakSession session) {
    return new EherkenningClaimSyncEventListenerProvider(session);
  }

  @Override
  public void init(Config.Scope config) {}

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {}

  @Override
  public String getId() {
    return ID;
  }
}
