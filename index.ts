interface CallFrame {
    functionName: string;
    arguments: any[];
    localVariables: Map<string, any>;
    returnAddress: number;
}

const createStack = () => {
    const stack: Array<any> = [];

    return {
        push: (item: any) => stack.push(item),
        pop: () => stack.pop(),
        peek: () => stack[stack.length -1],
        isEmpty: () => stack.length === 0
    }
}

const createHeap = () => {
    const heap: Array<any> = [];
    
    const adresses = new Map<number, number>();

    return {
        allocate: () => {
            const adress = heap.length;
            heap.push(null);
            adresses.set(adress, heap.length - 1);
            return adress;
        },
        free: (adress: number) => {
            heap[adress] = null;
            adresses.delete(adress);
        },
        read: (adress: number) => {
            const index = adresses.get(adress);
            if (index === undefined) {
                throw new Error("Invalid address");
            }
            return heap[index];
        },
        write: (adress: number, value: any) => {
            const index = adresses.get(adress);
            if (index === undefined) {
                throw new Error("Invalid address");
            }
            heap[index] = value;
        }
    }
}
