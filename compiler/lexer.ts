import { TokenType, KEYWORDS, type Token } from "./tokens";

export const tokenize = (source: string): Token[] => {
    const tokens: Token[] = [];
    let pos = 0;
    let line = 1;
    let column = 1;

    const peek = (): string => source[pos] ?? "\0";
    const advance = (): string => {
        const ch = source[pos++];
        if (ch === "\n") { line++; column = 1; }
        else { column++; }
        return ch;
    };

    const addToken = (type: TokenType, value: string) => {
        tokens.push({ type, value, line, column: column - value.length });
    };

    while (pos < source.length) {
        const ch = peek();

        // whitespace
        if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
            advance();
            continue;
        }

        // comentarios de linha: // e #
        if ((ch === "/" && source[pos + 1] === "/") || ch === "#") {
            while (pos < source.length && peek() !== "\n") advance();
            continue;
        }

        // comentarios de bloco: /* ... */
        if (ch === "/" && source[pos + 1] === "*") {
            advance(); // consome /
            advance(); // consome *
            while (pos < source.length) {
                if (peek() === "*" && source[pos + 1] === "/") {
                    advance(); // consome *
                    advance(); // consome /
                    break;
                }
                advance();
            }
            continue;
        }

        // numeros
        if (ch >= "0" && ch <= "9") {
            let num = "";
            while (pos < source.length && peek() >= "0" && peek() <= "9") {
                num += advance();
            }
            addToken(TokenType.NUMBER_LITERAL, num);
            continue;
        }

        // identificadores e keywords
        if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
            let ident = "";
            while (
                pos < source.length &&
                ((peek() >= "a" && peek() <= "z") ||
                 (peek() >= "A" && peek() <= "Z") ||
                 (peek() >= "0" && peek() <= "9") ||
                  peek() === "_")
            ) {
                ident += advance();
            }
            const keyword = KEYWORDS[ident];
            addToken(keyword ?? TokenType.IDENTIFIER, ident);
            continue;
        }

        // operadores e delimitadores de um caractere
        advance();
        switch (ch) {
            case "+": addToken(TokenType.PLUS,   ch); break;
            case "-": addToken(TokenType.MINUS,  ch); break;
            case "*": addToken(TokenType.STAR,   ch); break;
            case "/": addToken(TokenType.SLASH,  ch); break;
            case "=":
                if (peek() === "=") { advance(); addToken(TokenType.EQ_EQ, "=="); }
                else { addToken(TokenType.EQUALS, ch); }
                break;
            case "!":
                if (peek() === "=") { advance(); addToken(TokenType.NOT_EQ, "!="); }
                else { addToken(TokenType.BANG, ch); }
                break;
            case ".": addToken(TokenType.DOT,    ch); break;
            case "(": addToken(TokenType.LPAREN, ch); break;
            case ")": addToken(TokenType.RPAREN, ch); break;
            case "{": addToken(TokenType.LBRACE, ch); break;
            case "}": addToken(TokenType.RBRACE, ch); break;
            case "<":
                if (peek() === "=") { advance(); addToken(TokenType.LT_EQ, "<="); }
                else { addToken(TokenType.LANGLE, ch); }
                break;
            case ">":
                if (peek() === "=") { advance(); addToken(TokenType.GT_EQ, ">="); }
                else { addToken(TokenType.RANGLE, ch); }
                break;
            case ":": addToken(TokenType.COLON,  ch); break;
            case ",": addToken(TokenType.COMMA,  ch); break;
            case "&":
                if (peek() === "&") { advance(); addToken(TokenType.AND, "&&"); }
                else { throw new Error(`Caractere inesperado '&' na linha ${line}, coluna ${column - 1}. Voce quis dizer '&&'?`); }
                break;
            case "|":
                if (peek() === "|") { advance(); addToken(TokenType.OR, "||"); }
                else { throw new Error(`Caractere inesperado '|' na linha ${line}, coluna ${column - 1}. Voce quis dizer '||'?`); }
                break;
            case ";": break; // semicolons opcionais, ignorados
            default:
                throw new Error(`Caractere inesperado '${ch}' na linha ${line}, coluna ${column - 1}`);
        }
    }

    tokens.push({ type: TokenType.EOF, value: "", line, column });
    return tokens;
};
