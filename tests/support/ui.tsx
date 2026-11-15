import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { formatDayLabel } from "@/lib/domain/slots";

type User = ReturnType<typeof userEvent.setup>;

/** Opens a dropdown (a shadcn Select or the tutor combobox) by its name and picks an option by its text. */
export async function choose(user: User, dropdown: string | RegExp, option: string | RegExp) {
  await user.click(screen.getByRole("combobox", { name: dropdown }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/** Picks a day (YYYY-MM-DD) in a slot picker's Day dropdown. */
export const chooseDay = (user: User, day: string) => choose(user, "Day", formatDayLabel(day));

/** Opens the tutor combobox and picks a tutor by name. */
export async function chooseTutor(user: User, name: string) {
  await user.click(screen.getByRole("combobox", { name: "Tutor" }));
  await user.click(await screen.findByRole("option", { name }));
}
