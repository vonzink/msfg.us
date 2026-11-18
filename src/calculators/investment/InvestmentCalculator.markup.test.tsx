import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InvestmentCalculator } from "./InvestmentCalculator";

// Pins the server-rendered markup so a refactor of the shared kit cannot change what the page shows.
it("renders the same markup as before the shared-kit extraction", () => {
  expect(renderToStaticMarkup(<InvestmentCalculator />)).toMatchSnapshot();
});
