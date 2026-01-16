export const checkAuth = async (keycloak: any) => {
    try {
        if (keycloak.authenticated) {
            return true;
        }

        const authenticated = await keycloak.init({
            onLoad: 'check-sso',
            pkceMethod: 'S256',
            silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
            checkLoginIframe: false
        })

        // console.log('[CheckAuth] Authenticated', authenticated)
        return authenticated

    } catch (error) {
        console.error('Keycloak init error:', error);
        return false;
    }
};