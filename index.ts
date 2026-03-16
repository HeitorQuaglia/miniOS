export { createMemory, WORD_SIZE_IN_BYTES, DEFAULT_MEMORY_SIZE } from "./memory";
export type { Registers, HeapBlock } from "./memory";

export { createCpu, Opcode, reg, imm, memAddr, memReg, fp, sp, hp } from "./cpu";
export type { Instruction, Operand, GeneralRegister, SpecialRegister, CpuState } from "./cpu";

export { compile, parseToAst, tokenize, parse, generateCode } from "./compiler";