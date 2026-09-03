export const rpName = "Control de personal";
export const rpID = process.env.RP_ID ?? "localhost";
export const origin = process.env.ORIGIN ?? `http://${rpID}:3000`;

// Reto temporal en memoria para las ceremonias WebAuthn (registro y login).
// ponytail: mapa en memoria de un solo proceso, si se escala a múltiples
// instancias hay que mover esto a la DB/Redis con TTL.
const challenges = new Map<string, string>();

export function setChallenge(key: string, challenge: string) {
  challenges.set(key, challenge);
}

export function popChallenge(key: string): string | undefined {
  const c = challenges.get(key);
  challenges.delete(key);
  return c;
}
