"use client";

import { MantineProvider, createTheme } from "@mantine/core";

const theme = createTheme({
  primaryColor: "teal",
  defaultRadius: "md",
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  colors: {
    dark: [
      "#e8e8f0",
      "#c1c1d0",
      "#9c9cb0",
      "#7a7a95",
      "#5a5a78",
      "#3d3d58",
      "#242442",
      "#1a1a2e",
      "#0f0f1a",
      "#080812",
    ],
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      {children}
    </MantineProvider>
  );
}
