import * as PATH from './path';

const AdherenceStatusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'revoked', label: 'Revoked' },
    { value: 'not_active', label: 'Not Active' },
    { value: 'pending', label: 'Pending' }
];

const AuthorisationRegistryIDOptions = [
    { value: 'EU.EORI.NL000000004', label: 'EU.EORI.NL000000004' },
    { value: 'EU.EORI.XX000000001', label: 'EU.EORI.XX000000001' }
];

const AuthorisationRegistryNameOptions = [
    { value: 'iSHARE Test Authorization Registry', label: 'iSHARE Test Authorization Registry' },
    { value: 'Example Authorization Registry', label: 'Example Authorization Registry' }
]

export {
    PATH,
    AdherenceStatusOptions,
    AuthorisationRegistryIDOptions,
    AuthorisationRegistryNameOptions
}
