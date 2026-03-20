// ============================================================
// miniOS - Conjunto de Instrucoes (pseudo-assembly)
// ============================================================
//
// Registradores de proposito geral: R0, R1, R2, R3
// Registradores especiais (somente leitura via MOV):
//   SP  - Stack Pointer:   gerenciado por PUSH/POP
//   FP  - Frame Pointer:   gerenciado por CALL/RET
//   HP  - Heap Pointer:    gerenciado pelo heap allocator
//
// Flags:
//   ZF  - Zero Flag:     setada por CMP quando os operandos sao iguais
//   NF  - Negative Flag: setada por CMP quando a < b
//
// Modos de enderecamento dos operandos:
//   register       ->  MOV R0, R1       (valor do registrador)
//   special        ->  MOV R0, FP       (valor de registrador especial)
//   immediate      ->  MOV R0, 42       (valor literal)
//   memoryDirect   ->  LOAD R0, [100]   (endereco fixo na memoria)
//   memoryRegister ->  LOAD R0, [R1]    (endereco contido no registrador)

export enum Opcode {
    // transferencia de dados
    MOV   = "MOV",     // MOV  dest, src           — copia valor entre registradores ou carrega imediato
    LOAD  = "LOAD",    // LOAD dest, [addr/reg]    — le word da memoria para registrador
    STORE = "STORE",   // STORE [addr/reg], src    — escreve registrador na memoria

    // aritmetica
    ADD = "ADD",       // ADD dest, src  — dest = dest + src
    SUB = "SUB",       // SUB dest, src  — dest = dest - src
    MUL = "MUL",       // MUL dest, src  — dest = dest * src
    DIV = "DIV",       // DIV dest, src  — dest = dest / src (inteiro)

    // comparacao
    CMP = "CMP",       // CMP a, b       — seta ZF se a == b

    // stack
    PUSH = "PUSH",     // PUSH src       — empilha valor
    POP  = "POP",      // POP  dest      — desempilha valor

    // controle de fluxo
    JMP  = "JMP",      // JMP  addr      — salto incondicional
    JZ   = "JZ",       // JZ   addr      — salto se ZF == true
    JNZ  = "JNZ",      // JNZ  addr      — salto se ZF == false
    JLT  = "JLT",      // JLT  addr      — salto se NF == true  (a < b)
    JGE  = "JGE",      // JGE  addr      — salto se NF == false (a >= b)
    CALL = "CALL",     // CALL addr      — chama funcao (pushFrame)
    RET  = "RET",      // RET            — retorna de funcao (popFrame)

    // heap
    ALLOC = "ALLOC",   // ALLOC dest, size — dest = heapAlloc(size)
    FREE  = "FREE",    // FREE  src        — heapFree(src)

    // sistema
    NOP  = "NOP",      // NOP            — nenhuma operacao
    HALT = "HALT",     // HALT           — para a execucao
    SYSCALL = "SYSCALL",  // SYSCALL — chama handler de syscall (numero em R0)
}

export type GeneralRegister = "R0" | "R1" | "R2" | "R3";

export type SpecialRegister = "SP" | "FP" | "HP";

export const GENERAL_REGISTERS: GeneralRegister[] = ["R0", "R1", "R2", "R3"];

// --- Operandos ---

export type Operand =
    | { type: "register"; register: GeneralRegister }
    | { type: "special"; register: SpecialRegister }
    | { type: "immediate"; value: number }
    | { type: "memoryDirect"; address: number }
    | { type: "memoryRegister"; register: GeneralRegister };

// --- Instrucao ---

export interface Instruction {
    opcode: Opcode;
    operands: Operand[];
}

// --- Helpers para montar instrucoes de forma legivel ---

export const reg = (r: GeneralRegister): Operand =>
    ({ type: "register", register: r });

export const sp = (): Operand =>
    ({ type: "special", register: "SP" });

export const fp = (): Operand =>
    ({ type: "special", register: "FP" });

export const hp = (): Operand =>
    ({ type: "special", register: "HP" });

export const imm = (value: number): Operand =>
    ({ type: "immediate", value });

export const memAddr = (address: number): Operand =>
    ({ type: "memoryDirect", address });

export const memReg = (r: GeneralRegister): Operand =>
    ({ type: "memoryRegister", register: r });