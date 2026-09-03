// Body vacío o JSON malformado no debe tirar un 500 sin manejar.
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
