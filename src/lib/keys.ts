const COMBINING_MARKS = /[̀-ͯ]/g;

/** Mirrors eduverify's parser/dynamo_item.py (Python) and web/lib/keys.ts (TS) so PKs
 * computed here match what's actually seeded into the shared DynamoDB table. If this
 * slugify algorithm ever changes, all three locations must change together or lookups
 * by id will silently miss rows — see keys.test.ts's known-slug assertions, which are
 * the only automated guard against drift between the two repos. */
function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

export function institutionKey(institution: { name: string; registration_number?: string | null }): string {
  if (institution.registration_number) {
    return `INST#${institution.registration_number}`;
  }
  return `INST#NAME#${slugify(institution.name)}`;
}
