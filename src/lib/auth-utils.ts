import type { User } from 'firebase/auth';
import type { Profile } from '@/lib/types';

export const MASTER_ADMIN_EMAIL = 'francisco.villarreal@outlook.es';

/**
 * Determina si un usuario autenticado cuenta con privilegios de Administrador.
 * 
 * Reglas de negocio:
 * 1. francisco.villarreal@outlook.es es siempre Administrador Maestro con acceso total permanente.
 * 2. Si el perfil asociado tiene la propiedad opcional `isAdmin: true`, también se le otorga rol de admin.
 * 3. No altera perfiles existentes en Firestore.
 */
export function isAdminUser(
  user?: User | { email?: string | null } | null,
  profile?: Profile | null
): boolean {
  if (!user) return false;
  if (user.email && user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  if (profile?.isAdmin === true) {
    return true;
  }
  return false;
}
