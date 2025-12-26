import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConditionBuilder from "../components/ConditionBuilder";

describe("ConditionBuilder", () => {
  it("allows switching group logic", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <ConditionBuilder
        value={{ logic: "AND", rules: [], groups: [] }}
        fieldOptions={[{ value: "name", label: "Name" }]}
        onChange={onChange}
      />
    );

    const logicSelect = screen.getByDisplayValue("All conditions match");
    await user.selectOptions(logicSelect, "OR");

    expect(onChange).toHaveBeenCalledWith({
      logic: "OR",
      rules: [],
      groups: []
    });
  });

  it("adds nested groups", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <ConditionBuilder
        value={{ logic: "AND", rules: [], groups: [] }}
        fieldOptions={[{ value: "name", label: "Name" }]}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add group" }));

    expect(onChange).toHaveBeenCalledWith({
      logic: "AND",
      rules: [],
      groups: [{ logic: "AND", rules: [], groups: [] }]
    });
  });
});
