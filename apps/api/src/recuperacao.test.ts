import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { montagemDe, recuperarDados } from "./recuperacao";

const pastas: string[] = [];

function pasta(): string {
  const p = mkdtempSync(join(tmpdir(), "nupe-recuperacao-"));
  pastas.push(p);
  return p;
}

function escrever(path: string, admin: boolean, respostas: number): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ admin: admin ? { name: "Teste", email: "teste@exemplo.br" } : null, entries: Array.from({ length: respostas }, () => ({})) }),
    "utf8",
  );
}

afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe("recuperação do arquivo de dados", () => {
  it("mantém o arquivo configurado quando ele já tem administrador", () => {
    const raiz = pasta();
    const config = join(raiz, "novo", "nupe.json");
    escrever(config, true, 2);
    const legado = join(raiz, "antigo", "nupe.json");
    escrever(legado, true, 50);

    const r = recuperarDados(config, [legado], false);

    expect(r.path).toBe(config);
    expect(r.restauradoDe).toBeNull();
  });

  it("usa o arquivo antigo quando o novo está vazio", () => {
    const raiz = pasta();
    const config = join(raiz, "novo", "nupe.json");
    const legado = join(raiz, "antigo", "nupe.json");
    escrever(legado, true, 12);

    const r = recuperarDados(config, [legado], false);

    expect(r.path).toBe(legado);
    expect(r.restauradoDe).toBe(legado);
    expect(r.candidatos.find((c) => c.path === legado)?.admin).toBe(true);
  });

  it("restaura a cópia diária mais recente quando nenhum arquivo principal tem administrador", () => {
    const raiz = pasta();
    const config = join(raiz, "novo", "nupe.json");
    const pastaAntiga = join(raiz, "dados");
    const copia = join(pastaAntiga, "backups", "nupe-2026-11-05.json");
    escrever(copia, true, 7);

    const r = recuperarDados(config, [join(pastaAntiga, "nupe.json")], false);

    expect(r.path).toBe(join(pastaAntiga, "nupe.json"));
    expect(r.restauradoDe).toBe(copia);
    expect(r.candidatos.some((c) => c.path === r.path && c.admin && c.entradas === 7)).toBe(true);
  });

  it("não troca nada quando não encontra administrador em lugar nenhum", () => {
    const raiz = pasta();
    const config = join(raiz, "novo", "nupe.json");
    escrever(config, false, 0);

    const r = recuperarDados(config, [join(raiz, "antigo", "nupe.json")], false);

    expect(r.path).toBe(config);
    expect(r.restauradoDe).toBeNull();
  });
});

describe("montagem do volume", () => {
  it("não quebra fora do Linux", () => {
    const r = montagemDe("E:/nupe/data/dev.json");
    expect(r.desconhecido || r.volume !== null).toBe(true);
  });
});
