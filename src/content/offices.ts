/** MSFG office directory — shown on /about. Phones are from the live contact
 *  page and differ from the site-wide footer line; tagged [VERIFY] until the
 *  company confirms the canonical per-office numbers. */
export type Office = { city: string; address: string; phone: string; primary?: boolean };

export const OFFICES: Office[] = [
  {
    city: "Westminster",
    address: "9035 Wadsworth Parkway, Suite 3400, Westminster, CO 80021",
    phone: "(720) 838-6372", // [VERIFY]
    primary: true,
  },
  {
    city: "Bismarck",
    address: "1600 E Interstate Ave, Ste 4, Bismarck, ND 58503",
    phone: "(701) 955-0597", // [VERIFY]
  },
  {
    city: "Fargo",
    address: "1630 1st Ave N, Ste B, Fargo, ND 58102",
    phone: "(701) 561-8266", // [VERIFY]
  },
];
