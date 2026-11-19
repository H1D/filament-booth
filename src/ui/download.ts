/** Saves a blob as a file through a temporary link, the way a browser offers a download. */
export function downloadAs(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => { URL.revokeObjectURL(url); }, 0);
}
