# miniOS

Simulador educacional de hardware e sistema operacional que demonstra como memória, CPU e compiladores funcionam por baixo dos panos. Inclui um modelo de memória unificada com Stack e Heap, um processador com 18 instruções de pseudo-assembly, e um compilador completo para uma linguagem de alto nível.

## Estrutura do projeto

```
miniOS/
├── memory/               # Modelo de memória unificada
│   ├── types.ts          # Registradores (SP, FP, HP), constantes
│   ├── buffer.ts         # Leitura/escrita de bytes e words (little-endian)
│   ├── stack.ts          # Push, pop, stack frames
│   ├── heap.ts           # Alocação first-fit, free, detecção de double-free
│   ├── dump.ts           # Visualização da memória para debug
│   └── index.ts          # Fachada: createMemory()
│
├── cpu/                  # Simulador de CPU
│   ├── types.ts          # Opcodes, operandos, modos de endereçamento
│   ├── registers.ts      # Estado da CPU (R0-R3, PC, ZF)
│   ├── executor.ts       # Execução de cada instrução
│   └── index.ts          # Fachada: createCpu()
│
├── compiler/             # Compilador da linguagem de alto nível
│   ├── tokens.ts         # Tipos de token e keywords
│   ├── lexer.ts          # Source code → tokens
│   ├── ast.ts            # Nós da árvore sintática
│   ├── parser.ts         # Tokens → AST (recursive descent)
│   ├── codegen.ts        # AST → instruções de pseudo-assembly
│   └── index.ts          # Fachada: compile()
│
├── examples/
│   └── point.example     # Programa demonstrando structs, heap e funções
│
└── index.ts              # Re-exporta tudo
```

## Modelo de memória

Um único buffer contíguo (`Uint8Array`) onde Stack e Heap compartilham o espaço e crescem em direções opostas:

```
Endereço 0                                     Endereço N
┌──────────────────┬──────────────┬──────────────────┐
│   HEAP ──>       │   (livre)    │       <── STACK  │
│   cresce ──>     │              │       <── cresce │
└──────────────────┴──────────────┴──────────────────┘
^                                                    ^
HP (Heap Pointer)                         SP (Stack Pointer)
```

**Registradores de controle:**
| Registrador | Descrição |
|---|---|
| `SP` (Stack Pointer) | Próximo byte livre no topo da stack (cresce para baixo) |
| `FP` (Frame Pointer) | Base do stack frame atual |
| `HP` (Heap Pointer) | Próximo byte livre no heap (cresce para cima) |

Se HP ultrapassar SP, uma exceção de **colisão de memória** é lançada.

**Layout do stack frame:**
```
@(FP + 8)   = parâmetro 0  (empurrado primeiro pelo caller)
@(FP + 4)   = parâmetro 1
@(FP)       = FP anterior salvo
@(FP - 4)   = endereço de retorno
@(FP - 8)   = variável local 0
@(FP - 12)  = variável local 1
...          <── SP (próximo livre)
```

## Conjunto de instruções da CPU

### Registradores
- **Propósito geral:** `R0`, `R1`, `R2`, `R3`
- **Especiais (somente leitura):** `SP`, `FP`, `HP`
- **Flags:** `ZF` (zero flag, setada por `CMP`)

### Modos de endereçamento
| Modo | Exemplo | Descrição |
|---|---|---|
| `register` | `R0` | Valor no registrador |
| `special` | `FP` | Valor de SP, FP ou HP |
| `immediate` | `42` | Valor literal |
| `memoryDirect` | `[100]` | Endereço fixo na memória |
| `memoryRegister` | `[R2]` | Endereço contido no registrador |

### Instruções (18 opcodes)

**Transferência de dados:**
| Instrução | Operação |
|---|---|
| `MOV dest, src` | `dest = src` |
| `LOAD dest, [addr]` | `dest = memory[addr]` |
| `STORE [addr], src` | `memory[addr] = src` |

**Aritmética:**
| Instrução | Operação |
|---|---|
| `ADD dest, src` | `dest = dest + src` |
| `SUB dest, src` | `dest = dest - src` |
| `MUL dest, src` | `dest = dest * src` |
| `DIV dest, src` | `dest = dest / src` (inteiro, erro se divisor = 0) |

**Comparação:**
| Instrução | Operação |
|---|---|
| `CMP a, b` | `ZF = (a == b)` |

**Stack:**
| Instrução | Operação |
|---|---|
| `PUSH src` | Empurra valor na stack, SP -= 4 |
| `POP dest` | Retira valor da stack, SP += 4 |

**Controle de fluxo:**
| Instrução | Operação |
|---|---|
| `JMP addr` | PC = addr |
| `JZ addr` | Se ZF: PC = addr |
| `JNZ addr` | Se !ZF: PC = addr |
| `CALL addr` | Salva frame (FP + retorno), PC = addr |
| `RET` | Restaura frame, PC = endereço de retorno |

**Heap:**
| Instrução | Operação |
|---|---|
| `ALLOC dest, size` | `dest = heapAlloc(size)` |
| `FREE src` | `heapFree(src)` |

**Sistema:**
| Instrução | Operação |
|---|---|
| `NOP` | Nenhuma operação |
| `HALT` | Para a execução |

## A linguagem de alto nível

Uma linguagem simples com structs, referências e gerenciamento manual de memória. O compilador segue o pipeline clássico:

```
Source code → Lexer → Tokens → Parser → AST → Codegen → Instruction[]
```

### Sintaxe

```
// Tipos primitivos: number, char
// Referências: ref<NomeDoStruct>

struct Point {
    x: number
    y: number
}

fn sum(a: number, b: number): number {
    return a + b
}

fn main() {
    p: ref<Point> = alloc(Point)
    p.x = 10
    p.y = 20
    free(p)
}
```

### Funcionalidades da linguagem
- **Structs** com campos tipados
- **Funções** com parâmetros e tipo de retorno
- **Variáveis locais** com declaração tipada (`nome: tipo = valor`)
- **Alocação/liberação** manual de memória (`alloc`, `free`)
- **Acesso a campos** via referências (`ptr.campo`)
- **Expressões aritméticas** com precedência (`+`, `-`, `*`, `/`)
- **Chamadas de função** com passagem por valor

### Convenção de chamada
1. Caller empurra argumentos **da direita para a esquerda**
2. `CALL` salva o frame (FP anterior + endereço de retorno)
3. Resultado retornado em **R0**
4. Caller limpa os argumentos da stack após o retorno

## Como usar

```bash
npm install
npm run build
```

### Compilando e executando um programa

```typescript
import { createMemory, createCpu, compile } from "minios";

const source = `
fn main() {
    x: number = 42
}
`;

const memory = createMemory(256);
const program = compile(source);
const cpu = createCpu(memory);

cpu.run(program);
memory.dump();
```

### Programando direto em assembly

```typescript
import { createMemory, createCpu, Opcode, reg, imm } from "minios";

const memory = createMemory();
const cpu = createCpu(memory);

const program = [
    { opcode: Opcode.MOV, operands: [reg("R0"), imm(10)] },
    { opcode: Opcode.MOV, operands: [reg("R1"), imm(20)] },
    { opcode: Opcode.ADD, operands: [reg("R0"), reg("R1")] },
    // R0 = 30
    { opcode: Opcode.HALT, operands: [] },
];

cpu.run(program);
console.log(cpu.getState().generalPurpose.R0); // 30
```

### Executando passo a passo

```typescript
const cpu = createCpu(memory);

while (cpu.step(program)) {
    console.log("PC:", cpu.getState().programCounter);
    memory.dump();
}
```

## API

### Memory
```typescript
createMemory(sizeInBytes?: number)  // default: 256

// Leitura/escrita
readWord(address) / writeWord(address, value)
readByte(address) / writeByte(address, value)

// Stack
stackPush(value) / stackPop() / stackPeek()
pushFrame(returnAddress) / popFrame(): number

// Heap
heapAlloc(sizeInBytes): number  // retorna endereço
heapFree(address)

// Debug
getRegisters(): { stackPointer, framePointer, heapPointer }
dump()
```

### CPU
```typescript
createCpu(memory)

run(program)           // executa até HALT
step(program): boolean // executa 1 instrução, retorna false se HALT
getState(): CpuState   // { programCounter, zeroFlag, halted, generalPurpose }
reset()
```

### Compiler
```typescript
compile(source): Instruction[]       // pipeline completo
parseToAst(source): Program          // só parsing
tokenize(source): Token[]            // só lexer
parse(tokens): Program               // tokens → AST
generateCode(ast): Instruction[]     // AST → instruções
```

### Helpers para construir instruções
```typescript
reg("R0")       // operando registrador
imm(42)         // operando imediato
memAddr(100)    // endereço direto na memória
memReg("R2")    // endereço no registrador
fp() / sp() / hp()  // registradores especiais
```

## Licença

MIT
