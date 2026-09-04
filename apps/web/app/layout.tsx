export const metadata = {
  title: 'india-ordering',
  description: 'Order groceries and food in India from chat',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          background: '#0d0f12',
          color: '#e8eaed',
        }}
      >
        {children}
      </body>
    </html>
  );
}
