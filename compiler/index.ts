import { tokenize } from "./lexer";
import { parse } from "./parser";
import { generateCode } from "./codegen";
import type { Instruction } from "../cpu";
import type { Program } from "./ast";

export const compile = (source: string): Instruction[] => {
    const tokens = tokenize(source);
    const ast = parse(tokens);
    return generateCode(ast);
};

export const parseToAst = (source: string): Program => {
    const tokens = tokenize(source);
    return parse(tokens);
};

export { tokenize } from "./lexer";
export { parse } from "./parser";
export { generateCode } from "./codegen";