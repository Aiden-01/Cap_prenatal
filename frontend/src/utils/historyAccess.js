import { ACCESS, canAccess } from './accessRules';

export function canViewHistory(usuario) {
  return canAccess(usuario, ACCESS.history);
}
