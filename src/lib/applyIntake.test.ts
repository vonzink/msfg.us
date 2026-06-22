import { describe, it, expect } from "vitest";
import { funnelToIntake, type LeadForIntake } from "./applyIntake";

const baseLead: LeadForIntake = {
  firstName: "Zachary", lastName: "Zink", email: "z@example.com", phone: "3035551234",
  intent: "REFI", idempotencyKey: "lead-1",
  answers: { fields: {
    address: { line1: "12750 W 88th Ave", city: "Arvada", state: "CO", zip: "80005" },
    propertyUse: "Primary residence", propertyType: "Single Family",
    homeValue: 485000, mortgageBalance: 312000, creditBand: "Good (680–739)",
    income: 120000, loanOfficer: "zachary-zink",
  } },
};

describe("funnelToIntake", () => {
  it("maps a refi lead to the IntakeDTO", () => {
    const dto = funnelToIntake(baseLead, { email: "zachary.zink@msfg.us", nmls: "451924", name: "Zachary Zink", slug: "zachary-zink" });
    expect(dto.sourceLeadId).toBe("lead-1");
    expect(dto.intent).toBe("refi");
    expect(dto.loanPurpose).toBe("Refinance");
    expect(dto.borrower).toEqual({ firstName: "Zachary", lastName: "Zink", email: "z@example.com", phone: "3035551234" });
    expect(dto.property.addressLine).toBe("12750 W 88th Ave");
    expect(dto.property.city).toBe("Arvada");
    expect(dto.property.propertyType).toBe("PrimaryResidence");
    expect(dto.property.constructionType).toBe("SiteBuilt");
    expect(dto.property.propertyValue).toBe(485000);
    expect(dto.financials.currentMortgageBalance).toBe(312000);
    expect(dto.financials.annualIncome).toBe(120000);
    expect(dto.loanOfficer?.email).toBe("zachary.zink@msfg.us");
  });

  it("maps intent buy→Purchase, cash→CashOut", () => {
    expect(funnelToIntake({ ...baseLead, intent: "BUY" }, null).loanPurpose).toBe("Purchase");
    expect(funnelToIntake({ ...baseLead, intent: "CASH" }, null).loanPurpose).toBe("CashOut");
  });

  it("maps Manufactured property type to constructionType", () => {
    const lead = { ...baseLead, answers: { fields: { ...baseLead.answers.fields, propertyType: "Manufactured home" } } };
    expect(funnelToIntake(lead, null).property.constructionType).toBe("Manufactured");
  });

  it("tolerates missing fields (null officer, no address)", () => {
    const dto = funnelToIntake({ ...baseLead, answers: { fields: {} } }, null);
    expect(dto.loanOfficer).toBeNull();
    expect(dto.property.addressLine).toBeNull();
    expect(dto.financials.annualIncome).toBeNull();
  });

  it("emits null for blank funnel address fields ('Address to be determined' city/state/zip blanked)", () => {
    const lead: LeadForIntake = {
      ...baseLead,
      answers: {
        fields: {
          address: { line1: "Address to be determined", city: "", state: "", zip: "" },
        },
      },
    };
    const dto = funnelToIntake(lead, null);
    expect(dto.property.addressLine).toBe("Address to be determined");
    expect(dto.property.city).toBeNull();
    expect(dto.property.state).toBeNull();
    expect(dto.property.zipCode).toBeNull();
  });

  it("passes through a full address unchanged", () => {
    const lead: LeadForIntake = {
      ...baseLead,
      answers: {
        fields: {
          address: { line1: "1600 Pennsylvania Ave NW", city: "Washington", state: "DC", zip: "20500" },
        },
      },
    };
    const dto = funnelToIntake(lead, null);
    expect(dto.property.addressLine).toBe("1600 Pennsylvania Ave NW");
    expect(dto.property.city).toBe("Washington");
    expect(dto.property.state).toBe("DC");
    expect(dto.property.zipCode).toBe("20500");
  });
});
