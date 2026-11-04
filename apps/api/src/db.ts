/**
 * Armazenamento persistente em arquivo JSON, com escrita atômica e fila de
 * gravação. Adequado a uma instalação de baixo volume (estagiário + coleta).
 * Para volume maior, troque o `load`/`flush` por um driver SQL.
 */
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Audience, Collection, DiaryRow, Entry, Flow, GlossaryRow, Improvement, Matrices, OpenResponse, SystemRecord, Theme } from "@nupe/core";
import { SUGGESTED_THEMES } from "@nupe/core";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ContestRecord {
  /** Sessão anônima existente no início do fluxo — impede envio repetido. */
  sessionId: string;
  createdAt: string;
}

export interface NumbersRowRecord {
  id: string;
  indicator: string;
  value: string;
  source: string;
}

export interface ProcedureRecord {
  id: string;
  procedure: string;
  base: string;
  responsible: string;
  deadline: string;
}

export interface ImprovementRec extends Improvement {
  id: string;
  updatedAt: string;
}

export interface InstitutionRecord {
  fields: Record<string, string>;
  numbers: NumbersRowRecord[];
  updatedAt: string;
}

export interface SettingsRecord {
  displayName: string;
  startDate: string;
  endDate: string;
  supervisor: string;
  course: string;
  updatedAt: string;
  /** Pausa a coleta aberta após X envios do mesmo endereço por hora (0 = desligado). */
  rateLimitPerHour: number;
}

export interface DailyVisit {
  date: string;
  count: number;
}

export interface DB {
  schemaVersion: number;
  admin: AdminUser | null;
  sessions: SessionRecord[];
  collections: Collection[];
  entries: Entry[];
  openResponses: OpenResponse[];
  themes: Theme[];
  contest: Record<string, ContestRecord[]>;
  institution: InstitutionRecord;
  flows: Flow[];
  systems: SystemRecord[];
  procedures: ProcedureRecord[];
  improvement: ImprovementRec;
  diary: DiaryRow[];
  glossary: GlossaryRow[];
  matrices: Matrices;
  settings: SettingsRecord;
  visits: DailyVisit[];
  /** Rótulo do conjunto fictício de demonstração ativo, ou null. */
  demo: string | null;
  /** Última versão aceita por ficha gravada em bloco (evita gravação velha sobrescrever nova). */
  recordVersions: Record<string, number>;
  log: Array<{ at: string; action: string; detail?: string }>;
}

export function emptyDb(): DB {
  return {
    schemaVersion: 1,
    admin: null,
    sessions: [],
    collections: [],
    entries: [],
    openResponses: [],
    themes: SUGGESTED_THEMES.map((t) => ({ id: t.id, label: t.label, keywords: t.keywords })),
    contest: {},
    institution: { fields: {}, numbers: [], updatedAt: new Date(0).toISOString() },
    flows: [],
    systems: [],
    procedures: [],
    improvement: { id: "principal", idea: "", fiveW2H: {}, pdca: {}, updatedAt: new Date(0).toISOString() },
    diary: [],
    glossary: [],
    matrices: {
      porter: { clientes: [], fornecedores: [], concorrentes: [], novosEntrantes: [], substitutos: [] },
      swot: { forcas: [], fraquezas: [], oportunidades: [], ameacas: [] },
      gut: [],
      notes: {},
    },
    settings: {
      displayName: "NUPE — UNEB Campus XXI",
      startDate: "",
      endDate: "",
      supervisor: "",
      course: "",
      updatedAt: new Date(0).toISOString(),
      rateLimitPerHour: 30,
    },
    visits: [],
    demo: null,
    recordVersions: {},
    log: [],
  };
}

/** Remove respostas individuais para telemetria pública e nunca guarda IP. */
export function ensureCollections(database: DB): void {
  const audiences: Audience[] = ["docentes", "estudantes", "equipe"];
  for (const a of audiences) {
    if (!database.collections.some((c) => c.audience === a)) {
      database.collections.push({
        id: crypto.randomUUID(),
        publicId: null,
        audience: a,
        status: "rascunho",
        label: `${a[0]!.toUpperCase()}${a.slice(1)} — primeira coleta`,
        opensAt: null,
        closesAt: null,
        createdAt: new Date().toISOString(),
        responses: 0,
      });
    }
  }
}

export class Store {
  readonly path: string;
  data: DB;
  private queue: Promise<void> = Promise.resolve();
  private pending = false;
  /** Número da última chamada de save(); diz qual rodada já foi gravada. */
  private marcador = 0;
  private ultimaGravacao = 0;
  /** Falso enquanto o disco se mostrou inutilizável; volta a tentar depois. */
  private podeGravar = false;

  private constructor(path: string, data: DB) {
    this.path = path;
    this.data = data;
  }

  static async open(path: string): Promise<Store> {
    const store = await Store.carregar(path);
    // Sondagem única: se o disco aceita gravação, o resto da vida do processo
    // grava direto. Se não, tudo fica em memória sem repetir o erro a cada ação.
    try {
      await mkdir(dirname(path), { recursive: true });
      await store.gravarAgora();
      store.podeGravar = true;
    } catch (e) {
      console.warn(`[NUPE] Sem gravação em ${path}: ${e instanceof Error ? e.message : e}`);
      console.warn(
        "[NUPE] Rodando em memória: os dados valem só enquanto o servidor estiver de pé. " +
          "Em hospedagem, monte um disco e defina NUPE_DATA para um caminho nele.",
      );
    }
    return store;
  }

  private static async carregar(path: string): Promise<Store> {
    let data: DB;
    if (existsSync(path)) {
      const raw = await readFile(path, "utf8");
      data = migrate(JSON.parse(raw) as Partial<DB>);
    } else {
      data = emptyDb();
    }
    ensureCollections(data);
    return new Store(path, data);
  }

  /** Grava agora, sem fila: usado pela sondagem e pela própria fila. */
  private async gravarAgora(): Promise<void> {
    const tmp = join(dirname(this.path), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(this.data), "utf8");
      await rename(tmp, this.path);
    } catch (e) {
      // Gravação pela metade não pode deixar lixo ao lado do arquivo bom.
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }

  /** Persiste de forma atômica (tmp + rename). Chamadas são serializadas. */
  save(): Promise<void> {
    // Sem disco utilizável, não há o que esperar: o chamador segue a vida.
    if (!this.podeGravar) return Promise.resolve();
    this.pending = true;
    const inicio = ++this.marcador;
    // A fila não pode quebrar: sem o catch a seguir, uma gravação com erro
    // interromperia todas as seguintes e os dados parariam de ser salvos.
    const tarefa = this.queue.catch(() => {}).then(async () => {
      // Só grava se ainda houver algo pendente E ninguém gravou depois de mim.
      // Assim a primeira chamada de uma rodada percebe a falha, e as chamadas
      // seguintes de uma rodada já gravada não repetem a escrita.
      if (!this.pending || this.ultimaGravacao > inicio) return;
      this.pending = false;
      try {
        await this.gravarAgora();
        // Só conta como gravada depois do sucesso; se falhar, a próxima chamada
        // tenta de novo em vez de achar que a rodada já foi salva.
        this.ultimaGravacao = inicio;
      } catch (e) {
        // O disco sumiu ou virou somente leitura no meio do uso. Para de tentar,
        // avisa uma vez, segue em memória e informa quem chamou.
        this.podeGravar = false;
        console.warn(
          `[NUPE] Falha ao gravar ${this.path}: ${e instanceof Error ? e.message : e}. ` +
            "O servidor segue em memória até reiniciar; verifique o disco.",
        );
        throw e;
      }
    });
    this.queue = tarefa.catch(() => {});
    return tarefa;
  }

  /** Aguarda gravações pendentes antes de encerrar. */
  async close(): Promise<void> {
    try {
      await this.save();
    } catch {
      // Já avisou no console; encerrar não pode travar por causa disso.
    }
    await this.queue;
  }

  note(action: string, detail?: string): void {
    this.data.log.push({ at: new Date().toISOString(), action, detail });
    if (this.data.log.length > 500) this.data.log.splice(0, this.data.log.length - 500);
  }
}

function migrate(partial: Partial<DB>): DB {
  const base = emptyDb();
  return {
    ...base,
    ...partial,
    institution: { ...base.institution, ...(partial.institution ?? {}) },
    matrices: { ...base.matrices, ...(partial.matrices ?? {}) },
    settings: { ...base.settings, ...(partial.settings ?? {}) },
    themes: partial.themes?.length ? partial.themes : base.themes,
    contest: partial.contest ?? {},
    log: partial.log ?? [],
    visits: partial.visits ?? [],
    demo: partial.demo ?? null,
    recordVersions: partial.recordVersions ?? {},
  };
}
