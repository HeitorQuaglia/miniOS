export enum TokenType {
    // literais
    NUMBER_LITERAL = "NUMBER_LITERAL",
    IDENTIFIER     = "IDENTIFIER",

    // keywords
    FN     = "fn",
    STRUCT = "struct",
    RETURN = "return",
    ALLOC  = "alloc",
    FREE   = "free",
    REF    = "ref",

    // tipos primitivos
    NUMBER_TYPE = "number",
    CHAR_TYPE   = "char",

    // operadores
    PLUS   = "+",
    MINUS  = "-",
    STAR   = "*",
    SLASH  = "/",
    EQUALS = "=",
    DOT    = ".",

    // delimitadores
    LPAREN = "(",
    RPAREN = ")",
    LBRACE = "{",
    RBRACE = "}",
    LANGLE = "<",
    RANGLE = ">",
    COLON  = ":",
    COMMA  = ",",

    // fim
    EOF = "EOF",
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

export const KEYWORDS: Record<string, TokenType> = {
    fn:     TokenType.FN,
    struct: TokenType.STRUCT,
    return: TokenType.RETURN,
    alloc:  TokenType.ALLOC,
    free:   TokenType.FREE,
    ref:    TokenType.REF,
    number: TokenType.NUMBER_TYPE,
    char:   TokenType.CHAR_TYPE,
};