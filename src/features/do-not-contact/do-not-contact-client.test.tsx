import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DoNotContactClient } from "./do-not-contact-client";
import type { DoNotContactRecord } from "./types";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const records: DoNotContactRecord[] = [
  {
    id: "nike",
    companyName: "Nike",
    domain: "nike.com",
    status: "RECENTLY_CONTACTED",
  },
];

describe("Do Not Contact UI", () => {
  it("shows a filtered empty state instead of a blank grid", () => {
    render(<DoNotContactClient records={records} />);

    fireEvent.change(screen.getByPlaceholderText("Search company or domain"), {
      target: { value: "booking.com" },
    });

    expect(screen.getByRole("heading", { name: "No matching account found" })).toBeTruthy();
    expect(screen.getByText(/only checks the available suppression records/i)).toBeTruthy();
  });
});
