import type { PhpFunction } from "../../electron/code-symbols.mjs";

// Core function signatures, captured with PHP Reflection (8.5); no PHP runtime is needed by the editor.
export const phpBuiltins: PhpFunction[] = [
  {
    name: "strlen",
    parameters: [
      {
        label: "string $string",
        name: "$string",
      },
    ],
    signature: "strlen(string $string): int",
    fullName: "strlen",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Geeft de lengte van een string in bytes.",
    from: 0,
    to: 0,
  },
  {
    name: "count",
    parameters: [
      {
        label: "Countable|array $value",
        name: "$value",
      },
      {
        label: "int $mode = COUNT_NORMAL",
        name: "$mode",
      },
    ],
    signature: "count(Countable|array $value, int $mode = COUNT_NORMAL): int",
    fullName: "count",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Telt de elementen in een array.",
    from: 0,
    to: 0,
  },
  {
    name: "explode",
    parameters: [
      {
        label: "string $separator",
        name: "$separator",
      },
      {
        label: "string $string",
        name: "$string",
      },
      {
        label: "int $limit = PHP_INT_MAX",
        name: "$limit",
      },
    ],
    signature:
      "explode(string $separator, string $string, int $limit = PHP_INT_MAX): array",
    fullName: "explode",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Splitst een string op een scheidingsteken.",
    from: 0,
    to: 0,
  },
  {
    name: "implode",
    parameters: [
      {
        label: "array|string $separator",
        name: "$separator",
      },
      {
        label: "?array $array = NULL",
        name: "$array",
      },
    ],
    signature: "implode(array|string $separator, ?array $array = NULL): string",
    fullName: "implode",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Voegt array-elementen samen tot één string.",
    from: 0,
    to: 0,
  },
  {
    name: "htmlspecialchars",
    parameters: [
      {
        label: "string $string",
        name: "$string",
      },
      {
        label: "int $flags = 11",
        name: "$flags",
      },
      {
        label: "?string $encoding = NULL",
        name: "$encoding",
      },
      {
        label: "bool $double_encode = true",
        name: "$double_encode",
      },
    ],
    signature:
      "htmlspecialchars(string $string, int $flags = 11, ?string $encoding = NULL, bool $double_encode = true): string",
    fullName: "htmlspecialchars",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Zet speciale tekens om voor weergave in HTML.",
    from: 0,
    to: 0,
  },
  {
    name: "trim",
    parameters: [
      {
        label: "string $string",
        name: "$string",
      },
      {
        label: "string $characters = '\r\t\u000b' . \"\\0\" . ''",
        name: "$characters",
      },
    ],
    signature:
      "trim(string $string, string $characters = '\r\t\u000b' . \"\\0\" . ''): string",
    fullName: "trim",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Verwijdert witruimte aan het begin en einde.",
    from: 0,
    to: 0,
  },
  {
    name: "strtolower",
    parameters: [
      {
        label: "string $string",
        name: "$string",
      },
    ],
    signature: "strtolower(string $string): string",
    fullName: "strtolower",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Zet een string om naar kleine letters.",
    from: 0,
    to: 0,
  },
  {
    name: "strtoupper",
    parameters: [
      {
        label: "string $string",
        name: "$string",
      },
    ],
    signature: "strtoupper(string $string): string",
    fullName: "strtoupper",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Zet een string om naar hoofdletters.",
    from: 0,
    to: 0,
  },
  {
    name: "substr",
    parameters: [
      {
        label: "string $string",
        name: "$string",
      },
      {
        label: "int $offset",
        name: "$offset",
      },
      {
        label: "?int $length = NULL",
        name: "$length",
      },
    ],
    signature:
      "substr(string $string, int $offset, ?int $length = NULL): string",
    fullName: "substr",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Haalt een deel uit een string.",
    from: 0,
    to: 0,
  },
  {
    name: "str_replace",
    parameters: [
      {
        label: "array|string $search",
        name: "$search",
      },
      {
        label: "array|string $replace",
        name: "$replace",
      },
      {
        label: "array|string $subject",
        name: "$subject",
      },
      {
        label: "&$count = NULL",
        name: "$count",
      },
    ],
    signature:
      "str_replace(array|string $search, array|string $replace, array|string $subject, &$count = NULL): array|string",
    fullName: "str_replace",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Vervangt tekst in een string.",
    from: 0,
    to: 0,
  },
  {
    name: "strpos",
    parameters: [
      {
        label: "string $haystack",
        name: "$haystack",
      },
      {
        label: "string $needle",
        name: "$needle",
      },
      {
        label: "int $offset = 0",
        name: "$offset",
      },
    ],
    signature:
      "strpos(string $haystack, string $needle, int $offset = 0): int|false",
    fullName: "strpos",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Zoekt de positie van tekst; geeft false als die ontbreekt.",
    from: 0,
    to: 0,
  },
  {
    name: "str_contains",
    parameters: [
      {
        label: "string $haystack",
        name: "$haystack",
      },
      {
        label: "string $needle",
        name: "$needle",
      },
    ],
    signature: "str_contains(string $haystack, string $needle): bool",
    fullName: "str_contains",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Controleert of een string bepaalde tekst bevat.",
    from: 0,
    to: 0,
  },
  {
    name: "str_starts_with",
    parameters: [
      {
        label: "string $haystack",
        name: "$haystack",
      },
      {
        label: "string $needle",
        name: "$needle",
      },
    ],
    signature: "str_starts_with(string $haystack, string $needle): bool",
    fullName: "str_starts_with",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "str_ends_with",
    parameters: [
      {
        label: "string $haystack",
        name: "$haystack",
      },
      {
        label: "string $needle",
        name: "$needle",
      },
    ],
    signature: "str_ends_with(string $haystack, string $needle): bool",
    fullName: "str_ends_with",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "sprintf",
    parameters: [
      {
        label: "string $format",
        name: "$format",
      },
      {
        label: "mixed ...$values",
        name: "$values",
      },
    ],
    signature: "sprintf(string $format, mixed ...$values): string",
    fullName: "sprintf",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "printf",
    parameters: [
      {
        label: "string $format",
        name: "$format",
      },
      {
        label: "mixed ...$values",
        name: "$values",
      },
    ],
    signature: "printf(string $format, mixed ...$values): int",
    fullName: "printf",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "number_format",
    parameters: [
      {
        label: "float $num",
        name: "$num",
      },
      {
        label: "int $decimals = 0",
        name: "$decimals",
      },
      {
        label: "?string $decimal_separator = '.'",
        name: "$decimal_separator",
      },
      {
        label: "?string $thousands_separator = ','",
        name: "$thousands_separator",
      },
    ],
    signature:
      "number_format(float $num, int $decimals = 0, ?string $decimal_separator = '.', ?string $thousands_separator = ','): string",
    fullName: "number_format",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "round",
    parameters: [
      {
        label: "int|float $num",
        name: "$num",
      },
      {
        label: "int $precision = 0",
        name: "$precision",
      },
      {
        label: "RoundingMode|int $mode = RoundingMode::HalfAwayFromZero",
        name: "$mode",
      },
    ],
    signature:
      "round(int|float $num, int $precision = 0, RoundingMode|int $mode = RoundingMode::HalfAwayFromZero): float",
    fullName: "round",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "abs",
    parameters: [
      {
        label: "int|float $num",
        name: "$num",
      },
    ],
    signature: "abs(int|float $num): int|float",
    fullName: "abs",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "min",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
      {
        label: "mixed ...$values",
        name: "$values",
      },
    ],
    signature: "min(mixed $value, mixed ...$values): mixed",
    fullName: "min",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "max",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
      {
        label: "mixed ...$values",
        name: "$values",
      },
    ],
    signature: "max(mixed $value, mixed ...$values): mixed",
    fullName: "max",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "rand",
    parameters: [
      {
        label: "int $min",
        name: "$min",
      },
      {
        label: "int $max",
        name: "$max",
      },
    ],
    signature: "rand(int $min, int $max): int",
    fullName: "rand",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "random_int",
    parameters: [
      {
        label: "int $min",
        name: "$min",
      },
      {
        label: "int $max",
        name: "$max",
      },
    ],
    signature: "random_int(int $min, int $max): int",
    fullName: "random_int",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "sort",
    parameters: [
      {
        label: "array &$array",
        name: "$array",
      },
      {
        label: "int $flags = SORT_REGULAR",
        name: "$flags",
      },
    ],
    signature: "sort(array &$array, int $flags = SORT_REGULAR): true",
    fullName: "sort",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "rsort",
    parameters: [
      {
        label: "array &$array",
        name: "$array",
      },
      {
        label: "int $flags = SORT_REGULAR",
        name: "$flags",
      },
    ],
    signature: "rsort(array &$array, int $flags = SORT_REGULAR): true",
    fullName: "rsort",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "array_push",
    parameters: [
      {
        label: "array &$array",
        name: "$array",
      },
      {
        label: "mixed ...$values",
        name: "$values",
      },
    ],
    signature: "array_push(array &$array, mixed ...$values): int",
    fullName: "array_push",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "array_pop",
    parameters: [
      {
        label: "array &$array",
        name: "$array",
      },
    ],
    signature: "array_pop(array &$array): mixed",
    fullName: "array_pop",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "array_merge",
    parameters: [
      {
        label: "array ...$arrays",
        name: "$arrays",
      },
    ],
    signature: "array_merge(array ...$arrays): array",
    fullName: "array_merge",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "array_keys",
    parameters: [
      {
        label: "array $array",
        name: "$array",
      },
      {
        label: "mixed $filter_value",
        name: "$filter_value",
      },
      {
        label: "bool $strict = false",
        name: "$strict",
      },
    ],
    signature:
      "array_keys(array $array, mixed $filter_value, bool $strict = false): array",
    fullName: "array_keys",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "array_values",
    parameters: [
      {
        label: "array $array",
        name: "$array",
      },
    ],
    signature: "array_values(array $array): array",
    fullName: "array_values",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "array_map",
    parameters: [
      {
        label: "?callable $callback",
        name: "$callback",
      },
      {
        label: "array $array",
        name: "$array",
      },
      {
        label: "array ...$arrays",
        name: "$arrays",
      },
    ],
    signature:
      "array_map(?callable $callback, array $array, array ...$arrays): array",
    fullName: "array_map",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Past een functie toe op array-elementen.",
    from: 0,
    to: 0,
  },
  {
    name: "array_filter",
    parameters: [
      {
        label: "array $array",
        name: "$array",
      },
      {
        label: "?callable $callback = NULL",
        name: "$callback",
      },
      {
        label: "int $mode = 0",
        name: "$mode",
      },
    ],
    signature:
      "array_filter(array $array, ?callable $callback = NULL, int $mode = 0): array",
    fullName: "array_filter",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Filtert array-elementen met een functie.",
    from: 0,
    to: 0,
  },
  {
    name: "in_array",
    parameters: [
      {
        label: "mixed $needle",
        name: "$needle",
      },
      {
        label: "array $haystack",
        name: "$haystack",
      },
      {
        label: "bool $strict = false",
        name: "$strict",
      },
    ],
    signature:
      "in_array(mixed $needle, array $haystack, bool $strict = false): bool",
    fullName: "in_array",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Controleert of een waarde in een array voorkomt.",
    from: 0,
    to: 0,
  },
  {
    name: "array_key_exists",
    parameters: [
      {
        label: "$key",
        name: "$key",
      },
      {
        label: "array $array",
        name: "$array",
      },
    ],
    signature: "array_key_exists($key, array $array): bool",
    fullName: "array_key_exists",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Controleert of een sleutel in een array bestaat.",
    from: 0,
    to: 0,
  },
  {
    name: "is_array",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
    ],
    signature: "is_array(mixed $value): bool",
    fullName: "is_array",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "is_string",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
    ],
    signature: "is_string(mixed $value): bool",
    fullName: "is_string",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "is_numeric",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
    ],
    signature: "is_numeric(mixed $value): bool",
    fullName: "is_numeric",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "intval",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
      {
        label: "int $base = 10",
        name: "$base",
      },
    ],
    signature: "intval(mixed $value, int $base = 10): int",
    fullName: "intval",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "floatval",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
    ],
    signature: "floatval(mixed $value): float",
    fullName: "floatval",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "json_encode",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
      {
        label: "int $flags = 0",
        name: "$flags",
      },
      {
        label: "int $depth = 512",
        name: "$depth",
      },
    ],
    signature:
      "json_encode(mixed $value, int $flags = 0, int $depth = 512): string|false",
    fullName: "json_encode",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Zet een waarde om naar JSON.",
    from: 0,
    to: 0,
  },
  {
    name: "json_decode",
    parameters: [
      {
        label: "string $json",
        name: "$json",
      },
      {
        label: "?bool $associative = NULL",
        name: "$associative",
      },
      {
        label: "int $depth = 512",
        name: "$depth",
      },
      {
        label: "int $flags = 0",
        name: "$flags",
      },
    ],
    signature:
      "json_decode(string $json, ?bool $associative = NULL, int $depth = 512, int $flags = 0): mixed",
    fullName: "json_decode",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Zet JSON om naar een PHP-waarde.",
    from: 0,
    to: 0,
  },
  {
    name: "date",
    parameters: [
      {
        label: "string $format",
        name: "$format",
      },
      {
        label: "?int $timestamp = NULL",
        name: "$timestamp",
      },
    ],
    signature: "date(string $format, ?int $timestamp = NULL): string",
    fullName: "date",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Maakt een datumtekst met een opgegeven formaat.",
    from: 0,
    to: 0,
  },
  {
    name: "time",
    parameters: [],
    signature: "time(): int",
    fullName: "time",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "file_get_contents",
    parameters: [
      {
        label: "string $filename",
        name: "$filename",
      },
      {
        label: "bool $use_include_path = false",
        name: "$use_include_path",
      },
      {
        label: "$context = NULL",
        name: "$context",
      },
      {
        label: "int $offset = 0",
        name: "$offset",
      },
      {
        label: "?int $length = NULL",
        name: "$length",
      },
    ],
    signature:
      "file_get_contents(string $filename, bool $use_include_path = false, $context = NULL, int $offset = 0, ?int $length = NULL): string|false",
    fullName: "file_get_contents",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Leest de inhoud van een bestand.",
    from: 0,
    to: 0,
  },
  {
    name: "file_put_contents",
    parameters: [
      {
        label: "string $filename",
        name: "$filename",
      },
      {
        label: "mixed $data",
        name: "$data",
      },
      {
        label: "int $flags = 0",
        name: "$flags",
      },
      {
        label: "$context = NULL",
        name: "$context",
      },
    ],
    signature:
      "file_put_contents(string $filename, mixed $data, int $flags = 0, $context = NULL): int|false",
    fullName: "file_put_contents",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Schrijft een string naar een bestand.",
    from: 0,
    to: 0,
  },
  {
    name: "filter_var",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
      {
        label: "int $filter = FILTER_DEFAULT",
        name: "$filter",
      },
      {
        label: "array|int $options = 0",
        name: "$options",
      },
    ],
    signature:
      "filter_var(mixed $value, int $filter = FILTER_DEFAULT, array|int $options = 0): mixed",
    fullName: "filter_var",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "",
    from: 0,
    to: 0,
  },
  {
    name: "var_dump",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
      {
        label: "mixed ...$values",
        name: "$values",
      },
    ],
    signature: "var_dump(mixed $value, mixed ...$values): void",
    fullName: "var_dump",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Toont het type en de inhoud van een waarde.",
    from: 0,
    to: 0,
  },
  {
    name: "print_r",
    parameters: [
      {
        label: "mixed $value",
        name: "$value",
      },
      {
        label: "bool $return = false",
        name: "$return",
      },
    ],
    signature: "print_r(mixed $value, bool $return = false): string|true",
    fullName: "print_r",
    namespace: "",
    owner: "",
    path: "PHP",
    info: "Toont een leesbare voorstelling van een waarde.",
    from: 0,
    to: 0,
  },
];
