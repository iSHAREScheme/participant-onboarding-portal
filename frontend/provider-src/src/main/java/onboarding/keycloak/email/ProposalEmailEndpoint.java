package onboarding.keycloak.email;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import jakarta.json.JsonObject;

import org.keycloak.email.EmailException;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.models.*;
import org.keycloak.theme.Theme;
import org.keycloak.http.HttpRequest;
import org.keycloak.services.resource.RealmResourceProvider;
import java.util.Map;
import java.util.logging.Logger;
import java.util.logging.Level;

public class ProposalEmailEndpoint implements RealmResourceProvider {
    private final KeycloakSession session;
    @Context
    HttpRequest request;

    private static final String[] ALLOWED_ORIGINS = new String[] {
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    };

    private String requestOrigin() {
        if (request != null && request.getHttpHeaders() != null) {
            // Prefer exact header; Resteasy headers are case-insensitive
            String origin = request.getHttpHeaders().getHeaderString("Origin");
            if (origin == null || origin.isEmpty()) {
                // Some environments only expose via requestHeaders map
                try {
                    origin = request.getHttpHeaders().getRequestHeaders().getFirst("Origin");
                } catch (Throwable ignored) {}
            }
            if (origin != null) return origin;
        }
        return "";
    }

    private boolean isAllowedOrigin(String origin) {
        if (origin == null || origin.isEmpty()) return false;
        for (String o : ALLOWED_ORIGINS) if (o.equalsIgnoreCase(origin)) return true;
        return false;
    }

    private Response withCors(Response.ResponseBuilder rb) {
        String origin = requestOrigin();
        if (isAllowedOrigin(origin)) {
            rb.header("Access-Control-Allow-Origin", origin)
            .header("Access-Control-Allow-Credentials", "true")
            .header("Vary", "Origin");
        }
        return rb.build();
    }

    /** Holder for template references resolved from notifyType */
    private static final class NotificationTemplate {
        final String subjectRef;
        final String bodyRef;

        NotificationTemplate(String subjectRef, String bodyRef) {
            this.subjectRef = subjectRef;
            this.bodyRef = bodyRef;
        }
    }

    /** Ensures an .ftl suffix for a template reference */
    private static String ensureFtl(String ref) {
        if (ref == null || ref.isEmpty()) return ref;
        return ref.endsWith(".ftl") ? ref : ref + ".ftl";
    }

    /** Try to resolve a template in the current realm's email theme; logs a warning if missing. */
    private boolean templateExists(RealmModel realm, String templateRef) {
        String file = ensureFtl(templateRef);
        String[] candidates = new String[] {
            "email/html/" + file,
            "email/text/" + file,
            "email/" + file
        };
        try {
            Theme theme = session.theme().getTheme(realm.getEmailTheme(), Theme.Type.EMAIL);
            Logger.getLogger(ProposalEmailEndpoint.class.getName())
                  .log(Level.INFO, () -> "[theme] name=" + theme.getName() + ", type=" + theme.getType() + ", realmEmailTheme=" + realm.getEmailTheme());
            for (String path : candidates) {
                try (java.io.InputStream is = theme.getResourceAsStream(path)) {
                    if (is != null) {
                        Logger.getLogger(ProposalEmailEndpoint.class.getName())
                              .log(Level.INFO, "Template FOUND: " + path);
                        return true;
                    } else {
                        Logger.getLogger(ProposalEmailEndpoint.class.getName())
                              .log(Level.FINE, "Template not found at: " + path);
                    }
                }
            }
            Logger.getLogger(ProposalEmailEndpoint.class.getName())
                  .log(Level.WARNING, "Template missing (checked): " + java.util.Arrays.toString(candidates));
            return false;
        } catch (Exception e) {
            Logger.getLogger(ProposalEmailEndpoint.class.getName())
                  .log(Level.WARNING, "Error checking email template for ref: " + templateRef, e);
            return false;
        }
    }

    public ProposalEmailEndpoint(KeycloakSession session) {
        this.session = session;
    }

    @Override public Object getResource() { return this; }

    @OPTIONS @Path("onboarding-notifications")
    public Response corsPreflight() {
        String origin = requestOrigin();
        System.out.println("[onboarding] CORS preflight /onboarding-notifications");
        Response.ResponseBuilder rb = Response.status(Response.Status.NO_CONTENT)
            .header("Access-Control-Allow-Origin", '*') // FIXME: CORS origin in provider...
            .header("Access-Control-Allow-Methods", "POST, OPTIONS")
            .header("Access-Control-Allow-Headers", "Authorization, Content-Type");
        return withCors(rb);
    }

    @GET @Path("ping")
    @Produces(MediaType.APPLICATION_JSON)
    public Response ping() {
        return withCors(Response.ok("{\"pong\":true}"));
    }

    @POST @Path("onboarding-notifications")
    @Consumes(MediaType.APPLICATION_JSON) @Produces(MediaType.APPLICATION_JSON)
    public Response send(JsonObject body) {
        RealmModel realm = session.getContext().getRealm();
        RoleModel role   = realm.getRole("onboarding-admin");
        if (role == null) return Response.status(404).entity("Role missing").build();

        String notifyType   = body.getString("notifyType", "unknown");

        // Resolve subject/body references based on notifyType
        NotificationTemplate notification = switch (notifyType) {
            case "proposal_created" -> new NotificationTemplate("proposalCreatedSubject", "proposalCreatedBody.ftl");
            case "proposal_review" -> new NotificationTemplate("proposalInReviewSubject", "proposalInReviewBody.ftl");
            case "proposal_accepted" -> new NotificationTemplate("proposalAcceptedSubject", "proposalAcceptedBody.ftl");
            case "proposal_rejected" -> new NotificationTemplate("proposalRejectedSubject", "proposalRejectedBody.ftl");

            case "agreement_created" -> new NotificationTemplate("agreementUploadedSubject", "agreementUploadedBody.ftl");
            case "agreement_review" -> new NotificationTemplate("agreementInReviewSubject", "agreementInReviewBody.ftl");
            case "agreement_accepted" -> new NotificationTemplate("agreementAcceptedSubject", "agreementAcceptedBody.ftl");
            case "agreement_rejected" -> new NotificationTemplate("agreementRejectedSubject", "agreementRejectedBody.ftl");

            default -> new NotificationTemplate("default.subject", "default.body");
        };
        
        String proposedBy   = body.getString("keycloakUsername", "unknown");

        // Get domain from environment variable
        String frontendDomain = System.getenv("NEXT_PUBLIC_FRONTEND_DOMAIN");

        String proposalLink;
        if (frontendDomain != null && !frontendDomain.isEmpty()) {
            proposalLink = frontendDomain + "/admin/proposals";
        } else {
            proposalLink = body.getString("proposalLink", "https://example.org/admin/proposals");
        }

        // template args
        Map<String,Object> attrs = new java.util.HashMap<>();
        attrs.put("proposedBy", proposedBy);
        attrs.put("proposalLink", proposalLink);

        EmailTemplateProvider etp = session.getProvider(EmailTemplateProvider.class)
                                           .setRealm(realm);

        Logger.getLogger(ProposalEmailEndpoint.class.getName())
              .info("Sending proposal notification to onboarding-admins");
        // Prepare templates: subject is a bundle key; body is an .ftl under email/html/
        String subjectKey   = notification.subjectRef;           // e.g. messages property key
        String bodyTemplate = ensureFtl(notification.bodyRef);   // ensure .ftl for the body
        session.users()
               .getRoleMembersStream(realm, role)
               .forEach(u -> {
                   try {
                       etp.setUser(u)
                          .send(subjectKey,
                                bodyTemplate,
                                attrs);
                   } catch (EmailException e) {
                       String userInfo = String.format("userId=%s, email=%s, username=%s", u.getId(), u.getEmail(), u.getUsername());
                       String themeName = realm.getEmailTheme();
                       // quick checks: does subject key exist in messages? do html/text variants exist?
                       boolean bodyExists = templateExists(realm, bodyTemplate);
                       boolean textExists = templateExists(realm, bodyTemplate.replace(".ftl", ".ftl"));
                       java.util.Set<String> messageKeys = new java.util.HashSet<>();
                       try {
                           Theme th = session.theme().getTheme(themeName, Theme.Type.EMAIL);
                           java.util.Properties msgs = th.getMessages(null);
                           if (msgs != null) messageKeys.addAll(msgs.stringPropertyNames());
                       } catch (Exception ignore) {}
                       boolean subjectKeyPresent = messageKeys.contains(subjectKey);

                       Logger.getLogger(ProposalEmailEndpoint.class.getName()).log(
                           Level.WARNING,
                           "Failed to template email. Details: subjectKey={0}, bodyTemplate={1}, theme={2}, subjectKeyPresent={3}, bodyExists={4}, textExists={5}, attrsKeys={6}, {7}",
                           new Object[]{ subjectKey, bodyTemplate, themeName, subjectKeyPresent, bodyExists, textExists, attrs.keySet(), userInfo }
                       );
                       Logger.getLogger(ProposalEmailEndpoint.class.getName()).log(Level.WARNING, "Exception:", e);
                   }
               });

        return withCors(Response.ok("{\"ok\":true}"));
    }
    @Override public void close() { }
}
