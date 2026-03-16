import type { Instruction } from "./types";
import { createCpuState, type CpuState } from "./registers";
import { executeInstruction } from "./executor";
import type { createMemory } from "../memory";

type Memory = ReturnType<typeof createMemory>;

export const createCpu = (memory: Memory) => {
    const state: CpuState = createCpuState();

    const run = (program: Instruction[]) => {
        state.programCounter = 0;
        state.halted = false;

        while (!state.halted) {
            if (state.programCounter < 0 || state.programCounter >= program.length) {
                throw new Error(
                    `PC=${state.programCounter} fora dos limites do programa (0..${program.length - 1}). ` +
                    `Esqueceu um HALT?`
                );
            }

            const currentInstruction = program[state.programCounter];
            executeInstruction(currentInstruction, state, memory);
        }
    };

    const step = (program: Instruction[]) => {
        if (state.halted) return false;

        if (state.programCounter < 0 || state.programCounter >= program.length) {
            throw new Error(
                `PC=${state.programCounter} fora dos limites do programa (0..${program.length - 1}).`
            );
        }

        const currentInstruction = program[state.programCounter];
        executeInstruction(currentInstruction, state, memory);
        return !state.halted;
    };

    const getState = (): CpuState => ({
        ...state,
        generalPurpose: { ...state.generalPurpose },
    });

    const reset = () => {
        state.programCounter = 0;
        state.zeroFlag = false;
        state.halted = false;
        state.generalPurpose.R0 = 0;
        state.generalPurpose.R1 = 0;
        state.generalPurpose.R2 = 0;
        state.generalPurpose.R3 = 0;
    };

    return { run, step, getState, reset };
};

export { Opcode, reg, imm, memAddr, memReg } from "./types";
export type { Instruction, Operand, GeneralRegister } from "./types";
export type { CpuState } from "./registers";
