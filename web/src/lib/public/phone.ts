/** Guest phone helpers. The API is the authority; these only format and pre-check. */

const toLatin = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** "+201012345678" → "010 1234 5678"; anything else is returned as is. */
export function formatPhone(e164: string): string {
  const m = /^\+20(1\d)(\d{4})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** A quick client-side check so obvious typos fail before a code is sent. */
export function looksLikeMobile(input: string): boolean {
  let d = toLatin(input).replace(/[\s\-().+]/g, "");
  if (d.startsWith("0020")) d = "0" + d.slice(4);
  else if (d.startsWith("20") && d.length === 12) d = "0" + d.slice(2);
  return /^01[0125]\d{8}$/.test(d);
}
