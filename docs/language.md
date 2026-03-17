# Documentacao da Linguagem miniOS

Referencia completa da linguagem de alto nivel do miniOS — uma linguagem compilada, estaticamente tipada, com gerenciamento manual de memoria, projetada para demonstrar como linguagens de programacao sao compiladas ate pseudo-assembly.

## Indice

1. [Visao geral](#visao-geral)
2. [Pipeline de compilacao](#pipeline-de-compilacao)
3. [Estrutura lexico](#estrutura-lexica)
4. [Sistema de tipos](#sistema-de-tipos)
5. [Declaracoes top-level](#declaracoes-top-level)
6. [Statements](#statements)
7. [Expressoes](#expressoes)
8. [Precedencia de operadores](#precedencia-de-operadores)
9. [Gerenciamento de memoria](#gerenciamento-de-memoria)
10. [Convencao de chamada](#convencao-de-chamada)
11. [Gerador de codigo](#gerador-de-codigo)
12. [Erros do compilador](#erros-do-compilador)
13. [Limitacoes conhecidas](#limitacoes-conhecidas)
14. [Exemplos completos](#exemplos-completos)

---

## Visao geral

A linguagem miniOS e uma linguagem imperativa com as seguintes caracteristicas:

- **Tipagem estatica** — toda variavel tem um tipo declarado explicitamente
- **Gerenciamento manual de memoria** — alocacao com `alloc`, liberacao com `free`
- **Structs como unico tipo composto** — sem arrays, strings ou classes
- **Funcoes como unica unidade de abstraccao** — sem closures, lambdas ou metodos
- **Sem garbage collector** — o programador e responsavel por liberar memoria
- **Compilacao em duas passadas** — permite recursao mutua entre funcoes
- **Ponto de entrada obrigatorio** — toda execucao comeca pela funcao `main`

---

## Pipeline de compilacao

```
Codigo fonte
    |
    v
 [Lexer]        tokenize(source) -> Token[]
    |            Converte texto em tokens, remove whitespace e comentarios
    v
 [Parser]       parse(tokens) -> Program (AST)
    |            Recursive descent, produz arvore sintatica abstrata
    v
 [Codegen]      generateCode(ast) -> Instruction[]
    |            Duas passadas: coleta enderecos, depois gera instrucoes
    v
 Instruction[]  Array de instrucoes de pseudo-assembly para a CPU
```

Cada fase pode ser executada independentemente:

```typescript
import { tokenize, parse, generateCode, compile } from "minios";

// Pipeline completo
const program = compile(source);

// Ou fase por fase
const tokens = tokenize(source);
const ast = parse(tokens);
const instructions = generateCode(ast);
```

---

## Estrutura lexica

### Tokens

A linguagem reconhece os seguintes tipos de tokens:

| Categoria | Tokens |
|---|---|
| Literais | `NUMBER_LITERAL` (inteiros decimais), `IDENTIFIER` |
| Keywords | `fn`, `struct`, `return`, `alloc`, `free`, `ref`, `if`, `else`, `while` |
| Tipos primitivos | `number`, `char` |
| Aritmeticos | `+`, `-`, `*`, `/` |
| Atribuicao | `=` |
| Comparacao | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| Logicos | `&&`, `\|\|`, `!` |
| Delimitadores | `(`, `)`, `{`, `}`, `<`, `>`, `:`, `,`, `.` |

### Identificadores

Comecam com letra (`a-z`, `A-Z`) ou `_`, seguido por letras, digitos ou `_`.

```
nome
_privado
minhaVar123
Point
```

### Literais numericos

Apenas inteiros decimais positivos. Numeros negativos sao expressos com o operador unario `-` (via subtracao: `0 - 42`).

```
0
42
1000
```

### Comentarios

Tres formas suportadas:

```
// comentario de linha

# tambem comentario de linha

/* comentario
   de bloco
   multilinha */
```

### Ponto e virgula

Ponto e virgula (`;`) e **opcional** — o lexer ignora silenciosamente. Statements sao delimitados pela estrutura sintatica (keywords, chaves, etc).

```
x: number = 10;    // OK, ; ignorado
x: number = 10     // OK, sem ;
```

### Caracteres invalidos

`&` isolado (sem ser `&&`) e `|` isolado (sem ser `||`) geram erro lexico com mensagem sugerindo o operador correto.

---

## Sistema de tipos

A linguagem possui dois tipos primitivos e um tipo de referencia:

### `number`

Inteiro de 32 bits (1 word = 4 bytes). Armazenado em little-endian na memoria. Todas as operacoes aritmeticas operam sobre `number`.

```
x: number = 42
```

### `char`

Declarado no lexer mas **sem suporte a literais char no parser/codegen**. Existe como reserva para extensao futura. Ocupa 1 word na pratica (mesmo tamanho que `number`).

### `ref<NomeStruct>`

Referencia (ponteiro) para uma instancia de struct alocada no heap. O valor armazenado e o endereco de inicio do bloco no heap.

```
p: ref<Point> = alloc(Point)
```

O tipo `ref` e parametrizado pelo nome do struct. O compilador usa essa informacao para:
- Calcular offsets de campos em acessos `p.x`
- Determinar o tamanho da alocacao em `alloc(Point)`

---

## Declaracoes top-level

Um programa e uma sequencia de declaracoes `struct` e `fn`, em qualquer ordem. Nao ha statements soltos fora de funcoes.

```
struct Point { ... }
fn helper(): number { ... }
fn main() { ... }
```

### `struct`

Define um tipo composto com campos nomeados e tipados. Cada campo ocupa exatamente 1 word (4 bytes), independente do tipo.

**Sintaxe:**
```
struct NomeStruct {
    campo1: tipo
    campo2: tipo
    ...
}
```

**Exemplo:**
```
struct Point {
    x: number
    y: number
}
```

**Layout na memoria (heap):**

Os campos sao dispostos sequencialmente a partir do endereco base retornado por `alloc`:

```
Endereco base + 0:  campo1 (4 bytes)
Endereco base + 4:  campo2 (4 bytes)
Endereco base + 8:  campo3 (4 bytes)
...
```

Para o `Point` acima: `sizeof(Point) = 8 bytes`, com `x` no offset 0 e `y` no offset 4.

**Restricoes:**
- Campos so podem ser `number`, `char`, ou `ref<OutroStruct>`
- Nao ha structs aninhados inline (apenas via referencia)
- Nao ha metodos — funcoes sao sempre top-level

### `fn`

Define uma funcao com parametros tipados, tipo de retorno opcional, e corpo.

**Sintaxe:**
```
fn nome(param1: tipo, param2: tipo): tipoRetorno {
    // corpo
}
```

O tipo de retorno e opcional. Se omitido, a funcao nao retorna valor explicitamente (equivalente a `void`).

```
fn semRetorno() {
    // ...
}

fn comRetorno(): number {
    return 42
}
```

**Funcao `main`:**

Todo programa **deve** ter uma funcao `main`. Ela e o ponto de entrada — o compilador gera `CALL main` como primeira instrucao, seguido de `HALT`.

```
fn main() {
    // execucao comeca aqui
}
```

`main` pode ter tipo de retorno. O valor fica em `R0` apos a execucao.

---

## Statements

Dentro do corpo de funcoes, os seguintes statements sao permitidos:

### Declaracao de variavel

Declara uma variavel local com tipo explicito e inicializador obrigatorio.

**Sintaxe:**
```
nome: tipo = expressao
```

**Exemplos:**
```
x: number = 0
p: ref<Point> = alloc(Point)
soma: number = a + b
```

**Semantica:**
1. A expressao inicializadora e compilada (resultado em `R0`)
2. O valor e empurrado na stack (`PUSH R0`)
3. A variavel e associada ao offset `FP - N` no stack frame

**Restricoes:**
- Toda variavel **deve** ter inicializador (nao existe declaracao sem valor)
- O tipo e obrigatorio (nao ha inferencia de tipos)
- Variaveis sao locais a funcao — nao existem variaveis globais
- Nao e possivel redeclarar uma variavel no mesmo escopo

### Atribuicao

Atribui um novo valor a uma variavel existente ou a um campo de struct.

**Sintaxe:**
```
variavel = expressao
ponteiro.campo = expressao
```

**Exemplos:**
```
x = x + 1
p.x = 10
p.y = soma(a, b)
```

**Atribuicao a campo:**
1. O valor e compilado e salvo na stack
2. O ponteiro (endereco base) e compilado em `R0`
3. O offset do campo e somado ao endereco base
4. `STORE [endereco], valor`

### `return`

Retorna um valor da funcao. O valor fica em `R0`.

**Sintaxe:**
```
return expressao
```

**Exemplo:**
```
fn dobro(n: number): number {
    return n * 2
}
```

**Semantica:**
1. A expressao e compilada (resultado em `R0`)
2. `RET` e emitido — restaura FP, SP, e pula para o endereco de retorno

Se uma funcao termina sem `return` explicito, o compilador insere um `RET` automatico (com valor indefinido em `R0`).

### `free`

Libera um bloco de memoria do heap.

**Sintaxe:**
```
free(expressao)
```

**Exemplo:**
```
free(p)
```

**Semantica:**
1. A expressao e compilada (endereco em `R0`)
2. `FREE R0` e emitido — o heap marca o bloco como livre e zera a memoria

**Erros em runtime:**
- `free` de endereco nao alocado → erro
- `free` duplo no mesmo endereco → erro de double-free

### `if` / `else if` / `else`

Execucao condicional com encadeamento opcional.

**Sintaxe:**
```
if (condicao) {
    // consequente
}

if (condicao) {
    // consequente
} else {
    // alternativo
}

if (condicao1) {
    // ...
} else if (condicao2) {
    // ...
} else {
    // ...
}
```

**Semantica:**
- A condicao e compilada → `R0`
- `CMP R0, 0` — se zero (falsy), pula para else/fim
- Valores truthy: qualquer `number` diferente de zero
- Valores falsy: `0`

**Chaves obrigatorias:** o corpo do `if` e `else` sempre exige `{ }`, mesmo para uma unica linha.

```
// CORRETO
if (x > 0) {
    return x
}

// INCORRETO — nao compila
if (x > 0) return x
```

### `while`

Loop condicional.

**Sintaxe:**
```
while (condicao) {
    // corpo
}
```

**Exemplo:**
```
i: number = 0
soma: number = 0
while (i < 10) {
    soma = soma + i
    i = i + 1
}
```

**Semantica (codigo gerado):**
```
loop:
    compila condicao → R0
    CMP R0, 0
    JZ exit           // se falsy, sai do loop
    compila corpo
    JMP loop          // volta para testar condicao
exit:
```

**Nota:** nao existem `break` ou `continue`.

### Expression statement

Qualquer expressao usada como statement. Util para chamadas de funcao com efeito colateral.

```
minhaFuncao(42)
```

---

## Expressoes

Toda expressao produz um valor em `R0`.

### Literal numerico

```
42
0
1000
```

Gera: `MOV R0, <valor>`

### Identificador (variavel)

```
x
meuPonteiro
```

Gera: calcula endereco `FP + offset`, depois `LOAD R0, [endereco]`

### Expressao aritmetica

```
a + b
x * 2
(a + b) / c
n - 1
```

Operadores: `+`, `-`, `*`, `/`

**Semantica da compilacao:**
1. Compila lado esquerdo → `R0`, salva com `PUSH R0`
2. Compila lado direito → `R0`
3. `MOV R1, R0` (direito vai para R1)
4. `POP R0` (esquerdo volta para R0)
5. `ADD/SUB/MUL/DIV R0, R1`

Divisao inteira. Divisao por zero causa erro em runtime.

### Expressao de comparacao

```
a == b
x != 0
i < 10
n >= 1
a > b
x <= 100
```

Operadores: `==`, `!=`, `<`, `>`, `<=`, `>=`

Retorna `1` (true) ou `0` (false) em `R0`.

**Implementacao interna:**
- `>` e compilado como `<` com operandos invertidos
- `<=` e compilado como `>=` com operandos invertidos
- Usa `CMP` seguido de jump condicional sobre `MOV R0, 1`

**Restricao:** comparacoes nao sao encadeaveis. `a < b < c` nao funciona como esperado — e parseado como `(a < b) < c`, onde `(a < b)` produz 0 ou 1.

### Expressao logica

```
a && b
x || y
a > 0 && b > 0
```

Operadores: `&&`, `||`

**Short-circuit evaluation:**
- `&&`: se o lado esquerdo e `0` (falsy), o lado direito **nao e avaliado** e o resultado e `0`
- `||`: se o lado esquerdo e diferente de `0` (truthy), o lado direito **nao e avaliado** e o resultado e o valor do lado esquerdo

**Implementacao:**
```
// a && b
compila a → R0
CMP R0, 0
JZ end          // short-circuit: R0 ja e 0
compila b → R0
end:

// a || b
compila a → R0
CMP R0, 0
JNZ end         // short-circuit: R0 ja e truthy
compila b → R0
end:
```

### Expressao unaria

```
!condicao
!(a > 0)
```

Operador: `!` (negacao logica)

- Se o operando e `0` → resultado e `1`
- Se o operando e diferente de `0` → resultado e `0`

### Chamada de funcao

```
soma(1, 2)
factorial(n - 1)
midPoint(p1, p2)
```

**Sintaxe:**
```
nomeFuncao(arg1, arg2, ...)
```

**Semantica da compilacao:**
1. Argumentos compilados e empurrados na stack **da direita para a esquerda**
2. `CALL endereco` — salva FP e endereco de retorno, cria novo frame
3. Funcao executa, resultado em `R0`
4. `RET` — restaura FP, volta para o caller
5. Caller faz `POP` para cada argumento (limpeza da stack)

Funcoes podem ser recursivas e mutuamente recursivas (resolvido pela compilacao em duas passadas).

### Acesso a campo

```
p.x
p.y
ponto.coordenada
```

**Sintaxe:**
```
expressao.campo
```

Encadeamento e suportado: `a.b.c` (embora exija que `a.b` retorne um `ref`).

**Semantica:**
1. Compila a expressao objeto → `R0` (endereco base no heap)
2. Soma o offset do campo ao endereco
3. `LOAD R0, [endereco]` — carrega o valor do campo

O compilador resolve o struct associado a expressao via informacao de tipo dos parametros e variaveis locais.

### Expressao `alloc`

```
alloc(Point)
alloc(Node)
```

**Sintaxe:**
```
alloc(NomeStruct)
```

Aloca `sizeof(NomeStruct)` bytes no heap e retorna o endereco em `R0`.

**Gera:** `ALLOC R0, <tamanho>`

O tamanho e calculado em tempo de compilacao: `numero_de_campos * WORD_SIZE (4)`.

### Expressao entre parenteses

```
(a + b) * c
!(x > 0)
```

Parenteses agrupam expressoes e alteram a precedencia.

---

## Precedencia de operadores

Da menor para a maior precedencia:

| Nivel | Operadores | Associatividade | Descricao |
|---|---|---|---|
| 1 | `\|\|` | Esquerda | OR logico (short-circuit) |
| 2 | `&&` | Esquerda | AND logico (short-circuit) |
| 3 | `==` `!=` `<` `>` `<=` `>=` | Nenhuma | Comparacao (nao encadeavel) |
| 4 | `+` `-` | Esquerda | Adicao e subtracao |
| 5 | `*` `/` | Esquerda | Multiplicacao e divisao |
| 6 | `!` | Direita (prefixo) | Negacao logica |
| 7 | `.` | Esquerda (posfixo) | Acesso a campo |
| 8 | `()` | — | Chamada de funcao / agrupamento |

**Exemplos de precedencia:**

```
a + b * c         // a + (b * c)
a * b + c         // (a * b) + c
!a && b           // (!a) && b
a || b && c       // a || (b && c)
a > 0 && b > 0   // (a > 0) && (b > 0)
p.x + p.y         // (p.x) + (p.y)
```

---

## Gerenciamento de memoria

### Modelo

A memoria virtual do miniOS e dividida em:

```
Endereco 0                              Endereco N
┌────────────┬──────────┬────────────┐
│   HEAP →   │ (livre)  │   ← STACK  │
└────────────┴──────────┴────────────┘
^                                    ^
HP                                  SP
```

- **Heap** cresce para cima (enderecos crescentes) a partir de 0
- **Stack** cresce para baixo (enderecos decrescentes) a partir do topo
- Se `HP > SP` → **colisao de memoria** (erro fatal)

### Alocacao (`alloc`)

```
p: ref<Point> = alloc(Point)
```

1. O compilador calcula `sizeof(Point)` em tempo de compilacao
2. O heap usa **first-fit**: procura o primeiro bloco livre grande o suficiente
3. Se nao encontrar, aloca no fim do heap e avanca HP
4. Retorna o endereco base do bloco

### Liberacao (`free`)

```
free(p)
```

1. O heap marca o bloco como livre
2. A memoria e zerada (`fillRange`)
3. O bloco fica disponivel para reuso por futuras alocacoes

**Erros:**
- `free` de endereco nao alocado → `"Endereco X nao foi alocado no heap"`
- `free` duplo → `"Double free detectado no endereco X"`

### Ciclo de vida tipico

```
// 1. Aloca
p: ref<MinhaStruct> = alloc(MinhaStruct)

// 2. Usa
p.campo = 42
resultado: number = p.campo + 1

// 3. Libera
free(p)

// Depois de free(p), acessar p.campo causa comportamento indefinido
// (a memoria foi zerada, mas o ponteiro ainda existe na stack)
```

---

## Convencao de chamada

### Visao do Caller (quem chama)

```
// Fonte:
resultado: number = soma(10, 20)

// Codigo gerado:
PUSH 20          // arg 1 (direita para esquerda)
PUSH 10          // arg 0
CALL soma        // salva FP + retorno, pula para soma
POP R3           // limpa arg 0
POP R3           // limpa arg 1
                 // resultado em R0
```

### Visao do Callee (funcao chamada)

```
fn soma(a: number, b: number): number {
    return a + b
}
```

**Layout do stack frame apos CALL:**

```
Enderecos altos (stack cresce para baixo)
    ...
    @(FP + 8)   = argumento 0 (a = 10)     // empurrado por ultimo
    @(FP + 4)   = argumento 1 (b = 20)     // empurrado primeiro
    @(FP)       = FP anterior (salvo por CALL)
    @(FP - 4)   = endereco de retorno (salvo por CALL)
    @(FP - 8)   = variavel local 0         // empurrado por declaracao
    @(FP - 12)  = variavel local 1
    ...         = SP (proximo livre)
Enderecos baixos
```

**Offsets:**
- Parametro `i` esta em `FP + 4 + i * 4`
  - Parametro 0: `FP + 4`
  - Parametro 1: `FP + 8`
  - Parametro 2: `FP + 12`
- Local `j` esta em `FP - 8 - j * 4`
  - Local 0: `FP - 8`
  - Local 1: `FP - 12`

### Registradores na chamada

| Registrador | Papel |
|---|---|
| `R0` | Valor de retorno |
| `R1` | Temporario (lado direito de expressoes binarias) |
| `R2` | Temporario (calculos de endereco) |
| `R3` | Descarte (limpeza de argumentos) |
| `FP` | Frame pointer — base do frame atual |
| `SP` | Stack pointer — proximo byte livre |

### Recursao

A convencao de chamada suporta recursao naturalmente — cada chamada cria um novo frame na stack:

```
fn factorial(n: number): number {
    if (n <= 1) {
        return 1
    }
    return n * factorial(n - 1)
}
```

Cada chamada recursiva empurra um novo frame. O `RET` restaura o frame anterior. A profundidade e limitada pelo espaco disponivel entre HP e SP.

---

## Gerador de codigo

### Compilacao em duas passadas

O codegen faz duas passadas completas para suportar chamadas entre funcoes em qualquer ordem (incluindo recursao mutua):

**Passada 1:**
1. Coleta structs e calcula tamanhos/offsets de campos
2. Compila todas as funcoes com enderecos placeholder (0)
3. Calcula o tamanho de cada funcao compilada
4. Atribui enderecos reais (funcoes sao colocadas sequencialmente apos instrucoes 0-1)

**Passada 2:**
1. Recompila todas as funcoes com enderecos corretos
2. Todos os `CALL` e jumps agora apontam para enderecos finais

### Layout do programa final

```
Instrucao 0:  CALL main     // ponto de entrada
Instrucao 1:  HALT          // executa quando main retorna
Instrucao 2:  [funcao 1]    // primeira funcao declarada
  ...
Instrucao N:  [funcao 2]    // segunda funcao declarada
  ...
```

A ordem das funcoes no programa final segue a ordem de declaracao no codigo fonte.

### Compilacao de controle de fluxo

**if sem else:**
```
    compila condicao → R0
    CMP R0, 0
    JZ end
    compila consequente
end:
```

**if com else:**
```
    compila condicao → R0
    CMP R0, 0
    JZ else
    compila consequente
    JMP end
else:
    compila alternativo
end:
```

**while:**
```
loop:
    compila condicao → R0
    CMP R0, 0
    JZ exit
    compila corpo
    JMP loop
exit:
```

Os enderecos dos jumps sao calculados via **patching**: o codegen emite um placeholder (`imm(0)`) e depois substitui com o endereco real quando conhece o destino.

---

## Erros do compilador

### Erros lexicos (tokenize)

| Erro | Causa |
|---|---|
| `Caractere inesperado 'X'` | Caractere nao reconhecido no fonte |
| `Voce quis dizer '&&'?` | `&` isolado encontrado |
| `Voce quis dizer '\|\|'?` | `\|` isolado encontrado |

### Erros sintaticos (parse)

| Erro | Causa |
|---|---|
| `esperava 'X', encontrou 'Y'` | Token inesperado na posicao |
| `Tipo inesperado 'X'` | Tipo nao reconhecido (nem `number`, `char` ou `ref<...>`) |
| `Declaracao inesperada 'X'. Esperava 'struct' ou 'fn'` | Codigo fora de funcao/struct |
| `Expressao inesperada 'X'` | Expressao nao reconhecida |

### Erros semanticos (codegen)

| Erro | Causa |
|---|---|
| `Funcao 'main' nao encontrada` | Programa sem funcao `main` |
| `Funcao 'X' nao definida` | Chamada a funcao inexistente |
| `Variavel 'X' nao declarada` | Uso de variavel sem declaracao |
| `Struct 'X' nao definida` | `alloc` de struct inexistente |
| `Campo 'X' nao existe em 'Y'` | Acesso a campo inexistente |
| `Nao foi possivel resolver o tipo struct` | Acesso a campo em expressao de tipo nao-ref |
| `Alvo de atribuicao invalido` | Atribuicao a algo que nao e variavel ou campo |

### Erros de runtime (execucao)

| Erro | Causa |
|---|---|
| `Colisao de memoria! HP=X ultrapassou SP=Y` | Heap e stack colidiram |
| `Memoria fisica esgotada!` | Limite de frames fisicos atingido |
| `Endereco X nao foi alocado no heap` | `free` de endereco invalido |
| `Double free detectado no endereco X` | `free` duplicado |
| `Stack underflow` | `pop` em stack vazia |
| `Divisao por zero` | Divisao com divisor 0 |

---

## Limitacoes conhecidas

1. **Sem literais negativos** — nao existe `-42` como literal. Use `0 - 42`
2. **Sem strings** — o tipo `char` existe no lexer mas nao ha literais char nem operacoes sobre eles
3. **Sem arrays** — o unico tipo composto e `struct`
4. **Sem variaveis globais** — toda variavel e local a uma funcao
5. **Sem `break`/`continue`** — loops so terminam pela condicao do `while`
6. **Sem `for`** — use `while` com variavel de controle
7. **Comparacoes nao encadeaveis** — `a < b < c` e parseado como `(a < b) < c`, nao como `a < b && b < c`
8. **Sem verificacao de uso apos `free`** — acessar um ponteiro liberado compila e executa, mas os dados foram zerados
9. **Sem retorno implicito de tipo** — o compilador nao verifica se uma funcao com tipo de retorno realmente retorna em todos os caminhos
10. **Sem sobrecarga de funcoes** — cada funcao deve ter nome unico
11. **Sem modulos/imports** — todo o programa esta em um unico arquivo fonte

---

## Exemplos completos

### Fatorial recursivo

```
fn factorial(n: number): number {
    if (n <= 1) {
        return 1
    }
    return n * factorial(n - 1)
}

fn main(): number {
    return factorial(5)
    // R0 = 120
}
```

### Somatorio com while

```
fn main(): number {
    soma: number = 0
    i: number = 1
    while (i <= 100) {
        soma = soma + i
        i = i + 1
    }
    return soma
    // R0 = 5050
}
```

### Structs e heap

```
struct Point {
    x: number
    y: number
}

fn distance_squared(p1: ref<Point>, p2: ref<Point>): number {
    dx: number = p2.x - p1.x
    dy: number = p2.y - p1.y
    return dx * dx + dy * dy
}

fn main(): number {
    a: ref<Point> = alloc(Point)
    a.x = 0
    a.y = 0

    b: ref<Point> = alloc(Point)
    b.x = 3
    b.y = 4

    d: number = distance_squared(a, b)

    free(a)
    free(b)

    return d
    // R0 = 25
}
```

### Ponto medio (do example do projeto)

```
struct Pointer {
    x: number
    y: number
}

fn sum(x: number, y: number): number {
    return x + y
}

fn midPoint(p1: ref<Pointer>, p2: ref<Pointer>): ref<Pointer> {
    pret: ref<Pointer> = alloc(Pointer)
    pret.x = sum(p1.x, p2.x) / 2
    pret.y = sum(p1.y, p2.y) / 2
    return pret
}

fn main() {
    point1: ref<Pointer> = alloc(Pointer)
    point1.x = 10
    point1.y = 10

    point2: ref<Pointer> = alloc(Pointer)
    point2.x = 10
    point2.y = 20

    pmid: ref<Pointer> = midPoint(point1, point2)

    free(point1)
    free(point2)
}
```

### Operadores logicos com short-circuit

```
fn isInRange(x: number, min: number, max: number): number {
    if (x >= min && x <= max) {
        return 1
    }
    return 0
}

fn main(): number {
    return isInRange(5, 1, 10)
    // R0 = 1
}
```

### Condicional encadeado

```
fn classify(n: number): number {
    if (n > 0) {
        return 1
    } else if (n < 0) {
        return 0 - 1
    } else {
        return 0
    }
}

fn main(): number {
    return classify(0 - 42)
    // R0 = 1 (a CMP interpreta o bit de sinal corretamente,
    // mas o valor retornado por 0 - 1 e 4294967295 em unsigned 32-bit)
}
```

### Recursao mutua

```
fn isEven(n: number): number {
    if (n == 0) {
        return 1
    }
    return isOdd(n - 1)
}

fn isOdd(n: number): number {
    if (n == 0) {
        return 0
    }
    return isEven(n - 1)
}

fn main(): number {
    return isEven(10)
    // R0 = 1
}
```
