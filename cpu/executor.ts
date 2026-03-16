import { Opcode, type Instruction, type Operand } from "./types";
import type { CpuState } from "./registers";
import type { createMemory } from "../memory";

type Memory = ReturnType<typeof createMemory>;

// --- Resolucao de operandos ---

const resolveValue = (operand: Operand, state: CpuState, memory: Memory): number => {
    switch (operand.type) {
        case "register":
            return state.generalPurpose[operand.register];
        case "special": {
            const regs = memory.getRegisters();
            if (operand.register === "SP") return regs.stackPointer;
            if (operand.register === "FP") return regs.framePointer;
            return regs.heapPointer;
        }
        case "immediate":
            return operand.value;
        case "memoryDirect":
            return memory.readWord(operand.address);
        case "memoryRegister":
            return memory.readWord(state.generalPurpose[operand.register]);
    }
};

type RegisterOperand = Extract<Operand, { type: "register" }>;
type MemoryOperand = Extract<Operand, { type: "memoryDirect" | "memoryRegister" }>;

const expectRegister: (
    operand: Operand | undefined,
    context: string,
) => asserts operand is RegisterOperand = (operand, context) => {
    if (!operand || operand.type !== "register") {
        const received = operand ? operand.type : "ausente";
        throw new Error(`${context}: destino deve ser um registrador, recebeu ${received}`);
    }
};

const expectMemory: (
    operand: Operand | undefined,
    context: string,
) => asserts operand is MemoryOperand = (operand, context) => {
    if (!operand || (operand.type !== "memoryDirect" && operand.type !== "memoryRegister")) {
        const received = operand ? operand.type : "ausente";
        throw new Error(`${context}: destino deve ser endereco de memoria, recebeu ${received}`);
    }
};

const resolveAddress = (operand: Operand, state: CpuState): number => {
    if (operand.type === "memoryDirect") return operand.address;
    if (operand.type === "memoryRegister") return state.generalPurpose[operand.register];
    throw new Error(`Operando nao e um endereco de memoria: ${operand.type}`);
};

// --- Execucao ---

export const executeInstruction = (
    instruction: Instruction,
    state: CpuState,
    memory: Memory,
) => {
    const { opcode, operands } = instruction;

    switch (opcode) {
        // ---- Transferencia de dados ----

        case Opcode.MOV: {
            const [dest, src] = operands;
            expectRegister(dest, "MOV");
            state.generalPurpose[dest.register] = resolveValue(src, state, memory);
            break;
        }

        case Opcode.LOAD: {
            const [dest, src] = operands;
            expectRegister(dest, "LOAD");
            expectMemory(src, "LOAD");
            state.generalPurpose[dest.register] = memory.readWord(resolveAddress(src, state));
            break;
        }

        case Opcode.STORE: {
            const [dest, src] = operands;
            expectMemory(dest, "STORE");
            memory.writeWord(resolveAddress(dest, state), resolveValue(src, state, memory));
            break;
        }

        // ---- Aritmetica ----

        case Opcode.ADD: {
            const [dest, src] = operands;
            expectRegister(dest, "ADD");
            state.generalPurpose[dest.register] =
                (state.generalPurpose[dest.register] + resolveValue(src, state, memory)) >>> 0;
            break;
        }

        case Opcode.SUB: {
            const [dest, src] = operands;
            expectRegister(dest, "SUB");
            state.generalPurpose[dest.register] =
                (state.generalPurpose[dest.register] - resolveValue(src, state, memory)) >>> 0;
            break;
        }

        case Opcode.MUL: {
            const [dest, src] = operands;
            expectRegister(dest, "MUL");
            state.generalPurpose[dest.register] =
                Math.imul(state.generalPurpose[dest.register], resolveValue(src, state, memory)) >>> 0;
            break;
        }

        case Opcode.DIV: {
            const [dest, src] = operands;
            expectRegister(dest, "DIV");
            const divisor = resolveValue(src, state, memory);
            if (divisor === 0) throw new Error("Divisao por zero");
            state.generalPurpose[dest.register] =
                (state.generalPurpose[dest.register] / divisor) >>> 0;
            break;
        }

        // ---- Comparacao ----

        case Opcode.CMP: {
            const [a, b] = operands;
            state.zeroFlag = resolveValue(a, state, memory) === resolveValue(b, state, memory);
            break;
        }

        // ---- Stack ----

        case Opcode.PUSH: {
            const [src] = operands;
            memory.stackPush(resolveValue(src, state, memory));
            break;
        }

        case Opcode.POP: {
            const [dest] = operands;
            expectRegister(dest, "POP");
            state.generalPurpose[dest.register] = memory.stackPop();
            break;
        }

        // ---- Controle de fluxo ----

        case Opcode.JMP: {
            const [target] = operands;
            state.programCounter = resolveValue(target, state, memory);
            return;
        }

        case Opcode.JZ: {
            const [target] = operands;
            if (state.zeroFlag) {
                state.programCounter = resolveValue(target, state, memory);
                return;
            }
            break;
        }

        case Opcode.JNZ: {
            const [target] = operands;
            if (!state.zeroFlag) {
                state.programCounter = resolveValue(target, state, memory);
                return;
            }
            break;
        }

        case Opcode.CALL: {
            const [target] = operands;
            memory.pushFrame(state.programCounter + 1);
            state.programCounter = resolveValue(target, state, memory);
            return;
        }

        case Opcode.RET: {
            state.programCounter = memory.popFrame();
            return;
        }

        // ---- Heap ----

        case Opcode.ALLOC: {
            const [dest, size] = operands;
            expectRegister(dest, "ALLOC");
            state.generalPurpose[dest.register] = memory.heapAlloc(resolveValue(size, state, memory));
            break;
        }

        case Opcode.FREE: {
            const [src] = operands;
            memory.heapFree(resolveValue(src, state, memory));
            break;
        }

        // ---- Sistema ----

        case Opcode.NOP:
            break;

        case Opcode.HALT:
            state.halted = true;
            return;

        default:
            throw new Error(`Opcode desconhecido: ${opcode}`);
    }

    state.programCounter++;
};