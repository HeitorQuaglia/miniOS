import type { CpuState } from "./registers";
import type { createMemory } from "../memory";
import { WORD_SIZE_IN_BYTES } from "../memory";

type Memory = ReturnType<typeof createMemory>;

export interface SyscallHandler {
    inputBuffer: number[];
    outputBuffer: number[];
    exitCode: number | null;
    handleSyscall(state: CpuState, memory: Memory): void;
}

const SYSCALL_READ = 0;
const SYSCALL_WRITE = 1;
const SYSCALL_EXIT = 2;

export const createSyscallHandler = (): SyscallHandler => {
    const handler: SyscallHandler = {
        inputBuffer: [],
        outputBuffer: [],
        exitCode: null,

        handleSyscall(state: CpuState, memory: Memory): void {
            const syscallNumber = state.generalPurpose.R0;

            switch (syscallNumber) {
                case SYSCALL_READ: {
                    const destAddr = state.generalPurpose.R1;
                    const count = state.generalPurpose.R2;
                    const available = Math.min(count, handler.inputBuffer.length);
                    for (let i = 0; i < available; i++) {
                        const value = handler.inputBuffer.shift()!;
                        memory.writeWord(destAddr + i * WORD_SIZE_IN_BYTES, value);
                    }
                    state.generalPurpose.R0 = available;
                    break;
                }

                case SYSCALL_WRITE: {
                    const srcAddr = state.generalPurpose.R1;
                    const count = state.generalPurpose.R2;
                    for (let i = 0; i < count; i++) {
                        const value = memory.readWord(srcAddr + i * WORD_SIZE_IN_BYTES);
                        handler.outputBuffer.push(value);
                    }
                    state.generalPurpose.R0 = count;
                    break;
                }

                case SYSCALL_EXIT: {
                    handler.exitCode = state.generalPurpose.R1;
                    state.halted = true;
                    break;
                }

                default:
                    throw new Error(`Syscall desconhecida: ${syscallNumber}`);
            }
        },
    };

    return handler;
};
