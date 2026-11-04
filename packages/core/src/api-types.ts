/** Contrato HTTP compartilhado entre API e PWA. */
import type { Audience } from "./surveys";
import type { CollectionStatus } from "./types";

export interface PublicSurveyView {
  audience: Audience;
  title: string;
  intro: string;
  status: "aberta" | "encerrada" | "indisponivel";
  closesAt: string | null;
  /** Tokens de verificação exibidos ao terminal. */
  requireCaptcha?: boolean;
}

export interface AdminCounts {
  audience: Audience;
  total: number;
}

export interface LoginBody {
  email: string;
  password: string;
}
