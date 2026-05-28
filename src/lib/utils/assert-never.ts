/**
 * assertNever — exhaustive switch helper.
 * Use as the final return of any switch over a union type.
 * TypeScript will error at compile time if any case is unhandled.
 *
 * Usage:
 *   switch (type) {
 *     case "a": return A;
 *     case "b": return B;
 *   }
 *   return assertNever(type);  // compile error if "a"|"b" is not fully covered
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${x as string}`);
}
