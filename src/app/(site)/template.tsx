/** Re-mounts on every navigation, so each page arrives with the same short settle. */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="s-page">{children}</div>;
}
