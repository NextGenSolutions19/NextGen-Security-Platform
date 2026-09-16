export interface SocietyRow {
  id: string;
  society_code: string;
  name: string;
  status: "active" | "disabled";
}

export interface AppUserRow {
  id: string;
  login_id: string;
  password_hash: string;
  role: "guard" | "society_admin";
  society_id: string;
  status: "active" | "disabled";
  must_change_password: boolean;
  is_authorized_admin: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  societies?: SocietyRow | SocietyRow[] | null;
}

export interface AuthSessionResponse {
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: {
      id: string;
      loginId: string;
      role: "guard" | "society_admin";
      societyId: string;
      societyCode: string;
      societyName: string;
      mustChangePassword: boolean;
      isAuthorizedAdmin?: boolean;
    };
  };
}

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
