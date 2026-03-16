export { createMemory, WORD_SIZE_IN_BYTES, DEFAULT_MEMORY_SIZE } from "./memory";
export type { Registers, HeapBlock } from "./memory";

export { createCpu, Opcode, reg, imm, memAddr, memReg } from "./cpu";
export type { Instruction, Operand, GeneralRegister, CpuState } from "./cpu";
