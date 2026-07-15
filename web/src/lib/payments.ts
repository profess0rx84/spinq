// Strips a leading @ or $ so it doesn't matter how the DJ typed their handle.
export function cleanHandle(raw: string): string {
  return raw.trim().replace(/^[@$]+/, "");
}

export function venmoLink(handle: string, amount: number, note: string): string {
  const params = new URLSearchParams({ txn: "pay", amount: String(amount), note });
  return `https://venmo.com/${cleanHandle(handle)}?${params.toString()}`;
}

export function cashAppLink(handle: string, amount: number): string {
  return `https://cash.app/$${cleanHandle(handle)}/${amount}`;
}
