import type { GeneralRegister } from "./types";

export interface CpuState {
    programCounter: number;
    zeroFlag: boolean;
    generalPurpose: Record<GeneralRegister, number>;
    halted: boolean;
}

export const createCpuState = (): CpuState => ({
    programCounter: 0,
    zeroFlag: false,
    generalPurpose: { R0: 0, R1: 0, R2: 0, R3: 0 },
    halted: false,
});
