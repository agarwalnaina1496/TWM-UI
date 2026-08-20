// Shared page shell for the app's React pages (not the marketing site,
// which is plain static HTML). Renders the app-wide .wrap container plus,
// optionally, the copyright line as a SIBLING after it (not nested inside)
// — matching the marketing site's structure, since the sticky-footer flex
// mechanics in shared-layout.css rely on .wrap and the trailing footer
// being separate flex children of .app-shell, not one nested inside the
// other. Individual pages never hand-roll <main className="wrap"> or
// repeat the footer markup themselves.
export default function Layout({ children, className = '', footer = false }) {
  return (
    <>
      <main className={`wrap${className ? ' ' + className : ''}`}>{children}</main>
      {footer && (
        <p className="footer-bottom">&copy; {new Date().getFullYear()} TravelWithMe. All rights reserved.</p>
      )}
    </>
  );
}
