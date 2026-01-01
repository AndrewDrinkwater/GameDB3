import { render } from "@testing-library/react";
import AppRouter from "../src/router";

describe("AppRouter", () => {
  it("renders without crashing", () => {
    expect(() => render(<AppRouter />)).not.toThrow();
  });
});
