# Public calculators: compliance checklist

Date: 2026-11-18. For Zachary Zink, the compliance sign-off, before production cutover.

This comes from an independent read-through of the nine staging pages (the `/calculators` landing page and the eight calculators) by an AI reviewer, checked against the source. It is a list of things to look at, with the rule area each one touches. **It is not legal advice.** State advertising rules, licence and trade-name status, and current tax law were flagged, not verified.

Two facts shape most of it:

- Every calculator prints under a letterhead with the legal name and the licensing line. The site header and footer do not print.
- The same disclaimer is on screen and in print on all eight: "This is an estimate based on the numbers you entered. It is not a loan offer, a rate quote or a commitment to lend. Talk with a loan officer for figures specific to you."

## A. Likely needs a change before production

| # | Page | What | Why | A cautious fix |
|---|---|---|---|---|
| A1 | Mortgage, Rate buydown, Refinance breakeven, Rent vs buy, APR, Investment (with a loan) | The note "Example rate for illustration, not an offer." is on screen beside the rate but does not print. The printed sheet shows a rate, term, down payment and payment under the letterhead. | Reg Z advertising (12 CFR 1026.24), Reg N (12 CFR 1014). On paper it looks like a quote. | Print the note beside the rate, with a line such as "Figures entered by the visitor. Not a quote or a Loan Estimate." |
| A2 | All eight | No date on any printout. The letterhead says "Rates and terms subject to change without notice". | An undated rate and payment on letterhead can circulate for years. | Print "Prepared [date]" and the page address. |
| A3 | Mortgage, Rate buydown, Refinance breakeven, Rent vs buy | Each opens on a pre-filled example with a rate, payment, term and down payment, and no APR. | If read as an advertisement, a stated rate must be shown as an APR, and payment, term and down payment are trigger terms (1026.24(c) and (d)). A lender-chosen, pre-filled rate above an application button is closer to an advertisement than a blank tool. The example rate is a tenant setting, so it could later be set to a real offered rate. | Counsel to choose: open with the rate blank; or show a representative example with its APR; or at least put the example-rate note in the result card, on screen and in print. |
| A4 | APR | The lender fees hint says to include "the lender's title insurance". | Under 12 CFR 1026.4(c)(7), title insurance on a real-estate-secured loan is left out of the finance charge when bona fide and reasonable. The dashboard's catalog counts it, and Zachary chose on 2026-11-18 to follow the dashboard. The reviewer reads the rule the other way. | Have whoever runs APR for the lender confirm the include and leave-out list. If the rule reading is right, the dashboard catalog is the thing to correct. |
| A5 | APR | "The APR for your loan is the one on your Loan Estimate." | The Loan Estimate's APR is itself an estimate; the final figure is on the Closing Disclosure. | "Your Loan Estimate shows the APR for your loan as estimated at application, and your Closing Disclosure shows the final one." |
| A6 | Rent vs buy | "With less than 20% down, most loans add mortgage insurance ... until the loan balance reaches 78% of the home price." | The 78% rule is for conventional loans with private mortgage insurance. FHA and VA differ. Mortgage and APR say they assume a conventional loan; this page does not. | Say the page assumes a conventional loan and change "most loans" to "most conventional loans". |
| A7 | Investment | The comparison "ahead of the same cash earning 4% a year" is on by default, and the hint names an index fund. Rent vs buy uses 5% for the same idea. | A comparative claim built on a figure the lender picked (UDAAP). | Default the comparison to off, or drop "such as from an index fund" and call the figure a placeholder. |
| A8 | All (footer and letterhead) | The copyright line reads "MSFG, LLC". The licensed entity is Mountain State Financial Group, LLC. | Licensee name accuracy in advertising. It prints on the letterhead. | Use the legal name, or a trade name registered in NMLS. |

The reviewer also reported that Payment mode's printout lacks the sentence "This is arithmetic on the payment entered. It is not the amount a lender would lend." That is not so: `mortgage/PrintSummary.tsx` prints it. No change needed.

## B. For the owner to check

1. **Founding year.** The staging footer says "since 2007" and "© 2007–2026"; the code's default tagline says "since 2015". Make them agree.
2. **State licence disclosures.** The calculator pages show the NMLS number, "Equal Housing Lender" and the seven states, with no state licence numbers, address or regulator wording. Check what CO, TX, MN, MI, IN, ND and SD require in advertising. The linked `/licensing` page on staging is still a draft with placeholders for all seven licence numbers.
3. **Trade names.** "MSFG", "MSFG Mortgage", "MSFG Veterans", "MSFG Reverse", "MSFG Investment", "MSFG Commercial" and "MSFG Equity" appear in the header and footer. Check each is registered in NMLS and in each state.
4. **Is the pre-filled example an advertisement?** Counsel's call (A3). If it is, Reg N asks for dated copies of each page and of the example rate, kept for 24 months.
5. **Rate buydown.** The page shows each reduced rate with its period and the full rate after, which the Reg Z commentary allows. Showing the payments may call for an APR. Also check the wording "A seller, builder or lender credit often covers it" and that the page does not mention seller-contribution limits or that borrowers are generally assessed at the full rate.
6. **Home budget band edges.** 32% and 47% for housing; 47% and 55% for housing and debts. They are the dashboard's. A housing-and-debt share of 47% sits in the lowest band; common consumer guidance is nearer 28% and 36%. Confirm the source and that this is acceptable. The cards are also labelled "front-end ratio" and "back-end ratio", which are underwriting terms.
7. **Mortgage, Payment mode.** The heading is "Estimated loan amount", with a home price line. Tax and insurance are under "Add detail" and open empty, so a visitor who types a whole housing payment and adds nothing gets a loan amount with no tax or insurance taken off. The page says "No tax or insurance is taken off." Decide whether that is enough.
8. **Rent vs buy defaults.** The example opens on "Buying comes out ahead by $10,816". The defaults are the lender's: 3% appreciation, 3% rent growth, 5% return, 20% down, $8,000 closing costs, 6% selling costs. The page leaves out investing the monthly difference, which in the example would remove much of the gap. Decide whether an opening example that favours buying is acceptable on a lender's site.
9. **Tax statements, for a CPA.** Rent vs buy's interest deduction wording does not say the benefit is only the amount above the standard deduction. Investment's passive-loss hint leaves out the $25,000 yearly cap and the active-participation condition, and "Yes, each year" appears to deduct any loss in full. Current-year tax law was not verified.
10. **Investment as investment advice.** The heading "Will this rental pay off?", a five-year return figure and dials that read Higher / Middle / Lower. The page says it is not tax, legal or investment advice and not a guarantee of return. Check comfort with a lender's page rating a deal.
11. **Privacy and third-party scripts.** The Home budget page says nothing typed is saved or sent, and the chat widget is kept off that page. The landing page used to make the same promise for all eight; that clause was removed on 2026-11-18, because the chat widget runs on the other seven. Confirm what production loads (the chat widget, Vercel Analytics and Speed Insights) and that the privacy policy covers it.
12. **Refinance breakeven and Blended rate.** Cash-out and debt-consolidation fields carry no Texas home-equity caveat.
13. **Mortgage insurance wording** on Mortgage does not mention borrower-requested cancellation at 80% or the midpoint rule. Optional.
14. **Call to action.** The first button reads "Start with MSFG AI" and goes to `/apply/buy` or `/apply/refi`. Check that clicking it does not begin an application before the visitor expects. Mortgage's Refinance mode still links to the purchase application.
15. **Print letterhead.** It carries the "MSFG AI provides general information" sentence, and has no address, phone or Equal Housing logo.
16. **Share text.** Every calculator page uses the site default social description: "AI-first, transparent home financing across seven states. Real licensed loan officers, one tap away."
17. **Languages.** Pages are English only; the site config lists Spanish, Hindi and Korean as languages spoken.

## C. Looked fine on a read-through

- All pages: the licensing line with NMLS number, Equal Housing Lender text and logo, the seven states and "not a commitment to lend" are in the footer. No "qualify", "approved", "eligible" or "your rate". No location-keyed content. No external script hosts in the staging HTML. Inputs have labels.
- Opening arithmetic checked on Mortgage ($2,129 on $320,000 at 7%), Rate buydown ($7,459), APR ($920.55 prepaid interest, $315,079 financed).
- The cautions on Blended rate ("A lower rate is not the whole decision"), Refinance breakeven ("restarts the clock"), Rent vs buy ("This is not tax advice"), Home budget ("not as a loan decision") and Investment ("not a guarantee of return") are on screen and in print.

## D. Page-by-page tick list

**/calculators**
- [ ] Footer shows the licensing line with NMLS #1314257 and the Equal Housing logo
- [ ] No rate or payment on this page
- [ ] All eight cards present; none says "qualify", "afford" or "approved"
- [ ] Founding year and copyright entity are correct

**/calculators/mortgage**
- [ ] "Example rate for illustration, not an offer." is beside the rate
- [ ] Decision made on an APR or a blank rate (A3)
- [ ] Disclaimer is visible under the results
- [ ] Payment mode: "It is not the amount a lender would lend." shows on screen and in print
- [ ] Payment mode: happy with what it opens on, with no tax or insurance taken off (B7)
- [ ] Mortgage insurance prompt appears under 20% down
- [ ] Print has a date and the example-rate note (A1, A2)

**/calculators/buydown**
- [ ] Each reduced rate shows its period and the full rate after
- [ ] "principal and interest only" is on screen and in print
- [ ] "often covers it" wording is acceptable (B5)
- [ ] Decision made on an APR
- [ ] Print has a date and the example-rate note

**/calculators/blended-rate**
- [ ] No lender rate is pre-filled in "A new rate to compare"
- [ ] The no-closing-costs assumption shows whenever savings show
- [ ] "A lower rate is not the whole decision" is on screen and in print
- [ ] Call to action goes to the refinance application
- [ ] Print has a date

**/calculators/refinance-breakeven**
- [ ] Example-rate note is on the new rate
- [ ] Lifetime interest shows beside the breakeven
- [ ] The "restarts the clock" line is on screen and in print
- [ ] Any Texas cash-out caveat counsel wants (B12)
- [ ] Print has a date and the example-rate note

**/calculators/rent-vs-buy**
- [ ] The opening result is acceptable as a default (B8)
- [ ] Mortgage insurance wording says conventional (A6)
- [ ] "This is not tax advice" shows when the interest deduction is used
- [ ] Assumptions list is in print
- [ ] Print has a date and the example-rate note

**/calculators/budget**
- [ ] "not as a loan decision" shows at the top and under the results
- [ ] Band edges approved (B6)
- [ ] The privacy line is true in production (B11)
- [ ] Print carries the ratios note and the disclaimer
- [ ] Print has a date

**/calculators/apr**
- [ ] The lender fees include and leave-out list is approved by whoever runs APR (A4)
- [ ] "Estimated APR" is labelled an estimate everywhere
- [ ] Loan Estimate wording settled (A5)
- [ ] "Assumes a conventional fixed-rate loan" is on screen as well as in print
- [ ] Print has a date and the example-rate note

**/calculators/investment**
- [ ] Opens on "All cash" with the rate greyed out
- [ ] Example-rate note appears when a loan type is chosen
- [ ] Comparison default and "index fund" wording approved (A7)
- [ ] "not tax, legal or investment advice ... not a guarantee of return" is on screen and in print
- [ ] Passive-loss hint approved by a CPA (B9)
- [ ] Print has a date

## E. Not checked

- Behaviour in a live browser session in production: cookies, network calls after load, and what the production environment loads.
- Real printed pages; print was read from the markup.
- State advertising rules, licence and trade-name status in NMLS, and current tax-law figures.
- Colour contrast, keyboard order and screen readers.
- The application flow and the loan officer pages behind the call to action.
- Production tenant settings, which can differ from the code defaults.
