// Confere o armazenamento quando o disco não é gravável, como em hospedagem
// sem disco: o servidor precisa subir, avisar e continuar funcionando em memória.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../apps/api/src/db.ts";

const pasta = mkdtempSync(join(tmpdir(), "nupe-disco-"));
// Um arquivo no lugar da pasta de dados impede a criação do diretório.
const bloqueio = join(pasta, "bloqueado");
writeFileSync(bloqueio, "sou um arquivo");
const alvo = join(bloqueio, "dados", "nupe.json");

const checagens = [];
const store = await Store.open(alvo);
checagens.push(["abre sem pasta gravável", store.data.collections.length === 3, store.data.collections.length]);
checagens.push(["configuração vazia", store.data.admin === null, store.data.admin]);

// Em modo memória, save() não pode rejeitar: as rotas seguem funcionando.
const abriu = await store.save().then(() => true, () => false);
checagens.push(["gravação não derruba a requisição", abriu, abriu]);

store.note("teste", "memória");
checagens.push(["dados em memória funcionam", store.data.log.length > 0, store.data.log.length]);
checagens.push(["nada foi criado no bloqueio", !existsSync(alvo) && statSync(bloqueio).isFile(), true]);
await store.close();

// Disco liberado: uma instância nova grava e o conteúdo sobrevive à releitura.
rmSync(bloqueio);
const outra = await Store.open(alvo);
outra.note("teste", "disco");
await outra.save();
checagens.push(["grava quando o disco permite", existsSync(alvo), existsSync(alvo)]);
await outra.close();

const lido = JSON.parse(readFileSync(alvo, "utf8"));
checagens.push([
  "o que foi gravado volta na leitura",
  lido.log?.some((x) => x.detail === "disco") === true,
  lido.log?.length ?? 0,
]);

rmSync(pasta, { recursive: true, force: true });
let falhas = 0;
for (const [nome, ok, detalhe] of checagens) {
  if (!ok) falhas++;
  console.log(`${ok ? "ok     " : "FALHOU "} ${nome} (${detalhe})`);
}
console.log(`\n${checagens.length - falhas} de ${checagens.length} passaram`);
process.exit(falhas ? 1 : 0);
