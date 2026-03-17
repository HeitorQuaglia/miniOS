# miniOS

Simulador educacional de hardware e sistema operacional que demonstra como memória, CPU e compiladores funcionam por baixo dos panos. Inclui um modelo de memória virtual com paginação por demanda, um processador com 20 instruções de pseudo-assembly, e um compilador completo para uma linguagem de alto nível Turing Complete.

## Estrutura do projeto

```
miniOS/
├── memory/               # Modelo de memória virtual
│   ├── types.ts          # Registradores (SP, FP, HP), constantes, interface MemoryBuffer
│   ├── paging/           # Sistema de paginação por demanda
│   │   ├── types.ts      # Constantes (PAGE_SIZE, etc.), interfaces (PhysicalFrame, PageTableEntry)
│   │   ├── physicalMemory.ts  # Pool de frames físicos (cresce sob demanda)
│   │   ├── pageTable.ts  # Tabela de páginas (virtual → físico)
│   │   ├── mmu.ts        # MMU: tradução de endereços, page faults, demand paging
│   │   └── index.ts      # Re-exportações
│   ├── stack.ts          # Push, pop, stack frames
│   ├── heap.ts           # Alocação first-fit, free, detecção de double-free
│   ├── dump.ts           # Visualização da memória e estatísticas de paginação
│   └── index.ts          # Fachada: createMemory()
│
├── cpu/                  # Simulador de CPU
│   ├── types.ts          # Opcodes, operandos, modos de endereçamento
│   ├── registers.ts      # Estado da CPU (R0-R3, PC, ZF, NF)
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

## Modelo de memória virtual

O miniOS usa **paginação por demanda** (demand paging), da mesma forma que sistemas operacionais modernos. O programa enxerga um espaço de endereçamento virtual contínuo, mas a memória física só é alocada quando uma página é acessada pela primeira vez (page fault).

```
Espaço virtual (1024 bytes por padrão):

Endereço 0                                   Endereço 1023
┌──────────────────┬──────────────┬──────────────────┐
│   HEAP ──>       │   (livre)    │       <── STACK  │
│   cresce ──>     │              │       <── cresce │
└──────────────────┴──────────────┴──────────────────┘
^                                                    ^
HP (Heap Pointer)                         SP (Stack Pointer)
```

### Como funciona a tradução de endereços

```
CPU → mmu.readWord(endereço virtual)
        → splitAddress(addr) → { pageNumber, offset }
        → pageTable.lookup(pageNumber)
            → HIT:  retorna frame físico já alocado
            → MISS: page fault → aloca novo frame → mapeia na tabela
        → frame.data[offset]
```

### Constantes de paginação

| Constante | Valor | Descrição |
|---|---|---|
| `PAGE_SIZE` | 16 bytes | Tamanho de cada página (4 words) |
| `VIRTUAL_ADDRESS_SPACE` | 1024 bytes | Espaço virtual que o programa enxerga |
| `MAX_PHYSICAL_PAGES` | 64 | Limite de frames físicos (simula RAM finita) |

### Page Table Entry

Cada entrada na tabela de páginas contém:
- `valid` — página está mapeada?
- `physicalFrameId` — qual frame físico foi atribuído
- `dirty` — página foi escrita?
- `accessed` — página foi acessada?

### Registradores de controle

| Registrador | Descrição |
|---|---|
| `SP` (Stack Pointer) | Próximo byte livre no topo da stack (cresce para baixo) |
| `FP` (Frame Pointer) | Base do stack frame atual |
| `HP` (Heap Pointer) | Próximo byte livre no heap (cresce para cima) |

Se HP ultrapassar SP, uma exceção de **colisão de memória** é lançada.

### Layout do stack frame

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
- **Flags:** `ZF` (zero flag, setada por `CMP`), `NF` (negative flag, setada por `CMP` quando `a < b`)

### Modos de endereçamento
| Modo | Exemplo | Descrição |
|---|---|---|
| `register` | `R0` | Valor no registrador |
| `special` | `FP` | Valor de SP, FP ou HP |
| `immediate` | `42` | Valor literal |
| `memoryDirect` | `[100]` | Endereço fixo na memória |
| `memoryRegister` | `[R2]` | Endereço contido no registrador |

### Instruções (20 opcodes)

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
| `CMP a, b` | `ZF = (a == b)`, `NF = (a < b)` |

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
| `JLT addr` | Se NF: PC = addr (a < b) |
| `JGE addr` | Se !NF: PC = addr (a >= b) |
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
// Comentário de linha
# Também comentário de linha
/* Comentário
   de bloco */

struct Point {
    x: number
    y: number
}

fn factorial(n: number): number {
    if (n <= 1) {
        return 1
    }
    return n * factorial(n - 1)
}

fn main() {
    // Variáveis e while loop
    sum: number = 0
    i: number = 1
    while (i <= 10) {
        sum = sum + i
        i = i + 1
    }

    // Structs e heap
    p: ref<Point> = alloc(Point)
    p.x = sum
    p.y = factorial(5)
    free(p)
}
```

### Funcionalidades da linguagem
- **Structs** com campos tipados
- **Funções** com parâmetros e tipo de retorno
- **Variáveis locais** com declaração tipada (`nome: tipo = valor`)
- **Condicionais** `if`/`else if`/`else` com blocos
- **Loops** `while (condição) { ... }`
- **Operadores de comparação** `==`, `!=`, `<`, `>`, `<=`, `>=`
- **Operadores lógicos** `&&`, `||`, `!` (com short-circuit)
- **Expressões aritméticas** com precedência (`+`, `-`, `*`, `/`)
- **Alocação/liberação** manual de memória (`alloc`, `free`)
- **Acesso a campos** via referências (`ptr.campo`)
- **Chamadas de função** com passagem por valor
- **Comentários** `//`, `#` (linha) e `/* */` (bloco)

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

const memory = createMemory();
const program = compile(source);
const cpu = createCpu(memory);

cpu.run(program);
memory.dump();
```

### Configurando a memória

```typescript
// Padrão: 1024 bytes virtuais, páginas de 16 bytes, máx 64 frames
const memory = createMemory();

// Customizado
const memory = createMemory({
    virtualSize: 2048,
    pageSize: 32,
    maxPhysicalPages: 128,
});
```

### Inspecionando a paginação

```typescript
const memory = createMemory();
const cpu = createCpu(memory);
cpu.run(program);

// Estatísticas: page faults, hit rate, frames alocados
console.log(memory.getPagingStats());
// { totalPageFaults: 3, totalAccesses: 136, physicalFramesAllocated: 3, physicalFramesMax: 64 }

// Tabela de páginas detalhada
memory.dumpPageTable();
// Pagina  0 (virtual    0-  15) -> Frame  1 [DA]
// Pagina 63 (virtual 1008-1023) -> Frame  0 [DA]
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
createMemory(config?: {
    virtualSize?: number;       // default: 1024
    pageSize?: number;          // default: 16
    maxPhysicalPages?: number;  // default: 64
})

// Leitura/escrita (endereços virtuais, traduzidos pela MMU)
readWord(address) / writeWord(address, value)
readByte(address) / writeByte(address, value)

// Stack
stackPush(value) / stackPop() / stackPeek()
pushFrame(returnAddress) / popFrame(): number

// Heap
heapAlloc(sizeInBytes): number  // retorna endereço virtual
heapFree(address)

// Paginação
getPagingStats(): PagingStats
dumpPageTable()

// Debug
getRegisters(): { stackPointer, framePointer, heapPointer }
dump()
```

### CPU
```typescript
createCpu(memory)

run(program)           // executa até HALT
step(program): boolean // executa 1 instrução, retorna false se HALT
getState(): CpuState   // { programCounter, zeroFlag, negativeFlag, halted, generalPurpose }
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
