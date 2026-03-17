import type { PhysicalFrame } from "./types";

export const createPhysicalMemory = (maxFrames: number, pageSize: number) => {
    const frames: PhysicalFrame[] = [];

    const allocateFrame = (): PhysicalFrame => {
        if (frames.length >= maxFrames) {
            throw new Error(
                `Memoria fisica esgotada! ${frames.length}/${maxFrames} frames alocados. ` +
                `Nao ha mais memoria fisica disponivel.`
            );
        }
        const frame: PhysicalFrame = {
            id: frames.length,
            data: new Uint8Array(pageSize),
        };
        frames.push(frame);
        return frame;
    };

    const getFrame = (frameId: number): PhysicalFrame => {
        if (frameId < 0 || frameId >= frames.length) {
            throw new Error(`Frame fisico ${frameId} nao existe`);
        }
        return frames[frameId];
    };

    const getAllocatedCount = (): number => frames.length;

    const getTotalPhysicalBytes = (): number => frames.length * pageSize;

    return { allocateFrame, getFrame, getAllocatedCount, getTotalPhysicalBytes };
};
