import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = getMetadata({
  title: "BankrBets - Predict Token Prices",
  description:
    "Binary prediction market for Bankr ecosystem tokens on Base. Bet UP or DOWN on Clanker tokens in 5-minute rounds.",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={`${outfit.variable} ${plusJakarta.variable}`} data-theme="light">
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false} forcedTheme="light">
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
