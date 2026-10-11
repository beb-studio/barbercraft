import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Randevunuz | BarberCraft",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      noimageindex: true,
    },
  },
};

export default function AppointmentManagementLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
