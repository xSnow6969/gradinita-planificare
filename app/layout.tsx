import "./globals.css";

export const metadata = {
  title: "Planificare Grădiniță",
  description: "Generator de planificări săptămânale pentru grădiniță",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        {children}
      </body>
    </html>
  );
}
