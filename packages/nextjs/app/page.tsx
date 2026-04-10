import HomeClient from "./HomeClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  other: {
    "base:app_id": "695bcd874d3a403912ed8e43",
  },
};

export default function Page() {
  return <HomeClient />;
}
