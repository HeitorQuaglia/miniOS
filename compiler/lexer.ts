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

        // comentarios //
        if (ch === "/" && source[pos + 1] === "/") {
            while (pos < source.length && peek() !== "\n") advance();
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
            case "=": addToken(TokenType.EQUALS, ch); break;
            case ".": addToken(TokenType.DOT,    ch); break;
            case "(": addToken(TokenType.LPAREN, ch); break;
            case ")": addToken(TokenType.RPAREN, ch); break;
            case "{": addToken(TokenType.LBRACE, ch); break;
            case "}": addToken(TokenType.RBRACE, ch); break;
            case "<": addToken(TokenType.LANGLE, ch); break;
            case ">": addToken(TokenType.RANGLE, ch); break;
            case ":": addToken(TokenType.COLON,  ch); break;
            case ",": addToken(TokenType.COMMA,  ch); break;
            case ";": break; // semicolons opcionais, ignorados
            default:
                throw new Error(`Caractere inesperado '${ch}' na linha ${line}, coluna ${column - 1}`);
        }
    }

    tokens.push({ type: TokenType.EOF, value: "", line, column });
    return tokens;
};
