export async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error("File is too large. Use an image under 5 MB.");
        }
        throw new Error(`Request failed (${res.status}). Please try again.`);
      }
      throw new Error("Unexpected response from server");
    }
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}
