// import Keycloak from 'keycloak-js';

// export const keycloak = new Keycloak({
//     url: process.env.NEXT_PUBLIC_KEYCLOAK_BASE_URL + '/keycloak',
//     realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
//     clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
// });

// export const initializeKeycloak = async () => {
//     try {
//         const authenticated = await keycloak.init({
//             onLoad: 'login-required',
//             checkLoginIframe: false,
//             enableLogging: true  // Enable Keycloak debug logging
//         });
//         if (authenticated) {
//             console.log('User is authenticated');
//         } else {
//             console.log('User is not authenticated');
//         }
//         return authenticated;
//     } catch (error) {
//         console.error('Failed to initialize adapter:', error);
//         return false;
//     }
// };
