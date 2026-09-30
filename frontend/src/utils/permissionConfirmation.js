export function requiresVihConfirmation(originalPermissions, selectedPermissions) {
  return !originalPermissions.includes('controles.ver_vih')
    && selectedPermissions.includes('controles.ver_vih');
}
