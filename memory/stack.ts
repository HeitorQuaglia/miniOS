import { WORD_SIZE_IN_BYTES, type Registers } from "./types";
import type { MemoryBuffer } from "./types";

export const createStack = (
    buffer: MemoryBuffer,
    registers: Registers,
    totalSizeInBytes: number,
    checkCollision: () => void,
) => {
    const push = (value: number) => {
        registers.stackPointer -= WORD_SIZE_IN_BYTES;
        checkCollision();
        buffer.writeWord(registers.stackPointer, value);
    };

    const pop = (): number => {
        if (registers.stackPointer >= totalSizeInBytes) {
            throw new Error("Stack underflow: stack esta vazia");
        }
        const value = buffer.readWord(registers.stackPointer);
        registers.stackPointer += WORD_SIZE_IN_BYTES;
        return value;
    };

    const peek = (): number => {
        if (registers.stackPointer >= totalSizeInBytes) {
            throw new Error("Stack vazia: nada para ler");
        }
        return buffer.readWord(registers.stackPointer);
    };

    const pushFrame = (returnAddress: number) => {
        // salva o frame pointer anterior
        push(registers.framePointer);
        // salva o endereco de retorno
        push(returnAddress);
        // novo frame pointer aponta para onde salvamos o anterior
        registers.framePointer = registers.stackPointer + WORD_SIZE_IN_BYTES;
    };

    const popFrame = (): number => {
        // descarta variaveis locais voltando SP para o inicio do frame
        registers.stackPointer = registers.framePointer - WORD_SIZE_IN_BYTES;
        // recupera o endereco de retorno
        const returnAddress = pop();
        // restaura o frame pointer anterior
        registers.framePointer = pop();
        return returnAddress;
    };

    return { push, pop, peek, pushFrame, popFrame };
};
