# Arrays C-like e Pseudo-Syscalls

## Resumo

Duas features interdependentes para o miniOS:
1. **Arrays C-like** com alocacao em stack e heap, sintaxe `arr[i]`, genericos sobre qualquer tipo
2. **Pseudo-syscalls** estilo ARM via opcode `SYSCALL`, com buffers internos de I/O e tres syscalls iniciais: `sys_read`, `sys_write`, `sys_exit`

Arrays sao pre-requisito para a integracao das syscalls no compilador (built-ins `sys_read`/`sys_write` operam sobre buffers em memoria que sao arrays). O opcode `SYSCALL` em si e independente de arrays.

---

## Parte 1: Arrays C-like

### Tipo no sistema de tipos

Nova sintaxe de tipo: `T[N]` onde `T` e qualquer tipo existente (`number`, `char`, `ref<Struct>`) e `N` e um literal inteiro positivo (N >= 1). O tamanho e fixo em tempo de compilacao. Arrays de tamanho 0 sao erro de compilacao.

```
let scores: number[4];                // stack: 4 words no frame + ponteiro
let buf: ref<char[64]> = alloc(64);   // heap: alloc retorna ponteiro
```

### Representacao em memoria

Um array e sempre um **ponteiro** (1 word) para um bloco contiguo de `N * 4` bytes.

**Stack array** (`let a: number[3]`):
```
Frame:
  FP - 8   -> ponteiro a (aponta para FP - 20)
  FP - 12  -> a[0]
  FP - 16  -> a[1]
  FP - 20  -> a[2]
```

**Heap array** (`let a: ref<number[3]> = alloc(3)`):
```
Frame:
  FP - 8   -> ponteiro a (aponta para endereco no heap)

Heap:
  HP + 0   -> a[0]
  HP + 4   -> a[1]
  HP + 8   -> a[2]
```

### Compilacao de `arr[i]`

Nota: todas as instrucoes aritmeticas (ADD, SUB, MUL, DIV) sao 2-operandos: `OP dest, src` onde `dest = dest OP src`.

**Leitura** (`arr[i]` como expressao):
```asm
LOAD R0, @(FP - offset)    // ponteiro do array
PUSH R0                      // salvar base
<compilar expressao i> -> R0
MOV R1, R0                  // R1 = i
MOV R0, 4                   // R0 = WORD_SIZE
MUL R1, R0                  // R1 = i * 4
POP R0                      // R0 = base
ADD R0, R1                  // R0 = base + i*4
LOAD R0, @R0                // ler valor
```

**Escrita** (`arr[i] = expr`):
```asm
// 1. Calcular endereco destino:
LOAD R0, @(FP - offset)    // ponteiro do array
PUSH R0                      // salvar base
<compilar expressao index> -> R0
MOV R1, R0                  // R1 = i
MOV R0, 4
MUL R1, R0                  // R1 = i * 4
POP R0                      // R0 = base
ADD R0, R1                  // R0 = endereco destino
PUSH R0                      // salvar endereco
// 2. Compilar valor:
<compilar expr> -> R0        // R0 = valor
// 3. Escrever:
POP R1                       // R1 = endereco destino
STORE @R1, R0
```

Nota sobre register pressure: expressoes de indice ou valor que contenham chamadas de funcao sao seguras porque valores intermediarios sao salvos na stack via PUSH/POP antes da sub-expressao, seguindo o mesmo padrao ja usado para expressoes binarias no codegen existente.

**Sem bounds checking.** Acesso fora dos limites e comportamento indefinido, como em C. Decisao consciente para manter o modelo educacional proximo ao hardware real.

### AST

Novos nos:
- `ArrayType { elementType: Type, size: number }` no sistema de tipos
- `IndexAccess { object: Expression, index: Expression }` para leitura/escrita

### Codegen de alocacao de stack array

Para `let a: number[3]`:
```asm
// 1. Reservar espaco para N elements (SP -= N * WORD_SIZE)
MOV R0, 12                  // 3 * 4 = 12
SUB SP, R0                  // reservar 12 bytes no stack
// (internamente: 3x PUSH com valor 0 para inicializar)

// 2. Computar endereco base e salvar como ponteiro
MOV R0, SP                  // R0 = endereco do primeiro elemento
PUSH R0                      // ponteiro 'a' no stack frame
```

Alternativa mais simples: emitir N instruçoes `PUSH imm(0)` para reservar e inicializar, depois computar o endereco base.

### Alloc para arrays no heap

`alloc(N)` para arrays: o argumento N e o numero de **elementos** (nao bytes). O codegen emite `ALLOC R0, N * WORD_SIZE`. O `AllocExpression` no AST sera estendido com um campo opcional `elementCount: Expression` para diferenciar alloc de struct (tamanho inferido) de alloc de array (tamanho explicito).

```
let buf: ref<char[64]> = alloc(64);  // ALLOC com 64 * 4 = 256 bytes
```

### Lexer/Parser

- Lexer: `[` e `]` como tokens
- Parser: apos identificador, `[` inicia index access; em declaracao de tipo, `T[N]` e array type
- Parser: `arr[i] = expr` como assignment target

---

## Parte 2: Pseudo-Syscalls

### Novo opcode

`SYSCALL` -- 21o opcode. Sem operandos na instrucao.

Convencao de chamada (estilo ARM):

| Registro | Proposito |
|----------|-----------|
| R0 | Numero da syscall (entrada) / valor de retorno (saida) |
| R1 | Argumento 1 |
| R2 | Argumento 2 |
| R3 | Argumento 3 |

### Tabela de syscalls

| Numero | Nome | R1 | R2 | Retorno (R0) |
|--------|------|----|----|---------------|
| 0 | sys_read | endereco destino | quantidade (words) | words lidos |
| 1 | sys_write | endereco fonte | quantidade (words) | words escritos |
| 2 | sys_exit | codigo de saida | -- | (nao retorna) |

### Buffers de I/O

Vivem **fora** da memoria da VM, no `SyscallHandler`:

```typescript
interface SyscallHandler {
  inputBuffer: number[];   // fila de valores a serem lidos
  outputBuffer: number[];  // valores escritos pelo programa
  exitCode: number | null; // codigo de saida (set por sys_exit)

  handleSyscall(cpu: CpuState, memory: Memory): void;
}
```

- `sys_read`: consome do `inputBuffer`, copia para memoria da VM no endereco R1, ate R2 words. Retorna quantidade efetivamente lida (pode ser < R2 se buffer insuficiente). Se o buffer estiver vazio, retorna 0 e nao escreve nada na memoria.
- `sys_write`: le R2 words da memoria da VM a partir de R1, appenda ao `outputBuffer`. Retorna R2.
- `sys_exit`: seta flag de halt e armazena codigo de saida (R1) em `SyscallHandler.exitCode`. O `CpuState` nao muda — o codigo de saida e propriedade do handler.

### Injecao na CPU

```typescript
const handler = createSyscallHandler();
handler.inputBuffer = [72, 101, 108, 108, 111]; // "Hello"

const cpu = createCpu(memory, { syscallHandler: handler });
cpu.run(program);

console.log(handler.outputBuffer); // valores escritos pelo programa
```

O `syscallHandler` e **opcional**. Se nao fornecido e o programa executar `SYSCALL`, erro em runtime.

### Codegen / Linguagem

Syscalls sao expostas como **funcoes built-in** no compilador:

```
let buf: char[5];
let n: number = sys_read(buf, 5);
sys_write(buf, n);
sys_exit(0);
```

`sys_read`, `sys_write` e `sys_exit` **nao sao funcoes reais** — nao podem ser passadas como valores, chamadas indiretamente, ou armazenadas em variaveis. O parser/codegen intercepta esses nomes antes da compilacao normal de chamada de funcao e emite instrucoes inline:

O codegen reconhece esses nomes especiais e emite:

```asm
// sys_read(buf, 5):
MOV R1, <endereco de buf>
MOV R2, 5
MOV R0, 0          // syscall number
SYSCALL
// resultado em R0
```

---

## Parte 3: Integracao e Impacto nos Modulos

### Mudancas por modulo

**`cpu/types.ts`**
- Adicionar `SYSCALL` ao enum `Opcode`

**`cpu/executor.ts`**
- Novo case `SYSCALL` no switch -- delega para `SyscallHandler.handleSyscall()`
- `sys_exit` seta flag que faz o loop de execucao parar (similar a `HALT`, mas com codigo de saida)

**`cpu/index.ts`**
- `createCpu(memory, options?)` aceita `{ syscallHandler?: SyscallHandler }` opcional

**`cpu/syscall.ts`** (novo arquivo)
- `SyscallHandler` interface + `createSyscallHandler()` factory
- Implementacao dos 3 handlers (read, write, exit)
- Importa tipos apenas de `cpu/registers.ts` e `memory/` (sem dependencia circular)

**`compiler/ast.ts`**
- `ArrayType` node no sistema de tipos
- `IndexAccess` node para `arr[i]`

**`compiler/lexer.ts`**
- Tokens `[` e `]`

**`compiler/parser.ts`**
- Parse de tipo `T[N]` em declaracoes
- Parse de `expr[expr]` como index access
- Parse de `arr[i] = expr` como assignment

**`compiler/codegen.ts`**
- Alocacao de arrays no stack (reservar N words + ponteiro)
- Compilacao de `IndexAccess` (leitura e escrita)
- Suporte a `alloc(N)` para tipo array no heap
- Reconhecer `sys_read`, `sys_write`, `sys_exit` como built-ins -> emitir MOV nos registradores + SYSCALL

**`memory/`**
- Sem mudancas -- `read`/`write` ja suportam enderecamento arbitrario

**`index.ts`** (raiz)
- Re-exportar `createSyscallHandler` e tipos relacionados

### Ordem de implementacao

1. **Arrays** (lexer -> parser -> AST -> codegen) -- independente de syscalls
2. **SYSCALL opcode + SyscallHandler** -- independente de arrays
3. **Built-ins `sys_read`/`sys_write`/`sys_exit` no compilador** -- depende de 1 e 2

### Exemplo de programa completo

```
fn main(): number {
    let buf: char[5];
    let n: number = sys_read(buf, 5);
    sys_write(buf, n);
    sys_exit(0);
    return 0;
}
```
