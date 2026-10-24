/**
 * Decouples the API layer from the router: `client.ts` must not import the
 * router (circular import through views), so it emits an event and `main.ts`
 * wires it to an actual navigation.
 */
type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export function onUnauthorized(next: UnauthorizedHandler): void {
  handler = next;
}

export function emitUnauthorized(): void {
  handler?.();
}
