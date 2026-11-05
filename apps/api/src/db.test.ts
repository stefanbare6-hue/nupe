import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, emptyDb } from "./db";

function pasta() {
  return mkdtempSync(join(tmpdir(), "nupe-db-"));
}

describe("armazenamento em arquivo", () => {
  it("grava de forma atômica: nenhum arquivo temporário fica para trás", async () => {
    const dir = pasta();
    const arquivo = join(dir, "sub", "dados.json");
    const store = await Store.open(arquivo);
    expect(existsSync(arquivo)).toBe(true);
    for (let i = 0; i < 5; i++) {
      store.data.settings.displayName = `versão ${i}`;
      await store.save();
    }
    await store.close();
    // A pasta de backups é a única coisa além do arquivo principal.
    expect(readdirSync(join(dir, "sub")).sort()).toEqual(["backups", "dados.json"]);
    const lido = JSON.parse(readFileSync(arquivo, "utf8"));
    expect(lido.settings.displayName).toBe("versão 4");
    rmSync(dir, { recursive: true, force: true });
  });

  it("mantém uma cópia por dia, feita na abertura", async () => {
    const dir = pasta();
    const arquivo = join(dir, "dados.json");
    const primeiro = await Store.open(arquivo);
    primeiro.data.settings.displayName = "retrato do dia";
    await primeiro.save();
    await primeiro.close();
    const pastaBackup = join(dir, "backups");
    const copias = readdirSync(pastaBackup);
    expect(copias).toHaveLength(1);
    expect(copias[0]).toMatch(/^nupe-\d{4}-\d{2}-\d{2}\.json$/);
    // A cópia é a foto da abertura do dia; o arquivo principal tem a versão mais nova.
    expect(JSON.parse(readFileSync(arquivo, "utf8")).settings.displayName).toBe("retrato do dia");
    rmSync(dir, { recursive: true, force: true });
  });

  it("não sobrescreve o backup do dia numa segunda abertura", async () => {
    const dir = pasta();
    const arquivo = join(dir, "dados.json");
    const primeiro = await Store.open(arquivo);
    await primeiro.close();
    const segunda = await Store.open(arquivo);
    segunda.data.settings.displayName = "mudou depois";
    await segunda.save();
    await segunda.close();
    const copias = readdirSync(join(dir, "backups"));
    expect(copias).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, "backups", copias[0]!), "utf8")).settings.displayName).not.toBe("mudou depois");
    expect(JSON.parse(readFileSync(arquivo, "utf8")).settings.displayName).toBe("mudou depois");
    rmSync(dir, { recursive: true, force: true });
  });

  it("reabre com as três coletas garantidas", async () => {
    const dir = pasta();
    const arquivo = join(dir, "dados.json");
    const store = await Store.open(arquivo);
    await store.close();
    const outra = await Store.open(arquivo);
    expect(outra.data.collections.map((c) => c.audience).sort()).toEqual(["docentes", "equipe", "estudantes"]);
    expect(outra.data.collections.every((c) => c.status === "rascunho" && !c.publicId)).toBe(true);
    await outra.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("arquivo antigo recebe os campos novos sem perder dados", async () => {
    const dir = pasta();
    const arquivo = join(dir, "dados.json");
    const antigo = emptyDb() as any;
    delete antigo.visits;
    delete antigo.settings.rateLimitPerHour;
    antigo.institution.fields = { missao: "apoiar" };
    antigo.collections = [];
    writeFileSync(arquivo, JSON.stringify(antigo));
    const store = await Store.open(arquivo);
    expect(store.data.institution.fields.missao).toBe("apoiar");
    expect(store.data.visits).toEqual([]);
    expect(store.data.settings.rateLimitPerHour).toBe(30);
    expect(store.data.collections.map((c) => c.audience).sort()).toEqual(["docentes", "equipe", "estudantes"]);
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sem disco gravável, sobe em memória e não rejeita as gravações", async () => {
    const dir = pasta();
    // Um arquivo onde deveria existir a pasta: mkdir falha com ENOTDIR.
    const bloqueio = join(dir, "bloqueado");
    writeFileSync(bloqueio, "arquivo");
    const store = await Store.open(join(bloqueio, "dados.json"));
    expect(store.data.collections).toHaveLength(3);
    await expect(store.save()).resolves.toBeUndefined();
    store.note("teste", "memória");
    expect(store.data.log.at(-1)!.detail).toBe("memória");
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("uma falha de gravação deixa o servidor em memória, sem arquivo temporário", async () => {
    const dir = pasta();
    const arquivo = join(dir, "dados.json");
    const store = await Store.open(arquivo);
    // Troca o arquivo bom por uma pasta: a escrita temporária depois do rename
    // falha, e o sistema não pode insistir nem deixar sobra.
    rmSync(arquivo);
    mkdirSync(arquivo);
    store.note("teste", "falha");
    await expect(store.save()).rejects.toBeTruthy();
    // Só o arquivo (agora uma pasta) e a pasta de backups: nenhum .tmp solto.
    expect(readdirSync(dir).sort()).toEqual(["backups", "dados.json"]);
    await expect(store.save()).resolves.toBeUndefined();
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("o diário de atividade é limitado a 500 linhas", async () => {
    const dir = pasta();
    const store = await Store.open(join(dir, "dados.json"));
    for (let i = 0; i < 520; i++) store.note("teste", String(i));
    expect(store.data.log.length).toBe(500);
    expect(store.data.log.at(-1)!.detail).toBe("519");
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
