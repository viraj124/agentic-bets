import HomeClient from "./HomeClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  other: {
    "base:app_id": "69d860ec34c69936dc95d692",
  },
};

export default function Page() {
  return <HomeClient />;
}
