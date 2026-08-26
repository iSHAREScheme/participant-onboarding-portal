// SHA-256 of a file as lowercase hex — the format the registry validates for
// claim verificationHash values (v3SHA256Hex on the satellite).
export const sha256HexOfFile = async (file: File): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
