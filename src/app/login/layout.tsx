// Login route uses its own standalone layout — no sidebar, no BrandingProvider.
// This wraps the root layout output by returning a completely independent tree.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
